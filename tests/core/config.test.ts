import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, validateConfig } from '../../src/shared/config.js';
import { seededRandom, shuffled } from '../../src/shared/random.js';
import { makeParticipant } from '../../src/shared/state.js';
describe('T02: shared config and identities', () => {
 it('matches the design defaults', () => {
  expect(DEFAULT_CONFIG).toMatchObject({ simulationHz:30, snapshotHz:10, maxSlots:16, roundSeconds:240, mapRadius:56, spawnRadius:1, moveCellsPerSecond:4.2 });
  expect(validateConfig()).toEqual(DEFAULT_CONFIG);
 });
 it.each([{maxSlots:17},{maxSlots:0},{maxSlots:1.2},{roundSeconds:0},{mapRadius:1},{simulationHz:Infinity},{snapshotHz:7},{protectSeconds:NaN}])('rejects invalid config %j', c => expect(() => validateConfig(c)).toThrow());
 it('reproduces the seeded sequence and shuffling', () => {
  const a=seededRandom(71), b=seededRandom(71);
  expect(Array.from({length:32},a)).toEqual(Array.from({length:32},b));
  expect(shuffled([0,1,2,3],seededRandom(1))).toEqual([3,1,0,2]);
 });
 it('keeps identity, slot, life and stats separate', () => {
  const p=makeParticipant({participantId:'p',slot:3,kind:'HUMAN',nickname:'브로'});
  expect(p.lifeId).toBe(0); expect(p.slot).toBe(3); expect(p.trailCells.size).toBe(0);
  expect(p.lifeState).toBe('DEAD_WAIT'); expect(p.kills+p.deaths+p.controlScore+p.territoryCount).toBe(0);
 });
});
