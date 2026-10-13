import { botOptions } from './bot-experiment.js';
import { observationVariants } from './bot-runtime.js';
import { normalizeDirection, stepSteering } from './movement.js';
import { moveSpeed } from './config.js';
// Unchanged route and observed-heading ETA primitives used by both decision layers.
export function observedHeading(obs, p) {
    return botOptions(observationVariants.get(obs) ?? 'combined').fair ? p.direction : p.targetDirection ?? p.direction;
}
const forecastCache = new WeakMap();
export function forecastHead(obs, enemy) {
    const options = botOptions(observationVariants.get(obs) ?? 'combined'), intent = observedHeading(obs, enemy);
    let cache = forecastCache.get(obs.map);
    if (options.cache && cache?.tick !== obs.tick) {
        cache = { tick: obs.tick, entries: new Map() };
        forecastCache.set(obs.map, cache);
    }
    const signature = [enemy.lifeId, enemy.cellId, enemy.position.x, enemy.position.y, enemy.direction.x, enemy.direction.y, intent.x, intent.y, obs.config.simulationHz, obs.config.moveCellsPerSecond, obs.config.hexSideWorldUnits, obs.config.turnRadiansPerSecond, obs.map.side].join(':');
    const previous = cache?.entries.get(enemy.participantId);
    if (options.cache && previous?.signature === signature)
        return previous.cells;
    const cells = [enemy.cellId];
    let position = enemy.position, cellId = enemy.cellId, heading = enemy.direction;
    for (let tick = 0; tick < obs.config.simulationHz; tick++) {
        const next = stepSteering(obs.map, position, cellId, heading, intent, obs.config);
        if (next.blocked)
            break;
        position = next.position;
        heading = next.direction;
        cellId = next.cellId;
        cells.push(cellId);
    }
    if (options.cache)
        cache.entries.set(enemy.participantId, { signature, cells });
    return cells;
}
export function shortestPath(map, start, goal, allowed = () => true, maxLength = 24) {
    if (start < 0)
        return null;
    if (goal(start))
        return [];
    const parents = new Int32Array(map.cells.length);
    parents.fill(-2);
    parents[start] = -1;
    const depths = new Uint16Array(map.cells.length), queue = [start];
    let found = -1;
    for (let head = 0; head < queue.length && found < 0; head++) {
        if (depths[queue[head]] >= maxLength)
            continue;
        for (const n of map.cells[queue[head]].neighbors) {
            if (n < 0 || parents[n] !== -2 || !allowed(n))
                continue;
            parents[n] = queue[head];
            depths[n] = depths[queue[head]] + 1;
            queue.push(n);
            if (goal(n)) {
                found = n;
                break;
            }
        }
    }
    if (found < 0)
        return null;
    const path = [];
    for (let id = found; id !== start; id = parents[id])
        path.push(id);
    path.reverse();
    return path.length <= maxLength ? path : null;
}
export function returnPath(obs) {
    // Enemy trails are cuttable, not walls. Prefer a safe route, but never abandon
    // the only way home just because an opponent has drawn across it.
    const threatened = new Set(obs.others.flatMap(p => [p.cellId, ...obs.map.cells[p.cellId].neighbors.filter(id => id >= 0)]));
    return shortestPath(obs.map, obs.self.cellId, id => obs.owners[id] === obs.self.slot + 1, id => !threatened.has(id), 24)
        ?? shortestPath(obs.map, obs.self.cellId, id => obs.owners[id] === obs.self.slot + 1, () => true, 24);
}
export function travelSeconds(obs, p, path) {
    if (!path.length)
        return 0;
    const first = obs.map.cells[path[0]].center, dx = first.x - p.position.x, dy = first.y - p.position.y, distance = Math.hypot(dx, dy);
    const dot = distance ? Math.max(-1, Math.min(1, (p.direction.x * dx + p.direction.y * dy) / distance)) : 1;
    const estimate = (distance + Math.max(0, path.length - 1) * Math.sqrt(3) * obs.map.side) / moveSpeed(obs.config) + Math.acos(dot) / obs.config.turnRadiansPerSecond;
    if (path.length > 3)
        return estimate;
    // Close duels depend on entering a cell, not reaching its centre. Use the
    // shared steering step for a short horizon without changing actual movement.
    let position = p.position, heading = p.direction, cellId = p.cellId, index = 0;
    const reach = moveSpeed(obs.config) / obs.config.turnRadiansPerSecond + moveSpeed(obs.config) / obs.config.simulationHz;
    for (let tick = 0; tick < Math.ceil(Math.min(3, estimate + 1) * obs.config.simulationHz); tick++) {
        if (cellId === path.at(-1))
            return tick / obs.config.simulationHz;
        while (index < path.length - 1 && cellId === path[index] && Math.hypot(obs.map.cells[cellId].center.x - position.x, obs.map.cells[cellId].center.y - position.y) < reach)
            index++;
        const target = obs.map.cells[path[index]].center, intent = normalizeDirection(target.x - position.x, target.y - position.y) ?? heading;
        const next = stepSteering(obs.map, position, cellId, heading, intent, obs.config);
        if (next.blocked)
            return Infinity;
        position = next.position;
        heading = next.direction;
        cellId = next.cellId;
    }
    return Infinity;
}
