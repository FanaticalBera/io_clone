import {describe,it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {createBotIdentity} from '../../src/shared/bot-identity.js';
import {BotDebugCollector} from '../../src/client/bot-debug-model.js';
import {updateBotEmotion,grudgeAmount} from '../../src/shared/bot-emotion.js';
import {damageWeight,damageExpansionAnchors,expansionDamageBonus} from '../../src/shared/bot-damage.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {setOwner,neutralizeTerritory,addTrail} from '../../src/shared/territory.js';
import {markDead,leaveParticipant} from '../../src/shared/life.js';
import {makeParticipant} from '../../src/shared/state.js';
import {runRepeatedTheft} from '../bot-damage-fixture.js';
function fixture(){
 const m=createMatch({mapRadius:22},19,botSpecs(3)),[a,b,c]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants)neutralizeTerritory(m,p);
 a.cellId=id(0);b.cellId=id(19);c.cellId=id(-19);
 for(const p of m.participants){p.position={...m.map.cells[p.cellId].center};setOwner(m,p.cellId,p.slot+1);}
 const memory=createBotMemory(19,'combined',createBotIdentity(19,'DEFEND',{secondaryTrait:'Territorial'}));a.personality='DEFEND';
 const update=()=>{const obs=observeBot(m,a.participantId);updateBotEmotion(obs,memory.emotion,memory.identity);return obs;};update();
 const capture=(cells:number[],attacker=b,victim=a)=>{for(const cell of cells){setOwner(m,cell,victim.slot+1);addTrail(m,attacker,cell);}applySimultaneousCaptures(m,[attacker]);return update();};
 return {m,a,b,c,id,memory,update,capture};
}
describe('phase 2.5 public damage aggregation',()=>{
 it('accumulates small captures per attacker, consumes excess once, and never retro-awards cooldown damage',()=>{
  const f=fixture(),collector=new BotDebugCollector(f.m,new Map(f.m.participants.map(p=>[p.participantId,p===f.a?f.memory:createBotMemory(1)])));
  f.capture([f.id(1,1),f.id(2,1)]);f.m.tick=15;f.capture([f.id(-1,1),f.id(-2,1)],f.c);expect(f.memory.emotion.grudge.size).toBe(0);
  f.m.tick=30;f.capture([3,4,5,6].map(q=>f.id(q,1)));expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(3);expect(f.memory.emotion.damage.bank.has(f.b.participantId)).toBe(false);
  f.m.tick=45;f.capture([7,8,9,10,11].map(q=>f.id(q,1)));expect(f.memory.emotion.damage.bank.has(f.b.participantId)).toBe(false);expect(f.memory.emotion.damage.regions.has(f.id(11,1))).toBe(true);
  const ignored=collector.snapshot().bots[0].grudgeEvents.at(-1)!;expect(ignored).toMatchObject({ignored:'COOLDOWN',cells:5,accumulated:0});
  f.m.tick=90;f.update();expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBeCloseTo(3*2**(-2/45));
  f.capture([f.id(12,1)]);expect(f.memory.emotion.damage.bank.get(f.b.participantId)?.reduce((s,e)=>s+e.cells,0)).toBe(1);
  f.m.tick=105;f.capture(Array.from({length:18},(_,n)=>f.id(n-10,2)));expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBeCloseTo(3*2**(-2.5/45)+3);expect(f.memory.emotion.damage.bank.has(f.b.participantId)).toBe(false);
  f.update();expect(collector.snapshot().bots[0].grudgeEvents.at(-1)).toMatchObject({cells:18,accumulated:19,delta:3});collector.dispose();
 });
 it.each([299,300])('uses a strict ten-second rolling boundary at tick %s',tick=>{
  const f=fixture();f.capture([f.id(1,1),f.id(2,1),f.id(3,1)]);f.m.tick=tick;f.capture([f.id(4,1),f.id(5,1),f.id(6,1)]);
  expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(tick===299?3:0);
 });
 it('attributes A→B→C to the transfer-time attacker and separates mixed local/global losses',()=>{
  const f=fixture(),cells=[f.id(1,1),...Array.from({length:5},(_,n)=>f.id(14+n,1))],obs=f.capture(cells);
  expect(obs.events).toContainEqual(expect.objectContaining({type:'LOSS',attackerId:f.b.participantId,cells:6,observedCells:1,cellIds:cells}));
  expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(3);expect(f.memory.emotion.losses).toEqual([{tick:0,cells:1}]);
  for(const id of cells)addTrail(f.m,f.c,id);applySimultaneousCaptures(f.m,[f.c]);f.update();
  expect(grudgeAmount(f.memory.emotion,f.c.participantId)).toBe(0);expect(f.memory.emotion.damage.regions.get(cells[0])?.attackerId).toBe(f.b.participantId);
  expect(JSON.stringify(obs.events)).not.toMatch(/position|direction|targetDirection|trailCells/);
 });
 it('counts the same cell only once per capture but counts a genuine later retheft',()=>{
  const f=fixture(),cells=[1,2,3].map(q=>f.id(q,1));f.capture(cells);f.update();expect(f.memory.emotion.damage.bank.get(f.b.participantId)?.[0].cells).toBe(3);
  f.m.tick=30;f.capture(cells);expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(3);expect(f.memory.emotion.damage.regions.size).toBe(3);
 });
 it('clears pending damage and regions on death and ID departure while preserving grudge',()=>{
  const f=fixture();f.capture([1,2,3].map(q=>f.id(q,1)));markDead(f.m,f.a,'TRAIL_CUT',f.b);f.update();
  expect(f.memory.emotion.damage.bank.size).toBe(0);expect(f.memory.emotion.damage.regions.size).toBe(0);expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(5);
  const g=fixture();g.capture([1,2,3,4,5,6].map(q=>g.id(q,1)));leaveParticipant(g.m,g.b);g.update();expect(g.memory.emotion.damage.regions.size).toBe(0);expect(g.memory.emotion.grudge.size).toBe(0);
 });
 it('bounds spatial memory deterministically without truncating real damage counts',()=>{
  const f=fixture(),cells=f.m.map.cells.filter(c=>c.id!==f.a.cellId&&c.id!==f.b.cellId&&c.id!==f.c.cellId).slice(0,80).map(c=>c.id);
  f.capture(cells);expect(grudgeAmount(f.memory.emotion,f.b.participantId)).toBe(3);expect(f.memory.emotion.damage.regions.size).toBe(32);
  const first=[...f.memory.emotion.damage.regions];f.update();expect([...f.memory.emotion.damage.regions]).toEqual(first);
  const region=first[0][1];expect(damageWeight(region,600,30)).toBeCloseTo(.5);f.m.tick=1800;f.update();expect(f.memory.emotion.damage.regions.size).toBe(0);
 });
 it('bounds regions across four different actual attackers to 96 without cross-opponent cooldown',()=>{
  const f=fixture(),attackers=[f.b,f.c];for(const slot of [3,4]){const p=makeParticipant({participantId:'extra-'+slot,slot,nickname:'추가',kind:'BOT',personality:'ATTACK'});p.lifeId=1;p.lifeState='ALIVE';p.cellId=f.id(19,slot-2);p.position={...f.m.map.cells[p.cellId].center};f.m.participants.push(p);setOwner(f.m,p.cellId,slot+1);attackers.push(p);}
  const excluded=new Set(f.m.participants.map(p=>p.cellId)),cells=f.m.map.cells.filter(c=>!excluded.has(c.id)).slice(0,160).map(c=>c.id);
  for(const [i,attacker]of attackers.entries()){f.m.tick=i;f.capture(cells.slice(i*40,(i+1)*40),attacker);expect(grudgeAmount(f.memory.emotion,attacker.participantId)).toBe(3);}
  expect(f.memory.emotion.damage.regions.size).toBe(96);const counts=new Map<string,number>();for(const c of f.memory.emotion.damage.regions.values())counts.set(c.attackerId,(counts.get(c.attackerId)??0)+1);expect([...counts.values()].every(n=>n<=32)).toBe(true);
 });
 it('does not mistake death neutralization, empty ownership or direct edits for theft',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);setOwner(f.m,f.id(1),0);addTrail(f.m,f.b,f.id(2));applySimultaneousCaptures(f.m,[f.b]);f.update();
  expect(f.memory.emotion.damage.regions.size).toBe(0);markDead(f.m,f.a,'WALL_HIT');f.update();expect(f.memory.emotion.grudge.size).toBe(0);
 });
});
describe('phase 2.5 safe damage expansion',()=>{
 it.each([100,2,0,-5])('caps recovery and vengeance together for base score %s',base=>{
  const f=fixture(),gain=[1,2,3,4,5,6].map(q=>f.id(q,1));f.capture(gain);f.memory.emotion.grudge.set(f.b.participantId,{amount:20,tick:0});
  const bonus=expansionDamageBonus(observeBot(f.m,f.a.participantId),f.memory.emotion,gain,base,f.memory.identity);
  expect(bonus.overlapCells).toBe(6);expect(bonus.reclaimRaw).toBe(4.5);expect(bonus.revengeRaw).toBe(4.5);expect(bonus.bonus).toBe(Math.min(6,.5*Math.max(0,base)));
  for(const id of gain)setOwner(f.m,id,f.c.slot+1);const third=expansionDamageBonus(observeBot(f.m,f.a.participantId),f.memory.emotion,gain,base,f.memory.identity);expect(third.reclaimRaw).toBe(4.5);expect(third.revengeRaw).toBe(0);
 });
 it('uses only nearby candidate cells and never hidden head/trail/direction information',()=>{
  const f=fixture(),gain=Array.from({length:6},(_,n)=>f.id(14+n,1));f.capture(gain);const obs=observeBot(f.m,f.a.participantId);
  expect(expansionDamageBonus(obs,f.memory.emotion,gain,100,f.memory.identity).bonus).toBe(0);
  const a=createBotMemory(19,'combined',f.memory.identity),b=createBotMemory(19,'combined',f.memory.identity);a.emotion=structuredClone(f.memory.emotion);b.emotion=structuredClone(f.memory.emotion);
  f.b.cellId=f.id(20);f.b.position={...f.m.map.cells[f.b.cellId].center};f.b.direction={x:-1,y:0};f.b.targetDirection={x:0,y:1};addTrail(f.m,f.b,f.id(21));
  const changed=observeBot(f.m,f.a.participantId);expect(changed.others).toEqual(obs.others);expect(changed.trails).toEqual(obs.trails);
  expect(getBotInput(obs,a)).toEqual(getBotInput(changed,b));expect(a.random()).toBe(b.random());
 });
 it('adds reachable damage boundaries outside the nearest six, preserves six total, and reports far boundaries without REPOSITION',()=>{
  const f=fixture();for(const c of f.m.map.cells)setOwner(f.m,c.id,0);for(let q=-20;q<=0;q++)setOwner(f.m,f.id(q),1);
  const obs=observeBot(f.m,f.a.participantId),boundary=Array.from({length:21},(_,n)=>f.m.map.cells[f.id(-n)]);
  expect(damageExpansionAnchors(obs,f.memory.emotion.damage,boundary).anchors).toEqual(boundary.slice(0,6));
  f.memory.emotion.damage.regions.set(f.id(-9,1),{attackerId:f.b.participantId,tick:0});const near=damageExpansionAnchors(obs,f.memory.emotion.damage,boundary);
  expect(near.anchors).toHaveLength(6);expect(new Set(near.anchors.map(c=>c.id)).size).toBe(6);expect(near.damageAnchors).toHaveLength(2);expect(near.damageAnchors.some(id=>!boundary.slice(0,6).some(c=>c.id===id))).toBe(true);
  f.memory.emotion.damage.regions.clear();f.memory.emotion.damage.regions.set(f.id(-20,1),{attackerId:f.b.participantId,tick:0});const far=damageExpansionAnchors(obs,f.memory.emotion.damage,boundary);
  expect(far.damageAnchors).toEqual([]);expect(far.unreachable).toBeGreaterThan(0);expect(far.anchors).toEqual(boundary.slice(0,6));
 });
 it('uses shared movement for two small thefts, accumulates grudge, then actually reclaims the damaged area safely',()=>{
  const r=runRepeatedTheft();expect(r.captures.filter(c=>c.slot===1).map(c=>c.cells)).toEqual([4,4]);expect(r.stolen).toBe(8);expect(r.reclaimed).toBeGreaterThan(0);
  expect(r.plans[0].response.reclaimCells).toBeGreaterThan(0);expect(r.plans[0].response.bonus).toBeGreaterThan(0);expect(r.memory.emotion.grudge.get(r.thief.participantId)?.amount).toBeGreaterThan(0);
  expect(r.plans.every(p=>p.pathLength<=24&&p.externalLength<=12)).toBe(true);expect(r.match.participants.every(p=>p.deaths===0)).toBe(true);expect(r.memory.goal).not.toBe('REPOSITION');
 });
 it('never uses bonuses to admit a loop near an observed head',()=>{
  const f=fixture();neutralizeTerritory(f.m,f.a);for(const c of f.m.map.cells)if(Math.max(Math.abs(c.q),Math.abs(c.r),Math.abs(c.q+c.r))<=3)setOwner(f.m,c.id,1);
  const damage=f.id(4);setOwner(f.m,damage,2);f.memory.emotion.damage.regions.set(damage,{attackerId:f.b.participantId,tick:0});f.memory.emotion.grudge.set(f.b.participantId,{amount:20,tick:0});
  f.b.cellId=damage;f.b.position={...f.m.map.cells[damage].center};let trace:BotDecisionTrace|undefined;watchBotDecisions(f.memory,t=>trace=t,{shadow:false});getBotInput(observeBot(f.m,f.a.participantId),f.memory);
  expect(trace!.expansionRejected?.NEAR_HEAD).toBeGreaterThan(0);
  if(trace!.expansionPath){const external=trace!.expansionPath.filter(id=>f.m.owners[id]!==1);expect(external).not.toContain(damage);}
 });
});
