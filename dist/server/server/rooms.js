// Room rules now live in src/shared/rooms.ts so the LAN host phone runs the same code (PRD 5.1).
import { RoomManager as SharedRoomManager } from '../shared/rooms.js';
export { MAX_HUMAN_ROOM_MEMBERS } from '../shared/rooms.js';
export class RoomManager extends SharedRoomManager {
}
