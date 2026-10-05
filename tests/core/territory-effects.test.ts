import {describe,it,expect} from 'vitest';
import {TerritoryEffectModel,collapseOrigin,collapseDelays,collapseAppearance,experimentalTerritoryEffect,EFFECT_DURATION} from '../../src/client/territory-effect-model.js';
import {indexRenderChunks} from '../../src/client/render-chunks.js';
import {buildView} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {botSpecs} from '../../src/shared/bot.js';
import {markDead,emitEvent} from '../../src/shared/life.js';
import {prepareTerritorySteal} from '../capture-feedback-fixture.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {TerritoryCaptureModel} from '../../src/client/territory-capture-model.js';
import {hexDistance} from '../../src/shared/hex.js';
import type {GameEvent} from '../../src/shared/model.js';
const styles=['WAVE_COLLAPSE','POWER_DOWN','EDGE_CRUMBLE'] as const;
function setup(style:typeof styles[number]='WAVE_COLLAPSE'){
 const m=createMatch({mapRadius:56,maxSlots:16},4,botSpecs(16)),model=new TerritoryEffectModel(style);
 const keys=indexRenderChunks(m.map).keys,previous=buildView(m),old=previous.owners.slice(),color=(slot:number)=>0x102030+slot;
 model.accept(previous,old,m.map,keys,color,0,true);
 const accept=(now=100,reset=false)=>model.accept(buildView(m),old,m.map,keys,color,now,reset,previous);
 return {m,model,keys,previous,old,color,accept};
}
const ids=(model:TerritoryEffectModel)=>model.effects.flatMap(e=>[...e.chunks.values()].flatMap(c=>c.filter(v=>!v.cancelled).map(v=>v.id)));
describe('last-observed territory death presentation',()=>{
 for(const style of styles)it(style+' plays owner 16 once and expires without mutating gameplay',()=>{
  const {m,model,old,accept}=setup(style);markDead(m,m.participants[15],'TRAIL_CUT',m.participants[0],{cause:'TRAIL_CAPTURE',cellId:m.participants[0].cellId});m.tick++;
  const owners=m.owners.slice(),trails=m.trailMasks.slice(),events=structuredClone(m.events);accept();
  expect(model.effects).toHaveLength(1);expect(model.effects[0]).toMatchObject({slot:15,color:0x10203f,originCellId:m.participants[0].cellId});
  expect(ids(model)).toEqual(Array.from(old.keys()).filter(id=>old[id]===16));
  accept(150);expect(model.played).toBe(1);
  model.expire(100+EFFECT_DURATION[style]);expect(model.effects).toHaveLength(0);
  expect(m.owners).toEqual(owners);expect(m.trailMasks).toEqual(trails);expect(m.events).toEqual(events);
 });
 it('excludes transfers, existing new trails and other victims from one victim effect',()=>{
  const {m,model,previous,accept}=setup(),owned=Array.from(previous.owners.keys()).filter(id=>previous.owners[id]===16);
  markDead(m,m.participants[15],'TRAIL_CUT');m.owners[owned[0]]=1;m.trailMasks[owned[1]]=1<<8;
  const other=m.participants[3].cellId;m.owners[other]=0;m.tick++;accept();
  expect(ids(model)).toHaveLength(17);expect(ids(model)).not.toContain(owned[0]);expect(ids(model)).not.toContain(owned[1]);expect(ids(model)).not.toContain(other);
 });
 it('permanently revokes reclaimed and newly trailed cells even if they later become empty',()=>{
  const {m,model,accept}=setup();markDead(m,m.participants[15],'WALL_HIT');m.tick++;accept();
  const [a,b]=ids(model);m.owners[a]=1;m.trailMasks[b]=0x8000;m.tick++;accept(120);
  expect(model.cancelledCells).toBe(2);expect(ids(model)).not.toContain(a);expect(ids(model)).not.toContain(b);
  m.owners[a]=0;m.trailMasks[b]=0;m.tick++;accept(140);
  expect(ids(model)).not.toContain(a);expect(ids(model)).not.toContain(b);
 });
 it('does not play history on init, recovery, match change or reset, and ignores old views',()=>{
  const {m,model,keys,old,color,previous,accept}=setup();markDead(m,m.participants[15],'WALL_HIT');m.tick++;accept();
  accept(200,true);expect(model.effects).toHaveLength(0);accept(220);expect(model.played).toBe(0);
  const fresh=new TerritoryEffectModel('WAVE_COLLAPSE');fresh.accept(buildView(m),old,m.map,keys,color,0);expect(fresh.played).toBe(0);
  const stale=buildView(m);stale.tick=0;stale.events=[{eventId:'stale',tick:0,type:'DEATH',participantId:m.participants[3].participantId}];
  model.accept(stale,old,m.map,keys,color,230,false,previous);expect(model.played).toBe(0);
  const next=buildView(m);next.matchId='next';model.accept(next,old,m.map,keys,color,240);expect(model.effects).toHaveLength(0);
 });
 it('requires a confirmed recent death; owner changes alone are not death effects',()=>{
  const {m,model,accept}=setup();m.owners[m.participants[15].cellId]=0;m.tick++;accept();expect(model.played).toBe(0);
  markDead(m,m.participants[15],'WALL_HIT');m.tick+=31;accept();expect(model.played).toBe(0);
 });
 it('handles simultaneous slot 3 and 15 deaths independently',()=>{
  const {m,model,accept}=setup();markDead(m,m.participants[3],'WALL_HIT');markDead(m,m.participants[15],'WALL_HIT');m.tick++;accept();
  expect(model.effects.map(e=>e.slot)).toEqual([3,15]);expect(model.effects.map(e=>e.color)).toEqual([0x102033,0x10203f]);
  expect(ids(model)).toHaveLength(38);
 });
 it('enforces a strict four-effect global budget',()=>{
  const {m,model,accept}=setup();for(let slot=0;slot<6;slot++)markDead(m,m.participants[slot],'WALL_HIT');m.tick++;accept();
  expect(model.effects.map(e=>e.slot)).toEqual([2,3,4,5]);expect(model.played).toBe(6);expect(model.dropped).toBe(2);
 });
 it('does not reconstruct cells acquired and lost entirely between known snapshots',()=>{
  const {m,model,old,accept}=setup();const unknown=m.map.cells.find(c=>old[c.id]===0)!;m.owners[unknown.id]=16;
  markDead(m,m.participants[15],'WALL_HIT');m.owners[unknown.id]=0;m.tick++;accept();expect(ids(model)).not.toContain(unknown.id);
 });
 it('keeps head position distinct from trigger origin, with safe fallbacks only',()=>{
  const {m,previous}=setup(),victim=m.participants[15],trigger=m.participants[0].cellId;
  const e:GameEvent={eventId:'a',tick:0,type:'DEATH',participantId:victim.participantId,lifeId:1,position:{...victim.position},deathContext:{cause:'TRAIL_CAPTURE',cellId:trigger}};
  expect(collapseOrigin(m.map,e,previous)).toBe(trigger);expect(e.position).toEqual(victim.position);
  e.deathContext!.cellId=-1;expect(collapseOrigin(m.map,e,previous)).toBe(victim.cellId);
  e.position={x:1e9,y:1e9};expect(collapseOrigin(m.map,e,previous)).toBe(victim.cellId);
  e.lifeId=2;expect(collapseOrigin(m.map,e,previous)).toBe(-1);
 });
 it('wave accepts an external origin; edge handles holes, disconnected pieces and thin shapes',()=>{
  const {m}=setup(),map=m.map,center=map.byKey.get('0,0')!,external=map.byKey.get('30,0')!;
  const cells=map.cells.filter(c=>hexDistance(c,{q:0,r:0})<=8&&c.id!==center).map(c=>c.id);
  cells.push(map.byKey.get('20,0')!);
  const wave=collapseDelays(map,cells,external,'WAVE_COLLAPSE'),edge=collapseDelays(map,cells,external,'EDGE_CRUMBLE');
  expect(Math.max(...wave)).toBe(420);expect(Math.min(...wave)).toBeGreaterThan(0);
  expect(edge.at(-1)).toBe(0);expect(Math.max(...edge)).toBe(460);expect(edge.every(Number.isFinite)).toBe(true);
  expect(collapseDelays(map,cells,external,'POWER_DOWN')).toEqual(collapseDelays(map,cells,external,'POWER_DOWN'));
 });
 it('bounded animation visibly brightens, fades, shrinks and completes in every style',()=>{
  for(const style of styles){
   const start=collapseAppearance(style,0,0,0x445566),middle=collapseAppearance(style,170,0,0x445566),end=collapseAppearance(style,EFFECT_DURATION[style],0,0x445566);
   expect(start.color).not.toBe(0x445566);expect(start.alpha).toBe(.92);expect(middle.alpha).toBeLessThan(start.alpha);expect(end.alpha).toBe(0);
   if(style!=='POWER_DOWN')expect(middle.scale).toBeLessThan(1);
  }
 });
 it('NONE performs no board access or color work; production defaults to the chosen Wave regardless of overrides',()=>{
  const model=new TerritoryEffectModel(),{m,keys}=setup(),view=buildView(m),blocked=new Proxy(view.owners,{get(){throw Error('Unexpected scan');}});
  model.accept(view,blocked,m.map,keys,()=>{throw Error('Unexpected color');},0);expect(model.played).toBe(0);
  for(const value of ['wave','power','edge',null,'bad'])expect(experimentalTerritoryEffect(value,false)).toBe('WAVE_COLLAPSE');
  expect(['wave','power','edge'].map(v=>experimentalTerritoryEffect(v,true))).toEqual(styles);
 });
});
describe('capture-induced territory loss feedback',()=>{
 it('real bridge capture animates neutralized owner 16 while victim survives, and theft gets a capture pulse',()=>{
  const m=createMatch({mapRadius:56,maxSlots:16},4,botSpecs(16)),{capturer,victim}=prepareTerritorySteal(m);
  const previous=buildView(m),keys=indexRenderChunks(m.map).keys,death=new TerritoryEffectModel('WAVE_COLLAPSE'),capture=new TerritoryCaptureModel(true);
  const color=(slot:number)=>0x102030+slot;death.accept(previous,previous.owners,m.map,keys,color,0,true,previous);
  capture.accept(previous,previous.owners,m.map,keys,color,0,true,previous);
  applySimultaneousCaptures(m,[capturer]);m.tick++;const next=buildView(m);
  death.accept(next,previous.owners,m.map,keys,color,100,false,previous);capture.accept(next,previous.owners,m.map,keys,color,100,false,previous);
  expect(victim.lifeState).toBe('ALIVE');expect(victim.territoryCount).toBeGreaterThan(0);expect(m.events.some(e=>e.type==='DEATH')).toBe(false);
  const lost=Array.from(previous.owners.keys()).filter(id=>previous.owners[id]===16&&next.owners[id]===0);
  expect(lost.length).toBeGreaterThan(30);expect(ids(death).sort((a,b)=>a-b)).toEqual(lost);
  expect(death.effects[0]).toMatchObject({kind:'CAPTURE_LOSS',slot:15});expect(next.owners[death.effects[0].originCellId]).toBe(1);
  expect(capture.effects[0].stolenCount).toBeGreaterThan(0);expect(capture.effects[0].neutralCount).toBeGreaterThan(0);
  const repeat=buildView(m);death.accept(repeat,next.owners,m.map,keys,color,120,false,next);expect(death.played).toBe(1);
  const old=next.owners.slice(),id=lost[0];m.owners[id]=1;m.trailMasks[lost[1]]=0x8000;m.tick++;
  death.accept(buildView(m),old,m.map,keys,color,130,false,next);expect(ids(death)).not.toContain(id);expect(ids(death)).not.toContain(lost[1]);
 });
 it('unknown neutralization without a confirmed capture or observed transfer is not a loss wave',()=>{
  const {m,model,accept}=setup(),victim=m.participants[15],home=Array.from(m.owners.keys()).filter(id=>m.owners[id]===16);
  m.owners[home[0]]=0;m.tick++;accept();expect(model.played).toBe(0);
  emitEvent(m,{type:'CAPTURE',participantId:m.participants[0].participantId});m.owners[home[1]]=0;m.tick++;accept();expect(model.played).toBe(0);
 });
 it('death and capture in one batch do not duplicate victim collapse; recovery ignores both histories',()=>{
  const {m,model,accept}=setup();markDead(m,m.participants[15],'WALL_HIT');emitEvent(m,{type:'CAPTURE',participantId:m.participants[0].participantId});m.tick++;accept();
  expect(model.effects).toHaveLength(1);expect(model.effects[0].kind).toBe('DEATH');accept(120,true);expect(model.effects).toHaveLength(0);accept(140);expect(model.played).toBe(0);
 });
});
