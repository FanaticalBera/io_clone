import {describe,it,expect} from 'vitest';
import {stepMatch,buildView} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {createState} from '../../src/shared/state.js';
import {createMap,hexDistance,region,worldCell} from '../../src/shared/hex.js';
import {botSpecs,observeBot,createBotMemory,getBotInput} from '../../src/shared/bot.js';
import {addTrail,clearTrail,setOwner,visitCell,neutralizeTerritory,pruneDisconnectedTerritory,assertOwnershipCounts} from '../../src/shared/territory.js';
import {resolveAtTime} from '../../src/shared/engine.js';
import {markDead} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
import {slotBit,hasTrail} from '../../src/shared/slots.js';
import {generateStartingAnchors} from '../../src/shared/starting-anchors.js';
import {encodeBytes,encodeTrailMasks,decodeTrailMasks,packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {experimentalMapConfig,experimentalSlotConfig} from '../../src/shared/map-experiment.js';
import {PracticeSession} from '../../src/client/practice.js';
import {indexRenderChunks} from '../../src/client/render-chunks.js';

function fixture(){
 const map=createMap(6),m=createState({maxSlots:16,mapRadius:6},19,[{participantId:'low',slot:0,nickname:'low',kind:'HUMAN'},{participantId:'high',slot:15,nickname:'high',kind:'HUMAN'}],map,'high-slots');
 for(const p of m.participants){p.lifeState='ALIVE';p.lifeId=1;}
 return {m,low:m.participants[0],high:m.participants[1],id:(q:number,r:number)=>map.byKey.get(`${q},${r}`)!};
}
describe('16-slot rules and little-endian protocol',()=>{
 it('sets bit 15, preserves mixed bits and clears only its own trail',()=>{
  const {m,low,high,id}=fixture(),cell=id(0,0);setOwner(m,id(1,0),16);high.cellId=id(1,0);
  expect(visitCell(m,high,cell)).toBe('TRAIL');addTrail(m,low,cell);expect(m.trailMasks[cell]).toBe(0x8001);
  expect(slotBit(15)).toBe(0x8000);expect(hasTrail(m.trailMasks[cell],15)).toBe(true);
  clearTrail(m,high);expect(m.trailMasks[cell]).toBe(1);expect(high.trailOriginCellId).toBeNull();
  clearTrail(m,low);expect(m.trailMasks[cell]).toBe(0);for(const slot of [-1,16,1.5])expect(()=>slotBit(slot)).toThrow();
 });
 it.each([false,true])('high slot can cut and be cut; mutual contact survives reversed order %s',reverse=>{
  const {m,low,high,id}=fixture();setOwner(m,id(-2,0),1);setOwner(m,id(3,0),16);
  low.cellId=id(1,0);high.cellId=id(0,0);addTrail(m,low,id(0,0));addTrail(m,high,id(1,0));
  if(reverse)m.participants.reverse();resolveAtTime(m);
  expect(low.lifeState).toBe('ELIMINATED');expect(high.lifeState).toBe('ELIMINATED');expect(low.kills).toBe(1);expect(high.kills).toBe(1);expect(m.trailMasks.every(v=>v===0)).toBe(true);
 });
 it('resolves simultaneous provisional contact at slots 0 and 15',()=>{
  const {m,low,high,id}=fixture();setOwner(m,id(-2,0),1);setOwner(m,id(3,0),16);low.cellId=high.cellId=id(0,0);resolveAtTime(m);
  expect(low.deaths).toBe(1);expect(high.deaths).toBe(1);expect(m.trailMasks.every(v=>v===0)).toBe(true);
 });
 it('slot 15 captures, prunes, accounts owner 16 and neutralizes',()=>{
  const {m,low,high,id}=fixture();setOwner(m,id(1,0),16);setOwner(m,id(4,0),1);low.cellId=id(4,0);high.cellId=id(1,0);
  for(const [q,r]of [[1,-1],[0,-1],[-1,0],[-1,1],[0,1]])addTrail(m,high,id(q,r));resolveAtTime(m);
  expect(m.owners[id(0,0)]).toBe(16);expect(high.territoryCount).toBe(7);expect(high.trailCells.size).toBe(0);expect(m.trailMasks.every(v=>v===0)).toBe(true);
  setOwner(m,id(-4,0),16);pruneDisconnectedTerritory(m,high,high.cellId);expect(m.owners[id(-4,0)]).toBe(0);expect(high.territoryCount).toBe(7);assertOwnershipCounts(m);
  neutralizeTerritory(m,high);expect(high.territoryCount).toBe(0);expect(()=>setOwner(m,id(0,0),17)).toThrow();
 });
 it.each([false,true])('simultaneous low/high captures transfer both closed rings in either participant order %s',reverse=>{
  const {m,low,high,id}=fixture();
  for(const [p,q]of [[low,-2],[high,2]] as const){const ring=m.map.cells[id(q,0)].neighbors;const home=ring[p===low?3:0];setOwner(m,home,p.slot+1);p.cellId=home;p.position={...m.map.cells[home].center};for(const cell of ring)if(cell!==home)addTrail(m,p,cell);}
  if(reverse)m.participants.reverse();resolveAtTime(m);expect(low.territoryCount).toBe(7);expect(high.territoryCount).toBe(7);expect(m.owners[id(-2,0)]).toBe(1);expect(m.owners[id(2,0)]).toBe(16);expect(m.events.filter(e=>e.type==='CAPTURE')).toHaveLength(2);expect(m.trailMasks.every(v=>v===0)).toBe(true);assertOwnershipCounts(m);
 });
 it('slot 15 moves, dies and respawns in its original slot with owner 16',()=>{
  const m=createMatch({maxSlots:16,mapRadius:56},4,botSpecs(16)),high=m.participants[15],start={...high.position};
  for(let i=0;i<25;i++)stepMatch(m);expect(high.position).not.toEqual(start);expect(high.trailCells.size).toBeGreaterThan(0);
  markDead(m,high,'WALL_HIT');m.tick=high.respawnAtTick;tryRespawns(m);
  expect(high).toMatchObject({slot:15,lifeState:'ALIVE',lifeId:2,territoryCount:19});expect([...high.spawnCells].every(id=>m.owners[id]===16)).toBe(true);assertOwnershipCounts(m);
 });
 it('round trips uint16 boundaries and spells 0x8001 as bytes 01 80',()=>{
  const masks=new Uint16Array([0,1,0xff,0x100,0x8000,0x8001,0xffff]);expect(decodeTrailMasks(encodeTrailMasks(masks),masks.length)).toEqual(masks);
  expect(encodeTrailMasks(new Uint16Array([0x8001]))).toBe('AYA=');
  expect(()=>decodeTrailMasks('AYB=',1)).toThrow('Noncanonical');expect(()=>decodeTrailMasks('AYA=',2)).toThrow();expect(()=>decodeTrailMasks(encodeBytes(new Uint8Array(3)),1)).toThrow();
  for(const length of [-1,1.5,Infinity])expect(()=>decodeTrailMasks('',length)).toThrow();
  expect(()=>encodeTrailMasks([65536] as unknown as Uint16Array)).toThrow();
 });
 it('round trips 16 participants, high-slot events and Classic mode; rejects malformed capacities',()=>{
  const m=createMatch({maxSlots:16,mapRadius:56},19,botSpecs(16),'wire16',{id:'classic'}),v=buildView(m);
  v.trailMasks[0]=0x8001;v.events=[{eventId:'high',tick:0,type:'CAPTURE',participantId:m.participants[15].participantId,amount:3}];
  const wire=packSnapshot(v,1,100,null);expect(unpackSnapshot(wire)).toEqual(v);
  for(const bad of [{...wire,protocolVersion:3},{...wire,trailMasks:encodeBytes(new Uint8Array(v.owners.length))},{...wire,participants:[...wire.participants,wire.participants[0]]},{...wire,participants:[wire.participants[0],wire.participants[0]]},{...wire,participants:[{...wire.participants[15],slot:16}]},{...wire,config:{...wire.config,maxSlots:14}}])expect(()=>unpackSnapshot(bad)).toThrow();
  const small=buildView(createMatch({},4,botSpecs(8)));small.trailMasks[0]=0x100;expect(()=>unpackSnapshot(packSnapshot(small,1,0,null))).toThrow('Invalid board');
 });
});
describe('large-map spawning, observation and development overrides',()=>{
 for(const [radius,count]of [[48,14],[56,14],[56,16],[64,16]])it(`R${radius}/${count} has complete disjoint spawn zones for all screening seeds`,()=>{
  for(const seed of [4,19,73,115]){
   const m=createMatch({mapRadius:radius,maxSlots:count},seed,botSpecs(count)),claimed=new Set<number>();expect(m.owners.length).toBe(1+3*radius*(radius+1));
   expect(m.map.anchors).toEqual(generateStartingAnchors(m.map,count,2,seed));expect(new Set(m.participants.map(p=>p.participantId)).size).toBe(count);
   for(const p of m.participants){expect(p.lifeState).toBe('ALIVE');expect(p.territoryCount).toBe(19);expect(worldCell(m.map,p.position)).toBe(p.cellId);expect(Math.hypot(p.direction.x,p.direction.y)).toBeCloseTo(1);if(Math.hypot(p.position.x,p.position.y)>0)expect(p.direction.x*p.position.x+p.direction.y*p.position.y).toBeLessThan(0);
    for(const id of region(m.map,p.cellId,2)){expect(id).toBeGreaterThanOrEqual(0);expect(claimed.has(id)).toBe(false);expect(m.map.controlPoints.some(cp=>cp.cellId===id)).toBe(false);claimed.add(id);expect(m.owners[id]).toBe(p.slot+1);}
   }assertOwnershipCounts(m);
   for(const c of m.map.cells)for(const n of c.neighbors)if(n>=0)expect(hexDistance(c,m.map.cells[n])).toBe(1);
   const index=indexRenderChunks(m.map);expect([...index.chunks.values()].flatMap(c=>c.cells).sort((a,b)=>a-b)).toEqual(m.map.cells.map(c=>c.id));
  }
 });
 it.each([10,12,14,16])('supports deterministic dynamic count %i without random retries',count=>{
  const map=createMap(56);expect(generateStartingAnchors(map,count,2,73)).toHaveLength(count);expect(generateStartingAnchors(map,count,2,73)).toEqual(generateStartingAnchors(map,count,2,73));
 });
 it.each([14,16])('keeps high-slot enemies/trails outside observation range hidden with %i participants',count=>{
  const m=createMatch({mapRadius:56,maxSlots:count},4,botSpecs(count)),self=m.participants[0],far=m.participants[count-1];
  self.cellId=m.map.byKey.get('0,0')!;far.cellId=m.map.byKey.get('20,0')!;addTrail(m,far,far.cellId);
  const obs=observeBot(m,self.participantId);expect(obs.others.some(p=>p.slot===far.slot)).toBe(false);expect(obs.trails.some(t=>t.slot===far.slot)).toBe(false);
  expect(obs.config.botObservationRange).toBe(12);expect(getBotInput(obs,createBotMemory(4))).not.toBeUndefined();
 });
 it('fills practice from config and ignores production overrides',()=>{
  const practice=new PracticeSession('tester',()=>{}, {mapRadius:56,maxSlots:16},{autoStart:false,seed:4});expect(practice.match.participants).toHaveLength(16);expect(practice.match.participants.filter(p=>p.kind==='BOT')).toHaveLength(15);practice.dispose();
  expect(experimentalMapConfig('56',true)).toEqual({mapRadius:56});expect(experimentalSlotConfig('16',true)).toEqual({maxSlots:16});expect(experimentalSlotConfig('17',false)).toEqual({});expect(()=>experimentalSlotConfig('17',true)).toThrow();
 });
});
