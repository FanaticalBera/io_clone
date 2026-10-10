import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {markDead,leaveParticipant} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
import {setOwner,neutralizeTerritory,addTrail,clearTrail} from '../../src/shared/territory.js';
import {makeParticipant} from '../../src/shared/state.js';
import {createBotMemory,observeBot,getBotInput,botSpecs,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {botSeed,createBotIdentity,BOT_PERSONALITIES,BOT_RANGES,ACTIVE_SECONDARY_TRAITS} from '../../src/shared/bot-identity.js';
import {createBotEmotion,updateBotEmotion,rememberBotEntries,updatePressure,emotionIndividual,grudgeAmount,memoryValuable,grudgeBonus} from '../../src/shared/bot-emotion.js';
import {getBotInputs,botDirector} from '../../src/shared/bot-director.js';
import {BotDebugCollector} from '../../src/client/bot-debug-model.js';
import {BOT_PHASE02 as C} from '../../src/shared/bot-phase02-config.js';
import {survivalCounterAllowed} from '../../src/shared/bot-policy.js';

function fixture(){
 const m=createMatch({mapRadius:22},19,botSpecs(2)),[self,enemy]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants)neutralizeTerritory(m,p);
 self.personality='DEFEND';self.cellId=id(0);self.position={...m.map.cells[self.cellId].center};self.direction={x:1,y:0};setOwner(m,id(0),1);
 enemy.cellId=id(5);enemy.position={...m.map.cells[enemy.cellId].center};enemy.direction={x:0,y:1};setOwner(m,id(9),2);
 const memory=createBotMemory(7,'combined',createBotIdentity(7,'DEFEND',{secondaryTrait:'Territorial'}));
 updateBotEmotion(observeBot(m,self.participantId),memory.emotion,memory.identity);
 return {m,self,enemy,id,memory};
}
function capture(f:ReturnType<typeof fixture>,count:number,far=false,attackerQ=9){
 const cells=Array.from({length:count},(_,i)=>f.id(far?14+i:-1-i,1));for(const cell of cells){setOwner(f.m,cell,1);addTrail(f.m,f.enemy,cell);}
 f.enemy.cellId=f.id(attackerQ);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};applySimultaneousCaptures(f.m,[f.enemy]);
}
function update(f:ReturnType<typeof fixture>){const obs=observeBot(f.m,f.self.participantId);updateBotEmotion(obs,f.memory.emotion,f.memory.identity);return obs;}

describe('phase 2 observed event memory',()=>{
 it.each([5,6,7])('attributes a real %s-cell capture once at the N boundary',count=>{
  const f=fixture();capture(f,count);const obs=update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(count>=6?3:0);
  update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(count>=6?3:0);
  expect(obs.events).toEqual(expect.arrayContaining([expect.objectContaining({type:'LOSS',cells:count})]));
  expect(JSON.stringify(obs.events)).not.toMatch(/position|direction|trail|targetDirection/);
 });
 it('filters loss cells at the event location/time and records public remote damage without widening local pressure',()=>{
  const f=fixture();capture(f,6,true);expect(update(f).events!.filter(e=>e.type==='LOSS')).toEqual([expect.objectContaining({cells:6,observedCells:0})]);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(3);expect(f.memory.emotion.losses).toEqual([]);
  f.self.cellId=f.id(17,1);f.self.position={...f.m.map.cells[f.self.cellId].center};update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(3);
 });
 it('small ownership edits and death neutralization do not manufacture capture damage',()=>{
  const f=fixture();for(const q of [-1,-2]){setOwner(f.m,f.id(q,1),1);setOwner(f.m,f.id(q,1),2);}update(f);
  expect(f.memory.emotion.losses).toEqual([]);expect(f.memory.emotion.grudge.size).toBe(0);
  markDead(f.m,f.self,'TRAIL_CUT',f.enemy);update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(5);expect(f.memory.emotion.losses).toEqual([]);
 });
 it('uses a two-second per-opponent capture cooldown without deferred accumulation',()=>{
  const f=fixture();capture(f,6);update(f);f.m.tick=30;capture(f,6);update(f);
  expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(3*2**(-1/45));
  f.m.tick=60;update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(3*2**(-2/45));
  capture(f,6);update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(3*2**(-2/45)+3);
 });
 it('keeps death memory and dedup through actual respawn, decaying during the wait',()=>{
  const f=fixture();getBotInput(observeBot(f.m,f.self.participantId),f.memory);markDead(f.m,f.self,'TRAIL_CUT',f.enemy);
  expect(getBotInput(observeBot(f.m,f.self.participantId),f.memory)).toBeNull();expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(5);
  f.m.tick=f.self.respawnAtTick;tryRespawns(f.m);getBotInput(observeBot(f.m,f.self.participantId),f.memory);
  expect(f.self.lifeId).toBe(2);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(5*2**(-3/45));expect(memoryValuable(f.memory.emotion,f.enemy.participantId)).toBe(false);
  update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(5*2**(-3/45));
 });
 it.each([false,true])('applies public opponent-death relief once (self kill %s)',revenge=>{
  const f=fixture();f.memory.emotion.grudge.set(f.enemy.participantId,{amount:12,tick:0});markDead(f.m,f.enemy,'TRAIL_CUT',revenge?f.self:undefined);
  update(f);update(f);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(revenge?3:6);
 });
 it('forgets a departed ID rather than transferring it to a new participant in that slot',()=>{
  const f=fixture();f.memory.emotion.grudge.set(f.enemy.participantId,{amount:12,tick:0});leaveParticipant(f.m,f.enemy);f.m.participants=f.m.participants.filter(p=>p!==f.enemy);
  const replacement=makeParticipant({...f.enemy,participantId:'replacement'});f.m.participants.push(replacement);update(f);expect(f.memory.emotion.grudge.size).toBe(0);
 });
 it.each([['Territorial',45],['Vengeful',90]] as const)('uses the approved %s half-life and deletes only below 0.1', (trait,half)=>{
  const f=fixture(),identity=createBotIdentity(7,'DEFEND',{secondaryTrait:trait});f.memory.emotion.grudge.set(f.enemy.participantId,{amount:12,tick:0});f.m.tick=half*30;
  updateBotEmotion(observeBot(f.m,f.self.participantId),f.memory.emotion,identity);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(6);expect(memoryValuable(f.memory.emotion,f.enemy.participantId)).toBe(true);
  f.m.tick++;updateBotEmotion(observeBot(f.m,f.self.participantId),f.memory.emotion,identity);expect(memoryValuable(f.memory.emotion,f.enemy.participantId)).toBe(false);expect(f.memory.emotion.grudge.has(f.enemy.participantId)).toBe(true);
  f.m.tick=Math.ceil(half*Math.log2(12/.1)*30)+1;updateBotEmotion(observeBot(f.m,f.self.participantId),f.memory.emotion,identity);expect(f.memory.emotion.grudge.size).toBe(0);
 });
 it('caps one source of memory at 20',()=>{const f=fixture();for(let n=0;n<10;n++){f.m.tick=n*60;capture(f,6);update(f);}expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(20);});
});

describe('phase 2 repeated local entries',()=>{
 function visit(f:ReturnType<typeof fixture>,tick:number,q:number,r=0){f.m.tick=tick;f.enemy.cellId=f.id(q,r);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};const obs=update(f);rememberBotEntries(obs,f.memory.emotion);}
 it('requires two actual reentries and never awards continued residence or short boundary jitter',()=>{
  const f=fixture();for(const q of [1,2,3])setOwner(f.m,f.id(q),1);
  visit(f,0,5);visit(f,15,1);for(const tick of [21,27,33])visit(f,tick,1);expect(f.memory.emotion.grudge.size).toBe(0);
  visit(f,40,5);visit(f,46,1);expect(f.memory.emotion.grudge.size).toBe(0);
  visit(f,60,5);visit(f,75,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(1);
  visit(f,90,5);visit(f,105,1);visit(f,120,5);visit(f,135,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeLessThanOrEqual(1);
  visit(f,195,5);visit(f,210,1);visit(f,225,5);visit(f,240,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeGreaterThan(1.8);
 });
 it('awards only the higher intrusion weight when the same entry also approaches our line',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);addTrail(f.m,f.self,f.id(0,1));
  visit(f,0,6);visit(f,15,1);visit(f,30,6);visit(f,45,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(1);
 });
 it('upgrades an approach award to intrusion without adding both when the head enters home a tick later',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);addTrail(f.m,f.self,f.id(0,1));
  visit(f,0,6);visit(f,15,1);visit(f,30,6);visit(f,45,3);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBe(.5);
  visit(f,51,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeCloseTo(1);visit(f,57,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeLessThan(1);
 });
 it('treats observation loss as unknown, rather than an outside interval',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);visit(f,0,5);visit(f,15,1);visit(f,30,18);visit(f,60,1);expect(f.memory.emotion.grudge.size).toBe(0);
 });
 it('retains recent award cooldowns when its own life changes but resets local visit history',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);visit(f,0,5);visit(f,15,1);visit(f,30,5);visit(f,45,1);expect(f.memory.emotion.repeatAward.get(f.enemy.participantId)?.intrusion).toBe(45);
  f.self.lifeId++;update(f);expect(f.memory.emotion.intrusions.size).toBe(0);expect(f.memory.emotion.repeatAward.get(f.enemy.participantId)?.intrusion).toBe(45);
  visit(f,60,5);visit(f,75,1);visit(f,90,5);visit(f,105,1);expect(grudgeAmount(f.memory.emotion,f.enemy.participantId)).toBeLessThanOrEqual(1);
 });
 it('expires unpaired entries after the ten-second window',()=>{
  const f=fixture();setOwner(f.m,f.id(1),1);visit(f,0,5);visit(f,15,1);visit(f,30,5);visit(f,360,1);expect(f.memory.emotion.grudge.size).toBe(0);
 });
});

describe('passive grudge cause diagnostics',()=>{
 it('attributes local capture to a distant actual attacker and separates old death memory',()=>{
  const f=fixture(),other=makeParticipant({participantId:'old-killer',slot:2,nickname:'옛 가해자',kind:'BOT',personality:'ATTACK'});f.m.participants.push(other);
  const collector=new BotDebugCollector(f.m,new Map([[f.self.participantId,f.memory],[f.enemy.participantId,createBotMemory(8)],[other.participantId,createBotMemory(9)]]));
  markDead(f.m,f.self,'TRAIL_CUT',other);update(f);f.m.tick=f.self.respawnAtTick;tryRespawns(f.m);
  neutralizeTerritory(f.m,f.self);f.self.cellId=f.id(0);f.self.position={...f.m.map.cells[f.self.cellId].center};setOwner(f.m,f.id(0),1);update(f);
  setOwner(f.m,f.id(19),2);capture(f,6,false,19);const obs=update(f);expect(obs.others.some(p=>p.participantId===f.enemy.participantId)).toBe(false);
  const row=collector.snapshot().bots.find(p=>p.participantId===f.self.participantId)!;
  expect(row.grudgeEvents.map(e=>[e.targetId,e.reason,e.delta])).toEqual([[other.participantId,'DEATH',5],[f.enemy.participantId,'CAPTURE',3]]);
  expect(row.emotion.grudges.find(g=>g.participantId===f.enemy.participantId)).toMatchObject({slot:f.enemy.slot,nickname:f.enemy.nickname,amount:3,lastEvent:{reason:'CAPTURE',cells:6,lifeId:2}});
  expect(row.emotion.grudges.find(g=>g.participantId===other.participantId)?.lastEvent).toMatchObject({reason:'DEATH',lifeId:1});collector.dispose();
 });
 it('explains small losses and cooldown misses without changing the remembered cause',()=>{
  const f=fixture(),collector=new BotDebugCollector(f.m,new Map([[f.self.participantId,f.memory],[f.enemy.participantId,createBotMemory(8)]]));
  capture(f,5);update(f);f.m.tick=30;capture(f,6);update(f);f.m.tick=60;capture(f,6);update(f);update(f);
  const row=collector.snapshot().bots[0];expect(row.grudgeEvents).toHaveLength(3);
  expect(row.grudgeEvents.map(e=>[e.cells,e.ignored,e.delta])).toEqual([[5,'BELOW_THRESHOLD',0],[6,undefined,3],[6,'COOLDOWN',0]]);
  expect(row.emotion.grudges[0].lastEvent).toMatchObject({tick:30,cells:6,delta:3});collector.dispose();
 });
 it('records actual capped increments, bounded history and unsubscribes on disposal',()=>{
  const f=fixture(),collector=new BotDebugCollector(f.m,new Map([[f.self.participantId,f.memory],[f.enemy.participantId,createBotMemory(8)]]));
  f.memory.emotion.grudge.set(f.enemy.participantId,{amount:19,tick:0});capture(f,6);update(f);
  expect(collector.snapshot().bots[0].grudgeEvents[0]).toMatchObject({delta:1,balance:20});
  for(let n=1;n<=15;n++){f.m.tick=n*60;capture(f,6);update(f);}expect(collector.snapshot().bots[0].grudgeEvents).toHaveLength(12);
  const saved=collector.snapshot().bots[0];saved.grudgeEvents[0].delta=999;expect(collector.snapshot().bots[0].grudgeEvents[0].delta).not.toBe(999);
  collector.dispose();f.m.tick+=60;capture(f,6);update(f);expect(collector.snapshot().bots[0].grudgeEvents).toEqual([]);expect(collector.snapshot().bots[0].emotion.grudges[0].lastEvent).toBeNull();
 });
 it('records repeat approach and the later intrusion adjustment as separate causes',()=>{
  const f=fixture(),collector=new BotDebugCollector(f.m,new Map([[f.self.participantId,f.memory],[f.enemy.participantId,createBotMemory(8)]]));
  setOwner(f.m,f.id(1),1);addTrail(f.m,f.self,f.id(0,1));
  for(const [tick,q]of [[0,6],[15,1],[30,6],[45,3],[51,1]]){f.m.tick=tick;f.enemy.cellId=f.id(q);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};rememberBotEntries(update(f),f.memory.emotion);}
  const events=collector.snapshot().bots[0].grudgeEvents;expect(events).toHaveLength(2);expect(events[0]).toMatchObject({reason:'REPEAT_APPROACH',delta:.5,upgrade:false});
  expect(events[1]).toMatchObject({reason:'REPEAT_INTRUSION',upgrade:true});expect(events[1].delta).toBeCloseTo(1-.5*2**(-.2/45));collector.dispose();
 });
 it('explains a remote public capture while keeping pressure local',()=>{
  const f=fixture(),collector=new BotDebugCollector(f.m,new Map([[f.self.participantId,f.memory],[f.enemy.participantId,createBotMemory(8)]]));
  capture(f,6,true);update(f);expect(collector.snapshot().bots[0].grudgeEvents).toEqual([expect.objectContaining({reason:'CAPTURE',cells:6,observedCells:0,delta:3})]);expect(collector.snapshot().bots[0].emotion.grudges[0].amount).toBe(3);expect(f.memory.emotion.losses).toEqual([]);collector.dispose();
 });
});

describe('phase 2 bounded emotional weights',()=>{
 it.each(BOT_PERSONALITIES)('%s uses raw grudge 6 for valuable regardless of the trait multiplier',personality=>{
  const f=fixture(),identity=createBotIdentity(7,personality,{secondaryTrait:'Vengeful'});
  for(const amount of [5,5.99,6]){f.memory.emotion.grudge.set(f.enemy.participantId,{amount,tick:0});expect(memoryValuable(f.memory.emotion,f.enemy.participantId)).toBe(amount>=6);expect(grudgeBonus(f.memory.emotion,f.enemy.participantId,identity)).toBeCloseTo(Math.min(12,amount*.6*1.25));}
 });
 it.each(BOT_PERSONALITIES)('%s pressure and target attack adjustment respect identity bounds',personality=>{
  const f=fixture();f.self.personality=personality;const obs=observeBot(f.m,f.self.participantId),identity=createBotIdentity(7,personality,{secondaryTrait:'Vengeful'}),saved=structuredClone(identity);
  f.memory.emotion.pressure=1;f.memory.emotion.grudge.set(f.enemy.participantId,{amount:20,tick:0});const individual=emotionIndividual(obs,f.memory.emotion,identity,f.enemy.participantId)!;
  for(const [key,value]of Object.entries(individual)){const [lo,hi]=BOT_RANGES[personality][key as keyof typeof individual];expect(value).toBeGreaterThanOrEqual(lo);expect(value).toBeLessThanOrEqual(hi);}expect(identity).toEqual(saved);
  expect(grudgeBonus(f.memory.emotion,f.enemy.participantId,identity)).toBe(12);
 });
 it('uses the 59/41 local pressure ratio, ten-second losses, and distinct rise/fall constants',()=>{
  const f=fixture();f.memory.emotion.losses=[{tick:0,cells:7}];f.m.tick=30;const obs=observeBot(f.m,f.self.participantId);
  updatePressure(obs,f.memory.emotion,true);expect(f.memory.emotion.pressure).toBeCloseTo(1-Math.exp(-1));
  f.memory.emotion.losses=[];f.m.tick=60;updatePressure(observeBot(f.m,f.self.participantId),f.memory.emotion,false);expect(f.memory.emotion.pressure).toBeCloseTo((1-Math.exp(-1))*Math.exp(-1/4));
  f.memory.emotion.pressure=0;f.memory.emotion.pressureTick=60;f.m.tick=90;updatePressure(observeBot(f.m,f.self.participantId),f.memory.emotion,true);expect(f.memory.emotion.pressure).toBeCloseTo((10/17)*(1-Math.exp(-1)));
  f.memory.emotion.losses=[{tick:90,cells:7}];f.m.tick=391;update(f);expect(f.memory.emotion.losses).toEqual([]);
 });
 it.each(['Territorial','Vengeful'] as const)('adds grudge exactly once to real candidate scores for %s',trait=>{
  const f=fixture();addTrail(f.m,f.enemy,f.id(2));const obs=observeBot(f.m,f.self.participantId);
  const score=(amount:number)=>{const identity=createBotIdentity(7,'DEFEND',{secondaryTrait:trait}),m=createBotMemory(7,'combined',identity);m.plannedLifeId=obs.self.lifeId;m.path=[f.id(0)];updateBotEmotion(obs,m.emotion,identity);m.emotion.grudge.set(f.enemy.participantId,{amount,tick:obs.tick});let t:BotDecisionTrace|undefined;watchBotDecisions(m,trace=>t=trace,{shadow:false});getBotInput(obs,m);const a=t!.attacks.find(a=>a.score!==undefined)!;expect(a).toBeDefined();return a;};
  const cold=score(0),warm=score(5),bonus=trait==='Vengeful'?3.75:3;expect(warm.grudgeBonus).toBe(bonus);expect(warm.score!-cold.score!-15*(warm.attackChance!-cold.attackChance!)).toBeCloseTo(bonus);
 });
 it('changes neither input, scores nor RNG when only public standings change',()=>{
  const f=fixture(),a=createBotMemory(7,'combined',f.memory.identity),b=createBotMemory(7,'combined',f.memory.identity),obs=observeBot(f.m,f.self.participantId),other=structuredClone(obs);other.standings=other.standings!.map(p=>({...p,rank:99,territory:9999,share:.99}));
  let ta:BotDecisionTrace|undefined,tb:BotDecisionTrace|undefined;watchBotDecisions(a,t=>ta=t,{shadow:false});watchBotDecisions(b,t=>tb=t,{shadow:false});
  expect(getBotInput(obs,a)).toEqual(getBotInput(other,b));expect(ta).toEqual(tb);expect(a.random()).toBe(b.random());
 });
 it('activates Vengeful while leaving Persistent out of automatic assignment',()=>{expect(ACTIVE_SECONDARY_TRAITS).toContain('Vengeful');expect(ACTIVE_SECONDARY_TRAITS).not.toContain('Persistent');});
});

function reservations(targetKind:'HUMAN'|'BOT'='BOT'){
 const m=createMatch({mapRadius:22},19,botSpecs(5)),memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(7)])),target=m.participants[4];target.kind=targetKind;
 const cut=m.map.cells[target.cellId].neighbors[0];addTrail(m,target,cut);
 for(const p of m.participants.slice(0,4)){const memory=memories.get(p.participantId)!;memory.goal='ATTACK';memory.attackSlot=target.slot;memory.attackTarget=cut;memory.path=[cut,p.cellId];memory.plannedLifeId=p.lifeId;}
 return {m,memories,target,d:botDirector(m)};
}
describe('phase 2 atomic pursuit director',()=>{
 it.each(['HUMAN','BOT'] as const)('applies 1/.65/.35 and a cap of three to a %s target',kind=>{
  const {m,memories,target,d}=reservations(kind);
  for(let i=0;i<3;i++){const p=m.participants[i];expect(d.policy(p.participantId).evaluate(target.participantId,target.lifeId,100,false).score).toBe([100,65,35][i]);d.commit(p,memories.get(p.participantId)!);}
  expect(d.count(target.participantId)).toBe(3);expect(d.policy(m.participants[3].participantId).evaluate(target.participantId,target.lifeId,100,false).reason).toBe('RESERVATION_FULL');
  expect(d.policy(m.participants[0].participantId).evaluate(target.participantId,target.lifeId,100,false).otherReservations).toBe(2);
  d.commit(m.participants[0],memories.get(m.participants[0].participantId)!);expect(d.count(target.participantId)).toBe(3);
 });
 it('rejects non-positive planned scores rather than making a negative score better',()=>{const {target,d,m}=reservations();expect(d.policy(m.participants[0].participantId).evaluate(target.participantId,target.lifeId,-10,false).reason).toBe('NON_POSITIVE_ATTACK');});
 it.each(['goal','target','attackerDeath','victimDeath','life','targetLife','trail','path','home','leave','ttl'] as const)('releases immediately for %s',reason=>{
  const {m,memories,target,d}=reservations(),p=m.participants[0],memory=memories.get(p.participantId)!;d.commit(p,memory);
  if(reason==='goal')memory.goal='RETURN';if(reason==='target')memory.attackSlot=1;if(reason==='attackerDeath')p.lifeState='DEAD_WAIT';if(reason==='victimDeath')target.lifeState='DEAD_WAIT';if(reason==='life')p.lifeId++;if(reason==='targetLife')target.lifeId++;if(reason==='trail')clearTrail(m,target);if(reason==='path')memory.path=[];if(reason==='home')setOwner(m,memory.path.at(-1)!,0);if(reason==='leave')m.participants=m.participants.filter(x=>x!==target);if(reason==='ttl')m.tick=C.reservationTtl*m.config.simulationHz;
  d.prune(memories);expect(d.count(target.participantId)).toBe(0);
 });
 it('refreshes expiry on a valid decision and counts selected survival separately from planned reservations',()=>{
  const {m,memories,target,d}=reservations();for(const p of m.participants.slice(0,3))d.commit(p,memories.get(p.participantId)!);
  m.tick=18;d.commit(m.participants[0],memories.get(m.participants[0].participantId)!);m.tick=24;d.prune(memories);expect(d.count(target.participantId)).toBe(1);
  for(const p of m.participants.slice(1,3))d.commit(p,memories.get(p.participantId)!);
  const fourth=m.participants[3],memory=memories.get(fourth.participantId)!;memory.attackSurvival=true;
  expect(d.policy(fourth.participantId).evaluate(target.participantId,target.lifeId,100,true).reason).toBeUndefined();d.commit(fourth,memory);expect(d.count(target.participantId)).toBe(3);expect(d.stats.survivalOverCap).toBe(1);
  memory.attackSurvival=false;expect(d.policy(fourth.participantId).evaluate(target.participantId,target.lifeId,100,false).reason).toBe('RESERVATION_FULL');
 });
 it('allows a real faster counter-cut at a full cap, then requires a normal reservation when the threat goes away',()=>{
  const {m,memories,target,d}=reservations();const self=m.participants[0],id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
  neutralizeTerritory(m,self);neutralizeTerritory(m,target);clearTrail(m,target);self.cellId=id(0);self.position={...m.map.cells[id(0)].center};self.direction={x:1,y:0};self.personality='DEFEND';setOwner(m,id(-3),1);for(const q of [-2,-1,0])addTrail(m,self,id(q));
  target.cellId=id(2);target.position={...m.map.cells[id(2)].center};target.direction={x:-1,y:0};setOwner(m,id(3),target.slot+1);for(const q of [1,2])addTrail(m,target,id(q));
  for(const p of m.participants.slice(1,4)){const mem=memories.get(p.participantId)!;mem.attackTarget=id(1);mem.path=[id(1),p.cellId];d.commit(p,mem);}
  const memory=memories.get(self.participantId)!;memory.goal='EXPAND';memory.path=[id(-3)];memory.attackSlot=null;memory.attackTarget=null;
  getBotInputs(m,memories,new Set([self.participantId]));expect(memory.goal).toBe('ATTACK');expect(memory.attackSurvival).toBe(true);expect(d.count(target.participantId)).toBe(3);expect(d.stats.survivalOverCap).toBe(1);
  target.cellId=id(6);target.position={...m.map.cells[id(6)].center};target.direction={x:0,y:1};m.tick=6;
  getBotInputs(m,memories,new Set([self.participantId]));expect(memory.goal).not.toBe('ATTACK');expect(memory.attackSurvival).toBe(false);expect(d.count(target.participantId)).toBe(3);
 });
 it('enforces the cap for a visible trail even when its owner head is outside observation range',()=>{
  const {m,memories,target,d}=reservations(),self=m.participants[0],id=(q:number)=>m.map.byKey.get(q+',0')!;neutralizeTerritory(m,self);neutralizeTerritory(m,target);clearTrail(m,target);
  self.cellId=id(0);self.position={...m.map.cells[id(0)].center};self.direction={x:1,y:0};self.personality='DEFEND';setOwner(m,id(0),self.slot+1);target.cellId=id(18);target.position={...m.map.cells[id(18)].center};setOwner(m,id(20),target.slot+1);addTrail(m,target,id(2));
  for(const p of m.participants.slice(1,4)){const mem=memories.get(p.participantId)!;mem.attackTarget=id(2);mem.path=[id(2),p.cellId];d.commit(p,mem);}
  const memory=memories.get(self.participantId)!;memory.goal='EXPAND';memory.path=[id(0)];memory.attackSlot=null;memory.attackTarget=null;updateBotEmotion(observeBot(m,self.participantId),memory.emotion);memory.emotion.grudge.set(target.participantId,{amount:6,tick:0});
  let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});getBotInputs(m,memories,new Set([self.participantId]));expect(memory.goal).not.toBe('ATTACK');expect(trace!.attacks.some(a=>a.reason==='RESERVATION_FULL')).toBe(true);expect(d.count(target.participantId)).toBe(3);
 });
 it('requires every survival timing condition and known finite return ETA',()=>{
  expect(survivalCounterAllowed(1,.8,1.2,.4)).toBe(true);
  for(const args of [[0,.8,1.2,.4],[1,1.1,2,.4],[1,.8,.9,.4],[1,.8,null,.4],[1,.8,Infinity,.4],[1,.8,1.2,.76],[1,.8,1.2,.66],[1,Infinity,2,.4]] as const)expect(survivalCounterAllowed(args[0],args[1],args[2],args[3])).toBe(false);
 });
 it('keeps real director choices and RNG identical with HUD on/off, including respawn and same-tick reservations',()=>{
  const specs=botSpecs(14,0,'bot',{seed:19}),a=createMatch({mapRadius:22},19,specs,'same'),b=createMatch({mapRadius:22},19,specs,'same');
  const memories=(m:typeof a)=>new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(19,p.slot),'combined',createBotIdentity(botSeed(19,p.slot),p.personality!))]));
  const ma=memories(a),mb=memories(b),collector=new BotDebugCollector(b,mb);
  for(let tick=0;tick<450;tick++){const ia=getBotInputs(a,ma),ib=getBotInputs(b,mb);expect(ia).toEqual(ib);stepMatch(a,ia);stepMatch(b,ib);if(tick%8===0)collector.snapshot();}
  expect(a).toEqual(b);expect(botDirector(a).snapshot()).toEqual(botDirector(b).snapshot());expect(botDirector(a).stats.maxPlanned).toBeLessThanOrEqual(3);
  for(const [id,m]of ma){expect(m.emotion).toEqual(mb.get(id)!.emotion);expect(m.random()).toBe(mb.get(id)!.random());}
  expect(a.participants.some(p=>p.deaths>0)).toBe(true);expect(collector.snapshot().bots.some(p=>p.grudgeEvents.length>0)).toBe(true);collector.dispose();
 });
});
