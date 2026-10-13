import {it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {createBotMemory,botSpecs,type BotDecisionTrace} from '../../src/shared/bot.js';
import {setOwner} from '../../src/shared/territory.js';
import {BotPlanTransitionTracker} from '../bot-plan-transition-tracker.js';

function fixture(){
 const match=createMatch({mapRadius:8,spawnRadius:1},19,botSpecs(2,0,'bot',{seed:19})),p=match.participants[0],m=createBotMemory(19);
 const next=match.map.cells[p.cellId].neighbors.find(id=>id>=0)!;setOwner(match,next,p.slot+1);m.path=[next];m.plannedLifeId=p.lifeId;m.lastCell=p.cellId;
 match.participants[1].cellId=next;
 const memories=new Map([[p.participantId,m]]),tracker=new BotPlanTransitionTracker(match);
 const choose=(tick:number,anchor:number,reason='EXPANSION_SCORE',safety=false)=>{
  match.tick=tick;tracker.beforeTick(memories);
  const t:BotDecisionTrace={tick,from:m.goal,to:m.goal,ownTrail:0,attackTarget:null,attacks:[],reason,safetyOverride:safety?reason:undefined,expansionPlan:{anchor,shape:'RHOMBUS',pathLength:4,externalLength:2,captureSize:2,stolenCells:0,earlyClosed:false}};
  tracker.afterInputs(memories,new Map([[p.participantId,t]]));
 };
 return {match,p,m,memories,tracker,choose,row:()=>tracker.snapshot().participants[0]};
}
it('counts a same-life A→B→A and separates eligible early voluntary switches from safety',()=>{
 const f=fixture();f.choose(0,10);f.choose(6,11);f.choose(12,10);
 expect(f.row()).toMatchObject({wouldBlock:2,targetABA:1,voluntaryTargetABA:1,nearReplacements:2});
 f.choose(15,12,'DANGER',true);expect(f.row().wouldBlock).toBe(2);
});
it('does not call completed plans or the 600ms boundary a blocked voluntary transition',()=>{
 const f=fixture();f.choose(0,10);f.choose(18,11);expect(f.row().wouldBlock).toBe(0);
 f.m.path=[];f.choose(20,10);expect(f.row()).toMatchObject({wouldBlock:0,targetABA:1,voluntaryTargetABA:0});
});
it('limits A→B→A to two seconds and clears history on a new life',()=>{
 const f=fixture();f.choose(0,10);f.choose(30,11);f.choose(61,10);expect(f.row().targetABA).toBe(0);
 f.p.lifeId++;f.m.plannedLifeId=f.p.lifeId;f.choose(62,11);f.choose(63,10);expect(f.row().targetABA).toBe(0);
});
it('does not label damage invalidation or reposition arrival as voluntary plan churn',()=>{
 for(const event of ['DAMAGE_GONE','ARRIVED'] as const){
  const f=fixture();f.choose(0,10);f.match.tick=6;f.tracker.beforeTick(f.memories);
  f.tracker.afterInputs(f.memories,new Map([[f.p.participantId,{tick:6,from:'REPOSITION',to:'EXPAND',ownTrail:0,attackTarget:null,attacks:[],reason:'EXPANSION_SCORE',repositionEvent:event,expansionPlan:{anchor:11,shape:'RHOMBUS',pathLength:4,externalLength:2,captureSize:2,stolenCells:0,earlyClosed:false}}]]));
  expect(f.row()).toMatchObject({wouldBlock:0,nearVoluntaryReplacements:0});
  if(event==='ARRIVED')expect(f.row().replacements).toBe(0);
 }
});
