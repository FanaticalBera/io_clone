import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {markDead,leaveParticipant} from '../../src/shared/life.js';
describe('T08: one death per life',()=>{
 it('clears only the victim, credits one killer and preserves cumulative stats',()=>{
  const {m,a,b,id}=captureFixture();a.controlScore=7;a.kills=2;
  setOwner(m,id(0,0),1);addTrail(m,a,id(1,0));addTrail(m,b,id(1,0));
  expect(markDead(m,a,'TRAIL_CUT',b)).toBe(true);expect(markDead(m,a,'TRAIL_CUT',b)).toBe(false);
  expect(a).toMatchObject({lifeState:'DEAD_WAIT',deaths:1,kills:2,controlScore:7,territoryCount:0,respawnAtTick:90});
  expect(b.kills).toBe(1);expect(m.owners[id(0,0)]).toBe(0);expect(m.trailMasks[id(1,0)]).toBe(2);
  addTrail(m,a,id(2,0));expect(a.trailCells.size).toBe(0);assertOwnershipCounts(m);
 });
 it('does not award kills for territory loss or leaving',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,0),1);markDead(m,a,'TERRITORY_LOST');
  expect(b.kills).toBe(0);setOwner(m,id(1,0),2);b.controlScore=4;
  leaveParticipant(m,b);leaveParticipant(m,b);expect(b.deaths).toBe(0);expect(m.departed).toHaveLength(1);
  expect(m.departed[0]).toMatchObject({rank:null,status:'LEFT',score:4,territory:0});
 });
});

