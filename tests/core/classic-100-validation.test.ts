import {describe,it,expect} from 'vitest';
import {recordThresholds,statistics,runSeed,summarize,thresholds} from '../../scripts/classic-100-validation.js';

describe('Classic validation telemetry',()=>{
 it('uses exact cell counts rather than rounded percentages and retains first arrival',()=>{
  const times=Object.fromEntries(thresholds.map(t=>[t,null]));
  recordThresholds(times,9576,9577,100);
  expect(times[99]).toBe(100);expect(times[100]).toBeNull();
  recordThresholds(times,9577,9577,120);
  expect(times[99]).toBe(100);expect(times[100]).toBe(120);
 });
 it('does not change deterministic game state through captures, deaths and respawns',()=>{
  const observed=runSeed({seed:1,minutes:2});
  const plain=runSeed({seed:1,minutes:2,instrument:false});
  expect(observed.hash).toBe(plain.hash);
  expect(observed.deaths).toBeGreaterThan(0);expect(observed.respawns).toBeGreaterThan(0);
  expect(observed.lives.filter(l=>l.endReason==='HORIZON').length).toBe(observed.final.alive);
  expect(observed.lives.every(l=>l.durationSeconds>=0)).toBe(true);
  expect(observed.spawnEvents.every(e=>(e as {leaderCellsDelta:number}).leaderCellsDelta===0)).toBe(true);
  const s=summarize([observed]);
  expect(s.n).toBe(1);expect(s.thresholds[100].times).toBeNull();
  expect(s.lifeSegments['99-100'].times).toBeNull();
 },60000);
 it('keeps the no-respawn control separate without changing config or AI',()=>{
  const control=runSeed({seed:1,minutes:1,variant:'no-respawn'});
  expect(control.deaths).toBeGreaterThan(0);expect(control.respawns).toBe(0);
  expect(control.lives).toHaveLength(16);expect(control.config.respawnSeconds).toBe(3);
  expect(control.variant).toBe('no-respawn');
 },60000);
 it('uses nearest-rank quantiles and empty samples stay unavailable',()=>{
  expect(statistics([])).toBeNull();
  expect(statistics([4,1,3,2])).toMatchObject({median:2,p75:3,p90:4,min:1,max:4});
 });
});

