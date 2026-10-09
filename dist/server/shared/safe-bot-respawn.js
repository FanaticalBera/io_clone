// Runtime switch for application entry points; baseline override is development-only.
const enabled = new WeakSet();
export function setSafeBotRespawn(match, on) { if (on)
    enabled.add(match);
else
    enabled.delete(match); }
export function safeBotRespawn(match, p) { return enabled.has(match) && p?.kind === 'BOT' && p.deaths > 0; }
export const MIN_CORE_OWNED_DISTANCE = 4;
// Reused from the previous Territory-Aware pilot. All owner IDs are equivalent.
export function cellDistances(match, sources) {
    const distances = new Int32Array(match.map.cells.length);
    distances.fill(-1);
    const queue = new Int32Array(distances.length);
    let head = 0, tail = 0;
    for (const id of sources)
        if (id >= 0 && distances[id] === -1) {
            distances[id] = 0;
            queue[tail++] = id;
        }
    while (head < tail) {
        const id = queue[head++];
        for (const n of match.map.cells[id].neighbors)
            if (n >= 0 && distances[n] === -1) {
                distances[n] = distances[id] + 1;
                queue[tail++] = n;
            }
    }
    return distances;
}
export function ownedDistances(match) { return cellDistances(match, match.map.cells.filter(c => match.owners[c.id] !== 0).map(c => c.id)); }
export function coreDistance(zone, distances) {
    let best = Infinity;
    for (const id of zone)
        if (id >= 0 && distances[id] >= 0)
            best = Math.min(best, distances[id]);
    return Number.isFinite(best) ? best : null;
}
export function experimentalSafeRespawn(value, development) {
    if (!development || value === null)
        return true;
    if (value === 'baseline')
        return false;
    if (value === 'territory-safe')
        return true;
    throw new Error('respawnMode는 baseline / territory-safe만 사용할 수 있어요.');
}
