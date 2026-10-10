import {describe,it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,type BotDecisionTrace} from '../../src/shared/bot.js';
import {BotReclaimDiagnostics} from '../../src/shared/bot-reclaim-diagnostics.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {neutralizeTerritory,setOwner,addTrail} from '../../src/shared/territory.js';
import {markDead} from '../../src/shared/life.js';
import {runRepeatedTheft} from '../bot-damage-fixture.js';
function fixture(){
 const m=createMatch({mapRadius:5},19,botSpecs(3)),[a,b,c]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants){neutralizeTerritory(m,p);p.protectedUntilTick=0;p.spawnCells.clear();}
 for(const [p,q]of [[a,0],[b,5],[c,-5]] as const){p.cellId=id(q);p.position={...m.map.cells[p.cellId].center};setOwner(m,p.cellId,p.slot+1);}
 setOwner(m,id(1),c.slot+1);setOwner(m,id(1,-1),c.slot+1);
 const memory=createBotMemory(19),memories=new Map([[a.participantId,memory]]),tracker=new BotReclaimDiagnostics(m,memories);
 memory.emotion.damage.regions.set(id(1),{attackerId:b.participantId,tick:0});
 const path=[id(1),id(1,-1),id(0,-1),id(0)];
 const plan={shape:'RHOMBUS' as const,pathLength:4,externalLength:3,captureSize:3,stolenCells:2,earlyClosed:false,response:{baseScore:5,reclaimWeight:1,revengeWeight:0,reclaimRaw:.5,revengeRaw:0,raw:.5,bonus:.5,reclaimCells:1,revengeCells:0,overlapCells:0}};
 const trace:BotDecisionTrace={tick:0,from:'EXPAND',to:'EXPAND',ownTrail:0,attackTarget:null,attacks:[],planChanged:true,reason:'EXPANSION_SCORE',expansionPlan:plan,expansionPath:path};
 tracker.decision(a.participantId,trace);
 const capture=()=>{for(const cell of path.slice(0,-1))addTrail(m,a,cell);applySimultaneousCaptures(m,[a]);};
 return {m,a,b,c,id,tracker,memory,trace,capture};
}
describe('plan-to-recovery diagnostics',()=>{
 it('counts exact reclaimed cells through A→B→C separately from ordinary theft and neutral capture',()=>{
  const f=fixture();expect(f.tracker.snapshot(f.a.participantId).active?.expectedCellIds).toEqual([f.id(1)]);
  f.capture();f.tracker.afterTick();const row=f.tracker.snapshot(f.a.participantId).recent[0];
  expect(row).toMatchObject({outcome:'CAPTURE',actualCellIds:[f.id(1)],otherReclaimCellIds:[],ordinaryStolenCells:1,neutralCells:1,retainedCells:1});
  f.tracker.afterTick();expect(f.tracker.snapshot(f.a.participantId).recent[0]).toEqual(row);f.tracker.dispose();
 });
 it('does not attribute a later attack capture or kill to the interrupted D plan',()=>{
  const f=fixture();f.tracker.decision(f.a.participantId,{...f.trace,expansionPlan:undefined,expansionPath:undefined,to:'ATTACK',reason:'ATTACK_OPPORTUNITY'});
  f.capture();markDead(f.m,f.b,'TRAIL_CUT',f.a,{cause:'TRAIL_CAPTURE',cellId:f.id(1),eventTick:0});f.tracker.afterTick();
  const row=f.tracker.snapshot(f.a.participantId).recent[0];expect(row.outcome).toBe('ATTACK');expect(row.actualCellIds).toEqual([]);expect(row.relatedDeaths).toContainEqual({tick:0,victimId:f.b.participantId,killerId:f.a.participantId,cause:'TRAIL_CAPTURE'});f.tracker.dispose();
 });
 it('keeps the actual third-party killer after the original D plan ends and a new ordinary plan starts',()=>{
  const f=fixture();f.capture();f.tracker.afterTick();f.memory.emotion.damage.regions.clear();
  f.tracker.decision(f.a.participantId,{...f.trace,expansionPlan:{...f.trace.expansionPlan!,response:{...f.trace.expansionPlan!.response!,reclaimRaw:0,bonus:0}}});
  markDead(f.m,f.b,'TRAIL_CUT',f.c,{cause:'TRAIL_CAPTURE',cellId:f.id(1),eventTick:0});f.tracker.afterTick();
  const rows=f.tracker.snapshot(f.a.participantId).recent;expect(rows[0].actualCellIds).toEqual([f.id(1)]);expect(rows[0].relatedDeaths).toContainEqual({tick:0,victimId:f.b.participantId,killerId:f.c.participantId,cause:'TRAIL_CAPTURE'});expect(rows[1].actualCellIds).toEqual([]);f.tracker.dispose();
 });
 it('keeps same-tick acquisition facts even if the bot dies and the recovered cells become neutral',()=>{
  const f=fixture();f.capture();markDead(f.m,f.a,'TRAIL_CUT',f.b);f.tracker.afterTick();const row=f.tracker.snapshot(f.a.participantId).recent[0];
  expect(row).toMatchObject({outcome:'DEATH',actualCellIds:[f.id(1)],retainedCells:0});expect(f.m.owners[f.id(1)]).toBe(0);f.tracker.dispose();
 });
 it('distinguishes early return, a new life and measurement end, and bounds recent plans',()=>{
  const f=fixture();f.tracker.decision(f.a.participantId,{...f.trace,expansionPlan:undefined,to:'RETURN',reason:'EARLY_CLOSURE'});
  expect(f.tracker.snapshot(f.a.participantId).active?.interruptions[0].reason).toBe('EARLY_CLOSURE');
  for(let tick=1;tick<12;tick++){f.m.tick=tick;f.tracker.decision(f.a.participantId,{...f.trace,tick});}
  expect(f.tracker.snapshot(f.a.participantId).recent).toHaveLength(6);f.a.lifeId++;expect(f.tracker.snapshot(f.a.participantId).active).toBeNull();f.tracker.afterTick();
  expect(f.tracker.snapshot(f.a.participantId).recent.at(-1)?.outcome).toBe('LIFE_RESET');f.tracker.decision(f.a.participantId,f.trace);f.tracker.finish();expect(f.tracker.snapshot(f.a.participantId).recent.at(-1)?.outcome).toBe('CENSORED');f.tracker.dispose();
 });
 it('observes real repeated-theft movement without changing world, plans or action RNG',()=>{
  const off=runRepeatedTheft(19,false),on=runRepeatedTheft(19,true);
  expect(on.match).toEqual(off.match);expect(on.plans).toEqual(off.plans);expect(on.memory.random()).toBe(off.memory.random());
  expect(on.diagnosticPlans.some(r=>r.dRaw>0&&r.actualCellIds.length>0)).toBe(true);expect(on.match.participants.every(p=>p.deaths===0)).toBe(true);
 });
});
