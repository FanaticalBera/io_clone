import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {axialToWorld} from '../../src/shared/hex.js';
import {stepMatch} from '../../src/shared/engine.js';
function place(m:ReturnType<typeof captureFixture>['m'],slot:number,q:number,r:number,dx:number,dy:number,offset=0){
 const p=m.participants[slot],cell=m.map.byKey.get(q+','+r)!;p.cellId=cell;p.position=axialToWorld(q,r);p.position.x+=offset;
 p.direction={x:dx,y:dy};p.protectedUntilTick=0;return p;
}
describe('T09: fixed tick authoritative events',()=>{
 it('cuts any old trail cell and discards the victim later movement',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(-2,0),1);setOwner(m,id(0,0),2);
  place(m,0,-1,0,1,0);place(m,1,0,0,1,0);addTrail(m,a,id(1,0));addTrail(m,a,id(2,0));
  b.position.x=Math.sqrt(3)*16-1;const old={...a.position};stepMatch(m);
  expect(a.lifeState).toBe('DEAD_WAIT');expect(b.kills).toBe(1);expect(a.position.x-old.x).toBeLessThan(2);expect(a.trailCells.size).toBe(0);assertOwnershipCounts(m);
 });
 it('does not kill touching bodies with no exposed trails',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,0),1);setOwner(m,id(0,1),2);
  place(m,0,0,0,1,0);place(m,1,0,0,1,0);b.spawnCells.add(id(0,0));b.protectedUntilTick=10;
  // B is outside its territory: it creates a real trail, so use both protected own regions in a body-only geometry scenario separately.
  b.cellId=id(0,1);b.position={...m.map.cells[id(0,1)].center};
  stepMatch(m);expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('ALIVE');
 });
 it('requires own territory return and ignores old life input',()=>{
  const {m,a,id}=captureFixture();m.participants[1].lifeState='DEAD_WAIT';
  setOwner(m,id(0,0),1);place(m,0,1,0,-1,0,-Math.sqrt(3)*16+1);addTrail(m,a,id(1,0));
  const input={matchId:'m',lifeId:0,seq:4,dx:1,dy:0};stepMatch(m,new Map([['a',input]]));
  expect(m.owners[id(1,0)]).toBe(1);expect(a.trailCells.size).toBe(0);expect(a.lastAppliedInputSeq).toBe(0);
 });
 it('repeats the same input sequence deterministically',()=>{
  const make=()=>{const f=captureFixture();setOwner(f.m,f.id(0,0),1);setOwner(f.m,f.id(3,0),2);place(f.m,0,0,0,1,0);place(f.m,1,3,0,-1,0);return f.m;};
  const a=make(),b=make();for(let i=0;i<50;i++){stepMatch(a);stepMatch(b);}expect(a.owners).toEqual(b.owners);expect(a.trailMasks).toEqual(b.trailMasks);
  expect(a.participants.map(p=>[p.position,p.lifeState,p.deaths])).toEqual(b.participants.map(p=>[p.position,p.lifeState,p.deaths]));
 });
});

