import { validateConfig } from './config.js';
import { createMap, region, inwardDirection } from './hex.js';
import { startRun } from './run.js';
import { createState } from './state.js';
import { seededRandom, shuffled } from './random.js';
import { generateStartingAnchors } from './starting-anchors.js';
export function createMatch(overrides, seed, specs, matchId = 'match-' + seed, gameMode = { id: 'classic' }) {
    const config = validateConfig(overrides), map = createMap(config.mapRadius, config.hexSideWorldUnits, config.mapShape ?? 0);
    const match = createState(config, seed, specs, map, matchId, gameMode);
    // Hand-placed anchors exist only on the hexagon; other shapes always use generated starts.
    const fixed = specs.length <= 8 && map.anchors.length >= specs.length;
    const anchors = fixed ? shuffled(map.anchors, seededRandom(seed ^ 0x51a7)) : generateStartingAnchors(map, specs.length, config.spawnRadius, seed);
    if (!fixed)
        map.anchors = anchors;
    for (const [i, p] of [...match.participants].sort((a, b) => a.slot - b.slot).entries()) {
        const id = anchors[i], zone = region(map, id, config.spawnRadius);
        if (zone.length !== 1 + 3 * config.spawnRadius * (config.spawnRadius + 1) || zone.some(c => c < 0 || match.owners[c] || map.controlPoints.some(cp => cp.cellId === c)))
            throw new Error('Invalid spawn anchor');
        p.cellId = id;
        p.position = { ...map.cells[id].center };
        p.lifeId = 1;
        p.lifeState = 'ALIVE';
        const length = Math.hypot(p.position.x, p.position.y);
        p.direction = inwardDirection(map, id) ?? (length ? { x: -p.position.x / length, y: -p.position.y / length } : { x: 1, y: 0 });
        p.spawnCells = new Set(zone);
        for (const cell of zone)
            match.owners[cell] = p.slot + 1;
        p.territoryCount = zone.length;
        startRun(match, p);
        p.protectedUntilTick = Math.round(config.protectSeconds * config.simulationHz);
    }
    return match;
}
export { stepMatch } from './engine.js';
export { buildView, computeResults } from './scoring.js';
