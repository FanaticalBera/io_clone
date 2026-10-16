import {describe,it,expect} from 'vitest';
import {emptyProfile,validProfile,migrateProfile,grantProfileReward} from '../../src/client/profile.js';
import {profileViewModel} from '../../src/client/profile-view-model.js';
import {presetForCellCount} from '../../src/shared/map-presets.js';
import type {RunResult} from '../../src/shared/model.js';
// A run on a board of `count` cells reaching `cells` of territory.
function run(count:number,cells:number,lifeId=1,endReason:RunResult['endReason']='DEATH'):RunResult{
 return{runId:'m:h:life:'+lifeId,matchId:'m',participantId:'h',lifeId,endReason,startedAtTick:30,endedAtTick:330,durationTicks:300,simulationHz:30,mapCellCount:count,kills:0,bestTerritoryCells:cells,bestTerritoryPercent:Math.floor(cells*1000/count)/10};
}
const admission=(lifeId=1)=>({matchId:'m',participantId:'h',lifeId,initialTerritoryCells:7,ownerId:'tab'});
describe('per-map profile records',()=>{
 it('tells every board preset apart by its cell count',()=>{
  expect(presetForCellCount(9577)).toBe('hex');expect(presetForCellCount(9709)).toBe('rect');expect(presetForCellCount(1801)).toBe('mini');expect(presetForCellCount(1234)).toBeNull();
 });
 it('moves a legacy profile’s totals onto the hexagon and starts the card there',()=>{
  const legacy=emptyProfile() as unknown as {stats:Record<string,unknown>};delete legacy.stats.maps;
  Object.assign(legacy.stats,{runsPlayed:12,classicClears:2,bestTerritoryPercent:41.5});
  const p=migrateProfile(legacy)!;expect(p.stats.maps).toEqual({hex:{best:41.5,clears:2,runs:12,kills:0,longest:0}});expect(validProfile(p)).toBe(true);
  const view=profileViewModel(p);expect(view.maps[view.lastMap]).toMatchObject({id:'hex',best:41.5,clears:2,runs:12,kills:0});
 });
 it('records each run on its own board and remembers the last board played',()=>{
  const p=migrateProfile(emptyProfile())!;
  grantProfileReward(p,run(9709,2000,1),admission(1));
  grantProfileReward(p,run(9577,9577,2,'FULL_CAPTURE_WIN'),admission(2));
  grantProfileReward(p,run(9709,500,3),admission(3));
  expect(p.stats.maps).toEqual({rect:{best:20.5,clears:0,runs:2,kills:0,longest:10,topKills:0},hex:{best:100,clears:1,runs:1,kills:0,longest:10,topKills:0,fastest:10}});
  expect(p.stats.lastMap).toBe('rect');expect(p.stats.runsPlayed).toBe(3);expect(p.stats.classicClears).toBe(1);expect(validProfile(p)).toBe(true);
 });
 it('counts a run on an unknown board only in the totals',()=>{
  const p=migrateProfile(emptyProfile())!;grantProfileReward(p,run(1000,300),admission());
  expect(p.stats.maps).toEqual({});expect(p.stats.lastMap).toBeUndefined();expect(p.stats.runsPlayed).toBe(1);
 });
 it('rejects malformed map records',()=>{
  for(const maps of [{nope:{best:1,clears:0,runs:1}},{hex:{best:101,clears:0,runs:1}},{hex:{best:5,clears:-1,runs:1}},{hex:{best:5,clears:0,runs:1,kills:-2}},{hex:{best:5,clears:0,runs:1,longest:-1}},[]]){const p=emptyProfile() as unknown as {stats:Record<string,unknown>};p.stats.maps=maps;expect(validProfile(p)).toBe(false);}
  const p=emptyProfile() as unknown as {stats:Record<string,unknown>};p.stats.lastMap='nope';expect(validProfile(p)).toBe(false);
 });
 it('reports records broken on the same board, never on its first run or on a tie',()=>{
  const p=migrateProfile(emptyProfile())!,kills=(r:RunResult,k:number)=>({...r,kills:k});
  expect(grantProfileReward(p,kills(run(9709,2000,1),2),admission(1)).records).toBeUndefined();
  expect(grantProfileReward(p,kills(run(9709,2000,2),2),admission(2)).records).toBeUndefined();
  expect(grantProfileReward(p,kills(run(9709,2500,3),5),admission(3)).records).toEqual({best:true,kills:true});
  // A first run on another board breaks nothing there.
  expect(grantProfileReward(p,kills(run(9577,4000,4),9),admission(4)).records).toBeUndefined();
 });
 it('counts a faster full capture as a record and keeps the fastest time',()=>{
  const p=migrateProfile(emptyProfile())!,win=(life:number,ticks:number)=>({...run(9577,9577,life,'FULL_CAPTURE_WIN'),durationTicks:ticks,endedAtTick:30+ticks});
  grantProfileReward(p,win(1,9000),admission(1));
  expect(grantProfileReward(p,win(2,12000),admission(2)).records).toBeUndefined();
  expect(grantProfileReward(p,win(3,6000),admission(3)).records).toEqual({fastest:true});
  expect(p.stats.maps!.hex.fastest).toBe(200);
 });
 it('counts 3-minute rounds only in the totals: no per-map record, no record badges',()=>{
  const p=migrateProfile(emptyProfile())!,timed=(life:number,cells:number,reason:RunResult['endReason']='TIME_LOSS')=>run(9577,cells,life,reason);
  grantProfileReward(p,run(9577,3000,1),admission(1));
  expect(grantProfileReward(p,timed(2,500),admission(2)).records).toBeUndefined();
  const won=grantProfileReward(p,timed(3,8000,'TIME_WIN'),admission(3));expect(won.records).toBeUndefined();expect(won.previousBest).toBeUndefined();
  expect(p.stats.maps!.hex.best).toBe(31.3);expect(p.stats.maps!['timed:hex']).toBeUndefined();
  expect(p.stats.runsPlayed).toBe(3);expect(p.stats.lastMap).toBe('hex');expect(validProfile(p)).toBe(true);
 });
 it('keeps growth records apart and reports the previous best for the result screen',()=>{
  const p=migrateProfile(emptyProfile())!,grow=(life:number,cells:number)=>({...run(9577,cells,life,'TIME_LOSS'),mode:'growth' as const});
  expect(grantProfileReward(p,grow(1,500),admission(1)).previousBest).toBeNull();
  const second=grantProfileReward(p,grow(2,800),admission(2));expect(second.previousBest).toBe(5.2);expect(second.records).toEqual({best:true});
  expect(p.stats.maps!['growth:hex']).toMatchObject({best:8.3,runs:2});expect(p.stats.maps!['timed:hex']).toBeUndefined();expect(validProfile(p)).toBe(true);
 });
});
