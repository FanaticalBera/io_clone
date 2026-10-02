import { region } from './hex.js';
import { setOwner } from './territory.js';
import { emitEvent } from './life.js';
import { roundDeadlineTicks } from './modes.js';
const regionCache = new WeakMap();
function spawnRegions(match) {
    let radii = regionCache.get(match.map);
    if (!radii) {
        radii = new Map();
        regionCache.set(match.map, radii);
    }
    let zones = radii.get(match.config.spawnRadius);
    if (!zones) {
        zones = match.map.cells.map(c => region(match.map, c.id, match.config.spawnRadius));
        radii.set(match.config.spawnRadius, zones);
    }
    return zones;
}
const spawnObservers = new WeakMap();
export function watchSpawnAttempts(match, observer) { spawnObservers.set(match, observer); return () => spawnObservers.delete(match); }
// The actual spawn selector and measurement share this one zone/safety scan.
// Omitting p measures space for a hypothetical dead participant (all alive
// bodies are obstacles). Eligibility/delay is handled by trySpawn/tryRespawns.
export function inspectSpawnSpace(match, p, reserved = new Set()) {
    const count = match.map.cells.length, distances = new Int32Array(count);
    distances.fill(count);
    const queue = new Int32Array(count);
    let head = 0, tail = 0;
    const sources = new Set(reserved);
    for (const other of match.participants)
        if (other !== p && other.lifeState === 'ALIVE') {
            sources.add(other.cellId);
            for (const id of other.trailCells)
                sources.add(id);
        }
    for (const id of sources)
        if (id >= 0 && distances[id] !== 0) {
            distances[id] = 0;
            queue[tail++] = id;
        }
    while (head < tail) {
        const id = queue[head++];
        for (const n of match.map.cells[id].neighbors)
            if (n >= 0 && distances[n] > distances[id] + 1) {
                distances[n] = distances[id] + 1;
                queue[tail++] = n;
            }
    }
    const zones = spawnRegions(match), pointCells = new Set(match.map.controlPoints.map(cp => cp.cellId));
    let best = -1, bestSafety = -1, validCenterCount = 0;
    for (const center of match.spawnOrder) {
        const zone = zones[center];
        let safety = count, valid = true;
        for (const id of zone) {
            if (id < 0 || match.owners[id] !== 0 || match.trailMasks[id] !== 0 || pointCells.has(id) || reserved.has(id) || distances[id] < match.config.spawnBufferHexes) {
                valid = false;
                break;
            }
            safety = Math.min(safety, distances[id]);
        }
        if (valid) {
            validCenterCount++;
            if (safety > bestSafety) {
                best = center;
                bestSafety = safety;
            }
        }
    }
    return { validCenterCount, bestCenter: best, bestSafety };
}
export function trySpawn(match, p, reserved = new Set()) {
    if (match.phase !== 'RUNNING' || p.lifeState === 'FINISHED' || p.lifeState === 'ALIVE' ||
        (roundDeadlineTicks(match) !== null && roundDeadlineTicks(match) - match.tick <= match.config.respawnSeconds * match.config.simulationHz))
        return false;
    const { bestCenter: best, validCenterCount } = inspectSpawnSpace(match, p, reserved), observer = spawnObservers.get(match);
    const trace = observer ? { tick: match.tick, participantId: p.participantId, kind: p.kind, stateBefore: p.lifeState, leaderCells: Math.max(...match.participants.map(p => p.territoryCount)), neutralCells: match.owners.reduce((sum, owner) => sum + Number(owner === 0), 0), validCenterCount, alive: match.participants.filter(p => p.lifeState === 'ALIVE').length, deadWait: match.participants.filter(p => p.lifeState === 'DEAD_WAIT').length, spawnBlocked: match.participants.filter(p => p.lifeState === 'SPAWN_BLOCKED').length, reservedCells: reserved.size, success: best >= 0, center: best < 0 ? null : best } : undefined;
    if (best < 0) {
        p.lifeState = 'SPAWN_BLOCKED';
        p.respawnAtTick = match.tick + Math.ceil(match.config.retrySpawnSeconds * match.config.simulationHz);
        if (trace && observer)
            observer(trace);
        return false;
    }
    p.lifeState = 'ALIVE';
    p.lifeId++;
    p.cellId = best;
    p.position = { ...match.map.cells[best].center };
    const length = Math.hypot(p.position.x, p.position.y);
    p.direction = length ? { x: -p.position.x / length, y: -p.position.y / length } : { x: 1, y: 0 };
    p.spawnCells = new Set(spawnRegions(match)[best]);
    p.lastAppliedInputSeq = 0;
    p.targetDirection = null;
    p.deathReason = null;
    p.deathContext = undefined;
    p.protectedUntilTick = match.tick + Math.ceil(match.config.protectSeconds * match.config.simulationHz);
    for (const id of p.spawnCells)
        setOwner(match, id, p.slot + 1);
    emitEvent(match, { type: 'SPAWN', participantId: p.participantId });
    if (trace && observer)
        observer(trace);
    return true;
}
export function tryRespawns(match) {
    const reserved = new Set();
    for (const slot of match.priority) {
        const p = match.participants.find(p => p.slot === slot);
        if (p && (p.lifeState === 'DEAD_WAIT' || p.lifeState === 'SPAWN_BLOCKED') && p.respawnAtTick <= match.tick && trySpawn(match, p, reserved))
            for (const id of p.spawnCells)
                reserved.add(id);
    }
}
