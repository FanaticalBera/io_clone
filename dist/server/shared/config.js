import { MAX_MATCH_SLOTS } from './slots.js';
export const PROTOCOL_VERSION = 6;
export const HEX_EPS = 1e-7;
export const MAX_ENTRY_EVENTS = 64;
export const DEFAULT_CONFIG = Object.freeze({
    simulationHz: 30, snapshotHz: 10, inputMaxHz: 30, roundSeconds: 240, maxSlots: 14,
    mapRadius: 56, hexSideWorldUnits: 32, spawnRadius: 1, moveCellsPerSecond: 4.2, turnRadiansPerSecond: 9,
    respawnSeconds: 3, protectSeconds: 2, retrySpawnSeconds: 1, spawnBufferHexes: 3,
    botDecisionMs: 200, botObservationRange: 12, interpolationMs: 100, maxExtrapolationMs: 100,
    publicRecruitSeconds: 2, countdownSeconds: 3, resultsSecondsIncludingCountdown: 10,
    reconnectGraceSeconds: 10, emptyRoomTtlSeconds: 60
});
export function validateConfig(overrides = {}) {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    for (const [key, value] of Object.entries(config)) {
        if (!Number.isFinite(value) || value <= 0 || value > 1e6)
            throw new Error('Invalid config: ' + key);
    }
    for (const key of ['simulationHz', 'snapshotHz', 'inputMaxHz', 'maxSlots', 'mapRadius', 'spawnRadius', 'spawnBufferHexes'])
        if (!Number.isInteger(config[key]))
            throw new Error('Expected integer: ' + key);
    if (config.maxSlots > MAX_MATCH_SLOTS || config.mapRadius < config.spawnRadius + 1 || config.mapRadius > 64 ||
        config.snapshotHz > config.simulationHz || config.simulationHz % config.snapshotHz !== 0 ||
        config.resultsSecondsIncludingCountdown <= config.countdownSeconds ||
        !Number.isInteger(config.roundSeconds * config.simulationHz))
        throw new Error('Invalid config relationship');
    return config;
}
export function moveSpeed(config) { return Math.sqrt(3) * config.hexSideWorldUnits * config.moveCellsPerSecond; }
