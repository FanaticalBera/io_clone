import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {axialToWorld} from '../../src/shared/hex.js';
import {stepMatch} from '../../src/shared/engine.js';
function crossing(returnOffset:number,cutOffset:number) {
 const {m,a,b,id}=captureFixture();
 setOwner(m,id(0,0),1);setOwner(m,id(3,0),2);
 a.cellId=id(1,0);a.position={x:Math.sqrt(3)*16+returnOffset,y:0};a.direction={x:-1,y:0};
 b.cellId=id(3,0);b.position={x:Math.sqrt(3)*32*2.5+cutOffset,y:0};b.direction={x:-1,y:0};
 addTrail(m,a,id(1,0));addTrail(m,a,id(2,0));return{m,a,b,id};
}
describe('T09: strict chronological cut/return',()=>{
 it('kills when the cut crosses first',()=>{
  const {m,a,b}=crossing(4,1);stepMatch(m);
  expect(a.lifeState).toBe('DEAD_WAIT');expect(b.kills).toBe(1);
 });
 it('does not cut an already closed trail when return crosses first',()=>{
  const {m,a,b,id}=crossing(1,4);stepMatch(m);
  expect(a.lifeState).toBe('ALIVE');expect(b.kills).toBe(0);expect(m.owners[id(2,0)]).toBe(1);
 });
 it('has no body-only kill when the territory owner is protected',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,0),1);setOwner(m,id(3,0),2);
  for(const p of [a,b]){p.cellId=id(0,0);p.position=axialToWorld(0,0);p.direction={x:1,y:0};}
  a.spawnCells.add(id(0,0));a.protectedUntilTick=60;
  stepMatch(m);expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('ALIVE');expect(a.kills+b.kills).toBe(0);
 });
});
