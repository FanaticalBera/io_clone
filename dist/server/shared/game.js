import { validateConfig } from './config.js';
import { createMap, region } from './hex.js';
import { createState } from './state.js';
import { seededRandom, shuffled } from './random.js';
export function createMatch(overrides, seed, specs, matchId = 'match-' + seed, gameMode = { id: 'classic' }) {
    const config = validateConfig(overrides), map = createMap(config.mapRadius, config.hexSideWorldUnits);
    const match = createState(config, seed, specs, map, matchId, gameMode);
    if (map.anchors.length < specs.length)
        throw new Error('Map lacks validated starting anchors');
    const anchors = shuffled(map.anchors, seededRandom(seed ^ 0x51a7));
    for (const [i, p] of [...match.participants].sort((a, b) => a.slot - b.slot).entries()) {
        const id = anchors[i], zone = region(map, id, config.spawnRadius);
        if (zone.some(c => c < 0 || match.owners[c] || map.controlPoints.some(cp => cp.cellId === c)))
            throw new Error('Invalid spawn anchor');
        p.cellId = id;
        p.position = { ...map.cells[id].center };
        p.lifeId = 1;
        p.lifeState = 'ALIVE';
        const length = Math.hypot(p.position.x, p.position.y);
        p.direction = { x: -p.position.x / length, y: -p.position.y / length };
        p.spawnCells = new Set(zone);
        for (const cell of zone)
            match.owners[cell] = p.slot + 1;
        p.territoryCount = zone.length;
        p.protectedUntilTick = Math.round(config.protectSeconds * config.simulationHz);
    }
    return match;
}
export { stepMatch } from './engine.js';
export { buildView, computeResults } from './scoring.js';
