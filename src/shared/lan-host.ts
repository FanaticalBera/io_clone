import {RoomManager,type RoomSession} from './rooms.js';
import {RoomLoop} from './room-loop.js';
import {acceptDirection} from './room-input.js';
import {PROTOCOL_VERSION,type GameConfig} from './config.js';
import {record,validRequest,type Ack,type AppError,type CommandRequest,type ErrorCode} from './protocol.js';
import {decodeFrame,encodeFrame,LAN_AWAY_GRACE_MS,LAN_HEARTBEAT_MS,LAN_HEARTBEAT_TIMEOUT_MS,LAN_HOST_PAUSE_MS,LAN_MAX_HUMANS,type FrameChannel} from './lan-protocol.js';
// The host phone's authority (PRD 5, 9). It runs the same RoomManager and RoomLoop as the online server; only the
// delivery differs: frames over FrameChannels instead of socket.io. The host's own client joins through a loopback
// channel and passes the same request and input validation as every guest.
interface Peer {
 id:string;channel:FrameChannel;local:boolean;session:LanSession;ready:boolean;attachedAt:number;lastHeard:number;closed:boolean;cache:Map<string,{at:number;response:Ack}>;
 inputTokens:number;inputRefillAt:number;inputViolations:number;requestTimes:number[];
 /** Set while the guest's app is in the background; the guest stays seated for LAN_AWAY_GRACE_MS. */
 awaySince:number|null;
}
interface LanSession extends RoomSession {peer:Peer}
export interface LanHostOptions {
 /** The 8-char LAN code shown in the lobby; it already encodes this host's address (PRD 6). */
 code:string;config?:Partial<GameConfig>;now?:()=>number;seed?:()=>number;autoStart?:boolean;
 log?:(event:string,fields:Record<string,unknown>)=>void;
 /** Called once when the room ends for everyone (host left, closed, or expired). */
 onClosed?:(error:AppError)=>void;
}
type Command='room:create'|'room:join'|'room:start'|'run:retry'|'room:leave'|'control:background'|'control:foreground';
// Anyone on the same Wi-Fi can reach the listener, so bound what one connection may cost (same budgets as src/server/limits.ts).
export const LAN_MAX_PEERS=8,LAN_HELLO_TIMEOUT_MS=5000;
const RATE_LIMITED:Ack={ok:false,code:'RATE_LIMITED',message:'요청이 너무 많아요. 잠시 후 다시 시도하세요.'};
const COMMANDS=new Set<string>(['room:create','room:join','room:start','run:retry','room:leave','control:background','control:foreground']);
export const HOST_LEFT:AppError={code:'HOST_LEFT',message:'방장이 방을 닫아 경기가 끝났어요.'};
export const HOST_GONE:AppError={code:'HOST_LEFT',message:'방장이 오래 자리를 비워 경기가 끝났어요.'};
const SEAT_EXPIRED:Ack={ok:false,code:'SESSION_EXPIRED',message:'자리를 너무 오래 비워 경기에서 빠졌어요.'};
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');

export class LanHost {
 readonly rooms:RoomManager<LanSession>;readonly loop:RoomLoop<LanSession>;
 private peers=new Map<string,Peer>();private nextPeer=0;private closed=false;private pausedAt:number|null=null;
 /** Seated guests by resume token, so a guest whose connection dropped can take the same seat back (PRD 11). */
 private sessions=new Map<string,LanSession>();
 private timers:ReturnType<typeof setInterval>[]=[];private now:()=>number;
 constructor(private options:LanHostOptions){
  this.now=options.now??(()=>performance.now());
  // A dropped guest keeps the seat (a bot steers home) for the away grace instead of the online 10 s.
  this.rooms=new RoomManager<LanSession>({now:this.now,sessions:this.sessions},{reconnectGraceSeconds:LAN_AWAY_GRACE_MS/1000,...options.config},1,options.seed,()=>options.code);
  this.loop=new RoomLoop<LanSession>(this.rooms,{
   roomView:(_room,member,view)=>this.emit(member.session.peer,'room:view',view),
   snapshot:(_room,member,snapshot,kind)=>{
    const peer=member.session.peer;if(peer.closed)return false;
    this.emit(peer,kind==='init'?'match:init':'match:snapshot',snapshot,kind==='volatile'?'snap:'+snapshot.matchId:undefined);return true;
   },
   result:(_room,member,payload)=>this.emit(member.session.peer,'match:result',payload),
   aborted:(_room,member,error)=>this.emit(member.session.peer,'app:error',error)
  },options.log);
  // The room can also expire by itself (everyone idle on results, or all humans out for the TTL), as online.
  this.rooms.onClosed=room=>{
   const error:AppError={code:'MATCH_ABORTED',message:'오래 쉬어서 방이 닫혔어요.'};
   for(const member of room.members.values())this.emit(member.session.peer,'app:error',error);
   queueMicrotask(()=>this.shutdown(error,false));
  };
  if(options.autoStart!==false)this.start();
 }
 start():void {
  if(this.timers.length||this.closed)return;
  this.timers.push(setInterval(()=>this.pump(),10),setInterval(()=>this.heartbeat(),LAN_HEARTBEAT_MS));
 }
 pump():void {if(!this.closed&&this.pausedAt===null)this.loop.pump();}
 get paused():boolean {return this.pausedAt!==null;}
 /**
  * The host app is going to the background: freeze the room for everyone instead of ending it (PRD 11).
  * Guests are told first, because this phone's JavaScript stops right after.
  */
 pause():void {
  if(this.closed||this.pausedAt!==null)return;this.pausedAt=this.now();
  for(const peer of this.peers.values())if(!peer.local)this.emit(peer,'room:paused',{graceMs:LAN_HOST_PAUSE_MS});
 }
 /** Returns false (and ends the room) when the host was away longer than guests were told to wait. */
 resume():boolean {
  if(this.closed)return false;if(this.pausedAt===null)return true;
  const now=this.now(),away=now-this.pausedAt;this.pausedAt=null;
  if(away>LAN_HOST_PAUSE_MS){this.shutdown(HOST_GONE);return false;}
  // Nothing happened while frozen: shift every wall-clock deadline so the pause is invisible to room rules.
  for(const room of this.rooms.rooms.values()){
   room.lastStepAt=now;room.accumulator=0;if(room.phaseDeadline!==null)room.phaseDeadline+=away;if(room.emptyDeadline!==null)room.emptyDeadline+=away;
   for(const member of room.members.values())if(member.graceUntil!==null){member.graceUntil+=away;member.session.expiresAt=member.graceUntil;}
  }
  for(const peer of this.peers.values()){peer.lastHeard=now;if(peer.awaySince!==null)peer.awaySince+=away;if(!peer.local)this.emit(peer,'room:resumed',null);}
  for(const room of this.rooms.rooms.values())for(const member of room.members.values())if(!member.session.peer.closed)this.loop.synchronize(member.session);
  return true;
 }
 get humanCount():number {return [...this.rooms.rooms.values()][0]?.members.size??0;}

 /** Accepts a new connection. `local` marks the host's own loopback client, the only one allowed to create the room. */
 attach(channel:FrameChannel,{local=false}:{local?:boolean}={}):void {
  if(this.closed){channel.close('HOST_CLOSED');return;}
  if(this.peers.size>=LAN_MAX_PEERS){this.options.log?.('lan_peer_rejected',{reason:'TOO_MANY_PEERS'});channel.close('TOO_MANY_PEERS');return;}
  const id='peer-'+(++this.nextPeer);
  const session={token:id,connected:true,roomId:null,memberId:null,expiresAt:Infinity,background:false,highestReceivedSeq:0,inputMatchId:null,inputLifeId:0} as unknown as LanSession;
  const now=this.now(),peer:Peer={id,channel,local,session,ready:false,attachedAt:now,lastHeard:now,closed:false,cache:new Map(),inputTokens:60,inputRefillAt:now,inputViolations:0,requestTimes:[],awaySince:null};session.peer=peer;
  this.peers.set(id,peer);
  channel.onMessage(data=>this.receive(peer,data));
  channel.onClose(reason=>this.dropped(peer,reason));
  this.options.log?.('lan_peer',{id,local});
 }

 /** Ends the room for everyone: tells every guest why, then closes all connections. */
 shutdown(error:AppError=HOST_LEFT,abortRooms=true):void {
  if(this.closed)return;this.closed=true;
  if(abortRooms)for(const room of [...this.rooms.rooms.values()])this.loop.abort(room,error.code,error.message);
  for(const timer of this.timers)clearInterval(timer);this.timers=[];
  for(const peer of this.peers.values()){peer.closed=true;peer.channel.close('HOST_CLOSED');}
  this.peers.clear();this.options.onClosed?.(error);
 }

 private emit(peer:Peer,event:string,data:unknown,replaceKey?:string):void {
  if(peer.closed)return;peer.channel.send(encodeFrame({k:'evt',e:event,d:data}),replaceKey?{replaceKey}:undefined);
 }
 private heartbeat():void {
  // Paused: guests know and wait, but the host's own client still needs pings or it would close the loopback
  // (the WebView keeps running timers in the background) and end the room.
  if(this.pausedAt!==null){for(const peer of this.peers.values())if(peer.local)this.emit(peer,'lan:ping',null);return;}
  const now=this.now();
  for(const peer of [...this.peers.values()]){
   // A backgrounded guest cannot answer pings; the seat is held for the away grace, then handed to a bot.
   if(peer.awaySince!==null){if(now-peer.awaySince>LAN_AWAY_GRACE_MS)this.disconnect(peer,'AWAY_TIMEOUT');continue;}
   if(now-peer.lastHeard>LAN_HEARTBEAT_TIMEOUT_MS)this.disconnect(peer,'HEARTBEAT_TIMEOUT');
   else if(!peer.ready&&now-peer.attachedAt>LAN_HELLO_TIMEOUT_MS)this.disconnect(peer,'HELLO_TIMEOUT');
   else this.emit(peer,'lan:ping',null);
  }
 }
 private disconnect(peer:Peer,reason:string):void {
  if(peer.closed)return;this.options.log?.('lan_disconnect',{id:peer.id,reason});
  // Handle the drop with our reason first: closing the channel fires onClose(LOCAL_CLOSE), which must not decide it.
  this.dropped(peer,reason);peer.channel.close(reason);
 }
 /** Token bucket identical to the server's: 30 inputs/s sustained, 60 burst, disconnect after 60 violations. */
 private allowInput(peer:Peer):boolean {
  const now=this.now(),elapsed=Math.max(0,now-peer.inputRefillAt);peer.inputRefillAt=now;
  peer.inputTokens=Math.min(60,peer.inputTokens+elapsed*0.03);
  if(peer.inputTokens>=1){peer.inputTokens--;return true;}
  if(++peer.inputViolations>=60)this.disconnect(peer,'INPUT_FLOOD');
  return false;
 }
 /** At most 5 room commands per 10 s; leaving and background changes are never limited (server parity). */
 private allowRequest(peer:Peer,event:Command):boolean {
  if(event==='room:leave'||event.startsWith('control:'))return true;
  const now=this.now();peer.requestTimes=peer.requestTimes.filter(t=>now-t<10000);
  if(peer.requestTimes.length>=5)return false;peer.requestTimes.push(now);return true;
 }
 private dropped(peer:Peer,reason:string):void {
  if(peer.closed)return;peer.closed=true;this.peers.delete(peer.id);this.options.log?.('lan_peer_closed',{id:peer.id,reason});
  if(this.closed)return;
  // The host's own client going away (app backgrounded, left the room) ends the room for everyone (PRD 8.2).
  if(peer.local){this.shutdown();return;}
  const session=peer.session,current=this.rooms.member(session);session.connected=false;
  if(!current){this.sessions.delete(session.token);return;}
  // Away too long: the seat goes to a bot now (PRD 9.4). Otherwise hold it for the away grace, a bot steering home,
  // so the guest can reconnect with its token; RoomManager hands it to a bot when the grace runs out.
  if(reason==='AWAY_TIMEOUT'){this.rooms.leave(session);this.sessions.delete(session.token);}
  else this.rooms.disconnected(session);
  this.loop.publishRoom(current.room);
 }
 private receive(peer:Peer,data:string):void {
  if(peer.closed)return;peer.lastHeard=this.now();
  const frame=decodeFrame(data);
  if(!frame){this.disconnect(peer,'BAD_FRAME');return;}
  if(frame.k==='ack')return;
  if(frame.k==='evt'){if(frame.e==='input:direction'&&peer.ready&&this.allowInput(peer))acceptDirection(this.rooms,peer.session,frame.d);return;}
  const reply=(d:unknown)=>{if(!peer.closed)peer.channel.send(encodeFrame({k:'ack',id:frame.id,d}));};
  if(frame.e==='lan:hello'){
   const version=record(frame.d)?frame.d.protocolVersion:undefined;
   if(version!==PROTOCOL_VERSION){reply(this.fail('PROTOCOL_MISMATCH','앱 버전이 달라요. 같은 버전으로 맞춰 주세요.'));setTimeout(()=>this.disconnect(peer,'PROTOCOL_MISMATCH'),100);return;}
   const resume=record(frame.d)&&typeof frame.d.resumeToken==='string'?frame.d.resumeToken:null;
   if(resume!==null){
    const seated=this.sessions.get(resume);
    if(!seated||!seated.peer.closed||!seated.roomId){reply({...SEAT_EXPIRED});setTimeout(()=>this.disconnect(peer,'SEAT_EXPIRED'),100);return;}
    // Take the same seat back: same member, same participant, the bot lets go.
    peer.session=seated;seated.peer=peer;seated.connected=true;peer.ready=true;
    this.rooms.restored(seated);reply({ok:true,token:resume,resumed:true});
    // It may have dropped during a host pause and missed the resume notice.
    if(this.pausedAt===null)this.emit(peer,'room:resumed',null);
    const current=this.rooms.member(seated);if(current){this.loop.publishRoom(current.room);this.loop.synchronize(seated);}
    this.options.log?.('lan_resumed',{id:peer.id});return;
   }
   const token=newToken();peer.session.token=token;this.sessions.set(token,peer.session);
   peer.ready=true;reply({ok:true,token});return;
  }
  if(frame.e==='clock:ping'){reply({nonce:record(frame.d)&&typeof frame.d.nonce==='string'?frame.d.nonce.slice(0,64):'',serverTime:this.now()});return;}
  if(!peer.ready||!COMMANDS.has(frame.e)){reply(this.fail('INVALID_INPUT','올바르지 않은 요청입니다.'));return;}
  const event=frame.e as Command,previous=this.rooms.member(peer.session);
  const response=this.request(peer,frame.d,request=>this.allowRequest(peer,event)?this.execute(peer,event,request):{...RATE_LIMITED});
  reply(response);
  if(peer.local&&event==='room:leave'&&response.ok){this.shutdown();return;}
  if(response.ok&&event==='control:background')peer.awaySince??=this.now();
  if(response.ok&&event==='control:foreground')peer.awaySince=null;
  if(response.ok&&event==='room:leave')this.sessions.delete(peer.session.token);
  const current=this.rooms.member(peer.session);
  if(event==='run:retry'&&response.ok&&current){this.loop.publishRoom(current.room);this.loop.publishSnapshot(current.room,false,true);}
  else if(event==='control:foreground'&&response.ok)this.loop.synchronize(peer.session);
  else if(current)this.loop.publishRoom(current.room);
  else if(previous)this.loop.publishRoom(previous.room);
 }
 /** Same request validation and requestId de-duplication as the server's SessionStore.request + app.ts. */
 private request(peer:Peer,raw:unknown,execute:(request:CommandRequest)=>Ack):Ack {
  if(!validRequest(raw))return this.fail('INVALID_INPUT','올바르지 않은 요청입니다.');
  const now=this.now();
  for(const [id,cached] of peer.cache)if(now-cached.at>=30000)peer.cache.delete(id);
  const cached=peer.cache.get(raw.requestId);if(cached)return{...cached.response};
  let response:Ack;
  try{response=execute(raw);}catch(error){this.options.log?.('lan_command_error',{error:error instanceof Error?error.stack:String(error)});response=this.fail('INTERNAL_ERROR','요청을 처리하지 못했습니다. 다시 시도하세요.');}
  peer.cache.set(raw.requestId,{at:now,response});while(peer.cache.size>64)peer.cache.delete(peer.cache.keys().next().value!);
  return{...response};
 }
 private execute(peer:Peer,event:Command,request:CommandRequest):Ack {
  const session=peer.session;
  if(request.gameMode!==undefined&&event!=='room:create')return this.fail('INVALID_INPUT','이 요청에서는 방의 모드를 변경할 수 없습니다.');
  if(event!=='run:retry'&&(request.matchId!==undefined||request.runId!==undefined))return this.fail('INVALID_INPUT','이 요청에는 Run 정보를 지정할 수 없습니다.');
  switch(event){
   case 'room:create':
    if(!peer.local)return this.fail('NOT_HOST','방은 방장 기기에서만 만들 수 있어요.');
    if(this.rooms.rooms.size)return this.fail('ALREADY_IN_ROOM','이미 방이 열려 있어요.');
    return this.rooms.createFriend(session,request.nickname,request.gameMode);
   case 'room:join':{
    const room=[...this.rooms.rooms.values()][0];
    if(room&&room.members.size>=LAN_MAX_HUMANS&&!session.roomId)return this.fail('ROOM_FULL','방이 가득 찼어요.');
    return this.rooms.joinFriend(session,request.nickname,request.code);
   }
   case 'room:start':return this.rooms.start(session);
   case 'run:retry':return this.rooms.retryRun(session,request.matchId,request.runId);
   case 'room:leave':return this.rooms.leave(session);
   case 'control:background':return this.rooms.setBackground(session,true);
   case 'control:foreground':return this.rooms.setBackground(session,false);
  }
 }
 private fail(code:ErrorCode,message:string):Ack {return{ok:false,code,message};}
}
