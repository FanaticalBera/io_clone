import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {captureCandidates} from '../../src/shared/capture.js';
const ring:[number,number][]=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
describe('T07: exterior ring and separated territory',()=>{
 it('does not fill a boundary pocket open to the virtual exterior',()=>{
  const {m,a,id,coords}=captureFixture(3);setOwner(m,id(2,0),1);setOwner(m,id(2,1),1);addTrail(m,a,id(3,-1));
  expect(coords(captureCandidates(m,a))).toEqual(['3,-1']);expect(captureCandidates(m,a).has(id(3,0))).toBe(false);
 });
 it('fills an actually sealed pocket adjacent to the edge',()=>{
  const {m,a,id,coords}=captureFixture(3);
  for(const [q,r]of ring)if(q===-1&&r===0)setOwner(m,id(q+2,r),1);else addTrail(m,a,id(q+2,r));
  expect(coords(captureCandidates(m,a))).toEqual(['1,1','2,-1','2,0','2,1','3,-1','3,0'].sort());
 });
 it('does not acquire an unrelated hole enclosed by pre-existing territory',()=>{
  const {m,a,id}=captureFixture();
  for(const [q,r]of ring)setOwner(m,id(q-2,r),1);
  for(const [q,r]of ring)if(q===-1&&r===0)setOwner(m,id(q+2,r),1);else addTrail(m,a,id(q+2,r));
  const result=captureCandidates(m,a);expect(result.has(id(2,0))).toBe(true);expect(result.has(id(-2,0))).toBe(false);
 });
 it('returns only the trail when returning to separated owned territory',()=>{
  const {m,a,id,coords}=captureFixture();setOwner(m,id(-2,0),1);setOwner(m,id(2,0),1);
  for(const q of [-1,0,1])addTrail(m,a,id(q,0));
  expect(coords(captureCandidates(m,a))).toEqual(['-1,0','0,0','1,0'].sort());
 });
});

