import {describe,it,expect} from 'vitest';
import {wallFixture} from '../../docs/wall-experiment/fixture.js';
import {setWallMargin,wallMargin,movementCell,boundaryGeometry} from '../../src/shared/wall-margin.js';
import {traceMovement} from '../../src/shared/movement.js';
import {createMap,worldCell,axialToWorld} from '../../src/shared/hex.js';
import {stepMatch,buildView} from '../../src/shared/game.js';
import {Presentation} from '../../src/client/presentation.js';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
describe('spatial wall tolerance (no timers, stops or sliding)',()=>{
 it('retains strict geometry by default and adds exactly a quarter spacing to a flat outer face',()=>{
  const strict=wallFixture(false,'push'),soft=wallFixture(true,'push'),a=strict.participants[0],b=soft.participants[0],before=soft.map.cells.length;
  const old=traceMovement(strict.map,a.position,a.cellId,a.direction,100),next=traceMovement(soft.map,b.position,b.cellId,b.direction,100);
  expect(next.boundaryT!-old.boundaryT!).toBeCloseTo(Math.sqrt(3)*32*.25/100,12);
  expect(next.position.x-old.position.x).toBeCloseTo(wallMargin(soft.map),9);expect(soft.map.cells.length).toBe(before);
  expect(worldCell(soft.map,next.position)).toBe(-1);expect(movementCell(soft.map,next.position)).toBe(b.cellId);
 });
 it('moves at full speed across the old wall and dies immediately at the new line',()=>{
  const m=wallFixture(true,'push'),p=m.participants[0],start={...p.position},distance=Math.sqrt(3)*32*4.2/30;
  stepMatch(m);expect(p.lifeState).toBe('ALIVE');expect(p.position.x-start.x).toBeCloseTo(distance,10);expect(worldCell(m.map,p.position)).toBe(-1);
  stepMatch(m);expect(p.deathReason).toBe('WALL_HIT');expect(p.deaths).toBe(1);expect(p.deathContext!.eventTick).toBeCloseTo((wallMargin(m.map)+.15)/distance,4);
  stepMatch(m);expect(m.events.filter(e=>e.type==='DEATH')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it('forgives a shallow graze and allows turning back, without changing turn rate',()=>{
  const strict=wallFixture(false),soft=wallFixture(true);stepMatch(strict);expect(strict.participants[0].deathReason).toBe('WALL_HIT');
  const p=soft.participants[0];
  for(let t=0;t<30;t++){stepMatch(soft);expect(p.lifeState).toBe('ALIVE');expect(movementCell(soft.map,p.position)).toBe(p.cellId);}
  expect(Math.atan2(p.direction.y,p.direction.x)).toBeCloseTo(Math.PI);expect(worldCell(soft.map,p.position)).toBe(p.cellId);
 });
 it('has no recharge history: re-entry and a fresh approach use the same spatial line',()=>{
  const m=wallFixture(true,'push'),p=m.participants[0],initial=traceMovement(m.map,p.position,p.cellId,p.direction,100);
  const near={x:initial.position.x-2,y:initial.position.y},back=traceMovement(m.map,near,p.cellId,{x:-1,y:0},30);
  expect(back.blocked).toBe(false);expect(worldCell(m.map,back.position)).toBe(back.cellId);
  const again=traceMovement(m.map,back.position,back.cellId,{x:1,y:0},100);expect(again.position.x).toBeCloseTo(initial.position.x,8);
  p.lifeId++;expect(traceMovement(m.map,back.position,back.cellId,{x:1,y:0},100)).toEqual(again);
 });
 it('keeps all original interior crossings exactly unchanged',()=>{
  const strict=createMap(5),soft=createMap(5);setWallMargin(soft,true);
  for(let i=0;i<100;i++){const direction={x:Math.cos(i),y:Math.sin(i)},start=axialToWorld(0,0),id=strict.byKey.get('0,0')!;
   expect(traceMovement(soft,start,id,direction,100)).toEqual(traceMovement(strict,start,id,direction,100));}
 });
 it('traces jagged edges/vertices deterministically and never invents a cell or seam event',()=>{
  const m=wallFixture(true),map=m.map;
  for(const edge of boundaryGeometry(map).edges){
   const mid={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2};
   const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy),normal={x:-dy/length,y:dx/length};
   // Polygon vertices run clockwise; its left side is outward.
   const start={x:mid.x-normal.x*.01,y:mid.y-normal.y*.01},id=movementCell(map,start);
   expect(id).toBeGreaterThanOrEqual(0);expect(movementCell(map,{x:mid.x+normal.x*.01,y:mid.y+normal.y*.01})).toBe(-1);
   const out=traceMovement(map,start,id,normal,10);expect(out.blocked).toBe(true);expect(movementCell(map,out.position)).toBe(out.cellId);expect(out.boundaryT).toBeCloseTo(.001,6);
  }
  const id=map.byKey.get('5,0')!,c=map.cells[id].center;
  for(let i=0;i<360;i++){const dir={x:Math.cos((i+.123)*Math.PI/180),y:Math.sin((i+.123)*Math.PI/180)},result=traceMovement(map,c,id,dir,150);
   expect(movementCell(map,result.position),JSON.stringify({i,result,actual:map.cells[movementCell(map,result.position)],expected:map.cells[result.cellId]})).toBe(result.cellId);expect(result.entries.every(e=>e.cellId>=0&&e.cellId<map.cells.length)).toBe(true);expect(result.entries.length).toBeLessThan(10);
   expect(traceMovement(map,c,id,dir,150)).toEqual(result);
  }
 });
 it('keeps the full R56 exposed outline lethal and every permitted endpoint attached to an existing cell',()=>{
  const map=createMap(56);setWallMargin(map,true);expect(map.cells.length).toBe(9577);
  for(const edge of boundaryGeometry(map).edges){const mid={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2},dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,len=Math.hypot(dx,dy),n={x:-dy/len,y:dx/len};
   const start={x:mid.x-n.x*.01,y:mid.y-n.y*.01},id=movementCell(map,start);expect(id).toBeGreaterThanOrEqual(0);
   expect(movementCell(map,{x:mid.x+n.x*.01,y:mid.y+n.y*.01})).toBe(-1);const hit=traceMovement(map,start,id,n,10);expect(hit.blocked).toBe(true);expect(movementCell(map,hit.position)).toBe(hit.cellId);
  }
 });
 it('preserves the original exact-210-degree internal seam rounding independently of padding',()=>{
  const strict=createMap(5),soft=createMap(5);setWallMargin(soft,true);const id=strict.byKey.get('5,0')!,start=strict.cells[id].center,dir={x:Math.cos(210*Math.PI/180),y:Math.sin(210*Math.PI/180)};
  const original=traceMovement(strict,start,id,dir,150),relaxed=traceMovement(soft,start,id,dir,150);
  expect(original.cellId).toBe(28);expect(worldCell(strict,original.position)).toBe(37);expect(relaxed).toEqual(original);
  expect(movementCell(soft,relaxed.position)).toBe(worldCell(strict,original.position));
 });
 it('matches fixed-step self prediction even with snapshots taken outside the original wall',()=>{
  const m=wallFixture(true),p=m.participants[0],display=new Presentation();display.setWallMargin(true);display.accept(buildView(m),p.participantId,0,true);
  for(let tick=1;tick<=20;tick++){stepMatch(m);expect(display.position(p.participantId,tick*1000/30)!.x).toBeCloseTo(p.position.x,7);expect(display.position(p.participantId,tick*1000/30)!.y).toBeCloseTo(p.position.y,7);
   if(tick===1)display.accept(buildView(m),p.participantId,tick*1000/30,true);
  }
 });
 it('preserves wire fields and board arrays and isolates matches and toggle state',()=>{
  const m=wallFixture(true,'push'),old=wallFixture(false,'push'),fields=Object.keys(buildView(m).participants[0]);stepMatch(m);
  const view=unpackSnapshot(packSnapshot(buildView(m),1,Date.now(),m.participants[0].participantId));expect(view.participants[0].position).toEqual(m.participants[0].position);expect(Object.keys(view.participants[0])).toEqual(fields);
  expect(view.owners.length).toBe(m.map.cells.length);expect(view.trailMasks.length).toBe(m.map.cells.length);stepMatch(old);expect(old.participants[0].deathReason).toBe('WALL_HIT');
  setWallMargin(m.map,false);expect(wallMargin(m.map)).toBe(0);stepMatch(m);expect(m.participants[0].deathReason).toBe('WALL_HIT');
 });
 it('applies the same fatal line to BOT and HUMAN in slot 15',()=>{
  for(const kind of ['BOT','HUMAN'] as const){const m=wallFixture(true,'push'),p=m.participants[0];m.config.maxSlots=16;p.kind=kind;p.slot=15;m.priority=Array.from({length:16},(_,i)=>i);for(let i=0;i<m.owners.length;i++)if(m.owners[i]===1)m.owners[i]=16;
   stepMatch(m);expect(p.lifeState).toBe('ALIVE');stepMatch(m);expect(p.deathReason).toBe('WALL_HIT');expect(p.deaths).toBe(1);}
 });
 it('keeps cut, capture and territory-loss deaths active during outside movement',()=>{
  const {m,a,b,id}=captureFixture();setWallMargin(m.map,true);a.cellId=id(5,0);a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16+5;a.direction={x:0,y:1};setOwner(m,id(4,0),1);addTrail(m,a,id(0,0));b.position=axialToWorld(0,0);b.cellId=id(0,0);b.direction={x:1,y:0};setOwner(m,id(-1,0),2);
  stepMatch(m);expect(a.deathReason).toBe('TRAIL_CUT');expect(b.kills).toBe(1);assertOwnershipCounts(m);
  const f=captureFixture();setWallMargin(f.m.map,true);setOwner(f.m,f.id(4,0),1);setOwner(f.m,f.id(0,0),2);f.a.cellId=f.id(5,0);f.a.position=axialToWorld(5,0);f.a.position.x+=Math.sqrt(3)*16+5;f.b.cellId=f.id(0,0);addTrail(f.m,f.a,f.id(1,0));addTrail(f.m,f.b,f.id(1,0));applySimultaneousCaptures(f.m,[f.b]);expect(f.a.deathReason).toBe('TRAIL_CUT');expect(f.b.kills).toBe(1);
  const g=wallFixture(true,'push');stepMatch(g);for(let i=0;i<g.owners.length;i++)if(g.owners[i]===1)setOwner(g,i,0);g.participants[0].direction={x:-1,y:0};stepMatch(g);expect(g.participants[0].deathReason).toBe('TERRITORY_LOST');
 });
});
