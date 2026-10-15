import { buildView, stepMatch } from './game.js';
import { createBotMemory, createGameplayBotMemory } from './bot.js';
import { getBotInputs } from './bot-director.js';
import { perfNow, perfAdd } from './perf-sink.js';
import { botSeed, createBotIdentity } from './bot-identity.js';
import { packSnapshot } from './protocol.js';
export class RoomLoop {
    rooms;
    output;
    log;
    metrics = { steps: 0, stepMs: [], snapshotBytes: 0, snapshotSentBytes: 0, snapshots: 0, maxBacklogMs: 0 };
    state = new WeakMap();
    constructor(rooms, output, log = () => { }) {
        this.rooms = rooms;
        this.output = output;
        this.log = log;
    }
    publishRoom(room) {
        for (const member of room.members.values()) {
            const active = !member.waitingForNextRound && !!room.match?.participants.some(p => p.participantId === member.memberId);
            this.output.roomView(room, member, this.rooms.view(room, member), active);
        }
    }
    publishSnapshot(room, init = false, reliable = false, only) {
        if (!room.match)
            return;
        const netAt = perfNow();
        const view = buildView(room.match), seq = ++room.snapshotSeq, now = this.rooms.sessions.now();
        const base = packSnapshot(view, seq, now, null);
        perfAdd('net.pack', netAt);
        const sendAt = perfNow();
        for (const member of room.members.values()) {
            if (member.waitingForNextRound || !member.session.connected || only && member.session !== only)
                continue;
            const p = view.participants.find(p => p.participantId === member.memberId);
            if (!p)
                continue;
            const snapshot = { ...base, selfParticipantId: p.participantId, lastAppliedInputSeq: p.lastAppliedInputSeq };
            if (this.output.snapshot(room, member, snapshot, init ? 'init' : reliable ? 'reliable' : 'volatile'))
                this.metrics.snapshots++;
        }
        perfAdd('net.send', sendAt);
        perfAdd('net', netAt);
    }
    synchronize(session) {
        const current = this.rooms.member(session);
        if (!current)
            return;
        const active = !current.member.waitingForNextRound && !!current.room.match?.participants.some(p => p.participantId === current.member.memberId);
        this.output.roomView(current.room, current.member, this.rooms.view(current.room, current.member), active);
        if (!current.member.waitingForNextRound && current.room.match)
            this.publishSnapshot(current.room, true, true, session);
    }
    abort(room, code = 'MATCH_ABORTED', message) {
        message ??= code === 'SERVER_OVERLOAD' ? '서버가 경기 시간을 따라잡지 못해 이 판을 종료했습니다.' : '경기가 중단되었습니다. 다시 입장하거나 연습을 선택하세요.';
        for (const member of room.members.values()) {
            this.output.aborted(room, member, { code, message });
            member.session.roomId = null;
            member.session.memberId = null;
        }
        room.phase = 'CLOSED';
        room.match = null;
        room.bots.clear();
        room.inputs.clear();
        room.members.clear();
        this.rooms.rooms.delete(room.roomId);
        this.log('room_closed', { roomId: room.roomId, code });
    }
    /** Runs one scheduler pass. Returns whether any room is behind (the server stops accepting new rooms then). */
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
                    const simAt = perfNow();
                    while (room.accumulator + 1e-9 >= dt && count < 5 && room.match.phase === 'RUNNING') {
                        const before = performance.now();
                        const inputs = new Map(room.inputs);
                        room.inputs.clear();
                        const selected = new Set(), returnOnly = new Set();
                        for (const p of room.match.participants)
                            if (p.lifeState === 'ALIVE' && (p.kind === 'BOT' || room.members.get(p.participantId)?.session.background || room.members.get(p.participantId)?.session.connected === false)) {
                                let memory = room.bots.get(p.participantId);
                                if (!memory) {
                                    const seed = botSeed(room.match.seed, p.slot);
                                    memory = p.kind === 'BOT' ? createGameplayBotMemory(seed, 'combined', createBotIdentity(seed, p.personality)) : createBotMemory(seed, 'combined');
                                    room.bots.set(p.participantId, memory);
                                }
                                memory.seq = Math.max(memory.seq, p.lastAppliedInputSeq);
                                selected.add(p.participantId);
                                if (p.kind === 'HUMAN')
                                    returnOnly.add(p.participantId);
                            }
                        let span = perfNow();
                        for (const [id, input] of getBotInputs(room.match, room.bots, selected, returnOnly))
                            inputs.set(id, input);
                        perfAdd('sim.bot', span);
                        span = perfNow();
                        stepMatch(room.match, inputs);
                        perfAdd('sim.engine', span);
                        const duration = performance.now() - before;
                        this.metrics.steps++;
                        this.metrics.stepMs.push(duration);
                        if (this.metrics.stepMs.length > 30000)
                            this.metrics.stepMs.splice(0, 1000);
                        room.accumulator -= dt;
                        count++;
                    }
                    perfAdd('sim', simAt);
                    const interval = room.match.config.simulationHz / room.match.config.snapshotHz;
                    // Cuts and closed excursions change which trails can be hit. Deliver both
                    // immediately: a stale trail after capture looks like an ignored collision,
                    // just as a delayed death makes a marker appear to pass through a live trail.
                    const contactChanged = room.match.events.some(e => (e.type === 'DEATH' || e.type === 'CAPTURE') && Number(e.eventId.split(':').at(-1)) > cache.lastEvent);
                    if (contactChanged || Math.floor(room.match.tick / interval) > Math.floor(cache.lastSentTick / interval) || room.match.phase === 'FINISHED' && cache.resultId !== room.match.matchId) {
                        const spawn = room.match.events.some(e => e.type === 'SPAWN' && Number(e.eventId.split(':').at(-1)) > cache.lastEvent);
                        this.publishSnapshot(room, false, contactChanged || spawn || room.match.phase === 'FINISHED');
                        cache.lastSentTick = room.match.tick;
                        cache.lastEvent = room.match.eventCounter;
                    }
                    this.rooms.advance();
                }
                if (room.phase === 'RESULTS' && room.match && cache.resultId !== room.match.matchId) {
                    cache.resultId = room.match.matchId;
                    const payload = { matchId: room.match.matchId, results: room.match.results ?? [], gameMode: room.match.gameMode, modeState: room.match.modeState, outcome: room.match.outcome };
                    for (const member of room.members.values())
                        if (room.match.participants.some(p => p.participantId === member.memberId))
                            this.output.result(room, member, payload);
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
        return overloaded;
    }
}
