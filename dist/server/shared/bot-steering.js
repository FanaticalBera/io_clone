import { normalizeDirection, stepSteering, traceMovement } from './movement.js';
// Look down a straight run, never across a bend. Keep every strategic waypoint:
// callers consume it only after actually entering its cell.
export function botSteeringTarget(map, p, path, config, lookAhead) {
    if (!path.length)
        return null;
    const fallback = map.cells[path[0]].center;
    let previous = map.cells[p.cellId], direction = -1, end = 0;
    for (let i = 0; i < Math.min(path.length, lookAhead); i++) {
        const next = map.cells[path[i]];
        if (next.id === previous.id) {
            previous = next;
            continue;
        }
        const leg = previous.neighbors.indexOf(next.id);
        if (leg < 0 || (direction >= 0 && leg !== direction))
            break;
        direction = leg;
        end = i;
        previous = next;
    }
    if (!end)
        return fallback;
    const target = map.cells[path[end]].center, dx = target.x - p.position.x, dy = target.y - p.position.y, intent = normalizeDirection(dx, dy);
    if (!intent)
        return fallback;
    const route = path.slice(0, end + 1).filter((id, i) => i !== 0 || id !== p.cellId);
    const line = traceMovement(map, p.position, p.cellId, intent, Math.hypot(dx, dy));
    if (line.blocked || line.entries.length !== route.length || line.entries.some((entry, i) => entry.cellId !== route[i]))
        return fallback;
    // The actual heading cannot snap to intent. Reject look-ahead if this tick's
    // shared steering would leave the approved corridor.
    const next = stepSteering(map, p.position, p.cellId, p.direction, intent, config);
    if (next.blocked || next.entries.some((entry, i) => entry.cellId !== route[i]))
        return fallback;
    return target;
}
