import {randomBytes,randomUUID} from 'node:crypto';
import type {Server,Socket} from 'socket.io';
import {PROTOCOL_VERSION} from '../shared/config.js';
import {record,validRequest,type Ack,type CommandRequest,type ClientEvents,type ServerEvents} from '../shared/protocol.js';
export type GameSocket=Socket<ClientEvents,ServerEvents>;
export type GameIO=Server<ClientEvents,ServerEvents>;
export interface Session {
 sessionId:string;token:string;socketId:string|null;generation:number;connected:boolean;
 roomId:string|null;memberId:string|null;expiresAt:number;background:boolean;
 cache:Map<string,{at:number;response:Ack}>;requestTimes:number[];codeFailures:number[];
 inputTokens:number;inputRefillAt:number;inputViolations:number;highestReceivedSeq:number;inputMatchId:string|null;inputLifeId:number;
}
export class SessionStore {
 readonly sessions=new Map<string,Session>();readonly epoch=randomUUID();
 constructor(readonly now:()=>number=()=>performance.now()){}
 create():Session {
  const session:Session={sessionId:randomUUID(),token:randomBytes(32).toString('hex'),socketId:null,generation:0,connected:false,
   roomId:null,memberId:null,expiresAt:this.now()+60000,background:false,cache:new Map(),requestTimes:[],codeFailures:[],
   inputTokens:60,inputRefillAt:this.now(),inputViolations:0,highestReceivedSeq:0,inputMatchId:null,inputLifeId:0};
  this.sessions.set(session.token,session);return session;
 }
 lookup(token:string):Session|null {
  const session=this.sessions.get(token);return session&&session.expiresAt>this.now()?session:null;
 }
 request(session:Session,raw:unknown,execute:(request:CommandRequest)=>Ack):Ack {
  if(!validRequest(raw))return {ok:false,code:'INVALID_INPUT',message:'올바르지 않은 요청입니다.'};
  const now=this.now();
  for(const [id,cached]of session.cache)if(now-cached.at>=30000)session.cache.delete(id);
  const cached=session.cache.get(raw.requestId);if(cached)return {...cached.response};
  const response=execute(raw);if(!session.roomId)session.expiresAt=now+60000;session.cache.set(raw.requestId,{at:now,response});
  while(session.cache.size>64)session.cache.delete(session.cache.keys().next().value!);return {...response};
 }
 prune():Session[] {const removed:Session[]=[];for(const [token,s]of this.sessions)if(!s.roomId&&s.expiresAt<=this.now()){this.sessions.delete(token);removed.push(s);}return removed;}
}
function handshakeError(code:string,message:string):Error {return Object.assign(new Error(message),{data:{code,message}});}
export function attachSessions(io:GameIO,store:SessionStore,callbacks:{
 onConnect?:(session:Session,socket:GameSocket)=>void;
 onDisconnect?:(session:Session,socket:GameSocket)=>void;
}={}):void {
 io.use((socket,next)=>{
  const auth=socket.handshake.auth;
  if(!record(auth)||auth.protocolVersion!==PROTOCOL_VERSION)return next(handshakeError('PROTOCOL_MISMATCH','게임 버전이 다릅니다. 새로고침하세요.'));
  let session:Session|null;
  if(auth.sessionToken!==undefined){
   if(typeof auth.sessionToken!=='string'||! /^[a-f0-9]{64}$/.test(auth.sessionToken))return next(handshakeError('SESSION_EXPIRED','연결 복구 시간이 지났습니다. 다시 입장하세요.'));
   session=store.lookup(auth.sessionToken);if(!session)return next(handshakeError('SESSION_EXPIRED','연결 복구 시간이 지났습니다. 다시 입장하세요.'));
  }else session=store.create();
  const oldSocketId=session.socketId;session.generation++;session.socketId=socket.id;session.connected=true;session.expiresAt=session.roomId?Infinity:store.now()+60000;
  socket.data.session=session;socket.data.generation=session.generation;
  if(oldSocketId&&oldSocketId!==socket.id)io.sockets.sockets.get(oldSocketId)?.disconnect(true);
  next();
 });
 io.on('connection',socket=>{
  const session=socket.data.session as Session,generation=socket.data.generation as number;
  callbacks.onConnect?.(session,socket);
  socket.emit('session:ready',{protocolVersion:PROTOCOL_VERSION,serverEpoch:store.epoch,sessionToken:session.token});
  socket.on('clock:ping',(data,ack)=>{if(record(data)&&typeof data.nonce==='string'&&data.nonce.length<=64&&typeof ack==='function')ack({nonce:data.nonce,serverTime:store.now()});});
  socket.on('disconnect',()=>{
   if(session.socketId!==socket.id||session.generation!==generation)return;
   session.socketId=null;session.connected=false;session.expiresAt=store.now()+60000;callbacks.onDisconnect?.(session,socket);
  });
 });
}


