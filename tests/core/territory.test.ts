import {describe,it,expect} from 'vitest';
import {createMap,axialKey} from '../../src/shared/hex.js';
import {createState} from '../../src/shared/state.js';
import {setOwner,visitCell,addTrail,clearTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
function fixture(){
 const m=createState({mapRadius:3},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}],createMap(3),'m');
 for(const p of m.participants){p.lifeState='ALIVE';p.lifeId=1;}
 return {m,id:(q:number,r:number)=>m.map.byKey.get(axialKey(q,r))!,a:m.participants[0],b:m.participants[1]};
}
describe('T05: ownership and exposed trail lifetime',()=>{
 it('keeps current ownership until return and deduplicates self crossings',()=>{
  const {m,id,a}=fixture();setOwner(m,id(0,0),1);setOwner(m,id(2,0),2);
  expect(visitCell(m,a,id(0,0))).toBe('INSIDE');expect(a.trailCells.size).toBe(0);
  expect(visitCell(m,a,id(1,0))).toBe('TRAIL');visitCell(m,a,id(2,0));visitCell(m,a,id(1,0));
  expect(a.trailCells.size).toBe(2);expect(m.owners[id(1,0)]).toBe(0);expect(m.owners[id(2,0)]).toBe(2);
  expect(visitCell(m,a,id(0,0))).toBe('RETURN');expect(a.trailCells.size).toBe(2);
  assertOwnershipCounts(m);
 });
 it('preserves the other simultaneous trail bit when one is removed',()=>{
  const {m,id,a,b}=fixture();addTrail(m,a,id(0,0));addTrail(m,b,id(0,0));
  expect(m.trailMasks[id(0,0)]).toBe(3);clearTrail(m,a);
  expect(m.trailMasks[id(0,0)]).toBe(2);expect(b.trailCells.size).toBe(1);
 });
 it('atomically accounts transfers and ignores duplicate ownership',()=>{
  const {m,id,a,b}=fixture();setOwner(m,id(0,0),1);setOwner(m,id(0,0),1);expect(a.territoryCount).toBe(1);
  setOwner(m,id(0,0),2);expect(a.territoryCount).toBe(0);expect(b.territoryCount).toBe(1);
  setOwner(m,id(0,0),0);expect(b.territoryCount).toBe(0);assertOwnershipCounts(m);
  expect(()=>setOwner(m,-1,1)).toThrow();expect(()=>setOwner(m,0,8)).toThrow();
 });
});
