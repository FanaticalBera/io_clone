import { validDirection } from '../shared/protocol.js';
export function attachDirection(socket, session, rooms, limits) {
    socket.on('input:direction', raw => {
        if (session.background || !session.connected || session.socketId !== socket.id || socket.data.generation !== session.generation)
            return;
        if (limits && !limits.direction(session, socket))
            return;
        if (!validDirection(raw))
            return;
        const current = rooms.member(session);
        if (!current || current.room.phase !== 'RUNNING' || current.member.waitingForNextRound || !current.room.match)
            return;
        const match = current.room.match, p = match.participants.find(p => p.participantId === current.member.memberId);
        if (!p || p.kind !== 'HUMAN' || p.lifeState !== 'ALIVE' || raw.matchId !== match.matchId || raw.lifeId !== p.lifeId)
            return;
        if (session.inputMatchId !== match.matchId || session.inputLifeId !== p.lifeId) {
            session.highestReceivedSeq = 0;
            session.inputMatchId = match.matchId;
            session.inputLifeId = p.lifeId;
        }
        if (raw.seq <= session.highestReceivedSeq)
            return;
        session.highestReceivedSeq = raw.seq;
        current.room.inputs.set(p.participantId, { ...raw });
    });
}
