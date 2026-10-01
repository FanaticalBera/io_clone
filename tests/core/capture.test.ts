import {describe,it,expect} from 'vitest';
import {createMap,axialKey} from '../../src/shared/hex.js';
import {createState} from '../../src/shared/state.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {captureCandidates} from '../../src/shared/capture.js';
import {captureFixture} from './helpers.js';
const ring:[number,number][]=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
type Coord=[number,number];
describe('T06: capture candidates with explicit expected cells',()=>{
 it('fills only a sealed ring and trail; opponent owners and trails are not walls',()=>{
  const {m,a,b,id,coords}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(0,0),2);addTrail(m,b,id(0,0));
  for(const [q,r] of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));
  expect(coords(captureCandidates(m,a))).toEqual(['-1,0','-1,1','0,0','0,1','1,-1','1,0'].sort());
  expect(m.owners[id(0,0)]).toBe(2);expect(m.trailMasks[id(0,0)]).toBe(2);
 });
 it('returns trail only for an unsealed ring and repeated self crossing',()=>{
  const {m,a,id,coords}=captureFixture();setOwner(m,id(0,-1),1);
  for(const [q,r] of [[1,0],[1,-1],[-1,0],[-1,1]] as Coord[])addTrail(m,a,id(q,r));
  addTrail(m,a,id(1,0));
  expect(coords(captureCandidates(m,a))).toEqual(['-1,0','-1,1','1,-1','1,0'].sort());
  expect(a.trailCells.size).toBe(4);
 });
 it('recognizes two independently sealed regions',()=>{
  const {m,a,id,coords}=captureFixture();
  for(const center of [-2,2])for(const [q,r] of ring)if(q===0&&r===-1)setOwner(m,id(q+center,r),1);else addTrail(m,a,id(q+center,r));
  expect(coords(captureCandidates(m,a))).toEqual(['-3,0','-3,1','-2,0','-2,1','-1,-1','-1,0','1,0','1,1','2,0','2,1','3,-1','3,0'].sort());
 });
});

