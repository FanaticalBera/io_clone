import {io,type Socket} from 'socket.io-client';
import {PROTOCOL_VERSION} from '../shared/config.js';
import {record,type Ack,type AppError,type ClientEvents,type ServerEvents,type CommandRequest,type SessionReady} from '../shared/protocol.js';
import type {DirectionInput} from '../shared/model.js';
import {decodeFrame,encodeFrame,LAN_AWAY_GRACE_MS,LAN_HEARTBEAT_MS,LAN_HEARTBEAT_TIMEOUT_MS,type FrameChannel} from '../shared/lan-protocol.js';
// How NetworkSession reaches the authority: the online server over socket.io, or a LAN host over frames (PRD 5.2).
// Both expose the same ServerEvents, so the session, UI and renderer do not know which one they talk to.
export type CommandEvent='room:quickJoin'|'room:create'|'room:join'|'room:start'|'room:leave'|'run:retry'|'control:background'|'control:foreground';
export type TransportEvents=ServerEvents&{disconnect:()=>void;connect_error:(error:AppError|null)=>void};
type Handler<E extends keyof TransportEvents>=TransportEvents[E];
export interface GameTransport {
 readonly kind:'online'|'lan';
 on<E extends keyof TransportEvents>(event:E,handler:Handler<E>):()=>void;
 /** Starts connecting; success is announced by `session:ready`, failure by `connect_error`. */
 connect():void;
 command(event:CommandEvent,request:CommandRequest,timeoutMs:number):Promise<Ack>;
 ping(timeoutMs:number):Promise<number>;
 /** Inputs are fire-and-forget: a newer direction always supersedes an older one. */
 direction(input:DirectionInput):void;
 dispose():void;
 testClose?(reconnect:boolean):void;testReconnect?():void;
}

class Listeners {
 private map=new Map<string,Set<(...args:never[])=>void>>();
 on(event:string,handler:(...args:never[])=>void):()=>void {let set=this.map.get(event);if(!set)this.map.set(event,set=new Set());set.add(handler);return()=>set.delete(handler);}
 emit(event:string,...args:unknown[]):void {for(const h of [...this.map.get(event)??[]])(h as (...a:unknown[])=>void)(...args);}
 clear():void {this.map.clear();}
}

const TOKEN_KEY='hexhold.session';
export function clearSessionToken():void {try{sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem('hexhold.epoch');}catch{}}
function savedToken():string|null{try{return sessionStorage.getItem(TOKEN_KEY);}catch{return null;}}

/** The online server. Keeps the anonymous session token so a page reload resumes the same seat. */
export class SocketIoTransport implements GameTransport {
 readonly kind='online';
 private socket:Socket<ServerEvents,ClientEvents>;
 constructor(){
  const saved=savedToken();this.socket=io({autoConnect:false,auth:{protocolVersion:PROTOCOL_VERSION,...(saved?{sessionToken:saved}:{})}});
  this.socket.on('session:ready',ready=>{
   try{sessionStorage.setItem(TOKEN_KEY,ready.sessionToken);sessionStorage.setItem('hexhold.epoch',ready.serverEpoch);}catch{}
   this.socket.auth={protocolVersion:PROTOCOL_VERSION,sessionToken:ready.sessionToken};
  });
 }
 on<E extends keyof TransportEvents>(event:E,handler:Handler<E>):()=>void {
  if(event==='connect_error'){
   const wrapped=(error:Error&{data?:AppError})=>(handler as TransportEvents['connect_error'])(error.data?.code?error.data:null);
   this.socket.on('connect_error',wrapped);return()=>{this.socket.off('connect_error',wrapped);};
  }
  const h=handler as unknown as (...args:unknown[])=>void;
  (this.socket.on as (e:string,h:(...args:unknown[])=>void)=>void)(event,h);return()=>{(this.socket.off as (e:string,h:(...args:unknown[])=>void)=>void)(event,h);};
 }
 connect():void {this.socket.connect();}
 command(event:CommandEvent,request:CommandRequest,timeoutMs:number):Promise<Ack> {
  return new Promise<Ack>((resolve,reject)=>this.socket.timeout(timeoutMs).emit(event,request,(error:Error|null,response:Ack)=>error?reject(error):resolve(response)));
 }
 ping(timeoutMs:number):Promise<number> {
  const sent=performance.now();
  return new Promise((resolve,reject)=>this.socket.timeout(timeoutMs).emit('clock:ping',{nonce:String(sent)},(error:Error|null)=>error?reject(error):resolve(performance.now()-sent)));
 }
 direction(input:DirectionInput):void {this.socket.volatile.emit('input:direction',input);}
 dispose():void {this.socket.removeAllListeners();this.socket.disconnect();}
 testClose(reconnect:boolean):void {this.socket.io.reconnection(reconnect);this.socket.io.engine.close();}
 testReconnect():void {this.socket.io.reconnection(true);this.socket.connect();}
}

/**
 * A LAN host over a FrameChannel: the native TCP plugin for guests, an in-process loopback for the host's own client.
 * A guest whose connection drops reconnects with its seat token for LAN_AWAY_GRACE_MS (waiting while the app is in the
 * background); after that, or when the host ends the room, the session is over (PRD 11).
 */
export interface FrameTransportOptions {
 /** Opens a fresh connection to the same host. Omitted for the host's own loopback, which cannot drop. */
 reconnect?:()=>Promise<FrameChannel>;
 /** True while reconnecting must wait (app in background: the guest cannot play anyway). */
 waitForForeground?:()=>boolean;
}
export class FrameTransport implements GameTransport {
 readonly kind='lan';
 private listeners=new Listeners();private nextId=0;private closed=false;private ready=false;private hostError=false;
 private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private lastHeard=performance.now();private lastTick=performance.now();private heartbeat:ReturnType<typeof setInterval>|null=null;
 private token:string|null=null;private lostAt:number|null=null;private retryUntil=0;private pausedUntil:number|null=null;
 constructor(private channel:FrameChannel,private options:FrameTransportOptions={}){this.attach(channel);}
 on<E extends keyof TransportEvents>(event:E,handler:Handler<E>):()=>void {return this.listeners.on(event,handler as (...args:never[])=>void);}
 connect():void {
  if(this.closed||this.ready||this.heartbeat)return;
  this.lastHeard=this.lastTick=performance.now();
  this.heartbeat=setInterval(()=>this.tick(),LAN_HEARTBEAT_MS);
  void this.hello().then(ok=>{if(!ok&&!this.closed)this.listeners.emit('connect_error',{code:'MATCH_ABORTED',message:'방에 연결하지 못했어요. 같은 Wi-Fi 또는 핫스팟인지 확인해 주세요.'});});
 }
 command(event:CommandEvent,request:CommandRequest,timeoutMs:number):Promise<Ack> {return this.request<Ack>(event,request,timeoutMs);}
 async ping(timeoutMs:number):Promise<number> {const sent=performance.now();await this.request('clock:ping',{nonce:String(sent)},timeoutMs);return performance.now()-sent;}
 direction(input:DirectionInput):void {this.send('input:direction',input);}
 dispose():void {if(this.closed)return;this.channel.close('LOCAL_CLOSE');this.ended('LOCAL_CLOSE',false);this.listeners.clear();}

 private attach(channel:FrameChannel):void {
  this.channel=channel;
  channel.onMessage(data=>{if(this.channel===channel)this.receive(data);});
  channel.onClose(reason=>{if(this.channel===channel)this.lost(reason);});
 }
 /** Says hello, resuming our seat when we already have a token. Resolves false on a network failure. */
 private async hello():Promise<boolean> {
  let response:Ack&{token?:string};
  try{response=await this.request('lan:hello',{protocolVersion:PROTOCOL_VERSION,...(this.token?{resumeToken:this.token}:{})},5000);}catch{return false;}
  if(this.closed)return true;
  if(!response.ok){
   if(this.token){this.hostError=true;this.listeners.emit('app:error',response);this.channel.close('SEAT_EXPIRED');this.ended('SEAT_EXPIRED');}
   else this.listeners.emit('connect_error',response);
   return true;
  }
  if(typeof response.token==='string')this.token=response.token;
  this.ready=true;this.lostAt=null;this.lastHeard=performance.now();
  const ready:SessionReady={protocolVersion:PROTOCOL_VERSION,serverEpoch:'lan',sessionToken:''};this.listeners.emit('session:ready',ready);
  return true;
 }
 private tick():void {
  const now=performance.now();
  // This page was suspended (app in background): silence during that time says nothing about the host.
  if(now-this.lastTick>3*LAN_HEARTBEAT_MS)this.lastHeard=now;
  this.lastTick=now;
  if(this.closed||this.lostAt!==null)return;
  const deadline=(this.pausedUntil??this.lastHeard)+LAN_HEARTBEAT_TIMEOUT_MS;
  if(now>deadline){this.channel.close('HEARTBEAT_TIMEOUT');this.lost('HEARTBEAT_TIMEOUT');return;}
  this.send('lan:ping',null);
 }
 private lost(reason:string):void {
  if(this.closed||this.lostAt!==null)return;
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('연결이 끊어졌어요.'));}
  this.pending.clear();
  // No way back: the host ended the room, we were never seated, or there is nothing to reconnect to.
  if(this.hostError||!this.ready||!this.options.reconnect){this.ended(reason);return;}
  // Android cuts a backgrounded app's network after a few seconds, so a paused host drops every guest:
  // keep knocking until the host's promised return time, otherwise for the away grace.
  const now=performance.now();this.lostAt=now;this.retryUntil=Math.max(now+LAN_AWAY_GRACE_MS,this.pausedUntil===null?0:this.pausedUntil+LAN_HEARTBEAT_TIMEOUT_MS);
  this.ready=false;this.listeners.emit('disconnect');
  void this.reconnectLoop();
 }
 private async reconnectLoop():Promise<void> {
  const reconnect=this.options.reconnect!,sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  while(!this.closed&&this.lostAt!==null&&performance.now()<this.retryUntil){
   if(this.options.waitForForeground?.()){await sleep(1000);continue;}
   try{
    const channel=await reconnect();
    if(this.closed){channel.close('LOCAL_CLOSE');return;}
    this.attach(channel);if(await this.hello())return;
   }catch{}
   await sleep(2000);
  }
  if(this.closed)return;
  if(this.pausedUntil!==null){this.hostError=true;this.listeners.emit('app:error',{code:'HOST_LEFT',message:'방장이 오래 자리를 비워 경기가 끝났어요.'});}
  this.ready=true;this.ended('RECONNECT_FAILED');
 }
 private send(event:string,data:unknown):void {if(!this.closed&&this.lostAt===null)this.channel.send(encodeFrame({k:'evt',e:event,d:data}));}
 private request<T>(event:string,data:unknown,timeoutMs:number):Promise<T> {
  if(this.closed)return Promise.reject(new Error('연결이 끊어졌어요.'));
  const id=++this.nextId;
  return new Promise<T>((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('응답 시간이 초과됐어요.'));},timeoutMs);
   this.pending.set(id,{resolve:resolve as (value:unknown)=>void,reject,timer});
   this.channel.send(encodeFrame({k:'req',id,e:event,d:data}));
  });
 }
 private receive(data:string):void {
  if(this.closed)return;this.lastHeard=performance.now();
  const frame=decodeFrame(data);if(!frame)return;
  if(frame.k==='ack'){const p=this.pending.get(frame.id);if(p){clearTimeout(p.timer);this.pending.delete(frame.id);p.resolve(frame.d);}return;}
  if(frame.k!=='evt'||frame.e==='lan:ping')return;
  if(frame.e==='app:error')this.hostError=true;
  else if(frame.e==='room:paused'){const grace=record(frame.d)&&typeof frame.d.graceMs==='number'?frame.d.graceMs:0;this.pausedUntil=performance.now()+grace;}
  else if(frame.e==='room:resumed')this.pausedUntil=null;
  this.listeners.emit(frame.e,frame.d);
 }
 private ended(reason:string,notify=true):void {
  if(this.closed)return;this.closed=true;
  if(this.heartbeat)clearInterval(this.heartbeat);
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('연결이 끊어졌어요.'));}
  this.pending.clear();
  if(!notify)return;
  // A host that leaves on purpose sends app:error first; this covers crashes, Wi-Fi loss and heartbeat timeouts.
  if(this.ready&&!this.hostError)this.listeners.emit('app:error',{code:'HOST_LEFT',message:reason==='HEARTBEAT_TIMEOUT'||reason==='RECONNECT_FAILED'?'방장과 연결이 끊어져 경기가 끝났어요.':'방장과의 연결이 끊어졌어요.'});
  this.listeners.emit('disconnect');
 }
}
