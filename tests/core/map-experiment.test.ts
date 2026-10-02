import {describe,it,expect} from 'vitest';
import {runMapExperiment} from '../../scripts/map-size-experiment.js';

describe('map experiment accounting uses ordinary gameplay',()=>{
 it('uses null and NOT_REACHED_UNVERIFIED for unvisited bands, with actual spawn outcomes recorded',()=>{
  const r=runMapExperiment(22,4,'classic',.7);expect(r.violations).toEqual([]);expect(r.respawn.attempts).toBeGreaterThan(0);expect(r.respawn.attempts).toBe(r.respawn.successful+r.respawn.failedBlocked);
  const unvisited=r.leaderBands.find(b=>b.band==='95%+')!;expect(unvisited).toMatchObject({status:'NOT_REACHED_UNVERIFIED',sampleCount:0,neutralCellCount:null,validSpawnCenterCount:null,respawnAttempts:null,successfulRespawns:null,failedBlockedRespawns:null,respawnSuccessRate:null});
  expect(r.spawnAttempts.every(a=>a.success===(a.validCenterCount>0))).toBe(true);expect(r.samples.every(s=>s.neutralPercent+s.occupiedPercent===100)).toBe(true);
  expect(r.config.mapRadius).toBe(22);expect(r.config.moveCellsPerSecond).toBe(4.2);expect(r.config.spawnRadius).toBe(2);expect(r.config.spawnBufferHexes).toBe(3);
 });
});
