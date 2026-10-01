import express from 'express';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {Server} from 'socket.io';
import type {GameConfig} from '../shared/config.js';
import type {ModeSettings} from '../shared/modes.js';
import type {MatchState} from '../shared/model.js';
import type {Ack,ClientEvents,ServerEvents,CommandRequest} from '../shared/protocol.js';
import {SessionStore,attachSessions,type Session} from './sessions.js';
import {RoomManager} from './rooms.js';
import {GameLoop} from './loop.js';
import {attachDirection} from './transport.js';
import {Limits,allowedOrigin,validateOrigins} from './limits.js';
export interface ServerOptions {modeSettings?:ModeSettings;rateNow?:()=>number;allowedOrigins?:string[];config?:Partial<GameConfig>;maxRooms?:number;now?:()=>number;autoStart?:boolean;seed?:()=>number;initializeMatch?:(match:MatchState)=>void;log?:(event:string,fields:Record<string,unknown>)=>void}
export function createGameServer(options:ServerOptions={}){
 if(options.initializeMatch&&process.env.NODE_ENV!=='test')throw new Error('Fixture initialization is test-only');
 const origins=options.allowedOrigins??(process.env.NODE_ENV==='test'?['http://127.0.0.1:5174']:[]);
 validateOrigins(origins);const app=express();app.disable('x-powered-by');
 const http=createServer(app),io=new Server<ClientEvents,ServerEvents>(http,{maxHttpBufferSize:4096,pingInterval:2000,pingTimeout:5000,allowRequest:(req,callback)=>callback(null,allowedOrigin(req.headers.origin,req.headers.host,origins))});
 const sessions=new SessionStore(options.now),rooms=new RoomManager(sessions,options.config,options.maxRooms,options.seed,undefined,options.initializeMatch,options.modeSettings);
 const loop=new GameLoop(io,rooms,options.log),limits=new Limits(options.rateNow??(()=>performance.now()),options.log);
 app.get('/healthz',(_req,res)=>res.json({ok:true,rooms:rooms.rooms.size,connections:io.engine.clientsCount}));
 const root=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../dist/client/':'../../client/',import.meta.url));
 app.use(express.static(root,{dotfiles:'deny',index:'index.html'}));
 const command=(session:Session,raw:unknown,action:(request:CommandRequest)=>Ack,event:string,sourceSocketId:string):Ack=>{
   const socket=session.socketId?io.sockets.sockets.get(session.socketId):undefined;
   if(!socket||socket.id!==sourceSocketId||socket.data.generation!==session.generation)return{ok:false,code:'SESSION_EXPIRED',message:'연결을 다시 확인하세요.'};
   return sessions.request(session,raw,request=>{
    if(request.gameMode!==undefined&&!['room:create','room:quickJoin'].includes(event))return{ok:false,code:'INVALID_INPUT',message:'이 요청에서는 방의 모드를 변경할 수 없습니다.'};
    const creates=event==='room:create'&&!session.roomId||event==='room:quickJoin'&&!session.roomId&&![...rooms.rooms.values()].some(r=>r.mode==='PUBLIC'&&r.gameMode.id===(request.gameMode??'classic')&&r.members.size<8&&(r.phase==='WAITING'||r.phase==='COUNTDOWN'&&r.roundNumber===0));
    try{return limits.request(session,event,socket.handshake.address,creates,()=>action(request));}
    catch{options.log?.('command_error',{event});return{ok:false,code:'INTERNAL_ERROR',message:'요청을 처리하지 못했습니다. 다시 시도하세요.'};}
   });
  };
 attachSessions(io,sessions,{onConnect:(session,socket)=>{
  rooms.restored(session);attachDirection(socket,session,rooms,limits);
  socket.on('room:quickJoin',(raw,ack)=>{const response=command(session,raw,r=>rooms.quickJoin(session,r.nickname,r.gameMode),'room:quickJoin',socket.id);if(typeof ack==='function')ack(response);const current=rooms.member(session);if(current)loop.publishRoom(current.room);});
  socket.on('room:create',(raw,ack)=>{const response=command(session,raw,r=>rooms.createFriend(session,r.nickname,r.gameMode),'room:create',socket.id);if(typeof ack==='function')ack(response);const current=rooms.member(session);if(current)loop.publishRoom(current.room);});
  socket.on('room:join',(raw,ack)=>{const response=command(session,raw,r=>rooms.joinFriend(session,r.nickname,r.code),'room:join',socket.id);if(typeof ack==='function')ack(response);const current=rooms.member(session);if(current)loop.publishRoom(current.room);});
  socket.on('room:start',(raw,ack)=>{const response=command(session,raw,()=>rooms.start(session),'room:start',socket.id);if(typeof ack==='function')ack(response);const current=rooms.member(session);if(current)loop.publishRoom(current.room);});
  socket.on('room:leave',(raw,ack)=>{const previous=rooms.member(session),response=command(session,raw,()=>rooms.leave(session),'room:leave',socket.id);if(typeof ack==='function')ack(response);
   if(response.ok&&previous){socket.leave('arena:'+previous.room.roomId);socket.leave('lobby:'+previous.room.roomId);loop.publishRoom(previous.room);}});
  for(const event of ['control:background','control:foreground'] as const)socket.on(event,(raw,ack)=>{
   const response=command(session,raw,()=>rooms.setBackground(session,event==='control:background'),event,socket.id);
   if(response.ok&&event==='control:foreground')loop.synchronize(session);
   if(typeof ack==='function')ack(response);
  });
  queueMicrotask(()=>loop.synchronize(session));
 },onDisconnect:(session)=>{rooms.disconnected(session);const current=rooms.member(session);if(current)loop.publishRoom(current.room);}});
 if(options.autoStart!==false)loop.start();
 return {app,http,io,sessions,rooms,loop,close:async()=>{rooms.accepting=false;loop.stop();for(const room of [...rooms.rooms.values()])loop.abort(room);await new Promise<void>(resolve=>io.close(()=>resolve()));sessions.sessions.clear();}};
}








