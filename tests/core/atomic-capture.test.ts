import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {disk,hexDistance} from '../../src/shared/hex.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {resolveAtTime} from '../../src/shared/engine.js';
const ring:[number,number][]=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
describe('T11: atomic captures and derived events',()=>{
 it('resolves overlapping candidates against one base state with seeded priority',()=>{
  for(const reverse of [false,true]){
   const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(-4,0),1);setOwner(m,id(-2,0),2);setOwner(m,id(4,0),2);
   a.cellId=id(0,-1);b.cellId=id(-2,0);m.priority=[0,1];
   for(const [q,r]of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));
   for(const c of disk({q:0,r:0},2))if(hexDistance(c,{q:0,r:0})===2&&(c.q!==-2||c.r!==0))addTrail(m,b,id(c.q,c.r));
   if(reverse)m.participants.reverse();resolveAtTime(m);
   expect(m.owners[id(0,0)]).toBe(1);expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('ALIVE');
   expect(m.owners[id(0,-1)]).toBe(2);expect(a.trailCells.has(id(0,-1))).toBe(true);assertOwnershipCounts(m);
  }
 });
 it('kills only after the full transfer when the last territory disappears',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(0,0),2);
  a.cellId=id(0,-1);b.cellId=id(3,0);
  for(const [q,r]of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));resolveAtTime(m);
  expect(b.lifeState).toBe('DEAD_WAIT');expect(b.deathReason).toBe('TERRITORY_LOST');expect(a.kills).toBe(0);assertOwnershipCounts(m);
 });
 it('a stolen current cell creates a trail without a body-only death',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(0,0),2);setOwner(m,id(3,0),2);
  a.cellId=id(0,-1);b.cellId=id(0,0);
  for(const [q,r]of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));resolveAtTime(m);
  expect(b.lifeState).toBe('ALIVE');expect(b.trailCells.has(id(0,0))).toBe(true);expect(a.kills).toBe(0);
 });
});
