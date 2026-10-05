import {describe,it,expect} from 'vitest';
import {TerritoryCaptureModel,captureAppearance,captureEdges,CAPTURE_DURATION,experimentalCaptureEffect} from '../../src/client/territory-capture-model.js';
import {buildView} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {botSpecs} from '../../src/shared/bot.js';
import {emitEvent} from '../../src/shared/life.js';
import {indexRenderChunks} from '../../src/client/render-chunks.js';
function setup(){
 const m=createMatch({mapRadius:56,maxSlots:16},4,botSpecs(16)),model=new TerritoryCaptureModel(true),keys=indexRenderChunks(m.map).keys;
 let previous=buildView(m);model.accept(previous,previous.owners,m.map,keys,slot=>0x102030+slot,0,true,previous);
 const accept=(now=100,reset=false)=>{const next=buildView(m);model.accept(next,previous.owners,m.map,keys,slot=>0x102030+slot,now,reset,previous);previous=next;};
 const cells=m.map.cells.filter(c=>m.owners[c.id]===0).slice(0,12).map(c=>c.id);
 const capture=(slot=15,ids=cells)=>{for(const id of ids)m.owners[id]=slot+1;emitEvent(m,{type:'CAPTURE',participantId:m.participants[slot].participantId});m.tick++;};
 const ids=()=>model.effects.flatMap(e=>[...e.chunks.values()].flatMap(list=>list.filter(c=>!c.cancelled).map(c=>c.id)));
 return {m,model,keys,accept,cells,capture,ids};
}
describe('Capture Bloom presentation',()=>{
 it('confirmed slot 15 capture highlights neutral and enemy transfers without changing gameplay',()=>{
  const {m,model,cells,capture,accept,ids}=setup();
  m.owners[cells[1]]=4;accept(0);capture();const owners=m.owners.slice(),trails=m.trailMasks.slice(),events=structuredClone(m.events);accept();
  expect(ids()).toEqual(cells);expect(model.effects).toHaveLength(1);
  expect(model.effects[0]).toMatchObject({slot:15,color:0x10203f,neutralCount:11,stolenCount:1});
  expect(m.owners).toEqual(owners);expect(m.trailMasks).toEqual(trails);expect(m.events).toEqual(events);
  model.expire(100+CAPTURE_DURATION);expect(model.effects).toHaveLength(0);
 });
 it('owner changes without CAPTURE create no bloom; existing territory and current trails are excluded',()=>{
  const {m,model,cells,capture,accept,ids}=setup();m.owners[cells[0]]=16;accept();expect(model.played).toBe(0);
  capture();m.trailMasks[cells[1]]=0x8000;accept(120);expect(ids()).not.toContain(cells[0]);expect(ids()).not.toContain(cells[1]);expect(ids()).toHaveLength(10);
 });
 it('deduplicates repeated snapshots and groups multiple captures of one participant in a batch',()=>{
  const {m,model,capture,accept}=setup();capture();emitEvent(m,{type:'CAPTURE',participantId:m.participants[15].participantId});accept();
  expect(model.played).toBe(1);expect(model.effects).toHaveLength(1);accept(130);expect(model.played).toBe(1);
 });
 it('current owner or any new trail permanently cancels the old cell',()=>{
  const {m,model,cells,capture,accept,ids}=setup();capture();accept();
  m.owners[cells[0]]=1;m.trailMasks[cells[1]]=0x8000;m.tick++;accept(130);expect(model.cancelledCells).toBe(2);
  m.owners[cells[0]]=16;m.trailMasks[cells[1]]=0;m.tick++;accept(160);expect(ids()).not.toContain(cells[0]);expect(ids()).not.toContain(cells[1]);
 });
 it('init, reconnect reset and match change establish a baseline without historical playback',()=>{
  const {m,model,capture,accept}=setup();capture();accept(100,true);expect(model.played).toBe(0);accept(110);expect(model.played).toBe(0);
  m.matchId='other';capture(3);accept(150);expect(model.effects).toHaveLength(0);
 });
 it('new life ignores spawn plus capture diff, then permits the next same-life capture',()=>{
  const {m,model,cells,capture,accept}=setup();m.participants[15].lifeId++;capture(15,cells.slice(0,5));accept();expect(model.played).toBe(0);
  capture(15,cells.slice(5));accept(120);expect(model.played).toBe(1);expect(model.state().cells).toBe(7);
  m.participants[15].lifeId++;m.tick++;accept(140);expect(model.state().cells).toBe(0);
 });
 it('replaces the same participant and caps simultaneous participants at four',()=>{
  const {m,model,cells,capture,accept}=setup();capture(15,cells.slice(0,2));accept();
  capture(15,cells.slice(2,4));accept(120);expect(model.effects).toHaveLength(1);expect(model.state().cells).toBe(2);
  for(let slot=0;slot<5;slot++)capture(slot,[cells[slot+4]]);accept(140);expect(model.effects.map(e=>e.slot)).toEqual([1,2,3,4]);expect(model.dropped).toBe(2);
 });
 it('does not replay expired/future events or stale snapshots',()=>{
  const {m,model,keys,capture,accept}=setup();capture();m.tick+=31;accept();expect(model.played).toBe(0);
  const stale=buildView(m);stale.tick--;stale.events=[{eventId:'stale',tick:stale.tick,type:'CAPTURE',participantId:m.participants[15].participantId}];
  model.accept(stale,new Uint8Array(m.owners.length),m.map,keys,()=>0xffffff,100,false,stale);expect(model.played).toBe(0);
  emitEvent(m,{type:'CAPTURE',participantId:m.participants[15].participantId});m.events.at(-1)!.tick=m.tick+5;accept();expect(model.played).toBe(0);
 });
 it('disabled performs no board scan; production cannot enable the bloom query',()=>{
  const {m,keys}=setup(),model=new TerritoryCaptureModel(),view=buildView(m),blocked=new Proxy(view.owners,{get(){throw Error('Unexpected board access');}});
  model.accept(view,blocked,m.map,keys,()=>{throw Error('Unexpected color');},0);expect(model.state().active).toBe(0);
  expect(experimentalCaptureEffect('bloom',false)).toBe(false);expect(experimentalCaptureEffect('bloom',true)).toBe(true);expect(experimentalCaptureEffect(null,true)).toBe(false);
 });
 it('all cells pulse together without scaling; outline survives the short fill pulse',()=>{
  const start=captureAppearance(0,0x102030),mid=captureAppearance(120,0x102030),end=captureAppearance(CAPTURE_DURATION,0x102030);
  expect(start.fillAlpha).toBe(.5);expect(start.lineAlpha).toBe(.95);expect(start.fillColor).not.toBe(0x102030);
  expect(mid.fillAlpha).toBe(0);expect(mid.lineAlpha).toBeGreaterThan(0);expect(end.lineAlpha).toBe(0);
 });
 it('outline has no internal hex edges, including holes and slot 15 territory',()=>{
  const {m}=setup(),a=m.map.byKey.get('0,0')!,b=m.map.cells[a].neighbors[0],edges=captureEdges(m.map,[a,b]);
  expect(edges[0]&(1<<0)).toBe(0);expect(edges[1]&(1<<3)).toBe(0);
  expect(edges.map(mask=>mask.toString(2).split('1').length-1)).toEqual([5,5]);
  const ring=m.map.cells[a].neighbors,ringEdges=captureEdges(m.map,ring);
  for(let i=0;i<ring.length;i++)expect(ringEdges[i]&(1<<m.map.cells[ring[i]].neighbors.indexOf(a))).not.toBe(0);
 });
});
