import {MAX_MATCH_SLOTS} from './slots.js';
export const PROTOCOL_VERSION = 8;
export const HEX_EPS = 1e-7;
export const MAX_ENTRY_EVENTS = 64;
export interface GameConfig {
 simulationHz: number; snapshotHz: number; inputMaxHz: number;
 roundSeconds: number; maxSlots: number; mapRadius: number; hexSideWorldUnits: number;
 /** Board shape: absent or 0 = hexagon (kept absent so existing configs serialise unchanged), 1 = rectangle. */
 mapShape?: number;
 spawnRadius: number; moveCellsPerSecond: number; turnRadiansPerSecond: number; respawnSeconds: number;
 protectSeconds: number; retrySpawnSeconds: number; spawnBufferHexes: number;
 botDecisionMs: number; botObservationRange: number; interpolationMs: number;
 maxExtrapolationMs: number; publicRecruitSeconds: number; countdownSeconds: number;
 resultsSecondsIncludingCountdown: number; reconnectGraceSeconds: number; emptyRoomTtlSeconds: number;
}
export const DEFAULT_CONFIG: Readonly<GameConfig> = Object.freeze({
 simulationHz: 30, snapshotHz: 10, inputMaxHz: 30, roundSeconds: 240, maxSlots: 14,
 mapRadius: 56, hexSideWorldUnits: 32, spawnRadius: 1, moveCellsPerSecond: 4.41, turnRadiansPerSecond: 9.45,
 respawnSeconds: 3, protectSeconds: 2, retrySpawnSeconds: 1, spawnBufferHexes: 3,
 botDecisionMs: 200, botObservationRange: 12, interpolationMs: 100, maxExtrapolationMs: 100,
 publicRecruitSeconds: 2, countdownSeconds: 3, resultsSecondsIncludingCountdown: 10,
 reconnectGraceSeconds: 10, emptyRoomTtlSeconds: 60
});
export function validateConfig(overrides: Partial<GameConfig> = {}): GameConfig {
 const config = { ...DEFAULT_CONFIG, ...overrides };
 for (const [key, value] of Object.entries(config)) {
  if (key === 'mapShape') { if (value !== undefined && value !== 0 && value !== 1) throw new Error('Invalid config: mapShape'); continue; }
  if (!Number.isFinite(value) || value <= 0 || value > 1e6) throw new Error('Invalid config: ' + key);
 }
 for (const key of ['simulationHz','snapshotHz','inputMaxHz','maxSlots','mapRadius','spawnRadius','spawnBufferHexes'] as const)
  if (!Number.isInteger(config[key])) throw new Error('Expected integer: ' + key);
 if (config.maxSlots > MAX_MATCH_SLOTS || config.mapRadius < config.spawnRadius + 1 || config.mapRadius > 64 ||
     config.snapshotHz > config.simulationHz || config.simulationHz % config.snapshotHz !== 0 ||
     config.resultsSecondsIncludingCountdown <= config.countdownSeconds ||
     !Number.isInteger(config.roundSeconds * config.simulationHz))
  throw new Error('Invalid config relationship');
 return config;
}
export function moveSpeed(config: GameConfig): number { return Math.sqrt(3) * config.hexSideWorldUnits * config.moveCellsPerSecond; }
