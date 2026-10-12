import {RoomLoop,type RoomOutput} from '../shared/room-loop.js';
import type {GameIO,Session} from './sessions.js';
import type {RoomManager} from './rooms.js';
export type {Metrics} from '../shared/room-loop.js';
// socket.io adapter around the shared room loop. Scheduling, stepping and delivery rules live in src/shared/room-loop.ts.
export class GameLoop extends RoomLoop<Session> {
 private timer:ReturnType<typeof setInterval>|null=null;
 declare readonly rooms:RoomManager;
 constructor(readonly io:GameIO,rooms:RoomManager,log:(event:string,fields:Record<string,unknown>)=>void=()=>{}){
  super(rooms,{} as RoomOutput<Session>,log);
  const socketOf=(session:Session)=>session.socketId?io.sockets.sockets.get(session.socketId):undefined;
  this.output={
   roomView:(room,member,view,active)=>{
    const socket=socketOf(member.session);if(!socket)return;
    socket.join('lobby:'+room.roomId);
    if(active)socket.join('arena:'+room.roomId);else socket.leave('arena:'+room.roomId);
    socket.emit('room:view',view);
   },
   snapshot:(room,member,snapshot,kind)=>{
    const socket=socketOf(member.session);if(!socket)return false;
    socket.join('arena:'+room.roomId);
    this.metrics.snapshotBytes+=Buffer.byteLength(JSON.stringify(snapshot));
    if(kind==='init')socket.emit('match:init',snapshot);else if(kind==='reliable')socket.emit('match:snapshot',snapshot);else socket.volatile.emit('match:snapshot',snapshot);
    return true;
   },
   result:(_room,member,payload)=>{if(member.session.socketId)io.to(member.session.socketId).emit('match:result',payload);},
   aborted:(room,member,error)=>{
    const socket=socketOf(member.session);
    socket?.emit('app:error',error);socket?.leave('arena:'+room.roomId);socket?.leave('lobby:'+room.roomId);
   }
  };
 }
 start():void {if(!this.timer)this.timer=setInterval(()=>this.pump(),10);}
 stop():void {if(this.timer){clearInterval(this.timer);this.timer=null;}}
 override pump():boolean {
  const overloaded=super.pump();
  for(const session of this.rooms.sessions.prune()){const socket=session.socketId?this.io.sockets.sockets.get(session.socketId):undefined;socket?.emit('app:error',{code:'SESSION_EXPIRED',message:'유휴 연결이 종료되었습니다. 다시 입장하세요.'});socket?.disconnect(true);}
  return overloaded;
 }
}
