import { acceptDirection } from '../shared/room-input.js';
export function attachDirection(socket, session, rooms, limits) {
    socket.on('input:direction', raw => {
        if (session.background || !session.connected || session.socketId !== socket.id || socket.data.generation !== session.generation)
            return;
        if (limits && !limits.direction(session, socket))
            return;
        acceptDirection(rooms, session, raw);
    });
}
