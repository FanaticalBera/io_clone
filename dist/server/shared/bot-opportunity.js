import { hexDistance } from './hex.js';
import { moveSpeed } from './config.js';
import { normalizeDirection, stepSteering } from './movement.js';
export const SHADOW_LIMITS = { maxCells: 4, maxSeconds: 2, marginSeconds: .2, maxReturnCells: 10, maxExcursionCells: 20 };
// Simulate the same waypoint steering as normal bot input, including the full
// cut-and-return route. A loop ending at its start is not already completed.
export function shadowTravelSeconds(obs, p, path) {
    if (!path.length)
        return 0;
    let position = p.position, heading = p.direction, cellId = p.cellId, index = 0;
    const speed = moveSpeed(obs.config), reach = speed / obs.config.turnRadiansPerSecond + speed / obs.config.simulationHz;
    for (let tick = 0; tick < 6 * obs.config.simulationHz; tick++) {
        if (index === path.length - 1 && cellId === path[index])
            return tick / obs.config.simulationHz;
        while (index < path.length - 1 && cellId === path[index] && Math.hypot(obs.map.cells[cellId].center.x - position.x, obs.map.cells[cellId].center.y - position.y) < reach)
            index++;
        const target = obs.map.cells[path[index]].center, intent = normalizeDirection(target.x - position.x, target.y - position.y) ?? heading, next = stepSteering(obs.map, position, cellId, heading, intent, obs.config);
        if (next.blocked)
            return Infinity;
        position = next.position;
        heading = next.direction;
        cellId = next.cellId;
    }
    return Infinity;
}
function distanceToCell(obs, position, id) {
    const vertices = obs.map.cells[id].vertices;
    let best = Infinity;
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(position.x - a.x - dx * t, position.y - a.y - dy * t));
    }
    return best;
}
// Shadow assessment has no memory, goal, personality probability or RNG input.
// Return/counter times are optimistic geometric lower bounds for opponents:
// ignoring their steering makes CLEAR conservative, not a prediction of intent.
export function evaluateShadowOpportunities(obs, nav) {
    const report = { tick: obs.tick, position: { ...obs.self.position }, ownTrailLength: obs.ownTrail.length, candidates: [], clearCount: 0 }, speed = moveSpeed(obs.config), owner = obs.self.slot + 1;
    const counts = new Map(), homes = new Map();
    for (const t of obs.trails)
        counts.set(t.slot, (counts.get(t.slot) ?? 0) + 1);
    for (const enemy of obs.others) {
        let bound = Infinity;
        if (obs.owners[enemy.cellId] === enemy.slot + 1)
            bound = 0;
        else
            for (const cell of obs.map.cells)
                if (obs.owners[cell.id] === enemy.slot + 1)
                    bound = Math.min(bound, distanceToCell(obs, enemy.position, cell.id) / speed);
        homes.set(enemy.slot, bound);
    }
    const counters = new Map();
    const lowerBound = (enemy, id) => { const key = enemy.slot + ':' + id; if (!counters.has(key))
        counters.set(key, enemy.cellId === id ? 0 : distanceToCell(obs, enemy.position, id) / speed); return counters.get(key); };
    const unique = new Set();
    for (const trail of obs.trails) {
        const key = trail.slot + ':' + trail.cellId;
        if (unique.has(key))
            continue;
        unique.add(key);
        const victim = obs.others.find(p => p.slot === trail.slot), record = { victimId: victim?.participantId ?? null, slot: trail.slot, observedTrailLength: counts.get(trail.slot) ?? 0, target: trail.cellId, distance: hexDistance(obs.map.cells[obs.self.cellId], obs.map.cells[trail.cellId]), path: [], back: [], attackSeconds: null, returnSeconds: null, victimReturnLowerBound: null, counterCutLowerBound: null, reason: 'OUT_OF_RANGE' };
        report.candidates.push(record);
        if (record.distance > SHADOW_LIMITS.maxCells)
            continue;
        if (!victim) {
            record.reason = 'UNKNOWN_VICTIM';
            continue;
        }
        if (obs.tick < obs.self.protectedUntilTick && obs.owners[trail.cellId] === owner) {
            record.reason = 'SPAWN_PROTECTED';
            continue;
        }
        const path = nav.path(obs.map, obs.self.cellId, id => id === trail.cellId, () => true, SHADOW_LIMITS.maxCells);
        if (!path) {
            record.reason = 'NO_APPROACH';
            continue;
        }
        record.path = path;
        const seconds = nav.seconds(obs, obs.self, path);
        record.attackSeconds = Number.isFinite(seconds) ? seconds : null;
        if (!Number.isFinite(seconds) || seconds > SHADOW_LIMITS.maxSeconds)
            continue;
        const home = homes.get(victim.slot);
        record.victimReturnLowerBound = Number.isFinite(home) ? home : null;
        if (!Number.isFinite(home)) {
            record.reason = 'UNKNOWN_VICTIM';
            continue;
        }
        if (seconds + SHADOW_LIMITS.marginSeconds >= home) {
            record.reason = 'VICTIM_RETURNS_FIRST';
            continue;
        }
        const back = nav.path(obs.map, trail.cellId, id => obs.owners[id] === owner, () => true, SHADOW_LIMITS.maxReturnCells);
        if (!back) {
            record.reason = 'NO_RETURN_PATH';
            continue;
        }
        record.back = back;
        if (obs.ownTrail.length + path.filter(id => obs.owners[id] !== owner).length + back.length > SHADOW_LIMITS.maxExcursionCells) {
            record.reason = 'TRAIL_BUDGET';
            continue;
        }
        const exposed = new Map(obs.ownTrail.map(id => [id, 0]));
        for (let i = 0; i < path.length; i++)
            if (obs.owners[path[i]] !== owner && !exposed.has(path[i]))
                exposed.set(path[i], nav.seconds(obs, obs.self, path.slice(0, i + 1)));
        let counter = Infinity;
        for (const enemy of obs.others)
            for (const [id, laidAt] of exposed)
                counter = Math.min(counter, Math.max(laidAt, lowerBound(enemy, id)));
        record.counterCutLowerBound = Number.isFinite(counter) ? counter : null;
        if (counter <= seconds + SHADOW_LIMITS.marginSeconds) {
            record.reason = 'COUNTER_CUT_FIRST';
            continue;
        }
        // The victim disappears at the cut. Other observed heads must also allow
        // the approach line and a bounded route home to survive after that cut.
        const total = nav.seconds(obs, obs.self, [...path, ...back]);
        record.returnSeconds = Number.isFinite(total) ? total : null;
        if (!Number.isFinite(total)) {
            record.reason = 'UNSAFE_RETURN';
            continue;
        }
        let safeReturn = true;
        for (const enemy of obs.others)
            if (enemy !== victim) {
                for (const [id, laidAt] of exposed)
                    if (Math.max(laidAt, lowerBound(enemy, id)) <= total + SHADOW_LIMITS.marginSeconds)
                        safeReturn = false;
                for (const id of back)
                    if (obs.owners[id] !== owner && lowerBound(enemy, id) <= total + SHADOW_LIMITS.marginSeconds)
                        safeReturn = false;
            }
        if (!safeReturn) {
            record.reason = 'UNSAFE_RETURN';
            continue;
        }
        record.reason = 'CLEAR_KILL_OPPORTUNITY';
        report.clearCount++;
    }
    return report;
}
export function summarizeOpportunities(frames) {
    const candidateReasons = {}, missedReasons = {}, goals = {};
    let clearFrames = 0, missedFrames = 0;
    for (const f of frames) {
        for (const c of f.candidates)
            candidateReasons[c.reason] = (candidateReasons[c.reason] ?? 0) + 1;
        const goal = f.goalBefore ?? 'UNKNOWN', g = goals[goal] ?? { frames: 0, clear: 0, missed: 0 };
        g.frames++;
        if (f.clearCount) {
            clearFrames++;
            g.clear++;
        }
        if (f.missed) {
            missedFrames++;
            g.missed++;
            missedReasons[f.missedReason ?? 'UNKNOWN'] = (missedReasons[f.missedReason ?? 'UNKNOWN'] ?? 0) + 1;
        }
        goals[goal] = g;
    }
    return { decisionFrames: frames.length, clearFrames, missedFrames, candidateReasons, missedReasons, goals };
}
