import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {markDead} from '../../src/shared/life.js';
import {setOwner} from '../../src/shared/territory.js';
import {buildView} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {roundDeadlineTicks} from '../../src/shared/modes.js';
import {calculateReward} from '../../src/client/reward.js';
import type {MatchState} from '../../src/shared/model.js';
// Two humans on a small board in the 3-minute round.
function round():MatchState{
 const m=createMatch({mapRadius:8,maxSlots:2,spawnRadius:1},7,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}],'t',{id:'timed'});
 for(let i=0;i<5;i++)stepMatch(m);return m;
}
// Hands each player exactly `cells` owned cells (their spawn zone included) and jumps to the last tick.
function finishWith(m:MatchState,cells:Record<string,number>,kills:Record<string,number>={}):void{
 for(let id=0;id<m.owners.length;id++)setOwner(m,id,0);
 let next=0;for(const p of m.participants){for(let i=0;i<cells[p.participantId];i++)setOwner(m,next++,p.slot+1);p.kills=kills[p.participantId]??0;p.cellId=next-1;p.position={...m.map.cells[p.cellId].center};}
 m.tick=roundDeadlineTicks(m)!-1;stepMatch(m);
}
describe('3-minute round',()=>{
 it('respawns a fallen human after three seconds, carrying the run, with its territory lost',()=>{
  const m=round(),a=m.participants[0],started=a.run!.startedAtTick;
  expect(markDead(m,a,'WALL_HIT')).toBe(true);
  expect(a.lifeState).toBe('DEAD_WAIT');expect(a.territoryCount).toBe(0);expect(a.run!.result).toBeNull();expect(a.run!.pendingDeathAtTick).toBeNull();
  for(let i=0;i<3*m.config.simulationHz+2;i++)stepMatch(m);
  expect(a.lifeState).toBe('ALIVE');expect(a.lifeId).toBe(2);expect(a.run!.lifeId).toBe(2);expect(a.run!.startedAtTick).toBe(started);
 });
 it('ends at three minutes: most territory wins, and every human gets one round result',()=>{
  const m=round();expect(roundDeadlineTicks(m)).toBe(180*m.config.simulationHz);
  markDead(m,m.participants[1],'WALL_HIT');
  finishWith(m,{a:12,b:0});
  expect(m.phase).toBe('FINISHED');expect(m.outcome).toMatchObject({winnerId:'a',reason:'TIME_UP'});expect(m.outcome!.coWinnerIds).toBeUndefined();
  const [a,b]=m.participants;
  expect(a.run!.result!.endReason).toBe('TIME_WIN');expect(b.run!.result!.endReason).toBe('TIME_LOSS');
  // The finished snapshot (with both results) passes the wire checks.
  const view=buildView(m);expect(()=>unpackSnapshot(packSnapshot(view,1,0,'a'))).not.toThrow();
  expect(calculateReward(a.run!.result!).clearBonusCoins).toBe(50);expect(calculateReward(b.run!.result!).clearBonusCoins).toBe(0);
 });
 it('breaks a territory tie by kills, and shares first place when kills tie too',()=>{
  const byKills=round();finishWith(byKills,{a:10,b:10},{a:1,b:3});
  expect(byKills.outcome).toMatchObject({winnerId:'b'});expect(byKills.outcome!.coWinnerIds).toBeUndefined();
  expect(byKills.results!.map(r=>[r.participantId,r.rank])).toEqual([['b',1],['a',2]]);
  const shared=round();finishWith(shared,{a:10,b:10},{a:2,b:2});
  expect(shared.outcome!.coWinnerIds!.sort()).toEqual(['a','b']);
  expect(shared.results!.map(r=>r.rank)).toEqual([1,1]);
  expect(shared.participants.map(p=>p.run!.result!.endReason)).toEqual(['TIME_WIN','TIME_WIN']);
  expect(()=>unpackSnapshot(packSnapshot(buildView(shared),1,0,'a'))).not.toThrow();
 });
 it('ends at once on a full capture before time, still settled as a timed round',()=>{
  const m=round(),[a,b]=m.participants;
  for(let id=0;id<m.owners.length;id++)setOwner(m,id,1);b.lifeState='DEAD_WAIT';b.respawnAtTick=m.tick+999;
  stepMatch(m);
  expect(m.phase).toBe('FINISHED');expect(m.outcome).toMatchObject({winnerId:'a',reason:'FULL_CAPTURE'});expect(m.tick).toBeLessThan(roundDeadlineTicks(m)!);
  expect(a.run!.result!.endReason).toBe('TIME_WIN');expect(b.run!.result!.endReason).toBe('TIME_LOSS');
  expect(()=>unpackSnapshot(packSnapshot(buildView(m),1,0,'a'))).not.toThrow();
 });
});
