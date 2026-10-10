import {describe,it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,type BotDecisionTrace} from '../../src/shared/bot.js';
import {markDead} from '../../src/shared/life.js';
import {neutralizeTerritory,setOwner,addTrail} from '../../src/shared/territory.js';
import {ExpansionEpisodeTracker,TerritoryDistances} from '../bot-phase025-plan-tracker.js';
import {BotGrowthTracker} from '../bot-growth-tracker.js';
function fixture(){
 const m=createMatch({mapRadius:8},19,botSpecs(2)),[a,b]=m.participants;
 for(const p of m.participants)neutralizeTerritory(m,p);
 const id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 a.cellId=id(0);b.cellId=id(4);for(const p of m.participants){p.position={...m.map.cells[p.cellId].center};setOwner(m,p.cellId,p.slot+1);}
 const memory=createBotMemory(19);memory.emotion.grudge.set(b.participantId,{amount:5,tick:0} as any);
 const tracker=new ExpansionEpisodeTracker(m,19);
 const trace:BotDecisionTrace={tick:0,from:'EXPAND',to:'EXPAND',ownTrail:0,attackTarget:null,attacks:[],
  expansionPlan:{shape:'RHOMBUS',pathLength:3,externalLength:2,captureSize:4,stolenCells:0,earlyClosed:false,
   response:{baseScore:4,reclaimWeight:2,revengeWeight:0,reclaimRaw:1,revengeRaw:0,raw:1,bonus:1,reclaimCells:2,revengeCells:0,overlapCells:0}},
  expansionPath:[id(1),id(2),id(0)]};
 return {m,a,b,id,memory,tracker,trace};
}
describe('audit expansion provenance and territory distance',()=>{
 it('keeps escape/return attached to the original expansion and records the trail before death clearing',()=>{
  const f=fixture();const growth=new BotGrowthTracker(f.m,t=>f.tracker.death(t,f.memory));
  f.tracker.before(f.a,f.memory,f.trace);f.m.tick=1;f.a.cellId=f.id(1);addTrail(f.m,f.a,f.id(1));f.tracker.after(f.a,false);
  f.m.tick=2;f.memory.goal='ESCAPE';f.tracker.before(f.a,f.memory);f.tracker.after(f.a,false);
  markDead(f.m,f.a,'TRAIL_CUT',f.b,{cause:'EXISTING_TRAIL_CONTACT',cellId:f.id(1)});
  const result=f.tracker.finish();expect(result.episodes[0]).toMatchObject({outcome:'DEATH',launchedTick:1,escape:true,attackInterrupted:false,terminalLineCells:1,terminalDistances:{grudge:3,killer:3}});
  expect(f.a.trailCells.size).toBe(0);growth.after(0);expect(growth.snapshot().participants[0].deathResetLoss).toBe(1);growth.dispose();
 });
 it('marks an attack interruption, then closes on capture so stale expansion data cannot label the next death',()=>{
  const f=fixture();const growth=new BotGrowthTracker(f.m,t=>f.tracker.death(t,f.memory));
  f.tracker.before(f.a,f.memory,f.trace);f.m.tick=1;f.a.cellId=f.id(1);addTrail(f.m,f.a,f.id(1));f.tracker.after(f.a,false);
  f.m.tick=2;f.memory.goal='ATTACK';f.memory.expansion=f.trace.expansionPlan;f.tracker.before(f.a,f.memory);
  f.a.trailCells.clear();f.a.cellId=f.id(0);f.tracker.after(f.a,true);markDead(f.m,f.a,'TRAIL_CUT',f.b);
  const result=f.tracker.finish();expect(result.episodes[0]).toMatchObject({outcome:'CAPTURE',attackInterrupted:true,attackTick:2});
  expect(result.deathLinks[0]).toMatchObject({episodeId:null,rememberedBonus:1,attributedBonus:null});growth.dispose();
 });
 it('separates selected candidates from launched plans and records censoring',()=>{
  const f=fixture();f.tracker.before(f.a,f.memory,f.trace);f.m.tick=1;f.tracker.before(f.a,f.memory,f.trace);
  f.m.tick=2;f.a.cellId=f.id(1);addTrail(f.m,f.a,f.id(1));f.tracker.after(f.a,false);
  expect(f.tracker.finish().episodes.map(r=>[r.outcome,r.launchedTick])).toEqual([['REPLANNED',null],['CENSORED',2]]);
 });
 it('computes exact minimum hex distance from public ownership, handles touching and absent owners, and invalidates changed ownership',()=>{
  const f=fixture(),d=new TerritoryDistances(f.m);
  expect(d.minimum([f.id(1),f.id(2)],[f.b.slot])).toBe(2);expect(d.minimum([f.id(4)],[f.b.slot])).toBe(0);
  expect(d.minimum([],[f.b.slot])).toBeNull();expect(d.minimum([f.id(1)],[7])).toBeNull();
  setOwner(f.m,f.id(2),f.b.slot+1);d.invalidate();expect(d.minimum([f.id(1)],[f.b.slot])).toBe(1);
 });
});
