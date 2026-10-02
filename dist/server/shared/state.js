import { validateConfig } from './config.js';
import { seededRandom, shuffled } from './random.js';
import { validateMode } from './modes.js';
export function makeParticipant(spec) {
    return { ...spec, position: { x: 0, y: 0 }, cellId: -1, direction: { x: 1, y: 0 }, targetDirection: null,
        lifeId: 0, lifeState: 'DEAD_WAIT', trailCells: new Set(), trailOriginCellId: null, spawnCells: new Set(),
        territoryCount: 0, controlScore: 0, kills: 0, deaths: 0, respawnAtTick: 0,
        protectedUntilTick: 0, deathReason: null, lastAppliedInputSeq: 0 };
}
export function createState(config, seed, specs, map, matchId, gameMode = { id: 'classic' }) {
    const checked = validateConfig(config);
    if (!matchId || matchId.length > 128 || map.cells.length !== 1 + 3 * checked.mapRadius * (checked.mapRadius + 1))
        throw new Error('Invalid match/map');
    if (!specs.length || specs.length > checked.maxSlots)
        throw new Error('Invalid participants');
    const ids = new Set(), slots = new Set();
    for (const spec of specs) {
        if (!spec.participantId || ids.has(spec.participantId) || slots.has(spec.slot) ||
            !Number.isInteger(spec.slot) || spec.slot < 0 || spec.slot >= checked.maxSlots)
            throw new Error('Duplicate/invalid identity');
        ids.add(spec.participantId);
        slots.add(spec.slot);
    }
    const random = seededRandom(seed);
    return { matchId, seed, tick: 0, config: checked, map, participants: specs.map(makeParticipant),
        owners: new Uint8Array(map.cells.length), trailMasks: new Uint8Array(map.cells.length),
        priority: shuffled([...slots].sort((a, b) => a - b), random),
        spawnOrder: shuffled(map.cells.map(c => c.id), random), phase: 'RUNNING',
        events: [], eventCounter: 0, results: null, departed: [], gameMode: validateMode(gameMode), modeState: { holds: [] }, outcome: null };
}
