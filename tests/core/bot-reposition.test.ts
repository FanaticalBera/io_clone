import * as immediateSafety from '../../src/shared/bot-immediate-safety.js';
import {describe,it,expect,vi} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,observeBotForTick,shortestPath,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {createBotIdentity} from '../../src/shared/bot-identity.js';
import {getBotInputs,botDirector} from '../../src/shared/bot-director.js';
import {setOwner,neutralizeTerritory,addTrail} from '../../src/shared/territory.js';
import {markDead,leaveParticipant} from '../../src/shared/life.js';
import {updateBotEmotion} from '../../src/shared/bot-emotion.js';
import {selectReposition,startReposition,endReposition,repositionImmediateReason,repositionRegularReason,watchReposition,type RepositionEpisode} from '../../src/shared/bot-reposition.js';
import {isRepositionPingPong} from '../../src/shared/bot-reposition-diagnostics.js';
import {BotDebugCollector} from '../../src/client/bot-debug-model.js';
import {runRepeatedTheft} from '../bot-damage-fixture.js';
import {BotReclaimDiagnostics} from '../../src/shared/bot-reclaim-diagnostics.js';
function fixture(distance=14,thin=false){
 const m=createMatch({mapRadius:28},19,botSpecs(3)),[a,b,c]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants)neutralizeTerritory(m,p);
 a.personality='DEFEND';a.cellId=id(0);b.cellId=id(25);c.cellId=id(-25);for(const p of m.participants){p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};setOwner(m,p.cellId,p.slot+1);}
 for(let q=0;q<=distance;q++)for(let r=thin?0:-2;r<=(thin?0:2);r++)if(m.map.byKey.has(q+','+r))setOwner(m,id(q,r),a.slot+1);
 const memory=createBotMemory(19,'combined',createBotIdentity(19,'DEFEND',{secondaryTrait:'Territorial'}));updateBotEmotion(observeBot(m,a.participantId),memory.emotion,memory.identity);memory.plannedLifeId=a.lifeId;
 // A compact stolen patch whose earliest adjacent owned boundary is distance.
 for(const q of [distance+3,distance+4])for(const r of [-1,0,1]){const cell=id(q,r);setOwner(m,cell,b.slot+1);memory.emotion.damage.regions.set(cell,{attackerId:b.participantId,tick:0});}
 memory.emotion.damage.recent.set(b.participantId,[{tick:0,cells:6,observedCells:0}]);
 const select=()=>selectReposition(observeBot(m,a.participantId),memory.emotion,memory.reposition,memory.identity,shortestPath);
 const start=()=>{const selection=select();expect(selection.plan).toBeDefined();startReposition(observeBot(m,a.participantId),memory.reposition,selection.plan!);memory.goal='REPOSITION';memory.path=[...selection.plan!.path];return selection.plan!;};
 return {m,a,b,c,id,memory,select,start};
}
describe('phase 2.5 internal reposition',()=>{
 it.each([10,11,20,21])('keeps direct/relocation distance boundary %s',distance=>{
  const f=fixture(distance,true);f.memory.emotion.grudge.set(f.b.participantId,{amount:20,tick:0});const selection=f.select();if(distance===11||distance===20)expect(selection.plan?.distance).toBe(distance);else expect(selection.plan).toBeUndefined();
  expect(selection.examined).toBeLessThanOrEqual(8);if(distance===10)expect(selection.within10).toBeGreaterThan(0);if(distance===21)expect(selection.beyond20OrDisconnected).toBeGreaterThan(0);
 });
 it('filters unreachable recent boundaries before the eight-destination cap',()=>{
  const f=fixture(14);f.m.tick=1;
  for(let q=15;q<=25;q++)for(const r of [2,3])setOwner(f.m,f.id(q,r),f.a.slot+1);
  for(const q of [25,26])for(const r of [0,1]){const id=f.id(q,r);setOwner(f.m,id,f.b.slot+1);f.memory.emotion.damage.regions.set(id,{attackerId:f.b.participantId,tick:1});}
  let calls=0;const obs=observeBot(f.m,f.a.participantId),selection=selectReposition(obs,f.memory.emotion,f.memory.reposition,f.memory.identity,(...args)=>{calls++;expect(args[4]).toBe(20);return shortestPath(...args);});
  expect(selection.beyond20OrDisconnected).toBeGreaterThanOrEqual(8);expect(selection.reason).toBe('SELECTED');expect(selection.plan!.distance).toBeGreaterThanOrEqual(11);expect(selection.plan!.distance).toBeLessThanOrEqual(20);
  expect(calls).toBe(selection.examined);expect(calls).toBeLessThanOrEqual(8);expect(selection.plan!.path.every(id=>f.m.owners[id]===f.a.slot+1)).toBe(true);
 });
 it('filters nearby recent boundaries before the cap without suppressing LOW_PRIORITY',()=>{
  const f=fixture(14);f.m.tick=1;
  for(let q=2;q<=7;q++){const id=f.id(q,3);setOwner(f.m,id,f.b.slot+1);f.memory.emotion.damage.regions.set(id,{attackerId:f.b.participantId,tick:1});}
  const selection=f.select();expect(selection.within10).toBeGreaterThanOrEqual(8);expect(selection.plan).toBeDefined();expect(selection.examined).toBeLessThanOrEqual(8);
  for(const cell of f.memory.emotion.damage.regions.values())cell.tick=-1700;f.memory.emotion.grudge.clear();expect(f.select().reason).toBe('LOW_PRIORITY');
 });
 it('requires actual recent damage or grudge plus a region; deterministic selection consumes no RNG',()=>{
  const f=fixture();const first=f.select();expect(f.select()).toEqual(first);const untouched=createBotMemory(19,'combined',f.memory.identity);expect(f.memory.random()).toBe(untouched.random());
  f.memory.emotion.damage.recent.clear();expect(f.select().plan).toBeUndefined();f.memory.emotion.grudge.set(f.b.participantId,{amount:6,tick:0});expect(f.select().plan).toBeDefined();
  f.memory.emotion.damage.regions.clear();expect(f.select().plan).toBeUndefined();
 });
 it('rejects score <=0 and uses the six-second cooldown across two different attackers',()=>{
  const f=fixture(20,true);f.memory.emotion.grudge.set(f.b.participantId,{amount:20,tick:0});for(const cell of f.memory.emotion.damage.regions.values())cell.tick=-1700;expect(f.select().plan).toBeUndefined();
  for(const cell of f.memory.emotion.damage.regions.values())cell.tick=0;f.start();endReposition(observeBot(f.m,f.a.participantId),f.memory.reposition,'NEAR_HEAD');
  for(const cell of f.memory.emotion.damage.regions.values())cell.attackerId=f.c.participantId;f.memory.emotion.damage.recent.set(f.c.participantId,[{tick:0,cells:6,observedCells:0}]);
  f.memory.emotion.grudge.set(f.c.participantId,{amount:20,tick:0});f.m.tick=179;expect(f.select().reason).toBe('COOLDOWN');f.m.tick=180;expect(f.select().plan?.attackerId).toBe(f.c.participantId);
 });
 it.each(['ROUTE_LOST','DESTINATION_CHANGED','TRAIL_EXPOSED','OUTSIDE_HOME','OPPONENT_LEFT'] as const)('invalidates %s immediately between regular decisions',reason=>{
  const f=fixture(),plan=f.start();f.memory.nextDecisionTick=100;
  if(reason==='ROUTE_LOST')setOwner(f.m,plan.path[4],f.b.slot+1);
  if(reason==='DESTINATION_CHANGED')for(const n of f.m.map.cells[plan.target].neighbors)if(n>=0)setOwner(f.m,n,f.a.slot+1);
  if(reason==='TRAIL_EXPOSED')addTrail(f.m,f.a,f.a.cellId);
  if(reason==='OUTSIDE_HOME')setOwner(f.m,f.a.cellId,f.b.slot+1);
  if(reason==='OPPONENT_LEFT')leaveParticipant(f.m,f.b);
  const obs=observeBotForTick(f.m,f.a.participantId,f.memory);expect(repositionImmediateReason(obs,f.memory.reposition,f.memory.path)).toBe(reason);
  getBotInput(obs,f.memory);expect(f.memory.reposition.active).toBeNull();expect(f.memory.reposition.last?.outcome).toBe(reason);expect(f.memory.reposition.cooldownUntil).toBe(180);
 });
 it('sees every local head before testing next three waypoints; zero trail still aborts as a due decision with no relocation reservation',()=>{
  const f=fixture(),plan=f.start();f.memory.nextDecisionTick=100;f.b.cellId=f.id(-3);f.b.position={...f.m.map.cells[f.b.cellId].center};f.c.cellId=plan.path[2];f.c.position={...f.m.map.cells[f.c.cellId].center};
  const obs=observeBotForTick(f.m,f.a.participantId,f.memory);expect(obs.ownTrail).toEqual([]);expect(obs.others.map(p=>p.participantId)).toEqual([f.b.participantId,f.c.participantId]);
  expect(repositionImmediateReason(obs,f.memory.reposition,f.memory.path)).toBe('NEAR_HEAD');
  const memories=new Map([[f.a.participantId,f.memory]]);const decisions=botDirector(f.m).stats.decisions;getBotInputs(f.m,memories);expect(f.memory.reposition.last?.outcome).toBe('NEAR_HEAD');expect(botDirector(f.m).stats.decisions).toBe(decisions+1);expect(botDirector(f.m).snapshot().reservations).toEqual([]);
 });
 it('does not enter a relocation already blocked by a visible nearby head',()=>{
  const f=fixture();f.c.cellId=f.id(3);f.c.position={...f.m.map.cells[f.c.cellId].center};expect(f.select().reason).toBe('NEAR_HEAD');getBotInput(observeBot(f.m,f.a.participantId),f.memory);expect(f.memory.goal).not.toBe('REPOSITION');
 });
 it('does not read a hidden head, trail, direction or target intent',()=>{
  const f=fixture(),before=f.select(),obs=observeBot(f.m,f.a.participantId);f.b.cellId=f.id(-24,-1);f.b.position={...f.m.map.cells[f.b.cellId].center};f.b.direction={x:0,y:1};f.b.targetDirection={x:0,y:-1};addTrail(f.m,f.b,f.id(-23,-1));
  const changed=observeBot(f.m,f.a.participantId);expect(changed.others).toEqual(obs.others);expect(changed.trails).toEqual(obs.trails);expect(f.select()).toEqual(before);
 });
 it('checks timeout and disappearing regions at normal decisions and clears old-life movement without teleport attribution',()=>{
  const f=fixture();f.start();f.m.tick=240;expect(repositionRegularReason(observeBot(f.m,f.a.participantId),f.memory.reposition,f.memory.emotion)).toBe('TIMEOUT');
  f.m.tick=6;f.memory.emotion.damage.regions.clear();expect(repositionRegularReason(observeBot(f.m,f.a.participantId),f.memory.reposition,f.memory.emotion)).toBe('DAMAGE_GONE');
  f.a.lifeId++;f.a.cellId=f.id(-10);getBotInput(observeBot(f.m,f.a.participantId),f.memory);expect(f.memory.reposition.last?.outcome).toBe('LIFE_CHANGED');expect(f.memory.reposition.last?.endCell).toBe(f.id(0));expect(f.memory.reposition.active).toBeNull();
 });
 it('clears a plan on death, interrupts it for return-only, and never starts during an existing expansion or escape',()=>{
  const f=fixture();f.start();markDead(f.m,f.a,'TRAIL_CUT',f.b);getBotInput(observeBot(f.m,f.a.participantId),f.memory);expect(f.memory.reposition.last?.outcome).toBe('DEATH');
  const g=fixture();g.start();getBotInput(observeBot(g.m,g.a.participantId),g.memory,true);expect(g.memory.reposition.last?.outcome).toBe('RETURN_ONLY');
  for(const goal of ['EXPAND','ESCAPE'] as const){const h=fixture();h.memory.goal=goal;h.memory.path=[h.id(1),h.id(2),h.id(3)];h.memory.lastProgressTick=0;if(goal==='ESCAPE'){setOwner(h.m,h.a.cellId,0);addTrail(h.m,h.a,h.a.cellId);}getBotInput(observeBot(h.m,h.a.participantId),h.memory);expect(h.memory.reposition.active).toBeNull();}
 });
 it('uses actual shared movement to arrive, replans a bounded guardian loop and actually recovers damaged cells',()=>{
  const f=fixture(),closed:any[]=[],traces:BotDecisionTrace[]=[],tracker=new BotReclaimDiagnostics(f.m,new Map([[f.a.participantId,f.memory]]));tracker.onClose=r=>closed.push(r);
  watchBotDecisions(f.memory,t=>{traces.push(t);tracker.decision(f.a.participantId,t);},{shadow:false});let arrived=false;
  for(let tick=0;tick<750;tick++){const input=getBotInput(observeBotForTick(f.m,f.a.participantId,f.memory),f.memory);if(input)stepMatch(f.m,new Map([[f.a.participantId,input]]));tracker.afterTick();if(f.memory.reposition.active){expect(f.m.owners[f.a.cellId]).toBe(f.a.slot+1);expect(f.a.trailCells.size).toBe(0);}if(f.memory.reposition.last?.outcome==='ARRIVED')arrived=true;if(closed.some(r=>r.actualCellIds.length))break;}
  expect(arrived).toBe(true);expect(f.memory.reposition.last?.movedCells).toBeGreaterThanOrEqual(11);expect(closed.some(r=>r.actualCellIds.length>0)).toBe(true);
  const plans=traces.filter(t=>t.expansionPlan).map(t=>t.expansionPlan!);expect(plans.length).toBeGreaterThan(0);expect(plans.every(p=>p.pathLength<=24&&p.externalLength<=12)).toBe(true);expect(f.a.deaths).toBe(0);tracker.dispose();
 });
 it('responds to two real small thefts while patrolling far away, relocates through owned cells, then reclaims',()=>{
  const r=runRepeatedTheft(19,true,true);expect(r.captures.filter(c=>c.slot===1).map(c=>c.cells)).toEqual([4,4]);expect(r.stolen).toBe(8);expect(r.memory.reposition.sequence).toBeGreaterThan(0);expect(r.memory.reposition.last?.outcome).toBe('ARRIVED');expect(r.memory.reposition.last?.movedCells).toBeGreaterThanOrEqual(11);expect(r.reclaimed).toBeGreaterThan(0);expect(r.match.participants.every(p=>p.deaths===0)).toBe(true);expect(r.plans.every(p=>p.pathLength<=24&&p.externalLength<=12)).toBe(true);
 });
 it('a valid existing cut interrupts relocation and obtains only the normal attack reservation',()=>{
  const f=fixture();f.start();f.b.cellId=f.id(9);f.b.position={...f.m.map.cells[f.b.cellId].center};f.b.direction={x:1,y:0};for(const q of [1,2,3])addTrail(f.m,f.b,f.id(q));
  const memories=new Map([[f.a.participantId,f.memory]]);getBotInputs(f.m,memories);expect(f.memory.goal).toBe('ATTACK');expect(f.memory.reposition.last?.outcome).toBe('ATTACK');
  expect(f.memory.attackSurvival).toBe(false);expect(botDirector(f.m).snapshot().reservations).toHaveLength(1);expect(botDirector(f.m).snapshot().reservations[0].targetId).toBe(f.b.participantId);
 });
 it('observed relocation and unobserved relocation have identical inputs, RNG, memory, world and director due order',()=>{
  const a=fixture(),b=fixture(),am=new Map([[a.a.participantId,a.memory]]),bm=new Map([[b.a.participantId,b.memory]]),collector=new BotDebugCollector(b.m,bm);
  for(let tick=0;tick<240;tick++){const ai=getBotInputs(a.m,am),bi=getBotInputs(b.m,bm);expect([...bi]).toEqual([...ai]);stepMatch(a.m,ai);stepMatch(b.m,bi);collector.afterTick();expect(b.m.owners).toEqual(a.m.owners);expect(b.m.trailMasks).toEqual(a.m.trailMasks);expect({...b.memory,random:undefined}).toEqual({...a.memory,random:undefined});expect(botDirector(b.m).snapshot()).toEqual(botDirector(a.m).snapshot());}
  expect(a.memory.reposition.sequence).toBeGreaterThan(0);expect(a.memory.random()).toBe(b.memory.random());collector.dispose();
 });
 it('counts A→B→A only after three actual movements, including aborted attempts and excluding unexecuted selections',()=>{
  const row=(sequence:number,attackerId:string,start:number,end:number):RepositionEpisode=>({sequence,lifeId:1,startedTick:sequence*200,endedTick:sequence*200+50,outcome:'ROUTE_LOST',target:sequence,attackerId,distance:14,score:1,startCell:0,endCell:1,start:{x:start,y:0},end:{x:end,y:0},movedCells:3,lastCell:1});
  const rows=[row(1,'A',0,3),row(2,'B',3,0),row(3,'A',0,3)];expect(isRepositionPingPong(rows,30)).toBe(true);
  expect(isRepositionPingPong(rows.map((r,i)=>i===1?{...r,movedCells:0}:r),30)).toBe(false);expect(isRepositionPingPong(rows.map((r,i)=>i===2?{...r,startedTick:1200}:r),30)).toBe(false);expect(isRepositionPingPong(rows.map((r,i)=>i===2?{...r,lifeId:2}:r),30)).toBe(false);
 });
});
describe('relocation physical start preflight',()=>{
 it('HUD observes rejected starts without changing inputs, RNG, memory, world or reservation order',()=>{
  const a=fixture(14,true),b=fixture(14,true);a.a.direction=b.a.direction={x:-1,y:0};
  const am=new Map([[a.a.participantId,a.memory]]),bm=new Map([[b.a.participantId,b.memory]]),collector=new BotDebugCollector(b.m,bm);let rejected=0;
  for(let tick=0;tick<120;tick++){const ai=getBotInputs(a.m,am),bi=getBotInputs(b.m,bm);if(b.memory.reposition.selection?.reason==='PHYSICAL_START_UNSAFE')rejected++;expect([...bi]).toEqual([...ai]);stepMatch(a.m,ai);stepMatch(b.m,bi);collector.afterTick();expect(b.m.owners).toEqual(a.m.owners);expect(b.m.trailMasks).toEqual(a.m.trailMasks);expect({...b.memory,random:undefined}).toEqual({...a.memory,random:undefined});expect(botDirector(b.m).snapshot()).toEqual(botDirector(a.m).snapshot());}
  expect(rejected).toBeGreaterThan(0);expect(a.memory.random()).toBe(b.memory.random());collector.dispose();
 });
 it('rejects an all-owned route when current steering first curves outside, with no cooldown or episode',()=>{
  const f=fixture(14,true);f.a.direction={x:-1,y:0};const obs=observeBot(f.m,f.a.participantId),saved=structuredClone(obs),state=structuredClone(f.memory.reposition);
  const result=f.select();expect(result.reason).toBe('PHYSICAL_START_UNSAFE');expect(result.startChecked).toBeGreaterThan(0);expect(result.startChecked).toBeLessThanOrEqual(8);expect(result.startRejected).toBe(result.startChecked);expect(result.firstStartRejection?.firstCell).not.toBeNull();expect(result.firstStartRejection?.entrySeconds).toBeLessThan(1);
  expect(f.memory.reposition).toEqual(state);expect(obs).toEqual(saved);expect(f.memory.reposition.sequence).toBe(0);
 });
 it('checks score order lazily and caches one forecast per destination across two attackers',()=>{
  const f=fixture();const first=f.select().plan!;
  for(const [id,region]of [...f.memory.emotion.damage.regions]){const n=f.m.map.cells[id].neighbors.find(n=>n>=0&&!f.memory.emotion.damage.regions.has(n));if(n!==undefined)f.memory.emotion.damage.regions.set(n,{...region,attackerId:f.c.participantId});}
  f.memory.emotion.damage.recent.set(f.c.participantId,[{tick:0,cells:6,observedCells:0}]);
  const spy=vi.spyOn(immediateSafety,'evaluateRepositionStartSafety');const checked:number[]=[];spy.mockImplementation((_obs,path)=>{checked.push(path.at(-1)!);return {safe:false,reason:'LEAVES_HOME',firstCell:0,entrySeconds:.1,blocked:false};});
  try{const result=f.select();expect(result.reason).toBe('PHYSICAL_START_UNSAFE');expect(checked[0]).toBe(first.target);expect(checked.length).toBe(result.startChecked);expect(new Set(checked).size).toBe(checked.length);expect(checked.length).toBeLessThanOrEqual(8);}finally{spy.mockRestore();}
 });
 it('chooses the next safe positive plan without forecasting lower ranked plans',()=>{
  const f=fixture(),best=f.select().plan!,original=immediateSafety.evaluateRepositionStartSafety,spy=vi.spyOn(immediateSafety,'evaluateRepositionStartSafety');
  let calls=0;spy.mockImplementation((obs,path)=>{calls++;return path.at(-1)===best.target?{safe:false,reason:'LEAVES_HOME',firstCell:0,entrySeconds:.1,blocked:false}:original(obs,path);});
  try{const result=f.select();expect(result.reason).toBe('SELECTED');expect(result.plan!.target).not.toBe(best.target);expect(result.startRejected).toBe(1);expect(result.startChecked).toBe(2);expect(calls).toBe(2);}finally{spy.mockRestore();}
 });
 it('rejects dead, exposed and non-owned starts, and detects a physical wall obstruction',()=>{
  const f=fixture(),obs=observeBot(f.m,f.a.participantId),path=f.select().plan!.path;
  expect(immediateSafety.evaluateRepositionStartSafety({...obs,actualOwnTrailLength:1},path).reason).toBe('INVALID_START');
  expect(immediateSafety.evaluateRepositionStartSafety({...obs,self:{...obs.self,lifeState:'DEAD_WAIT'}},path).reason).toBe('INVALID_START');
  const owners=obs.owners.slice();owners[obs.self.cellId]=0;expect(immediateSafety.evaluateRepositionStartSafety({...obs,owners},path).reason).toBe('INVALID_START');
  owners.fill(f.a.slot+1);const cell=f.m.map.cells[f.id(28)],edge={...obs,owners,self:{...obs.self,cellId:cell.id,position:{...cell.center},direction:{x:1,y:0}}};expect(immediateSafety.evaluateRepositionStartSafety(edge,[]).reason).toBe('WALL');
 });
});
