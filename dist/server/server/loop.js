import { RoomLoop } from '../shared/room-loop.js';
// socket.io adapter around the shared room loop. Scheduling, stepping and delivery rules live in src/shared/room-loop.ts.
export class GameLoop extends RoomLoop {
    io;
    timer = null;
    // Measuring bytes means serializing each snapshot a second time (socket.io serializes internally), so production skips it.
    constructor(io, rooms, log = () => { }, measureSnapshotBytes = process.env.NODE_ENV === 'test' || process.env.HEXHOLD_SNAPSHOT_BYTES === '1') {
        super(rooms, {}, log);
        this.io = io;
        const socketOf = (session) => session.socketId ? io.sockets.sockets.get(session.socketId) : undefined;
        this.output = {
            roomView: (room, member, view, active) => {
                const socket = socketOf(member.session);
                if (!socket)
                    return;
                socket.join('lobby:' + room.roomId);
                if (active)
                    socket.join('arena:' + room.roomId);
                else
                    socket.leave('arena:' + room.roomId);
                socket.emit('room:view', view);
            },
            snapshot: (room, member, snapshot, kind) => {
                const socket = socketOf(member.session);
                if (!socket)
                    return false;
                socket.join('arena:' + room.roomId);
                if (measureSnapshotBytes) {
                    const bytes = Buffer.byteLength(JSON.stringify(snapshot));
                    this.metrics.snapshotBytes += bytes;
                    this.metrics.snapshotSentBytes += bytes;
                }
                if (kind === 'init')
                    socket.emit('match:init', snapshot);
                else if (kind === 'reliable')
                    socket.emit('match:snapshot', snapshot);
                else
                    socket.volatile.emit('match:snapshot', snapshot);
                return true;
            },
            result: (_room, member, payload) => { if (member.session.socketId)
                io.to(member.session.socketId).emit('match:result', payload); },
            aborted: (room, member, error) => {
                const socket = socketOf(member.session);
                socket?.emit('app:error', error);
                socket?.leave('arena:' + room.roomId);
                socket?.leave('lobby:' + room.roomId);
            }
        };
    }
    start() { if (!this.timer)
        this.timer = setInterval(() => this.pump(), 10); }
    stop() { if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
    } }
    pump() {
        const overloaded = super.pump();
        for (const session of this.rooms.sessions.prune()) {
            const socket = session.socketId ? this.io.sockets.sockets.get(session.socketId) : undefined;
            socket?.emit('app:error', { code: 'SESSION_EXPIRED', message: '유휴 연결이 종료되었습니다. 다시 입장하세요.' });
            socket?.disconnect(true);
        }
        return overloaded;
    }
}
