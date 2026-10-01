import {describe,it,expect} from 'vitest';
import {createMap,axialToWorld,axialKey,worldCell} from '../../src/shared/hex.js';
import {normalizeDirection,traceMovement,quantizedEventTime} from '../../src/shared/movement.js';
describe('T04: continuous crossing geometry',()=>{
 const map=createMap(4),id=(q:number,r:number)=>map.byKey.get(axialKey(q,r))!;
 it('traces every intermediate horizontal cell and exact crossing times',()=>{
  const path=traceMovement(map,axialToWorld(-2,0),id(-2,0),{x:1,y:0},Math.sqrt(3)*32*4);
  expect(path.entries.map(e=>{const c=map.cells[e.cellId];return[c.q,c.r];})).toEqual([[-1,0],[0,0],[1,0],[2,0]]);
  path.entries.forEach((e,i)=>expect(e.t).toBeCloseTo([0.125,0.375,0.625,0.875][i],12));
  expect(path.cellId).toBe(id(2,0));
 });
 it('traces diagonal neighbor centers',()=>{
  const end=axialToWorld(0,-3),path=traceMovement(map,axialToWorld(0,0),id(0,0),end,Math.hypot(end.x,end.y));
  expect(path.entries.map(e=>{const c=map.cells[e.cellId];return[c.q,c.r];})).toEqual([[0,-1],[0,-2],[0,-3]]);
 });
 it('reports the boundary impact time and leaves the geometry result inside the map',()=>{
  const p=traceMovement(map,axialToWorld(4,0),id(4,0),{x:1,y:0},100);
  expect(p.blocked).toBe(true);expect(p.boundaryT).toBeCloseTo(Math.sqrt(3)*16/100,12);expect(worldCell(map,p.position)).toBe(id(4,0));
  const back=traceMovement(map,p.position,p.cellId,{x:-1,y:0},80);expect(back.blocked).toBe(false);expect(back.cellId).toBe(id(3,0));
 });
 it('handles a shared edge start and vertex sides without infinite iteration',()=>{
  const start={x:Math.sqrt(3)*16,y:0};
  const edge=traceMovement(map,start,id(0,0),{x:1,y:0},10);expect(edge.entries[0]).toMatchObject({t:0,cellId:id(1,0)});
  for(const x of [-0.001,0,0.001]){
   const p=traceMovement(map,{x,y:0},id(0,0),{x:0,y:1},100);
   expect(p.entries.length).toBeGreaterThan(0);expect(p.entries.length).toBeLessThan(6);
   expect(worldCell(map,p.position)).toBe(p.cellId);
  }
 });
 it('normalizes diagonals, rejects invalid directions and quantizes microseconds',()=>{
  expect(normalizeDirection(1,1)!.x).toBeCloseTo(Math.SQRT1_2,15); expect(normalizeDirection(1,1)!.y).toBeCloseTo(Math.SQRT1_2,15);
  for(const v of [[0,0],[NaN,1],[Infinity,1]])expect(normalizeDirection(v[0],v[1])).toBeNull();
  expect(quantizedEventTime(0.5,30)).toBe(16667);
 });
});

