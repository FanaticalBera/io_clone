export const HEX_DIRECTIONS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
export const START_ANCHORS = [{ q: 17, r: 0 }, { q: 17, r: -17 }, { q: 0, r: -17 }, { q: -12, r: -5 }, { q: -17, r: 0 }, { q: -17, r: 17 }, { q: 0, r: 17 }, { q: 12, r: 5 }];
export function axialKey(q, r) { return q + ',' + r; }
export function hexDistance(a, b) { return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)); }
export function axialToWorld(q, r, side = 32) { return { x: Math.sqrt(3) * side * (q + r / 2), y: 1.5 * side * r }; }
export function worldToAxial(x, y, side = 32) {
    const q = x / (Math.sqrt(3) * side) - y / (3 * side), r = 2 * y / (3 * side), s = -q - r;
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
export function region(map, center, radius) {
    return disk(map.cells[center], radius).map(a => map.byKey.get(axialKey(a.q, a.r)) ?? -1);
}
export function createMap(radius = 22, side = 32) {
    if (!Number.isInteger(radius) || radius < 1 || radius > 64 || !Number.isFinite(side) || side <= 0)
        throw new Error('Invalid map');
    const coords = disk({ q: 0, r: 0 }, radius), byKey = new Map(coords.map((a, i) => [axialKey(a.q, a.r), i]));
    const cells = coords.map((a, id) => {
        const center = axialToWorld(a.q, a.r, side);
        const vertices = Array.from({ length: 6 }, (_, i) => { const angle = (60 * i - 30) * Math.PI / 180; return { x: center.x + side * Math.cos(angle), y: center.y + side * Math.sin(angle) }; });
        return { ...a, id, center, vertices, neighbors: HEX_DIRECTIONS.map(d => byKey.get(axialKey(a.q + d.q, a.r + d.r)) ?? -1) };
    });
    // Edge k lies between vertices k and k+1 and points toward direction k.
    const boundaryEdges = cells.flatMap(c => c.neighbors.flatMap((n, k) => n < 0 ? [{ a: c.vertices[(6 - k) % 6], b: c.vertices[(7 - k) % 6] }] : []));
    const points = [{ q: -8, r: 0 }, { q: 0, r: 8 }, { q: 8, r: -8 }];
    return { mapId: 'hex-r' + radius + '-a' + side + '-v1', radius, side, cells, byKey, boundaryEdges,
        controlPoints: points.flatMap((p, i) => { const id = byKey.get(axialKey(p.q, p.r)); return id === undefined ? [] : [{ pointId: i, cellId: id }]; }),
        anchors: START_ANCHORS.flatMap(p => { const id = byKey.get(axialKey(p.q, p.r)); return id === undefined ? [] : [id]; }) };
}
