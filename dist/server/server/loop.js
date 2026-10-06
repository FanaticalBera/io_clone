import { buildView, stepMatch } from '../shared/game.js';
import { getBotInput, observeBotForTick, createBotMemory } from '../shared/bot.js';
import { packSnapshot } from '../shared/protocol.js';
export class GameLoop {
    io;
    rooms;
    log;
    metrics = { steps: 0, stepMs: [], snapshotBytes: 0, snapshots: 0, maxBacklogMs: 0 };
    timer = null;
    state = new WeakMap();
    constructor(io, rooms, log = () => { }) {
        this.io = io;
        this.rooms = rooms;
        this.log = log;
    }
    start() { if (!this.timer)
        this.timer = setInterval(() => this.pump(), 10); }
    stop() { if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
    } }
    publishRoom(room) {
        for (const member of room.members.values()) {
            const socketId = member.session.socketId, socket = socketId ? this.io.sockets.sockets.get(socketId) : undefined;
            if (!socket)
                continue;
            socket.join('lobby:' + room.roomId);
            const active = !member.waitingForNextRound && room.match?.participants.some(p => p.participantId === member.memberId);
            if (active)
                socket.join('arena:' + room.roomId);
            else
                socket.leave('arena:' + room.roomId);
            socket.emit('room:view', this.rooms.view(room, member));
        }
    }
    publishSnapshot(room, init = false, reliable = false, only) {
        if (!room.match)
            return;
        const view = buildView(room.match), seq = ++room.snapshotSeq, now = this.rooms.sessions.now();
        const base = packSnapshot(view, seq, now, null);
        for (const member of room.members.values()) {
            if (member.waitingForNextRound || !member.session.connected || only && member.session !== only)
                continue;
            const p = view.participants.find(p => p.participantId === member.memberId);
            if (!p)
                continue;
            const socket = member.session.socketId ? this.io.sockets.sockets.get(member.session.socketId) : undefined;
            if (!socket)
                continue;
            socket.join('arena:' + room.roomId);
            const snapshot = { ...base, selfParticipantId: p.participantId, lastAppliedInputSeq: p.lastAppliedInputSeq };
            this.metrics.snapshotBytes += Buffer.byteLength(JSON.stringify(snapshot));
            this.metrics.snapshots++;
            if (init)
                socket.emit('match:init', snapshot);
            else if (reliable)
                socket.emit('match:snapshot', snapshot);
            else
                socket.volatile.emit('match:snapshot', snapshot);
        }
    }
    synchronize(session) {
        const current = this.rooms.member(session);
        if (!current)
            return;
        const socket = session.socketId ? this.io.sockets.sockets.get(session.socketId) : undefined;
        if (!socket)
            return;
        socket.emit('room:view', this.rooms.view(current.room, current.member));
        if (!current.member.waitingForNextRound && current.room.match)
            this.publishSnapshot(current.room, true, true, session);
    }
    abort(room, code = 'MATCH_ABORTED') {
        const message = code === 'SERVER_OVERLOAD' ? '서버가 경기 시간을 따라잡지 못해 이 판을 종료했습니다.' : '경기가 중단되었습니다. 다시 입장하거나 연습을 선택하세요.';
        for (const member of room.members.values()) {
            const session = member.session, socket = session.socketId ? this.io.sockets.sockets.get(session.socketId) : undefined;
            socket?.emit('app:error', { code, message });
            socket?.leave('arena:' + room.roomId);
            socket?.leave('lobby:' + room.roomId);
            session.roomId = null;
            session.memberId = null;
        }
        room.phase = 'CLOSED';
        room.match = null;
        room.bots.clear();
        room.inputs.clear();
        room.members.clear();
        this.rooms.rooms.delete(room.roomId);
        this.log('room_closed', { roomId: room.roomId, code });
    }
    pump() {
        const now = this.rooms.sessions.now();
        this.rooms.advance();
        let overloaded = false;
        for (const room of [...this.rooms.rooms.values()]) {
            let cache = this.state.get(room);
            if (!cache) {
                cache = { revision: -1, viewAt: -Infinity, matchId: null, lastSentTick: -1, lastEvent: 0, resultId: null };
                this.state.set(room, cache);
            }
            try {
                if (room.phase === 'RUNNING' && room.match) {
                    if (cache.matchId !== room.match.matchId) {
                        cache.matchId = room.match.matchId;
                        cache.lastSentTick = -1;
                        cache.lastEvent = 0;
                        cache.resultId = null;
                        this.publishRoom(room);
                        this.publishSnapshot(room, true, true);
                        this.log('match_started', { roomId: room.roomId, matchId: room.match.matchId });
                    }
                    room.accumulator += Math.max(0, now - room.lastStepAt) / 1000;
                    room.lastStepAt = now;
                    this.metrics.maxBacklogMs = Math.max(this.metrics.maxBacklogMs, room.accumulator * 1000);
                    if (room.accumulator >= 3) {
                        this.abort(room, 'SERVER_OVERLOAD');
                        continue;
                    }
                    if (room.accumulator > 0.25)
                        overloaded = true;
                    const dt = 1 / room.match.config.simulationHz;
                    let count = 0;
                    while (room.accumulator + 1e-9 >= dt && count < 5 && room.match.phase === 'RUNNING') {
                        const before = performance.now();
                        const inputs = new Map(room.inputs);
                        room.inputs.clear();
                        for (const p of room.match.participants)
                            if (p.lifeState === 'ALIVE' && (p.kind === 'BOT' || room.members.get(p.participantId)?.session.background || room.members.get(p.participantId)?.session.connected === false)) {
                                let memory = room.bots.get(p.participantId);
                                if (!memory) {
                                    memory = createBotMemory(room.match.seed ^ p.slot);
                                    room.bots.set(p.participantId, memory);
                                }
                                memory.seq = Math.max(memory.seq, p.lastAppliedInputSeq);
                                const input = getBotInput(observeBotForTick(room.match, p.participantId, memory), memory, p.kind === 'HUMAN');
                                if (input)
                                    inputs.set(p.participantId, input);
                            }
                        stepMatch(room.match, inputs);
                        const duration = performance.now() - before;
                        this.metrics.steps++;
                        this.metrics.stepMs.push(duration);
                        if (this.metrics.stepMs.length > 30000)
                            this.metrics.stepMs.splice(0, 1000);
                        room.accumulator -= dt;
                        count++;
                    }
                    const interval = room.match.config.simulationHz / room.match.config.snapshotHz;
                    if (Math.floor(room.match.tick / interval) > Math.floor(cache.lastSentTick / interval) || room.match.phase === 'FINISHED' && cache.resultId !== room.match.matchId) {
                        const spawn = room.match.events.some(e => e.type === 'SPAWN' && Number(e.eventId.split(':').at(-1)) > cache.lastEvent);
                        this.publishSnapshot(room, false, spawn || room.match.phase === 'FINISHED');
                        cache.lastSentTick = room.match.tick;
                        cache.lastEvent = room.match.eventCounter;
                    }
                    this.rooms.advance();
                }
                if (room.phase === 'RESULTS' && room.match && cache.resultId !== room.match.matchId) {
                    cache.resultId = room.match.matchId;
                    for (const member of room.members.values())
                        if (room.match.participants.some(p => p.participantId === member.memberId) && member.session.socketId)
                            this.io.to(member.session.socketId).emit('match:result', { matchId: room.match.matchId, results: room.match.results ?? [], gameMode: room.match.gameMode, modeState: room.match.modeState, outcome: room.match.outcome });
                    this.publishRoom(room);
                }
                if (room.revision !== cache.revision || now - cache.viewAt >= 1000) {
                    this.publishRoom(room);
                    cache.revision = room.revision;
                    cache.viewAt = now;
                }
            }
            catch (error) {
                this.log('match_error', { roomId: room.roomId, error: error instanceof Error ? error.stack : 'unknown' });
                this.abort(room);
            }
        }
        this.rooms.accepting = !overloaded;
        for (const session of this.rooms.sessions.prune()) {
            const socket = session.socketId ? this.io.sockets.sockets.get(session.socketId) : undefined;
            socket?.emit('app:error', { code: 'SESSION_EXPIRED', message: '유휴 연결이 종료되었습니다. 다시 입장하세요.' });
            socket?.disconnect(true);
        }
    }
}
