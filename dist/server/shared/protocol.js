import { PROTOCOL_VERSION, validateConfig } from './config.js';
import { isGameModeId, validateMode, GAME_MODES } from './modes.js';
export function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validDeathContext(value, count) {
    return value === undefined || (record(value) && ['TRAIL_CONTACT', 'EXISTING_TRAIL_CONTACT', 'PENDING_TRAIL_CONTACT', 'TRAIL_CAPTURE', 'HOME_CAPTURE', 'TERRITORY_LOST', 'WALL_HIT'].includes(String(value.cause)) && Number.isInteger(value.cellId) && Number(value.cellId) >= 0 && Number(value.cellId) < count && (value.eventTick === undefined || (typeof value.eventTick === 'number' && Number.isFinite(value.eventTick) && value.eventTick >= 0)));
}
export function validRequest(value) {
    return record(value) && typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value.requestId) &&
        (value.gameMode === undefined || isGameModeId(value.gameMode)) && Object.keys(value).every(key => ['requestId', 'nickname', 'code', 'gameMode'].includes(key));
}
export function validDirection(value) {
    return record(value) && Object.keys(value).every(k => ['matchId', 'lifeId', 'seq', 'dx', 'dy'].includes(k)) &&
        typeof value.matchId === 'string' && value.matchId.length > 0 && value.matchId.length <= 128 &&
        Number.isSafeInteger(value.lifeId) && Number(value.lifeId) > 0 && Number.isSafeInteger(value.seq) && Number(value.seq) > 0 &&
        typeof value.dx === 'number' && typeof value.dy === 'number' && Number.isFinite(value.dx) && Number.isFinite(value.dy) && Math.abs(value.dx) <= 1 && Math.abs(value.dy) <= 1;
}
export function encodeBytes(bytes) {
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
export function decodeBytes(value, length) {
    if (typeof value !== 'string' || value.length !== 4 * Math.ceil(length / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
        throw new Error('Invalid base64');
    const binary = atob(value);
    if (binary.length !== length)
        throw new Error('Invalid byte length');
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (encodeBytes(bytes) !== value)
        throw new Error('Noncanonical base64');
    return bytes;
}
// Protocol v4: each trail cell is exactly two bytes, low byte first.
// Explicit shifts make this independent of the host's native byte order.
export function encodeTrailMasks(masks) {
    if (!(masks instanceof Uint16Array))
        throw new Error('Expected Uint16 trail masks');
    const bytes = new Uint8Array(masks.length * 2);
    for (let i = 0; i < masks.length; i++) {
        bytes[i * 2] = masks[i] & 0xff;
        bytes[i * 2 + 1] = masks[i] >>> 8;
    }
    return encodeBytes(bytes);
}
export function decodeTrailMasks(value, length) {
    if (!Number.isSafeInteger(length) || length < 0)
        throw new Error('Invalid mask length');
    const bytes = decodeBytes(value, length * 2), masks = new Uint16Array(length);
    for (let i = 0; i < length; i++)
        masks[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    return masks;
}
export function packSnapshot(view, snapshotSeq, serverTime, selfParticipantId) {
    return { ...view, protocolVersion: PROTOCOL_VERSION, snapshotSeq, serverTime, owners: encodeBytes(view.owners), trailMasks: encodeTrailMasks(view.trailMasks),
        lastAppliedInputSeq: view.participants.find(p => p.participantId === selfParticipantId)?.lastAppliedInputSeq ?? 0, selfParticipantId };
}
export function unpackSnapshot(raw) {
    if (!record(raw) || raw.protocolVersion !== PROTOCOL_VERSION || typeof raw.matchId !== 'string' || raw.matchId.length > 128 ||
        !Number.isSafeInteger(raw.snapshotSeq) || Number(raw.snapshotSeq) < 0 || !Number.isSafeInteger(raw.tick) || Number(raw.tick) < 0 ||
        !Number.isFinite(raw.serverTime) || !record(raw.config) || !Array.isArray(raw.participants) ||
        !['RUNNING', 'FINISHED', 'ABORTED'].includes(String(raw.phase)))
        throw new Error('Invalid snapshot');
    const config = validateConfig(raw.config), count = 1 + 3 * config.mapRadius * (config.mapRadius + 1);
    if (raw.participants.length > config.maxSlots)
        throw new Error('Too many participants');
    const gameMode = validateMode(raw.gameMode), timeLimit = GAME_MODES[gameMode.id].timeLimitSeconds;
    if (raw.mapId !== 'hex-r' + config.mapRadius + '-a' + config.hexSideWorldUnits + '-v1' ||
        raw.remainingTicks !== (timeLimit === null ? null : Math.max(0, timeLimit * config.simulationHz - Number(raw.tick))))
        throw new Error('Invalid map/time');
    const owners = decodeBytes(raw.owners, count), trailMasks = decodeTrailMasks(raw.trailMasks, count);
    if (owners.some(o => o > config.maxSlots) || trailMasks.some(mask => mask >= (1 << config.maxSlots)))
        throw new Error('Invalid board');
    const ids = new Set(), slots = new Set();
    for (const p of raw.participants) {
        if (!record(p) || typeof p.participantId !== 'string' || p.participantId.length > 128 || ids.has(p.participantId) ||
            !Number.isInteger(p.slot) || Number(p.slot) < 0 || Number(p.slot) >= config.maxSlots || slots.has(p.slot) ||
            typeof p.nickname !== 'string' || Array.from(p.nickname).length > 16 || !['HUMAN', 'BOT'].includes(String(p.kind)) ||
            !Number.isSafeInteger(p.lifeId) || Number(p.lifeId) < 0 || !['ALIVE', 'DEAD_WAIT', 'SPAWN_BLOCKED', 'FINISHED'].includes(String(p.lifeState)) ||
            !record(p.position) || !record(p.direction) || ![p.position.x, p.position.y, p.direction.x, p.direction.y].every(n => typeof n === 'number' && Number.isFinite(n)) ||
            (p.targetDirection !== null && (!record(p.targetDirection) || ![p.targetDirection.x, p.targetDirection.y].every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(Math.hypot(Number(p.targetDirection.x), Number(p.targetDirection.y)) - 1) > 1e-6)) ||
            ![p.territoryCount, p.controlScore, p.kills, p.deaths].every(n => Number.isSafeInteger(n) && Number(n) >= 0) || typeof p.protected !== 'boolean' || !validDeathContext(p.deathContext, count))
            throw new Error('Invalid participant');
        ids.add(p.participantId);
        slots.add(p.slot);
    }
    if (!Array.isArray(raw.events) || raw.events.length > 64 || raw.events.some(e => !record(e) || typeof e.eventId !== 'string' || !['CAPTURE', 'DEATH', 'SPAWN', 'POINT', 'FINISH'].includes(String(e.type))))
        throw new Error('Invalid events');
    for (const e of raw.events) {
        if ((e.position !== undefined && (!record(e.position) || ![e.position.x, e.position.y].every(n => typeof n === 'number' && Number.isFinite(n)))) ||
            (e.killerId !== undefined && (typeof e.killerId !== 'string' || e.killerId.length > 128)) ||
            (e.lifeId !== undefined && (!Number.isSafeInteger(e.lifeId) || Number(e.lifeId) < 1)) || !validDeathContext(e.deathContext, count))
            throw new Error('Invalid combat event');
    }
    if (!record(raw.modeState) || !Array.isArray(raw.modeState.holds) || raw.modeState.holds.length > config.maxSlots)
        throw new Error('Invalid mode state');
    const heldIds = new Set();
    for (const h of raw.modeState.holds) {
        if (gameMode.id !== 'hold' || !record(h) || typeof h.participantId !== 'string' || !ids.has(h.participantId) || heldIds.has(h.participantId) ||
            typeof h.startedAtTick !== 'number' || !Number.isFinite(h.startedAtTick) || h.startedAtTick < 0 || h.startedAtTick > Number(raw.tick) ||
            typeof h.endsAtTick !== 'number' || !Number.isFinite(h.endsAtTick) || h.endsAtTick !== h.startedAtTick + Math.max(1, Math.ceil(gameMode.holdSeconds * config.simulationHz)))
            throw new Error('Invalid hold progress');
        heldIds.add(h.participantId);
    }
    if (raw.phase === 'FINISHED' && raw.outcome === null)
        throw new Error('Missing outcome');
    if (raw.outcome !== null && (!record(raw.outcome) || typeof raw.outcome.winnerId !== 'string' || !ids.has(raw.outcome.winnerId) ||
        raw.phase !== 'FINISHED' || raw.outcome.reason !== (gameMode.id === 'classic' ? 'FULL_CAPTURE' : 'HELD_TERRITORY') ||
        typeof raw.outcome.atTick !== 'number' || !Number.isFinite(raw.outcome.atTick) || raw.outcome.atTick < 0 || raw.outcome.atTick > Number(raw.tick)))
        throw new Error('Invalid outcome');
    const wire = raw;
    return { matchId: wire.matchId, seed: wire.seed, tick: wire.tick, remainingTicks: wire.remainingTicks, phase: wire.phase, config, mapId: wire.mapId,
        owners, trailMasks, participants: wire.participants, events: wire.events, results: wire.results, gameMode, modeState: wire.modeState, outcome: wire.outcome };
}
export class SnapshotGate {
    matchId = null;
    lastSeq = -1;
    events = new Set();
    reset(matchId) { this.matchId = matchId; this.lastSeq = -1; this.events.clear(); }
    accept(raw, init = false) {
        if (init && raw.matchId !== this.matchId)
            this.reset(raw.matchId);
        if (raw.matchId !== this.matchId || raw.snapshotSeq <= this.lastSeq)
            return null;
        const view = unpackSnapshot(raw);
        this.lastSeq = raw.snapshotSeq;
        view.events = view.events.filter(e => { if (this.events.has(e.eventId))
            return false; this.events.add(e.eventId); return true; });
        if (this.events.size > 2048)
            this.events = new Set([...this.events].slice(-1024));
        return view;
    }
}
