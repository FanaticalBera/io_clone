import type {BotMemory,BotDecisionTrace} from '../src/shared/bot.js';
import type {MatchState} from '../src/shared/model.js';
import {hexDistance} from '../src/shared/hex.js';

type Kind='EXPANSION'|'ATTACK'|'POINT'|'REPOSITION';
type Change='INITIAL'|'COMPLETE'|'INVALID'|'SAFETY'|'INTERRUPT'|'VOLUNTARY';
interface Plan {tick:number;lifeId:number;key:string;kind:Kind}
interface Switch {tick:number;key:string;change:Change}
interface Before {alive:boolean;lifeId:number;near:boolean;unfinished:boolean;valid:boolean;goal:string}
const newCounts=()=>({aliveFrames:0,nearFrames:0,planStarts:0,nearPlanStarts:0,discardedSelections:0,replacements:0,nearReplacements:0,nearVoluntaryReplacements:0,earlyValidTransitions:0,earlyInterruptExempt:0,earlyDifferentLevel:0,earlySameTarget:0,wouldBlock:0,targetABA:0,voluntaryTargetABA:0,modeABA:0,voluntaryModeABA:0});

// Audit-only counterfactual eligibility, not a replay with a hold policy enabled.
// No observation/policy calls, bot memory writes or RNG draws.
export class BotPlanTransitionTracker {
 private rows=new Map<string,ReturnType<typeof newCounts>>();
 private before=new Map<string,Before>();private active=new Map<string,Plan>();
 private targets=new Map<string,Switch[]>();private modes=new Map<string,Switch[]>();private lives=new Map<string,number>();
 readonly cases:{slot:number;tick:number;type:'TARGET'|'MODE';changes:Switch[]}[]=[];
 readonly holdCases:{slot:number;tick:number;ageTicks:number;from:string;to:string;change:Change;wouldBlock:boolean}[]=[];
 constructor(private match:MatchState){for(const p of match.participants)this.rows.set(p.participantId,newCounts());}
 beforeTick(memories:ReadonlyMap<string,BotMemory>){
  this.before.clear();
  for(const p of this.match.participants){const m=memories.get(p.participantId);if(!m)continue;
   if(this.lives.get(p.participantId)!==p.lifeId){this.death(p.participantId);this.targets.delete(p.participantId);this.modes.delete(p.participantId);this.lives.set(p.participantId,p.lifeId);}
   const alive=p.lifeState==='ALIVE',origin=this.match.map.cells[p.cellId];
   const near=alive&&this.match.participants.some(q=>q!==p&&q.lifeState==='ALIVE'&&hexDistance(origin,this.match.map.cells[q.cellId])<=Math.min(6,this.match.config.botObservationRange));
   const atHome=this.match.owners[p.cellId]===p.slot+1;
   const unfinished=m.path.length>0&&!(atHome&&!p.trailCells.size&&m.path.every(id=>id===p.cellId));
   const homeLost=m.path.length>0&&this.match.owners[m.path.at(-1)!]!==p.slot+1;
   const victim=m.goal==='ATTACK'?this.match.participants.find(q=>q.slot===m.attackSlot):undefined;
   const targetPresent=m.goal!=='ATTACK'||!!victim&&victim.lifeState==='ALIVE'&&m.attackTarget!==null&&victim.trailCells.has(m.attackTarget)&&hexDistance(origin,this.match.map.cells[m.attackTarget])<=this.match.config.botObservationRange;
   const progressTick=m.lastCell!==p.cellId?this.match.tick:m.lastProgressTick;
   const valid=alive&&p.lifeId===m.plannedLifeId&&unfinished&&!homeLost&&targetPresent&&this.match.tick-progressTick<2*this.match.config.simulationHz;
   this.before.set(p.participantId,{alive,lifeId:p.lifeId,near,unfinished,valid,goal:m.goal});
   if(alive){const row=this.rows.get(p.participantId)!;row.aliveFrames++;if(near)row.nearFrames++;}
  }
 }
 private push(id:string,slot:number,key:string,change:Change,type:'TARGET'|'MODE'){
  const table=type==='TARGET'?this.targets:this.modes,row=this.rows.get(id)!,history=table.get(id)??[];
  if(history.at(-1)?.key===key)return;
  const entry={tick:this.match.tick,key,change};history.push(entry);if(history.length>3)history.shift();table.set(id,history);
  if(history.length===3&&history[0].key===history[2].key&&history[0].key!==history[1].key&&history[2].tick-history[0].tick<=2*this.match.config.simulationHz){
   const voluntary=history[1].change==='VOLUNTARY'&&history[2].change==='VOLUNTARY';
   if(type==='TARGET'){row.targetABA++;if(voluntary)row.voluntaryTargetABA++;}else{row.modeABA++;if(voluntary)row.voluntaryModeABA++;}
   this.cases.push({slot,tick:this.match.tick,type,changes:history.map(e=>({...e}))});
  }
 }
 afterInputs(memories:ReadonlyMap<string,BotMemory>,traces:ReadonlyMap<string,BotDecisionTrace>){
  for(const p of this.match.participants){const id=p.participantId,m=memories.get(id),b=this.before.get(id);if(!m||!b?.alive)continue;
   const trace=traces.get(id),row=this.rows.get(id)!,old=this.active.get(id);
   const safety=!!trace?.safetyOverride||!!trace?.earlyClosure;
   const rpEnd=trace?.repositionEvent;
   const change:Change=safety?'SAFETY':rpEnd==='ARRIVED'||!b.unfinished?'COMPLETE':rpEnd&&rpEnd!=='ATTACK'||!b.valid?'INVALID':rpEnd==='ATTACK'||trace?.reason==='ATTACK_OPPORTUNITY'?'INTERRUPT':'VOLUNTARY';
   this.push(id,p.slot,m.goal,this.modes.has(id)?change:'INITIAL','MODE');
   let kind:Kind|undefined,key:string|undefined;
   if(trace?.expansionPlan&&['EXPAND','STEAL'].includes(m.goal)){kind='EXPANSION';key='BOUNDARY:'+trace.expansionPlan.anchor;}
   else if(m.goal==='ATTACK'&&['ATTACK_SCORE','ATTACK_OPPORTUNITY','COUNTER_STRIKE'].includes(trace?.reason??'')){
    const victim=this.match.participants.find(q=>q.slot===m.attackSlot);kind='ATTACK';key='VICTIM:'+m.attackSlot+':'+victim?.lifeId;
   }else if(m.goal==='REPOSITION'&&trace?.reason==='REPOSITION_START'&&m.reposition.active){kind='REPOSITION';key='DAMAGE:'+m.reposition.active.attackerId+':'+m.reposition.active.target;}
   else if(m.goal==='SEEK_POINT'&&trace?.reason==='POINT_SCORE'){kind='POINT';key='POINT:'+m.path.find(cell=>this.match.map.controlPoints.some(cp=>cp.cellId===cell));}
   if(trace?.expansionPlan&&!kind)row.discardedSelections++;
   if(kind&&key){
    row.planStarts++;if(b.near)row.nearPlanStarts++;
    if(old&&b.unfinished&&change!=='COMPLETE'){
     row.replacements++;if(b.near){row.nearReplacements++;if(change==='VOLUNTARY')row.nearVoluntaryReplacements++;}
     const age=this.match.tick-old.tick,window=old.kind==='ATTACK'?Math.round(.3*this.match.config.simulationHz):old.kind==='REPOSITION'?0:Math.round(.6*this.match.config.simulationHz);
     if(age<window&&b.valid&&!safety&&(change==='VOLUNTARY'||change==='INTERRUPT')){
      row.earlyValidTransitions++;
      const sameTarget=old.key===key,sameLevel=old.kind===kind,interrupt=change==='INTERRUPT';
      const wouldBlock=!interrupt&&sameLevel&&!sameTarget;
      if(interrupt)row.earlyInterruptExempt++;else if(!sameLevel)row.earlyDifferentLevel++;else if(sameTarget)row.earlySameTarget++;else row.wouldBlock++;
      this.holdCases.push({slot:p.slot,tick:this.match.tick,ageTicks:age,from:old.key,to:key,change,wouldBlock});
     }
    }
    this.push(id,p.slot,key,old?change:'COMPLETE','TARGET');this.active.set(id,{tick:this.match.tick,lifeId:p.lifeId,key,kind});
   }else if(old&&(safety||!['EXPAND','STEAL','ATTACK','SEEK_POINT','REPOSITION'].includes(m.goal)||!m.path.length)){
    if(b.unfinished){row.replacements++;if(b.near)row.nearReplacements++;}this.active.delete(id);
   }
  }
 }
 death(id:string){this.active.delete(id);this.targets.delete(id);this.modes.delete(id);}
 afterTick(captured:ReadonlySet<string>){for(const p of this.match.participants)if(p.lifeState!=='ALIVE')this.death(p.participantId);else if(captured.has(p.participantId))this.active.delete(p.participantId);}
 snapshot(){return {participants:this.match.participants.map(p=>{const c=this.rows.get(p.participantId)!;return {slot:p.slot,personality:p.personality,...c,nearSeconds:c.nearFrames/this.match.config.simulationHz,nearReplacementsPerNearMinute:c.nearFrames?c.nearReplacements*this.match.config.simulationHz*60/c.nearFrames:null,nearVoluntaryPerNearMinute:c.nearFrames?c.nearVoluntaryReplacements*this.match.config.simulationHz*60/c.nearFrames:null};}),holdCases:this.holdCases,abaCases:this.cases};}
}
