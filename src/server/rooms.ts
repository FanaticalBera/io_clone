// Room rules now live in src/shared/rooms.ts so the LAN host phone runs the same code (PRD 5.1).
import {RoomManager as SharedRoomManager,type Room as SharedRoom,type Member as SharedMember} from '../shared/rooms.js';
import type {Session,SessionStore} from './sessions.js';
export {MAX_HUMAN_ROOM_MEMBERS} from '../shared/rooms.js';
export type Room=SharedRoom<Session>;
export type Member=SharedMember<Session>;
export class RoomManager extends SharedRoomManager<Session> {declare readonly sessions:SessionStore;}
