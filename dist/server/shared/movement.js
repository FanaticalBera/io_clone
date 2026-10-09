import { HEX_EPS, MAX_ENTRY_EVENTS, moveSpeed } from './config.js';
import { wallMargin, movementCell } from './wall-margin.js';
import { HEX_DIRECTIONS, axialToWorld } from './hex.js';
export function normalizeDirection(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1e6 || Math.abs(dy) > 1e6)
        return null;
    const length = Math.hypot(dx, dy);
    return length > 1e-8 ? { x: dx / length, y: dy / length } : null;
}
export function quantizedEventTime(t, hz) { return Math.round(t * 1e6 / hz); }
// Shortest turn without overshoot. Exact U-turns consistently choose positive
// rotation, including targets containing signed zero.
export function rotateDirectionTowards(current, target, maxRadians) {
    const from = normalizeDirection(current.x, current.y), to = normalizeDirection(target.x, target.y);
    if (!from)
        return to ?? { x: 1, y: 0 };
    if (!to)
        return from;
    if (!Number.isFinite(maxRadians) || maxRadians <= 0)
        return from;
    const dot = Math.max(-1, Math.min(1, from.x * to.x + from.y * to.y));
    const cross = from.x * to.y - from.y * to.x;
    const angle = dot < 0 && Math.abs(cross) < 1e-12 ? Math.PI : Math.atan2(cross, dot);
    if (Math.abs(angle) <= maxRadians)
        return to;
    const step = Math.sign(angle) * maxRadians, c = Math.cos(step), s = Math.sin(step);
    return normalizeDirection(from.x * c - from.y * s, from.x * s + from.y * c);
}
// Input is intent; direction is the actual heading. Null intent keeps heading.
// Authority and prediction both integrate one fixed simulation tick here.
export function stepSteering(map, start, cellId, current, target, config) {
    const direction = rotateDirectionTowards(current, target ?? current, config.turnRadiansPerSecond / config.simulationHz);
    return { ...traceMovement(map, start, cellId, direction, moveSpeed(config) / config.simulationHz), direction };
}
const normalCache = new WeakMap();
const normalCaching = new WeakMap();
// Per-map experiment control avoids cross-match/global switches. Weak keys are
// released with a match; changing side invalidates the six exact normals.
export function setMovementNormalCaching(map, enabled) { normalCaching.set(map, enabled); }
function movementNormals(map) {
    const enabled = normalCaching.get(map) !== false, cached = normalCache.get(map);
    if (enabled && cached?.side === map.side)
        return cached.values;
    const values = HEX_DIRECTIONS.map(a => { const p = axialToWorld(a.q, a.r, map.side), l = Math.hypot(p.x, p.y); return { x: p.x / l, y: p.y / l }; });
    if (enabled)
        normalCache.set(map, { side: map.side, values });
    return values;
}
export function traceMovement(map, start, startCell, direction, distance) {
    const normalized = normalizeDirection(direction.x, direction.y);
    if (!normalized || !Number.isFinite(distance) || distance < 0 || !map.cells[startCell])
        throw new Error('Invalid movement');
    if (distance === 0)
        return { position: { ...start }, cellId: startCell, entries: [], blocked: false, boundaryT: null };
    const delta = { x: normalized.x * distance, y: normalized.y * distance }, entries = [];
    const at = (t) => ({ x: start.x + delta.x * t, y: start.y + delta.y * t });
    const epsilon = HEX_EPS * 4 / distance, half = Math.sqrt(3) * map.side / 2;
    let cellId = startCell, t = 0;
    const startProbe = movementCell(map, at(epsilon));
    if (startProbe < 0)
        return { position: { ...start }, cellId, entries, blocked: true, boundaryT: 0 };
    if (startProbe !== cellId) {
        cellId = startProbe;
        entries.push({ t: 0, cellId, position: { ...start } });
    }
    const normals = movementNormals(map), margin = wallMargin(map);
    for (let count = 0; count <= MAX_ENTRY_EVENTS; count++) {
        const center = map.cells[cellId].center;
        let crossing = Infinity;
        for (let k = 0; k < normals.length; k++) {
            const n = normals[k];
            const denominator = delta.x * n.x + delta.y * n.y;
            if (denominator <= 1e-12)
                continue;
            const extent = half + (map.cells[cellId].neighbors[k] < 0 ? margin : 0);
            const candidate = (extent - (start.x - center.x) * n.x - (start.y - center.y) * n.y) / denominator;
            if (candidate >= t - epsilon && candidate < crossing)
                crossing = Math.max(t, candidate);
        }
        if (crossing > 1 + epsilon || !Number.isFinite(crossing))
            return { position: at(1), cellId, entries, blocked: false, boundaryT: null };
        // A step ending on an edge can round just past t=1 when speed changes.
        crossing = Math.min(1, crossing);
        const next = movementCell(map, at(crossing + epsilon));
        if (next < 0)
            return { position: at(Math.max(t, crossing - epsilon)), cellId, entries, blocked: true, boundaryT: crossing };
        if (next === cellId)
            throw new Error('Geometry made no progress');
        if (entries.length >= MAX_ENTRY_EVENTS)
            throw new Error('Movement event limit');
        cellId = next;
        t = crossing;
        entries.push({ t, cellId, position: at(t) });
    }
    throw new Error('Movement event limit');
}
