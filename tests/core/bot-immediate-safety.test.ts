import {it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,observeBot,createBotMemory,getBotInput,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {evaluateDepartureSafety,selectOwnedDepartureFallback,projectDeparture,departurePrefilterCells,recordDepartureSafety,expansionPerimeterBlocked} from '../../src/shared/bot-immediate-safety.js';
import {stepMatch} from '../../src/shared/game.js';
import {getBotInputs} from '../../src/shared/bot-director.js';
import {botSeed,createBotIdentity} from '../../src/shared/bot-identity.js';
import {watchBotCandidates} from '../../src/shared/bot-candidate-diagnostics.js';
import {BotDepartureDiagnostics} from '../../src/shared/bot-departure-diagnostics.js';
function fixture(){const m=createMatch({mapRadius:22},73,botSpecs(3)),p=m.participants[0],id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 m.owners.fill(0);for(const c of m.map.cells)if(c.q<=0)m.owners[c.id]=p.slot+1;
 p.cellId=id(0);p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};p.trailCells.clear();
 const e=m.participants[1];e.cellId=id(4);e.position={...m.map.cells[e.cellId].center};e.direction={x:-1,y:0};m.participants[2].lifeState='DEAD_WAIT';
 return {m,p,e,id,path:[id(1),id(2),id(2,-1),id(1,-1),id(0)],obs:()=>observeBot(m,p.participantId)};
}
it('predicts the recorded seed 4 wall override without consuming waypoints, and leaves other goals alone',()=>{
 const m=createMatch({mapRadius:56},4,botSpecs(1)),p=m.participants[0];
 p.position={x:1811.4682884654612,y:2052.654988326184};p.direction={x:.8283841663547362,y:.5601603992900327};
 p.cellId=m.map.cells.reduce((best,c)=>Math.hypot(c.center.x-p.position.x,c.center.y-p.position.y)<Math.hypot(best.center.x-p.position.x,best.center.y-p.position.y)?c:best).id;
 m.owners.fill(p.slot+1);const path=[8756,8686,8614,8541,8467],o=observeBot(m,p.participantId),before=[...path];
 expect(expansionPerimeterBlocked(o,path,'EXPAND')).toBe(true);expect(path).toEqual(before);
 for(const goal of ['ATTACK','RETURN','REPOSITION'] as const)expect(expansionPerimeterBlocked(o,path,goal)).toBe(false);
 const memory=createBotMemory(1);memory.plannedLifeId=p.lifeId;memory.path=[...path];memory.goal='EXPAND';memory.nextDecisionTick=100;memory.schedule!.nextTacticalTick=100;memory.random=()=>{throw Error('RNG');};
 let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});getBotInput(o,memory);expect(trace?.reason).toBe('PERIMETER_GUARD');expect(memory.goal).toBe('RETURN');
 const interior=fixture().obs();expect(expansionPerimeterBlocked(interior,[], 'EXPAND')).toBe(false);
});
it('selects a different executable expansion when the launch-safe top candidate would immediately hit the wall guard',()=>{
 const seed=19,m=createMatch({mapRadius:56,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));
 const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
 let replacements=0;const pending=new Set<string>();
 for(const [id,memory] of memories)watchBotCandidates(memory,(obs,batch)=>{
  if(batch.kind!=='STRATEGY')return;const old=batch.candidates.find(c=>!evaluateDepartureSafety(obs,c.path,c.goal).blocked),chosen=batch.candidates[batch.selectedIndex];
  if(chosen)expect(expansionPerimeterBlocked(obs,chosen.path,chosen.goal)).toBe(false);
  if(old&&expansionPerimeterBlocked(obs,old.path,old.goal)&&chosen?.expansion)pending.add(id);
 });
 for(let t=0;t<60;t++){pending.clear();const inputs=getBotInputs(m,memories);for(const id of pending){expect(['EXPAND','STEAL']).toContain(memories.get(id)!.goal);expect(inputs.has(id)).toBe(true);replacements++;}stepMatch(m,inputs);}
 expect(replacements).toBeGreaterThan(0);
});
it('uses a speed-scaled 8-cell filter at the faster pace and catches public one-second overlap beyond the current 2-cell gate',()=>{const {obs,path}=fixture(),o=obs(),r=evaluateDepartureSafety(o,path,'STEAL');expect(departurePrefilterCells(o)).toBe(8);expect(r.blocked).toBe(true);expect(r.reason).toBe('PREDICTED_OVERLAP');expect(r.enemySlot).toBe(1);});
it('uses swept physical exposure, not a nominal path cell, and predicts an owned fallback',()=>{const {obs,path}=fixture(),o=obs(),r=projectDeparture(o,path,'STEAL');expect(r.firstCell).not.toBeNull();const fallback=selectOwnedDepartureFallback(o);expect(fallback).not.toBeNull();expect(projectDeparture(o,fallback!,'RETURN',true).allOwned).toBe(true);});
it('retains all visible heads on light observations and ignores hidden inputs and out-of-range heads',()=>{const {m,p,e,path,id}=fixture(),before=evaluateDepartureSafety(observeBot(m,p.participantId,'combined',true),path,'STEAL');e.targetDirection={x:0,y:1};e.lastAppliedInputSeq=999;expect(evaluateDepartureSafety(observeBot(m,p.participantId,'combined',true),path,'STEAL')).toEqual(before);e.cellId=id(15);e.position={...m.map.cells[e.cellId].center};expect(evaluateDepartureSafety(observeBot(m,p.participantId,'combined',true),path,'STEAL').blocked).toBe(false);});
it('blocks between decisions, clears stale expansion attribution, and consumes no RNG or strategy slot',()=>{const {m,p,path}=fixture(),memory=createBotMemory(1);memory.plannedLifeId=p.lifeId;memory.path=path;memory.goal='STEAL';memory.nextDecisionTick=6;memory.schedule!.nextTacticalTick=6;memory.random=()=>{throw Error('RNG');};memory.expansion={shape:'RHOMBUS',pathLength:5,externalLength:4,captureSize:4,stolenCells:4,earlyClosed:false};let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});getBotInput(observeBot(m,p.participantId,'combined',true),memory);expect(memory.goal).toBe('RETURN');expect(memory.expansion).toBeUndefined();expect(memory.nextDecisionTick).toBe(6);expect(trace?.reason).toBe('LAUNCH_BLOCKED');expect(trace?.expansionPlan).toBeUndefined();});
it('does not gate attacks, exposed trails, or quiet expansion',()=>{const {obs,path}=fixture(),o=obs();expect(evaluateDepartureSafety(o,path,'ATTACK').blocked).toBe(false);o.ownTrail=[path[0]];expect(evaluateDepartureSafety(o,path,'STEAL').blocked).toBe(false);o.ownTrail=[];o.others=[];expect(evaluateDepartureSafety(o,path,'EXPAND').skipped).toBe(true);});
it('records attempts separately from candidate rejections and resets streak only on real departure/life change',()=>{const memory={},d=new BotDepartureDiagnostics(new Map([['a',memory]]),30),result=evaluateDepartureSafety(fixture().obs(),fixture().path,'STEAL');recordDepartureSafety(memory,{type:'tick',tick:0,lifeId:1,alive:true,outside:false});for(let i=0;i<3;i++)recordDepartureSafety(memory,{type:'block',tick:i,result,fallback:[0]});recordDepartureSafety(memory,{type:'candidate',tick:3,result});expect(d.snapshot('a',1800)?.blocksPerMatchMinute).toBe(3);expect(d.snapshot('a',1800)?.maxConsecutiveBlocks).toBe(3);expect(d.snapshot('a',1800)?.candidateRejected).toBe(1);recordDepartureSafety(memory,{type:'tick',tick:4,lifeId:1,alive:true,outside:true});expect(d.snapshot('a',1800)?.consecutiveBlocks).toBe(0);recordDepartureSafety(memory,{type:'tick',tick:5,lifeId:2,alive:true,outside:false});expect(d.snapshot('a',1800)?.lastBlock).toBeNull();d.dispose();});
it('has no safe owned route when every swept turn leaves a one-cell island',()=>{const {m,p,obs}=fixture();m.owners.fill(0);m.owners[p.cellId]=p.slot+1;expect(selectOwnedDepartureFallback(obs())).toBeNull();});

it('never selects an expansion candidate that the same immediate predictor blocks',()=>{const {m,p}=fixture();for(let tick=0;tick<12;tick++){const memory=createBotMemory(tick+1);let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});const o=observeBot(m,p.participantId);getBotInput(o,memory);if(trace?.expansionPlan)expect(evaluateDepartureSafety(o,trace.expansionPath!,trace.to).blocked).toBe(false);} });

it('light observations retain a second threatening head and a real trail prevents false departure gating',()=>{const {m,p,e,id,path}=fixture();e.cellId=id(10);e.position={...m.map.cells[e.cellId].center};const second=m.participants[2];second.lifeState='ALIVE';second.cellId=id(4);second.position={...m.map.cells[second.cellId].center};second.direction={x:-1,y:0};const o=observeBot(m,p.participantId,'combined',true);expect(o.departureHeads?.map(p=>p.slot)).toEqual([1,2]);expect(evaluateDepartureSafety(o,path,'STEAL').enemySlot).toBe(2);p.trailCells.add(id(1));expect(evaluateDepartureSafety(observeBot(m,p.participantId,'combined',true),path,'STEAL').blocked).toBe(false);});
it('invalidates temporary owned patrol when ownership changes without forcing a strategy tick',()=>{const {m,p,path}=fixture(),memory=createBotMemory(1);memory.plannedLifeId=p.lifeId;memory.nextDecisionTick=6;memory.schedule!.nextTacticalTick=6;memory.goal='RETURN';memory.path=[path[0]];memory.departureOwned=true;getBotInput(observeBot(m,p.participantId,'combined',true),memory);expect(memory.departureOwned).toBe(false);expect(memory.path).toEqual([]);expect(memory.nextDecisionTick).toBe(6);});
it('records no-owned-route without forcing a sharp turn or retaining an expansion',()=>{const {m,p,path}=fixture();m.owners.fill(0);m.owners[p.cellId]=p.slot+1;const memory=createBotMemory(1);memory.plannedLifeId=p.lifeId;memory.nextDecisionTick=6;memory.schedule!.nextTacticalTick=6;memory.path=path;memory.goal='STEAL';let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});const input=getBotInput(observeBot(m,p.participantId,'combined',true),memory);expect(trace?.reason).toBe('LAUNCH_NO_SAFE_OWNED_ROUTE');expect(memory.path).toEqual([]);expect(input?.dx).toBe(p.direction.x);expect(input?.dy).toBe(p.direction.y);});

it('checks physical departure even after the last strategic waypoint is consumed',()=>{const {obs,m,p}=fixture();expect(evaluateDepartureSafety(obs(),[],'STEAL').blocked).toBe(true);const memory=createBotMemory(1);memory.plannedLifeId=p.lifeId;memory.path=[];memory.goal='STEAL';memory.nextDecisionTick=6;memory.schedule!.nextTacticalTick=6;getBotInput(observeBot(m,p.participantId,'combined',true),memory);expect(memory.goal).toBe('RETURN');expect(memory.departureOwned).toBe(true);expect(memory.nextDecisionTick).toBe(6);});
