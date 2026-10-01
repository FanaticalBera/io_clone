import { describe,it,expect } from 'vitest';
import { createMap,axialToWorld,worldToAxial,hexDistance,region } from '../../src/shared/hex.js';
import { createMatch } from '../../src/shared/game.js';
import { createState } from '../../src/shared/state.js';
describe('T03: fixed pointy hex map',()=>{
 it('has 1519 unique cells in stable r/q order, symmetric adjacency and one component',()=>{
  const m=createMap();expect(m.cells.length).toBe(1519);expect(m.byKey.size).toBe(1519);
  const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const id of m.cells[queue[i]].neighbors)if(id>=0&&!visited.has(id)){visited.add(id);queue.push(id);}
  expect(visited.size).toBe(1519);
  for(const c of m.cells)for(const n of c.neighbors)if(n>=0)expect(m.cells[n].neighbors).toContain(c.id);
  expect(m.cells[0]).toMatchObject({q:0,r:-22});expect(m.controlPoints.map(cp=>{const c=m.cells[cp.cellId];return[c.q,c.r];})).toEqual([[-8,0],[0,8],[8,-8]]);
 });
 it('round trips every center and preserves known neighbor distances',()=>{
  const m=createMap();for(const c of m.cells)expect(worldToAxial(c.center.x,c.center.y)).toEqual({q:c.q,r:c.r});
  const a=axialToWorld(0,0),b=axialToWorld(1,0);expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeCloseTo(Math.sqrt(3)*32);
  expect(hexDistance({q:3,r:-1},{q:-2,r:4})).toBe(5);
 });
 it('validates all 8 disjoint 19-cell starting zones without control points',()=>{
  const m=createMap(), all=new Set<number>();expect(m.anchors.length).toBe(8);
  for(const anchor of m.anchors){const zone=region(m,anchor,2);expect(zone.length).toBe(19);
   for(const id of zone){expect(id).toBeGreaterThanOrEqual(0);expect(all.has(id)).toBe(false);expect(m.controlPoints.some(cp=>cp.cellId===id)).toBe(false);all.add(id);}
  }
 });
 it('reproduces initialization and rejects duplicate ids/slots',()=>{
  const specs=Array.from({length:8},(_,slot)=>({slot,participantId:'p'+slot,nickname:'same',kind:'HUMAN' as const}));
  const a=createMatch({},24,specs),b=createMatch({},24,[...specs].reverse());
  expect(a.owners.reduce((n,x)=>n+(x>0?1:0),0)).toBe(152);
  expect(createMatch({},24,specs).owners).toEqual(a.owners);
  expect([...a.priority]).toEqual(b.priority);
  expect(()=>createState({},24,[specs[0],specs[0]],a.map,'m')).toThrow();
 });
});
