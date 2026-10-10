import type {Limits} from './limits.js';
import {acceptDirection} from '../shared/room-input.js';
import type {GameSocket,Session} from './sessions.js';
import type {RoomManager} from './rooms.js';
export function attachDirection(socket:GameSocket,session:Session,rooms:RoomManager,limits?:Limits):void {
 socket.on('input:direction',raw=>{
  if(session.background||!session.connected||session.socketId!==socket.id||socket.data.generation!==session.generation)return;
  if(limits&&!limits.direction(session,socket))return;
  acceptDirection(rooms,session,raw);
 });
}
