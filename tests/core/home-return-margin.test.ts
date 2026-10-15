import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch,buildView} from '../../src/shared/game.js';
import {watchCaptureResolution} from '../../src/shared/engine.js';
import {HEX_DIRECTIONS,axialToWorld,worldCell} from '../../src/shared/hex.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {setHomeReturnMargin,homeReturnMargin,marginEntryTime,distanceToCellSquared} from '../../src/shared/home-return-margin.js';
import type {Vec} from '../../src/shared/model.js';

const half=Math.sqrt(3)*16,distance=Math.sqrt(3)*32*4.41/30;
it.each([6,10])('identical movement: radius %s returns only when the selected margin is reached',radius=>{
 const {m,a}=fixture({x:half+14.5,y:0},{x:-1,y:0},radius),startCell=a.cellId;
 stepMatch(m);expect(a.position.x-half).toBeGreaterThan(6);expect(a.position.x-half).toBeLessThan(10);
 expect(m.events.some(e=>e.type==='CAPTURE'&&e.participantId==='a')).toBe(radius===10);
 expect(m.owners[startCell]).toBe(radius===10?1:0);expect(a.lifeState).toBe('ALIVE');
});
function fixture(position:Vec,direction:Vec,radius:number,homes=[[0,0]]){
 const m=createMatch({},4,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]);
 const [a,b]=m.participants,cell=(q:number,r:number)=>m.map.byKey.get(`${q},${r}`)!;
 for(let id=0;id<m.owners.length;id++)setOwner(m,id,0);
 a.position={...position};a.cellId=worldCell(m.map,position);a.direction={...direction};a.targetDirection=null;a.protectedUntilTick=0;
 for(const [q,r]of homes)setOwner(m,cell(q,r),1);
 a.trailOriginCellId=cell(homes[0][0],homes[0][1]);if(m.owners[a.cellId]!==1)addTrail(m,a,a.cellId);
 b.cellId=cell(8,8);b.position={...m.map.cells[b.cellId].center};b.direction={x:1,y:0};b.targetDirection=null;b.protectedUntilTick=0;setOwner(m,cell(8,7),2);
 setHomeReturnMargin(m,radius);return {m,a,b,cell,home:cell(0,0)};
}
describe.each([6,10])('opt-in home return margin %s',radius=>{
 const setup=(position:Vec,direction:Vec,r=radius,homes=[[0,0]])=>fixture(position,direction,r,homes);
 it('stays off by default and does not leak between matches or into snapshots',()=>{
  const {m}=setup({x:half+7,y:0},{x:-1,y:0}),{m:normal,a}=setup({x:half+7,y:0},{x:-1,y:0},0);
  expect(homeReturnMargin(m)).toBe(radius);expect(homeReturnMargin(normal)).toBe(0);
  expect(buildView(m).config).toEqual(buildView(normal).config);
  // A smaller step reaches the proposed margin but not the actual home edge.
  normal.config.moveCellsPerSecond=2;stepMatch(normal);expect(a.trailCells.size).toBeGreaterThan(0);
  expect(normal.events.some(e=>e.type==='CAPTURE')).toBe(false);
  setHomeReturnMargin(m,0);expect(homeReturnMargin(m)).toBe(0);
  for(const bad of [-1,11,NaN,Infinity])expect(()=>setHomeReturnMargin(m,bad)).toThrow();
 });
 it.each(HEX_DIRECTIONS.flatMap((axial,side)=>[-70,0,70].map(degrees=>({axial,side,degrees}))))('returns before centre entry through side $side at $degrees degrees',({axial,degrees})=>{
  const v=axialToWorld(axial.q,axial.r,1),l=Math.hypot(v.x,v.y),n={x:v.x/l,y:v.y/l},theta=degrees*Math.PI/180;
  const direction={x:-n.x*Math.cos(theta)+n.y*Math.sin(theta),y:-n.y*Math.cos(theta)-n.x*Math.sin(theta)};
  const gap=Math.max(radius+1,distance*Math.cos(theta)+.5),start={x:n.x*(half+gap),y:n.y*(half+gap)},{m,a,home}=setup(start,direction),oldCell=a.cellId;
  let early=false;watchCaptureResolution(m,t=>{early||=t.participants.some(p=>p.participantId==='a'&&p.candidate&&p.headOwnerBefore!==1);});
  stepMatch(m);
  expect(early).toBe(true);expect(a.lifeState).toBe('ALIVE');expect(a.trailCells.size).toBe(0);expect(m.owners[oldCell]).toBe(1);
  expect(a.cellId).not.toBe(home);expect(a.position.x).toBeCloseTo(start.x+direction.x*distance,8);expect(a.position.y).toBeCloseTo(start.y+direction.y*distance,8);
  expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId==='a')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it.each([4,6,8,10])('uses an exact %s-unit face threshold',radius=>{
  const {m,home}=setup({x:half+radius+1,y:0},{x:-1,y:0},radius);
  expect(marginEntryTime(m.map.cells[home],{x:half+radius+1,y:0},{x:-distance,y:0},radius)).toBeCloseTo(1/distance,10);
 });
 it.each(Array.from({length:6},(_,vertex)=>vertex).flatMap(vertex=>[-1,1].flatMap(sign=>[false,true].map(enters=>({vertex,sign,enters})))))('vertex $vertex direction $sign: grazing=$enters without centre entry',({vertex,sign,enters})=>{
  const angle=(vertex*60-30)*Math.PI/180,n={x:Math.cos(angle),y:Math.sin(angle)},direction={x:-n.y*sign,y:n.x*sign};
  const depth=radius+(enters?-.1:.1),mid={x:n.x*(32+depth),y:n.y*(32+depth)},start={x:mid.x-direction.x*distance/2,y:mid.y-direction.y*distance/2};
  const {m,a,home}=setup(start,direction);
  const t=marginEntryTime(m.map.cells[home],start,{x:direction.x*distance,y:direction.y*distance},radius);
  if(enters){expect(t).toBeCloseTo(.5-Math.sqrt(radius*radius-depth*depth)/distance,8);}else expect(t).toBeNull();
  stepMatch(m);expect(a.cellId).not.toBe(home);expect(a.lifeState).toBe('ALIVE');
  expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId==='a')).toHaveLength(enters?1:0);assertOwnershipCounts(m);
 });
 it('does not close on departure, then closes on a later inward crossing without repeated events',()=>{
  const {m,a}=setup({x:half-1,y:0},{x:1,y:0});
  for(let i=0;i<4;i++)stepMatch(m);
  expect(a.trailCells.size).toBeGreaterThan(0);expect(m.events.some(e=>e.type==='CAPTURE')).toBe(false);
  a.direction={x:-1,y:0};for(let i=0;i<4;i++)stepMatch(m);
  expect(a.trailCells.size).toBe(0);expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId==='a')).toHaveLength(1);
  for(let i=0;i<3;i++)stepMatch(m);expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId==='a')).toHaveLength(1);
 });
 it('does not close while following an edge inside the existing margin band',()=>{
  const {m,a}=setup({x:half+radius-1,y:-8},{x:0,y:1});for(let i=0;i<3;i++)stepMatch(m);
  expect(a.trailCells.size).toBeGreaterThan(0);expect(m.events.some(e=>e.type==='CAPTURE')).toBe(false);
 });
 it('does not bridge a whole neutral hex between two home edges',()=>{
  const {m,a}=setup({x:0,y:-distance/2},{x:0,y:1},radius,[[-1,0],[1,0]]);stepMatch(m);
  expect(a.trailCells.size).toBeGreaterThan(0);expect(m.events.some(e=>e.type==='CAPTURE')).toBe(false);
 });
 it('does not treat enemy territory as a return',()=>{
  const {m,a,b,home}=setup({x:half+7,y:0},{x:-1,y:0});setOwner(m,home,2);setOwner(m,m.map.byKey.get('4,0')!,1);
  stepMatch(m);expect(a.trailCells.size).toBeGreaterThan(0);expect(b.kills).toBe(0);expect(m.events.some(e=>e.type==='CAPTURE')).toBe(false);
 });
 it.each([.1,.2,.3])('keeps event ordering: cut at %s versus early return at .2',cutAt=>{
  const {m,a,b,cell}=setup({x:half+radius+distance*.2,y:0},{x:-1,y:0}),trail=a.cellId;
  b.position={x:half*3+distance*cutAt,y:0};b.cellId=cell(2,0);b.direction={x:-1,y:0};setOwner(m,b.cellId,2);
  stepMatch(m);expect(a.lifeState).toBe(cutAt<=.2?'ELIMINATED':'ALIVE');expect(b.kills).toBe(cutAt<=.2?1:0);
  if(cutAt>.2){expect(m.owners[trail]).toBe(1);expect(a.trailCells.size).toBe(0);}
  else expect(a.deathContext).toMatchObject({cause:'EXISTING_TRAIL_CONTACT',cellId:trail});
  assertOwnershipCounts(m);
 });
 it('leaves direct enemy-trail contact at the original centre-entry threshold',()=>{
  const {m,a,b,home}=setup({x:half+7,y:0},{x:-1,y:0}),startCell=a.cellId;
  setOwner(m,home,0);setOwner(m,startCell,1);a.trailCells.clear();m.trailMasks.fill(0);a.trailOriginCellId=null;
  addTrail(m,b,home);stepMatch(m); // Traverses the 6-unit band and then the true edge in this long step.
  expect(b.lifeState).toBe('ELIMINATED');expect(b.deathContext!.eventTick).toBeCloseTo(7/distance,4);
  expect(a.kills).toBe(1);
 });
 it('keeps the rounded vertex threshold within the selected radius',()=>{
  const {m,home}=setup({x:0,y:45},{x:0,y:-1}),cell=m.map.cells[home];
  expect(distanceToCellSquared(cell,{x:0,y:32+radius})).toBeCloseTo(radius*radius,9);
  expect(marginEntryTime(cell,{x:0,y:39+radius},{x:0,y:-10},radius)).toBeCloseTo(.7,9);
 });
});
