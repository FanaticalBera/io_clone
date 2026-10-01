import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { leaveParticipant } from '../shared/life.js';
import { makeParticipant } from '../shared/state.js';
import { trySpawn } from '../shared/spawn.js';
import { validateConfig } from '../shared/config.js';
import { createMatch } from '../shared/game.js';
import { botSpecs, createBotMemory } from '../shared/bot.js';
import { normalizeNickname } from '../shared/names.js';
import { createMode, roundDeadlineTicks, isGameModeId } from '../shared/modes.js';
export class RoomManager {
    sessions;
    maxRooms;
    seed;
    codeGenerator;
    initializeMatch;
    modeSettings;
    rooms = new Map();
    config;
    accepting = true;
    joinCounter = 0;
    constructor(sessions, config = {}, maxRooms = 10, seed = () => randomBytes(4).readUInt32LE(0), codeGenerator = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''), initializeMatch, modeSettings = {}) {
        this.sessions = sessions;
        this.maxRooms = maxRooms;
        this.seed = seed;
        this.codeGenerator = codeGenerator;
        this.initializeMatch = initializeMatch;
        this.modeSettings = modeSettings;
        this.config = validateConfig(config);
        createMode('hold', modeSettings);
        if (!Number.isSafeInteger(maxRooms) || maxRooms < 1 || maxRooms > 1000)
            throw new Error('Invalid room limit');
    }
    createRoom(mode, gameMode, code = null) {
        if (!this.accepting || this.rooms.size >= this.maxRooms)
            return null;
        const now = this.sessions.now(), room = { roomId: randomUUID(), mode, gameMode: createMode(gameMode, this.modeSettings), code, createdAt: now, phase: 'WAITING',
            phaseDeadline: mode === 'PUBLIC' ? now + this.config.publicRecruitSeconds * 1000 : null, members: new Map(), hostId: null, match: null,
            roundNumber: 0, revision: 1, snapshotSeq: 0, accumulator: 0, lastStepAt: now, emptyDeadline: null, inputs: new Map(), bots: new Map() };
        this.rooms.set(room.roomId, room);
        return room;
    }
    addMember(room, session, nickname, waiting = false) {
        const member = { memberId: randomUUID(), session, nickname, joinOrder: ++this.joinCounter, waitingForNextRound: waiting, graceUntil: null };
        room.members.set(member.memberId, member);
        session.roomId = room.roomId;
        session.memberId = member.memberId;
        room.emptyDeadline = null;
        session.expiresAt = Infinity;
        room.revision++;
        if (room.mode === 'FRIEND' && !room.hostId)
            room.hostId = member.memberId;
        return member;
    }
    quickJoin(session, nickname, gameMode = 'classic') {
        if (!isGameModeId(gameMode))
            return { ok: false, code: 'INVALID_INPUT', message: '지원하지 않는 게임 모드입니다.' };
        if (session.roomId)
            return { ok: false, code: 'ALREADY_IN_ROOM', message: '이미 방에 참가하고 있습니다.' };
        const name = normalizeNickname(nickname);
        if (!name)
            return { ok: false, code: 'INVALID_NICKNAME', message: '닉네임은 1–16자로 입력하세요.' };
        this.advance();
        let room = [...this.rooms.values()].filter(r => r.mode === 'PUBLIC' && r.gameMode.id === gameMode && r.members.size < 8 && (r.phase === 'WAITING' || r.phase === 'COUNTDOWN' && r.roundNumber === 0)).sort((a, b) => a.createdAt - b.createdAt)[0];
        if (!room)
            room = this.createRoom('PUBLIC', gameMode) ?? undefined;
        if (!room)
            return { ok: false, code: 'SERVER_BUSY', message: '대전 서버가 가득 찼습니다. 잠시 후 다시 시도하세요.' };
        this.addMember(room, session, name);
        return { ok: true, roomId: room.roomId };
    }
    createFriend(session, nickname, gameMode = 'classic') {
        if (!isGameModeId(gameMode))
            return { ok: false, code: 'INVALID_INPUT', message: '지원하지 않는 게임 모드입니다.' };
        if (session.roomId)
            return { ok: false, code: 'ALREADY_IN_ROOM', message: '이미 방에 참가하고 있습니다.' };
        const name = normalizeNickname(nickname);
        if (!name)
            return { ok: false, code: 'INVALID_NICKNAME', message: '닉네임은 1–16자로 입력하세요.' };
        let code = '';
        for (let attempt = 0; attempt < 32; attempt++) {
            const candidate = this.codeGenerator();
            if (!/^[A-HJ-NP-Z2-9]{8}$/.test(candidate))
                throw new Error('Invalid generated code');
            if (![...this.rooms.values()].some(r => r.code === candidate)) {
                code = candidate;
                break;
            }
        }
        if (!code)
            return { ok: false, code: 'SERVER_BUSY', message: '새 방을 만들 수 없습니다. 잠시 후 다시 시도하세요.' };
        const room = this.createRoom('FRIEND', gameMode, code);
        if (!room)
            return { ok: false, code: 'SERVER_BUSY', message: '대전 서버가 가득 찼습니다.' };
        this.addMember(room, session, name);
        return { ok: true, roomId: room.roomId };
    }
    joinFriend(session, nickname, rawCode) {
        if (session.roomId)
            return { ok: false, code: 'ALREADY_IN_ROOM', message: '이미 방에 참가하고 있습니다.' };
        const name = normalizeNickname(nickname);
        if (!name)
            return { ok: false, code: 'INVALID_NICKNAME', message: '닉네임은 1–16자로 입력하세요.' };
        this.advance();
        const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
        const room = [...this.rooms.values()].find(r => r.code === code && r.mode === 'FRIEND' && r.phase !== 'CLOSED');
        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code) || !room)
            return { ok: false, code: 'ROOM_NOT_FOUND', message: '존재하지 않는 방 코드입니다.' };
        if (room.members.size >= 8)
            return { ok: false, code: 'ROOM_FULL', message: '친구 방의 사람 정원 8명이 모두 찼습니다.' };
        this.addMember(room, session, name, room.phase !== 'WAITING');
        return { ok: true, roomId: room.roomId };
    }
    start(session) {
        const current = this.member(session);
        if (!current)
            return { ok: false, code: 'ROOM_NOT_FOUND', message: '참가 중인 방이 없습니다.' };
        if (current.room.hostId !== current.member.memberId)
            return { ok: false, code: 'NOT_HOST', message: '방장만 처음 라운드를 시작할 수 있습니다.' };
        if (current.room.phase !== 'WAITING')
            return { ok: false, code: 'BAD_PHASE', message: '이미 라운드를 준비하거나 진행 중입니다.' };
        this.beginCountdown(current.room);
        return { ok: true, roomId: current.room.roomId };
    }
    transferHost(room) {
        if (room.mode !== 'FRIEND')
            return;
        room.hostId = [...room.members.values()].filter(m => m.session.connected).sort((a, b) => a.joinOrder - b.joinOrder)[0]?.memberId ?? null;
        room.revision++;
    }
    leave(session) {
        const current = this.member(session);
        if (!current)
            return { ok: true };
        const { room, member } = current;
        const p = room.match?.participants.find(p => p.participantId === member.memberId);
        if (room.phase === 'RUNNING' && room.match && p)
            this.replaceWithBot(room, p.participantId);
        room.members.delete(member.memberId);
        room.inputs.delete(member.memberId);
        session.roomId = null;
        session.memberId = null;
        session.background = false;
        session.expiresAt = this.sessions.now() + 60000;
        if (room.hostId === member.memberId)
            this.transferHost(room);
        if (!room.members.size)
            room.emptyDeadline = this.sessions.now() + this.config.emptyRoomTtlSeconds * 1000;
        room.revision++;
        return { ok: true };
    }
    beginCountdown(room, at = this.sessions.now()) {
        if (!room.members.size) {
            room.phase = 'WAITING';
            room.phaseDeadline = null;
            room.revision++;
            return;
        }
        for (const member of room.members.values())
            member.waitingForNextRound = false;
        room.phase = 'COUNTDOWN';
        room.phaseDeadline = at + this.config.countdownSeconds * 1000;
        room.revision++;
    }
    startMatch(room, at) {
        const members = [...room.members.values()].filter(m => !m.waitingForNextRound).sort((a, b) => a.joinOrder - b.joinOrder);
        if (!members.length) {
            room.phase = 'WAITING';
            room.phaseDeadline = null;
            room.revision++;
            return;
        }
        const matchId = room.roomId + ':round:' + (++room.roundNumber);
        const humans = members.map((m, slot) => ({ participantId: m.memberId, slot, nickname: m.nickname, kind: 'HUMAN' }));
        const seed = this.seed();
        room.match = createMatch(this.config, seed, [...humans, ...botSpecs(8 - humans.length, humans.length, matchId)], matchId, room.gameMode);
        this.initializeMatch?.(room.match);
        room.inputs.clear();
        room.bots.clear();
        for (const p of room.match.participants)
            if (p.kind === 'BOT')
                room.bots.set(p.participantId, createBotMemory(seed ^ (p.slot * 2654435761)));
        room.snapshotSeq = 0;
        room.accumulator = 0;
        room.lastStepAt = at;
        room.phase = 'RUNNING';
        room.phaseDeadline = null;
        room.revision++;
        for (const member of members) {
            member.session.highestReceivedSeq = 0;
        }
    }
    disconnected(session) {
        const current = this.member(session);
        if (!current)
            return;
        current.member.graceUntil = this.sessions.now() + this.config.reconnectGraceSeconds * 1000;
        session.expiresAt = current.member.graceUntil;
        session.background = true;
        current.room.inputs.delete(current.member.memberId);
        if (current.room.hostId === current.member.memberId)
            this.transferHost(current.room);
        current.room.revision++;
    }
    restored(session) {
        const current = this.member(session);
        if (!current)
            return;
        current.member.graceUntil = null;
        session.expiresAt = Infinity;
        this.setBackground(session, false);
        if (current.room.mode === 'FRIEND' && !current.room.hostId)
            this.transferHost(current.room);
        current.room.revision++;
    }
    setBackground(session, background) {
        session.background = background;
        const current = this.member(session);
        if (!current)
            return { ok: true };
        current.room.inputs.delete(current.member.memberId);
        current.room.bots.delete(current.member.memberId);
        const p = current.room.match?.participants.find(p => p.participantId === current.member.memberId);
        if (p) {
            session.highestReceivedSeq = p.lastAppliedInputSeq;
            session.inputMatchId = current.room.match.matchId;
            session.inputLifeId = p.lifeId;
        }
        return { ok: true, roomId: current.room.roomId };
    }
    replaceWithBot(room, participantId) {
        if (room.phase !== 'RUNNING' || !room.match)
            return;
        const match = room.match, old = match.participants.find(p => p.participantId === participantId);
        if (!old)
            return;
        leaveParticipant(match, old);
        match.participants = match.participants.filter(p => p !== old);
        room.bots.delete(participantId);
        const template = botSpecs(4, 0, match.matchId + '-replacement-' + randomUUID())[old.slot % 4];
        const p = makeParticipant({ ...template, slot: old.slot });
        p.respawnAtTick = match.tick;
        match.participants.push(p);
        room.bots.set(p.participantId, createBotMemory(match.seed ^ (p.slot * 2654435761) ^ match.tick));
        trySpawn(match, p);
    }
    closeRoom(room) {
        for (const member of room.members.values()) {
            member.session.roomId = null;
            member.session.memberId = null;
            member.session.expiresAt = this.sessions.now() + 60000;
        }
        room.phase = 'CLOSED';
        room.match = null;
        room.members.clear();
        room.bots.clear();
        room.inputs.clear();
        room.phaseDeadline = null;
        room.emptyDeadline = null;
        this.rooms.delete(room.roomId);
    }
    expireMembers(now) {
        for (const room of [...this.rooms.values()]) {
            for (const member of [...room.members.values()])
                if (member.graceUntil !== null && member.graceUntil <= now) {
                    const session = member.session;
                    this.leave(session);
                    this.sessions.sessions.delete(session.token);
                }
            if (room.emptyDeadline !== null && room.emptyDeadline <= now && !room.members.size)
                this.closeRoom(room);
        }
    }
    advance() {
        const now = this.sessions.now();
        this.expireMembers(now);
        for (const room of this.rooms.values()) {
            if (room.phase === 'WAITING' && room.mode === 'PUBLIC' && room.phaseDeadline !== null && room.phaseDeadline <= now)
                this.beginCountdown(room, room.phaseDeadline);
            if (room.phase === 'RESULTS' && room.phaseDeadline !== null && room.phaseDeadline <= now)
                this.beginCountdown(room, room.phaseDeadline);
            if (room.phase === 'COUNTDOWN' && room.phaseDeadline !== null && room.phaseDeadline <= now)
                this.startMatch(room, room.phaseDeadline);
            if (room.phase === 'RUNNING' && room.match?.phase === 'FINISHED') {
                room.phase = 'RESULTS';
                room.phaseDeadline = now + (this.config.resultsSecondsIncludingCountdown - this.config.countdownSeconds) * 1000;
                room.revision++;
            }
        }
    }
    view(room, member) {
        const remainingSeconds = room.phase === 'RUNNING' && room.match ? (roundDeadlineTicks(room.match) === null ? null : Math.max(0, (roundDeadlineTicks(room.match) - room.match.tick) / room.match.config.simulationHz)) :
            room.phaseDeadline === null ? 0 : Math.max(0, (room.phaseDeadline - this.sessions.now()) / 1000);
        return { roomId: room.roomId, mode: room.mode, gameMode: { ...room.gameMode }, outcome: room.match?.outcome ? { ...room.match.outcome } : null, code: room.code, phase: room.phase, phaseDeadline: room.phaseDeadline, serverTime: this.sessions.now(),
            members: [...room.members.values()].sort((a, b) => a.joinOrder - b.joinOrder).map(m => ({ memberId: m.memberId, nickname: m.nickname, connected: m.session.connected, waitingForNextRound: m.waitingForNextRound })),
            hostId: room.hostId, selfMemberId: member.memberId, selfParticipantId: room.match?.participants.some(p => p.participantId === member.memberId) ? member.memberId : null,
            waitingForNextRound: member.waitingForNextRound, remainingSeconds, results: room.phase === 'RESULTS' ? room.match?.results ?? null : null, matchId: room.match?.matchId ?? null, mapCellCount: room.match?.map.cells.length ?? 1 + 3 * this.config.mapRadius * (this.config.mapRadius + 1) };
    }
    member(session) {
        const room = session.roomId ? this.rooms.get(session.roomId) : undefined, member = room && session.memberId ? room.members.get(session.memberId) : undefined;
        return room && member ? { room, member } : null;
    }
}
