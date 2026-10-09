import { HEX_EPS } from './config.js';
import { HEX_DIRECTIONS, axialToWorld, axialKey, worldCell, worldToAxial } from './hex.js';
export const WALL_MARGIN_FRACTION = .25;
// The shared production rule is padded; only comparison fixtures opt out.
const overrides = new WeakMap();
export function setWallMargin(map, enabled) { overrides.set(map, enabled); }
export function wallMargin(map) { return overrides.get(map) === false ? 0 : Math.sqrt(3) * map.side * WALL_MARGIN_FRACTION; }
const normals = HEX_DIRECTIONS.map(a => { const p = axialToWorld(a.q, a.r, 1), l = Math.hypot(p.x, p.y); return { x: p.x / l, y: p.y / l }; });
function limit(map, id, k, margin) { return Math.sqrt(3) * map.side / 2 + (map.cells[id].neighbors[k] < 0 ? margin : 0); }
function contains(map, id, p, margin) {
    const c = map.cells[id];
    return normals.every((n, k) => (p.x - c.center.x) * n.x + (p.y - c.center.y) * n.y <= limit(map, id, k, margin) + 1e-10);
}
// Only exterior faces receive padding. Interior cell seams, ownership arrays,
// and map cell count stay unchanged. Outside positions still identify an
// existing boundary cell; no virtual territory/trail cells are created.
export function movementCell(map, p) {
    const original = worldCell(map, p);
    if (original >= 0)
        return original;
    const margin = wallMargin(map);
    if (!margin)
        return original;
    const a = worldToAxial(p.x, p.y, map.side);
    for (const d of HEX_DIRECTIONS) {
        const id = map.byKey.get(axialKey(a.q + d.q, a.r + d.r));
        if (id !== undefined && contains(map, id, p, margin))
            return id;
    }
    return -1;
}
export function segmentDistanceSquared(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return (p.x - a.x - dx * t) ** 2 + (p.y - a.y - dy * t) ** 2;
}
export function nearbyBoundaryEdges(map, p, radius) {
    const r2 = radius * radius;
    return map.boundaryEdges.filter(e => p.x >= Math.min(e.a.x, e.b.x) - radius && p.x <= Math.max(e.a.x, e.b.x) + radius && p.y >= Math.min(e.a.y, e.b.y) - radius && p.y <= Math.max(e.a.y, e.b.y) + radius && segmentDistanceSquared(p, e.a, e.b) <= r2);
}
const geometryCache = new WeakMap();
function vertices(map, id, margin) {
    const c = map.cells[id];
    return normals.map((n, k) => { const m = normals[(k + 1) % 6], a = limit(map, id, k, margin), b = limit(map, id, (k + 1) % 6, margin), det = n.x * m.y - n.y * m.x; return { x: c.center.x + (a * m.y - n.y * b) / det, y: c.center.y + (n.x * b - a * m.x) / det }; });
}
function clippedInterval(map, id, a, b, margin) {
    const c = map.cells[id], delta = { x: b.x - a.x, y: b.y - a.y };
    let lo = 0, hi = 1;
    for (let k = 0; k < 6; k++) {
        const n = normals[k], gap = limit(map, id, k, margin) - (a.x - c.center.x) * n.x - (a.y - c.center.y) * n.y, rate = delta.x * n.x + delta.y * n.y;
        if (Math.abs(rate) < 1e-12) {
            if (gap < -HEX_EPS)
                return null;
            continue;
        }
        const t = gap / rate;
        if (rate > 0)
            hi = Math.min(hi, t);
        else
            lo = Math.max(lo, t);
        if (lo > hi + 1e-10)
            return null;
    }
    return [Math.max(0, lo), Math.min(1, hi)];
}
// Exact outline of the padded-cell union, including concave joins. Shared
// faces are removed; any newly exposed part of an internal face is retained.
export function boundaryGeometry(map) {
    const margin = wallMargin(map), cached = geometryCache.get(map);
    if (cached?.margin === margin && cached.side === map.side)
        return cached.geometry;
    const geometry = { polygons: [], edges: [] };
    for (const c of map.cells) {
        if (!c.neighbors.includes(-1))
            continue;
        const v = vertices(map, c.id, margin);
        geometry.polygons.push(v);
        for (let k = 0; k < 6; k++) {
            const a = v[(k + 5) % 6], b = v[k], neighbor = c.neighbors[k], overlap = neighbor < 0 ? null : clippedInterval(map, neighbor, a, b, margin);
            const spans = overlap ? [[0, overlap[0]], [overlap[1], 1]] : [[0, 1]];
            for (const [lo, hi] of spans) {
                if (hi - lo < 1e-9)
                    continue;
                geometry.edges.push({ a: { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo }, b: { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi } });
            }
        }
    }
    geometryCache.set(map, { margin, side: map.side, geometry });
    return geometry;
}
