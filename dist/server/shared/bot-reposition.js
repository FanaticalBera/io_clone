import { evaluateRepositionStartSafety } from './bot-immediate-safety.js';
import { damageWeight } from './bot-damage.js';
import { hexDistance } from './hex.js';
import { BOT_REPOSITION as C } from './bot-phase025-config.js';
export function createRepositionState() { return { active: null, cooldownUntil: 0, sequence: 0, last: null, selection: null }; }
const selectionObservers = new WeakMap();
export function watchRepositionSelection(state, observer) { const set = selectionObservers.get(state) ?? new Set(); set.add(observer); selectionObservers.set(state, set); return () => { set.delete(observer); if (!set.size)
    selectionObservers.delete(state); }; }
const observers = new WeakMap();
export function watchReposition(state, observer) { const set = observers.get(state) ?? new Set(); set.add(observer); observers.set(state, set); return () => { set.delete(observer); if (!set.size)
    observers.delete(state); }; }
function publish(state, row) { for (const observer of observers.get(state) ?? [])
    observer(structuredClone(row)); }
export function startReposition(obs, state, plan) {
    const p = obs.self;
    state.active = { sequence: ++state.sequence, lifeId: p.lifeId, startedTick: obs.tick, endedTick: null, outcome: 'OPEN', target: plan.target, attackerId: plan.attackerId, distance: plan.distance, score: plan.score, startCell: p.cellId, endCell: p.cellId, start: { ...p.position }, end: { ...p.position }, movedCells: 0, lastCell: p.cellId };
    publish(state, state.active);
}
export function repositionProgress(obs, state) { const row = state.active; if (!row || row.lifeId !== obs.self.lifeId)
    return; if (row.lastCell !== obs.self.cellId) {
    row.movedCells++;
    row.lastCell = obs.self.cellId;
} row.endCell = obs.self.cellId; row.end = { ...obs.self.position }; }
export function endReposition(obs, state, reason) { const row = state.active; if (!row)
    return; repositionProgress(obs, state); row.endedTick = obs.tick; row.outcome = reason; state.active = null; state.last = row; state.cooldownUntil = obs.tick + C.cooldownSeconds * obs.config.simulationHz; publish(state, row); }
export function repositionPathNearHead(obs, path) { const cells = [obs.self.cellId, ...path.filter(id => id !== obs.self.cellId).slice(0, C.nearWaypoints)]; return obs.others.some(enemy => cells.some(id => hexDistance(obs.map.cells[id], obs.map.cells[enemy.cellId]) <= C.nearHeadDistance)); }
export function repositionImmediateReason(obs, state, path, returnOnly = false) {
    const row = state.active;
    if (!row)
        return null;
    const owner = obs.self.slot + 1;
    if (obs.self.lifeState !== 'ALIVE')
        return 'DEATH';
    if (obs.self.lifeId !== row.lifeId)
        return 'LIFE_CHANGED';
    if (returnOnly)
        return 'RETURN_ONLY';
    if (!obs.roster?.some(p => p.participantId === row.attackerId))
        return 'OPPONENT_LEFT';
    if (obs.ownTrail.length)
        return 'TRAIL_EXPOSED';
    if (obs.owners[obs.self.cellId] !== owner)
        return 'OUTSIDE_HOME';
    if (path.some(id => obs.owners[id] !== owner))
        return 'ROUTE_LOST';
    const target = obs.map.cells[row.target];
    if (obs.owners[row.target] !== owner || !target.neighbors.some(id => id >= 0 && obs.owners[id] !== owner))
        return 'DESTINATION_CHANGED';
    if (repositionPathNearHead(obs, path))
        return 'NEAR_HEAD';
    if (obs.self.cellId === row.target)
        return 'ARRIVED';
    return null;
}
export function repositionRegularReason(obs, state, emotion) {
    const row = state.active;
    if (!row)
        return null;
    if (obs.tick - row.startedTick >= C.maxSeconds * obs.config.simulationHz)
        return 'TIMEOUT';
    if (![...emotion.damage.regions].some(([id, cell]) => cell.attackerId === row.attackerId && hexDistance(obs.map.cells[id], obs.map.cells[row.target]) <= C.boundaryRadius))
        return 'DAMAGE_GONE';
    return null;
}
// Public ownership/damage only. At most eight destinations, deterministic ties,
// no opponent positions used to choose a remote destination and no RNG draws.
export function selectReposition(obs, emotion, state, identity, findPath) {
    const result = { reason: 'NO_ACTIVE_DAMAGE', startChecked: 0, startRejected: 0, nearBlocked: 0, examined: 0, within10: 0, beyond20OrDisconnected: 0 };
    const finish = () => { for (const observer of selectionObservers.get(state) ?? [])
        observer(structuredClone(result)); return result; };
    if (obs.tick < state.cooldownUntil) {
        result.reason = 'COOLDOWN';
        return finish();
    }
    const active = new Set(obs.roster?.map(p => p.participantId)), eligible = new Set();
    for (const region of emotion.damage.regions.values())
        if (active.has(region.attackerId) && ((emotion.damage.recent.get(region.attackerId) ?? []).filter(s => s.tick > obs.tick - C.damageWindow * obs.config.simulationHz).reduce((n, s) => n + s.cells, 0) >= C.damageCells || (emotion.grudge.get(region.attackerId)?.amount ?? 0) >= C.grudgeThreshold))
            eligible.add(region.attackerId);
    if (!eligible.size)
        return finish();
    const owner = obs.self.slot + 1, targets = new Map();
    for (const [id, region] of emotion.damage.regions) {
        if (!eligible.has(region.attackerId))
            continue;
        const origin = obs.map.cells[id], seen = new Set([id]), queue = [id], weight = damageWeight(region, obs.tick, obs.config.simulationHz);
        for (let i = 0; i < queue.length; i++) {
            const current = queue[i], cell = obs.map.cells[current];
            if (obs.owners[current] === owner && cell.neighbors.some(n => n >= 0 && obs.owners[n] !== owner)) {
                const entry = targets.get(current) ?? { tick: region.tick, groups: new Map() };
                entry.tick = Math.max(entry.tick, region.tick);
                entry.groups.set(region.attackerId, (entry.groups.get(region.attackerId) ?? 0) + weight);
                targets.set(current, entry);
            }
            for (const n of cell.neighbors)
                if (n >= 0 && !seen.has(n) && hexDistance(origin, obs.map.cells[n]) <= C.boundaryRadius) {
                    seen.add(n);
                    queue.push(n);
                }
        }
    }
    // Filter public owned-route distances before the destination cap. Otherwise
    // eight recent but unreachable boundaries hide older reachable ones.
    const distances = new Map(), queue = [];
    if (obs.owners[obs.self.cellId] === owner) {
        distances.set(obs.self.cellId, 0);
        queue.push(obs.self.cellId);
    }
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i], depth = distances.get(id);
        if (depth >= C.maxDistance)
            continue;
        for (const n of obs.map.cells[id].neighbors)
            if (n >= 0 && obs.owners[n] === owner && !distances.has(n)) {
                distances.set(n, depth + 1);
                queue.push(n);
            }
    }
    const reachable = [...targets].filter(([id]) => { const distance = distances.get(id); if (distance === undefined) {
        result.beyond20OrDisconnected++;
        return false;
    } if (distance < C.minDistance) {
        result.within10++;
        return false;
    } return true; });
    const ordered = reachable.sort((a, b) => b[1].tick - a[1].tick || Math.max(...b[1].groups.values()) - Math.max(...a[1].groups.values()) || a[0] - b[0]).slice(0, C.maxDestinations);
    const plans = [];
    result.reason = 'NO_DISTANT_DESTINATION';
    for (const [target, entry] of ordered) {
        result.examined++;
        const path = findPath(obs.map, obs.self.cellId, id => id === target, id => obs.owners[id] === owner, C.maxDistance);
        if (!path) {
            result.beyond20OrDisconnected++;
            continue;
        }
        if (path.length < C.minDistance) {
            result.within10++;
            continue;
        }
        if (repositionPathNearHead(obs, path)) {
            result.nearBlocked++;
            continue;
        }
        for (const [attackerId, weight] of entry.groups) {
            const grudge = emotion.grudge.get(attackerId)?.amount ?? 0, score = Math.min(C.weightCap, weight) * (identity?.secondaryTrait === 'Territorial' ? C.territorialMultiplier : 1) + C.grudgeWeight * grudge / 20 * (identity?.secondaryTrait === 'Vengeful' ? C.vengefulMultiplier : 1) - C.distanceCost * path.length;
            if (score > 0)
                plans.push({ target, attackerId, distance: path.length, score, weight, grudge, path });
        }
    }
    plans.sort((a, b) => b.score - a.score || a.distance - b.distance || a.target - b.target || (a.attackerId < b.attackerId ? -1 : a.attackerId > b.attackerId ? 1 : 0));
    // Only positive score-ranked plans are forecast. All attacker entries for a
    // destination share the same owned path; cache avoids repeated projections.
    const checked = new Map();
    for (const plan of plans) {
        let safety = checked.get(plan.target);
        if (!safety) {
            safety = evaluateRepositionStartSafety(obs, plan.path);
            checked.set(plan.target, safety);
            result.startChecked++;
            if (!safety.safe) {
                result.startRejected++;
                result.firstStartRejection ??= safety;
            }
        }
        if (safety.safe) {
            result.plan = plan;
            result.reason = 'SELECTED';
            return finish();
        }
    }
    if (plans.length)
        result.reason = 'PHYSICAL_START_UNSAFE';
    else if (result.nearBlocked)
        result.reason = 'NEAR_HEAD';
    else if (result.examined > 0)
        result.reason = 'LOW_PRIORITY';
    return finish();
}
