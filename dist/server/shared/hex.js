export const HEX_DIRECTIONS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
export const START_ANCHORS = [{ q: 17, r: 0 }, { q: 17, r: -17 }, { q: 0, r: -17 }, { q: -12, r: -5 }, { q: -17, r: 0 }, { q: -17, r: 17 }, { q: 0, r: 17 }, { q: 12, r: 5 }];
export function axialKey(q, r) { return q + ',' + r; }
export function hexDistance(a, b) { return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)); }
export function axialToWorld(q, r, side = 32) { return { x: Math.sqrt(3) * side * (q + r / 2), y: 1.5 * side * r }; }
export function worldToAxial(x, y, side = 32) {
    return roundAxial(x / (Math.sqrt(3) * side) - y / (3 * side), 2 * y / (3 * side));
}
function roundAxial(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds)
        rq = -rr - rs;
    else if (dr > ds)
        rr = -rq - rs;
    else
        rs = -rq - rr;
    return { q: rq === 0 ? 0 : rq, r: rr === 0 ? 0 : rr };
}
export function scaledStartAnchors(radius) {
    // Preserve the original R22 shape and shuffle order. Cube rounding keeps
    // fractional axial coordinates on the hex lattice instead of rounding q/r
    // independently; respawn placement does not use these initial anchors.
    const scale = radius / 22;
    return START_ANCHORS.map(p => roundAxial(p.q * scale, p.r * scale));
}
export function worldCell(map, position) {
    const a = worldToAxial(position.x, position.y, map.side);
    return map.byKey.get(axialKey(a.q, a.r)) ?? -1;
}
export function disk(center, radius) {
    const cells = [];
    for (let r = -radius; r <= radius; r++)
        for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++)
            cells.push({ q: center.q + q, r: center.r + r });
    return cells;
}
// Same cells and order as disk() + byKey, without building a string key per cell (performance PRD:
// respawn zone tables were rebuilt from ~600k keys on the first safe bot respawn of every match).
const cellLookups = new WeakMap();
function cellLookup(map) {
    let lookup = cellLookups.get(map);
    if (lookup)
        return lookup;
    // radius bounds |q| and |r| for every shape, so one square table covers any map.
    const size = 2 * map.radius + 1;
    lookup = new Int32Array(size * size).fill(-1);
    for (const c of map.cells)
        lookup[(c.q + map.radius) * size + c.r + map.radius] = c.id;
    cellLookups.set(map, lookup);
    return lookup;
}
export function region(map, center, radius) {
    const lookup = cellLookup(map), R = map.radius, size = 2 * R + 1, { q: cq, r: cr } = map.cells[center], cells = [];
    for (let r = -radius; r <= radius; r++)
        for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++) {
            const aq = cq + q, ar = cr + r;
            cells.push(aq < -R || aq > R || ar < -R || ar > R ? -1 : lookup[(aq + R) * size + ar + R]);
        }
    return cells;
}
export const MAP_SHAPE = { HEX: 0, RECT: 1, ISLANDS: 2, DONUT: 3, CROSS: 4 };
const SHAPE_NAMES = ['hex', 'rect', 'islands', 'donut', 'cross'];
/** Rectangle sized from the hex radius: about the same cell count, 2:1 for landscape screens. */
export function rectHalfSize(radius) { return { cols: Math.round(radius * 1.18), rows: Math.round(radius * .64) }; }
// Unit-side pixel position, for shapes defined by straight edges and corridors.
const unitPx = (a) => ({ x: Math.sqrt(3) * (a.q + a.r / 2), y: 1.5 * a.r });
const segmentDistance = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
/** Island, donut and cross boards, all proportional to the radius (designed at R56). */
function featureMember(shape, radius) {
    const k = radius / 56, o = { q: 0, r: 0 };
    if (shape === MAP_SHAPE.ISLANDS) {
        // Four hex islands joined in a ring by bridges about 8-9 cells wide.
        const centres = [[-24, -32], [56, -32], [-56, 32], [24, 32]].map(([q, r]) => ({ q: Math.round(q * k), r: Math.round(r * k) })), px = centres.map(unitPx), size = 26 * k, half = 7.5 * k;
        return a => centres.some(c => hexDistance(a, c) <= size) || [[0, 1], [0, 2], [1, 3], [2, 3]].some(([i, j]) => segmentDistance(unitPx(a), px[i], px[j]) <= half);
    }
    if (shape === MAP_SHAPE.DONUT) {
        const outer = Math.round(60 * k), inner = Math.round(24 * k);
        return a => { const d = hexDistance(a, o); return d <= outer && d > inner; };
    }
    if (shape === MAP_SHAPE.CROSS) {
        const plaza = 22 * k, arm = 1.5 * 12 * k, armX = Math.sqrt(3) * 12 * k, longX = Math.sqrt(3) * 70 * k, longY = 1.5 * 62 * k;
        return a => { const p = unitPx(a); return hexDistance(a, o) <= plaza || (Math.abs(p.y) <= arm && Math.abs(p.x) <= longX) || (Math.abs(p.x) <= armX && Math.abs(p.y) <= longY); };
    }
    return null;
}
function shapeCoords(radius, shape) {
    const member = featureMember(shape, radius);
    if (member) {
        const bound = Math.ceil(radius * 2.2), cells = [];
        for (let r = -bound; r <= bound; r++)
            for (let q = -2 * bound; q <= 2 * bound; q++)
                if (member({ q, r }))
                    cells.push({ q, r });
        return cells;
    }
    if (shape !== MAP_SHAPE.RECT)
        return disk({ q: 0, r: 0 }, radius);
    const { cols, rows } = rectHalfSize(radius), cells = [];
    // Odd-r offset rows: every row spans the same x range, so the board is a true rectangle.
    for (let r = -rows; r <= rows; r++) {
        const shift = Math.floor(r / 2);
        for (let col = -cols; col <= cols; col++)
            cells.push({ q: col - shift, r });
    }
    return cells;
}
export function mapIdFor(radius, side, shape = 0) { return (SHAPE_NAMES[shape] ?? 'hex') + '-r' + radius + '-a' + side + '-v1'; }
const cellCounts = new Map();
export function mapCellCount(radius, shape = 0) {
    if (shape === MAP_SHAPE.HEX)
        return 1 + 3 * radius * (radius + 1);
    const key = radius + ':' + shape;
    let n = cellCounts.get(key);
    if (n === undefined) {
        n = shapeCoords(radius, shape).length;
        cellCounts.set(key, n);
    }
    return n;
}
export function createMap(radius = 22, side = 32, shape = 0) {
    if (!Number.isInteger(radius) || radius < 1 || radius > 64 || !Number.isFinite(side) || side <= 0 || !Number.isInteger(shape) || shape < 0 || shape >= SHAPE_NAMES.length)
        throw new Error('Invalid map');
    const coords = shapeCoords(radius, shape), byKey = new Map(coords.map((a, i) => [axialKey(a.q, a.r), i]));
    const cells = coords.map((a, id) => {
        const center = axialToWorld(a.q, a.r, side);
        const vertices = Array.from({ length: 6 }, (_, i) => { const angle = (60 * i - 30) * Math.PI / 180; return { x: center.x + side * Math.cos(angle), y: center.y + side * Math.sin(angle) }; });
        return { ...a, id, center, vertices, neighbors: HEX_DIRECTIONS.map(d => byKey.get(axialKey(a.q + d.q, a.r + d.r)) ?? -1) };
    });
    // Edge k lies between vertices k and k+1 and points toward direction k.
    const boundaryEdges = cells.flatMap(c => c.neighbors.flatMap((n, k) => n < 0 ? [{ a: c.vertices[(6 - k) % 6], b: c.vertices[(7 - k) % 6] }] : []));
    const points = [{ q: -8, r: 0 }, { q: 0, r: 8 }, { q: 8, r: -8 }];
    // Rings to the edge: boundary cells are 0. On the hexagon this equals radius - distance to centre.
    const inset = new Int16Array(cells.length).fill(-1), queue = [];
    for (const c of cells)
        if (c.neighbors.some(n => n < 0)) {
            inset[c.id] = 0;
            queue.push(c.id);
        }
    for (let head = 0; head < queue.length; head++) {
        const id = queue[head];
        for (const n of cells[id].neighbors)
            if (n >= 0 && inset[n] < 0) {
                inset[n] = inset[id] + 1;
                queue.push(n);
            }
    }
    const bound = coords.reduce((m, a) => Math.max(m, Math.abs(a.q), Math.abs(a.r)), 0);
    return { mapId: mapIdFor(radius, side, shape), radius: bound, side, shape, inset, cells, byKey, boundaryEdges,
        controlPoints: points.flatMap((p, i) => { const id = byKey.get(axialKey(p.q, p.r)); return id === undefined ? [] : [{ pointId: i, cellId: id }]; }),
        // Hand-tuned hex anchors only fit the hexagon; other shapes use generated starts.
        anchors: shape !== MAP_SHAPE.HEX ? [] : scaledStartAnchors(radius).flatMap(p => { const id = byKey.get(axialKey(p.q, p.r)); return id === undefined ? [] : [id]; }) };
}
/**
 * Starting heading on boards whose centre is off the board (islands sea, donut hole): face the
 * deepest nearby cell instead of the origin. Other shapes return null and keep facing the centre.
 */
export function inwardDirection(map, cellId) {
    if (map.shape !== MAP_SHAPE.ISLANDS && map.shape !== MAP_SHAPE.DONUT)
        return null;
    let best = cellId;
    for (const id of region(map, cellId, 8))
        if (id >= 0 && map.inset[id] > map.inset[best])
            best = id;
    const from = map.cells[cellId].center, to = map.cells[best].center, dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    return length ? { x: dx / length, y: dy / length } : null;
}
