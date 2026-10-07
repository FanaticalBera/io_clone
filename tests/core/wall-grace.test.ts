import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {applySimultaneousCaptures,stepMatch} from '../../src/shared/engine.js';
import {axialToWorld,worldCell} from '../../src/shared/hex.js';
import {setWallGrace,wallGraceState,wallDeathTime,nearbyBoundaryEdges} from '../../src/shared/wall-grace.js';
import {traceMovement} from '../../src/shared/movement.js';
import {Presentation} from '../../src/client/presentation.js';
import {buildView} from '../../src/shared/game.js';
function wall(enabled=true){
 const f=captureFixture(),{m,a,b,id}=f;b.lifeState='FINISHED';a.cellId=id(5,0);setOwner(m,a.cellId,1);
 a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16-1;a.direction={x:1,y:0};a.targetDirection=null;
 setWallGrace(m,enabled);return f;
}
describe('opt-in wall escape experiment',()=>{
 it('retains strict default, gives exactly .2 seconds after impact and emits one death',()=>{
  const strict=wall(false);stepMatch(strict.m);expect(strict.a.deathReason).toBe('WALL_HIT');
  const {m,a}=wall();stepMatch(m);const deadline=wallGraceState(m,a)!.deadline!;
  expect(deadline).toBeCloseTo(6+1/(Math.sqrt(3)*32*4.2/30));expect(a.lifeState).toBe('ALIVE');
  while(m.tick<Math.floor(deadline)){stepMatch(m);expect(a.lifeState).toBe('ALIVE');expect(worldCell(m.map,a.position)).toBe(a.cellId);}
  stepMatch(m);expect(a.deathReason).toBe('WALL_HIT');expect(a.deaths).toBe(1);
  expect(a.deathContext!.eventTick).toBeCloseTo(deadline,4);stepMatch(m);
  expect(m.events.filter(e=>e.type==='DEATH')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it('continues limited rotation during contact and escapes a timely reverse input',()=>{
  const {m,a}=wall();a.targetDirection={x:-1,y:0};
  for(let t=0;t<6;t++){stepMatch(m);expect(a.lifeState).toBe('ALIVE');expect(worldCell(m.map,a.position)).toBe(a.cellId);}
  expect(a.direction.x).toBeLessThan(0);expect(a.position.x).toBeLessThan(axialToWorld(5,0).x+Math.sqrt(3)*16-1);
  expect(wallGraceState(m,a)!.deadline).not.toBeNull();
 });
 it('does not forgive trail cuts during grace and credits exactly one kill',()=>{
  const {m,a,b,id}=wall();b.lifeState='ALIVE';b.cellId=id(0,0);b.position=axialToWorld(0,0);b.direction={x:1,y:0};setOwner(m,id(-1,0),2);addTrail(m,a,id(0,0));
  stepMatch(m);expect(a.deathReason).toBe('TRAIL_CUT');expect(b.kills).toBe(1);expect(a.deaths).toBe(1);expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId==='a')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it('does not refill on a free tick near the wall or repeated contact; requires distance and one second',()=>{
  const {m,a}=wall();const start={...a.position},hit=traceMovement(m.map,start,a.cellId,{x:1,y:0},10);
  wallDeathTime(m,a,start,hit);const deadline=wallGraceState(m,a)!.deadline;
  const free={position:start,cellId:a.cellId,entries:[],blocked:false,boundaryT:null};
  for(m.tick=1;m.tick<=60;m.tick++)wallDeathTime(m,a,start,free);
  expect(wallGraceState(m,a)!.deadline).toBe(deadline);expect(wallDeathTime(m,a,start,hit)).toBe(hit.boundaryT);
  const centre=axialToWorld(0,0),clear={...free,position:centre,cellId:m.map.byKey.get('0,0')!};
  for(let i=0;i<29;i++)wallDeathTime(m,a,centre,clear);expect(wallGraceState(m,a)!.deadline).toBe(deadline);
  wallDeathTime(m,a,centre,clear);expect(wallGraceState(m,a)!.deadline).toBeNull();
  expect(wallDeathTime(m,a,start,hit)).toBeNull();expect(wallGraceState(m,a)!.deadline).toBeGreaterThan(m.tick);
 });
 it('resets budgets on a new life and keeps matches and protocol fields independent',()=>{
  const {m,a}=wall();stepMatch(m);expect(wallGraceState(m,a)).not.toBeNull();
  const fields=Object.keys(buildView(m).participants[0]);expect(fields.some(k=>k.toLowerCase().includes('wall'))).toBe(false);
  a.lifeId++;expect(wallGraceState(m,a)).toBeNull();stepMatch(m);expect(a.lifeState).toBe('ALIVE');
  const other=wall(false);stepMatch(other.m);expect(other.a.deathReason).toBe('WALL_HIT');
  setWallGrace(m,false);stepMatch(m);expect(a.deathReason).toBe('WALL_HIT');
 });
 it('uses the identical rule for BOT and HUMAN, including slot 15',()=>{
  for(const kind of ['HUMAN','BOT'] as const){const {m,a}=wall();a.kind=kind;m.config.maxSlots=16;m.priority=Array.from({length:16},(_,i)=>i);a.slot=15;m.owners[a.cellId]=16;stepMatch(m);expect(a.lifeState).toBe('ALIVE');for(let t=0;t<6;t++)stepMatch(m);expect(a.deathReason).toBe('WALL_HIT');expect(a.deaths).toBe(1);}
 });
 it('continues self prediction through clamp and rotation without changing geometry',()=>{
  const {m,a}=wall();a.targetDirection={x:-1,y:0};const view=buildView(m),p=new Presentation();p.setWallGrace(true);p.accept(view,'a',0,true);
  for(let t=1;t<=6;t++){stepMatch(m);expect(p.position('a',t*1000/30)!.x).toBeCloseTo(a.position.x,7);expect(p.position('a',t*1000/30)!.y).toBeCloseTo(a.position.y,7);}
  const strict=new Presentation();strict.accept(view,'a',0,true);expect(strict.position('a',200)!.x).toBeGreaterThan(p.position('a',200)!.x);
 });
 it('remains inside every boundary segment and corner through the entire grace',()=>{
  const map=wall().m.map;
  for(const edge of map.boundaryEdges){
   const {m,a}=wall();const mid={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2};
   const id=worldCell(m.map,{x:mid.x*.999999,y:mid.y*.999999}),centre=m.map.cells[id].center;
   const dx=mid.x-centre.x,dy=mid.y-centre.y,length=Math.hypot(dx,dy),dir={x:dx/length,y:dy/length};
   for(let i=0;i<m.owners.length;i++)if(m.owners[i]===1)setOwner(m,i,0);setOwner(m,id,1);
   a.cellId=id;a.position={x:mid.x-dir.x,y:mid.y-dir.y};a.direction=dir;
   for(let t=0;t<7;t++){stepMatch(m);expect(worldCell(m.map,a.position)).toBe(a.cellId);}
   expect(a.deathReason).toBe('WALL_HIT');expect(a.deaths).toBe(1);
  }
 });
 it('capture cuts and territory loss remain lethal while a wall budget is active',()=>{
  const {m,a,b,id}=wall();stepMatch(m);expect(wallGraceState(m,a)!.deadline).not.toBeNull();
  b.lifeState='ALIVE';b.cellId=id(0,0);b.position=axialToWorld(0,0);setOwner(m,b.cellId,2);
  const trail=id(1,0);addTrail(m,a,trail);addTrail(m,b,trail);applySimultaneousCaptures(m,[b]);
  expect(a.deathReason).toBe('TRAIL_CUT');expect(b.kills).toBe(1);assertOwnershipCounts(m);
  const f=wall();stepMatch(f.m);setOwner(f.m,f.a.cellId,0);stepMatch(f.m);expect(f.a.deathReason).toBe('TERRITORY_LOST');expect(f.a.deaths).toBe(1);
 });
 it('finds actual nearby segments at jagged corners and none in the map centre',()=>{
  const {m,a}=wall();expect(nearbyBoundaryEdges(m.map,a.position,32).length).toBeGreaterThan(0);
  expect(nearbyBoundaryEdges(m.map,{x:0,y:0},32)).toEqual([]);
  for(const e of m.map.boundaryEdges){expect(nearbyBoundaryEdges(m.map,e.a,.01)).toContain(e);}
 });
});
