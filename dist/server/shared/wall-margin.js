import { HEX_EPS } from './config.js';
import { HEX_DIRECTIONS, axialToWorld, axialKey, worldCell, worldToAxial } from './hex.js';
export const WALL_MARGIN_FRACTION = .25;
// The shared production rule is padded; only comparison fixtures opt out.
const overrides = new WeakMap();
export function setWallMargin(map, enabled) { overrides.set(map, enabled); }
export function wallMargin(map) { return overrides.get(map) === false ? 0 : Math.sqrt(3) * map.side * WALL_MARGIN_FRACTION; }
const normals = HEX_DIRECTIONS.map(a => { const p = axialToWorld(a.q, a.r, 1), l = Math.hypot(p.x, p.y); return { x: p.x / l, y: p.y / l }; });
// Pointy-top rows step half a cell, so a vertical board edge is a sawtooth of
// notches. For a notch cell (one open face k, both flanks also open on k) the
// flanks' faces toward the notch are pushed until their padded faces k meet,
// and the notch cell reaches the notch apex, so the padded wall runs straight.
// Values are extra reach in half-cell units beyond the normal padded face.
const notchCache = new WeakMap();
function notchFaces(map) {
    let faces = notchCache.get(map);
    if (faces)
        return faces;
    faces = new Map();
    for (const c of map.cells)
        for (let k = 0; k < 6; k++) {
            const n = c.neighbors, before = n[(k + 5) % 6], after = n[(k + 1) % 6];
            if (n[k] >= 0 || before < 0 || after < 0 || map.cells[before].neighbors[k] >= 0 || map.cells[after].neighbors[k] >= 0)
                continue;
            faces.set(c.id * 6 + k, 'notch');
            faces.set(before * 6 + (k + 1) % 6, 'flank');
            faces.set(after * 6 + (k + 5) % 6, 'flank');
        }
    notchCache.set(map, faces);
    return faces;
}
function limit(map, id, k, margin) {
    const half = Math.sqrt(3) * map.side / 2;
    if (map.cells[id].neighbors[k] >= 0)
        return half;
    if (!margin)
        return half;
    const notch = notchFaces(map).get(id * 6 + k);
    return notch === 'flank' ? 2 * half + margin : notch === 'notch' ? 2 * half : half + margin;
}
/**
 * The notch cell both cells border, when a move along a straightened wall jumps between two
 * flanks that overlap across the notch; -1 otherwise (always -1 on maps without notches).
 */
export function notchBetween(map, from, to) {
    if (!wallMargin(map))
        return -1;
    const faces = notchFaces(map);
    if (!faces.size)
        return -1;
    for (const id of map.cells[from].neighbors)
        if (id >= 0 && map.cells[to].neighbors.includes(id))
            for (let k = 0; k < 6; k++)
                if (faces.get(id * 6 + k) === 'notch')
                    return id;
    return -1;
}
/** Distance from a cell centre to its padded face k, shared by movement and drawing. */
export function faceLimit(map, id, k) { return limit(map, id, k, wallMargin(map)); }
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
// Exact outline of the padded-cell union, including concave joins and the
// overlapping flanks of straightened notches. Each face is split wherever a
// nearby padded cell starts or stops covering it; a piece is wall when the
// outside just beyond it is uncovered, and a coincident piece is kept once.
export function boundaryGeometry(map) {
    const margin = wallMargin(map), cached = geometryCache.get(map);
    if (cached?.margin === margin && cached.side === map.side)
        return cached.geometry;
    const geometry = { polygons: [], edges: [] }, probe = map.side * 1e-3;
    for (const c of map.cells) {
        if (!c.neighbors.includes(-1))
            continue;
        const v = vertices(map, c.id, margin);
        geometry.polygons.push(v);
        const nearby = new Set();
        for (const n of c.neighbors)
            if (n >= 0) {
                nearby.add(n);
                for (const m of map.cells[n].neighbors)
                    if (m >= 0 && m !== c.id)
                        nearby.add(m);
            }
        for (let k = 0; k < 6; k++) {
            const a = v[(k + 5) % 6], b = v[k], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
            if (length < 1e-9)
                continue;
            const out = { x: normals[k].x * probe, y: normals[k].y * probe }, cuts = [0, 1];
            for (const id of nearby) {
                const overlap = clippedInterval(map, id, a, b, margin);
                if (overlap)
                    cuts.push(overlap[0], overlap[1]);
            }
            cuts.sort((x, y) => x - y);
            let open = null, last = 0;
            const flush = (t) => { if (open !== null && t - open > 1e-9)
                geometry.edges.push({ a: { x: a.x + dx * open, y: a.y + dy * open }, b: { x: a.x + dx * t, y: a.y + dy * t } }); open = null; };
            for (let i = 1; i < cuts.length; i++) {
                const lo = cuts[i - 1], hi = cuts[i];
                if (hi - lo < 1e-9)
                    continue;
                const t = (lo + hi) / 2, p = { x: a.x + dx * t, y: a.y + dy * t };
                let wall = true;
                for (const id of nearby) {
                    if (contains(map, id, { x: p.x + out.x, y: p.y + out.y }, margin) || (id < c.id && contains(map, id, { x: p.x - out.x, y: p.y - out.y }, margin))) {
                        wall = false;
                        break;
                    }
                }
                if (wall) {
                    open ??= lo;
                    last = hi;
                }
                else
                    flush(lo);
            }
            flush(last);
        }
    }
    geometryCache.set(map, { margin, side: map.side, geometry });
    return geometry;
}
