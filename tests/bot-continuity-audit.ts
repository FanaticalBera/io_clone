import type {MatchState} from '../src/shared/model.js';
import type {BotMemory,BotObservation,BotDecisionTrace} from '../src/shared/bot.js';
import type {BotChoiceCandidate,BotCandidateBatch} from '../src/shared/bot-candidate-diagnostics.js';
import {hexDistance} from '../src/shared/hex.js';
type History={lifeId:number;tick:number;anchor?:number;victimSlot?:number;victimId?:string;victimLife?:number;damage:boolean};
const key=(c:BotChoiceCandidate|undefined)=>c?JSON.stringify([c.goal,c.slot,c.target,c.expansion?.anchor,c.path]):null;
export function continuityDelta(c:BotChoiceCandidate,eligible:boolean,independent:boolean){
 if(!eligible)return 0;
 const base=c.expansion?.response?.baseScore??c.rawScore??c.score,extra=Math.min(independent?2:1,.1*Math.max(0,base));
 if(c.expansion?.response&&!independent){const d=c.expansion.response;return Math.min(6,.5*Math.max(0,base),d.raw+extra)-d.bonus;}
 return extra*(c.goal==='ATTACK'?(c.reservationFactor??1):1);
}
const counts=()=>({choices:0,withHistory:0,eligibleChoices:0,sharedChanged:0,independentChanged:0,sharedAppliedChanged:0,independentAppliedChanged:0,sharedCappedOut:0,eligibleCandidates:0,zeroCheckMismatches:0});
// Local one-decision reranking only, with baseline trajectories/history fixed.
export class BotContinuityAudit {
 private rows=new Map<string,ReturnType<typeof counts>>();private history=new Map<string,History>();private active=new Map<string,History>();
 private ordinary=new Map<string,readonly BotChoiceCandidate[]>();private pending=new Map<string,{actual:BotChoiceCandidate;shared:boolean;independent:boolean}>();
 readonly examples:{slot:number;tick:number;actual:string|null;shared:string|null;independent:string|null}[]=[];
 constructor(private match:MatchState,private memories:ReadonlyMap<string,BotMemory>,watch:(m:BotMemory,f:(obs:BotObservation,b:BotCandidateBatch)=>void)=>()=>void,private safe:(obs:BotObservation,path:number[],goal:BotChoiceCandidate['goal'])=>{blocked:boolean}){
  for(const [id,m]of memories){this.rows.set(id,counts());watch(m,(obs,b)=>this.candidates(id,obs,b));}
 }
 private eligible(id:string,obs:BotObservation,c:BotChoiceCandidate){
  const h=this.history.get(id);if(!h||h.lifeId!==obs.self.lifeId||obs.tick-h.tick>6*obs.config.simulationHz)return false;
  if(c.expansion)return h.damage&&h.anchor!==undefined&&c.expansion.anchor!==undefined&&(c.expansion.response?.reclaimCells??0)>0&&hexDistance(obs.map.cells[h.anchor],obs.map.cells[c.expansion.anchor])<=3;
  return c.goal==='ATTACK'&&c.slot===h.victimSlot&&obs.roster?.some(p=>p.slot===h.victimSlot&&p.participantId===h.victimId&&p.lifeId===h.victimLife&&p.lifeState==='ALIVE')===true;
 }
 private candidates(id:string,obs:BotObservation,b:BotCandidateBatch){
  if(b.kind==='ATTACK'){if(!b.interrupt)this.ordinary.set(id,b.candidates);return;}
  const row=this.rows.get(id)!,actual=b.candidates[b.selectedIndex];row.choices++;
  const h=this.history.get(id);if(h&&h.lifeId===obs.self.lifeId&&obs.tick-h.tick<=6*obs.config.simulationHz)row.withHistory++;
  const attacks=this.ordinary.get(id)??[],others=b.candidates.filter(c=>c.goal!=='ATTACK');
  const all=[...attacks,...others],eligible=all.filter(c=>this.eligible(id,obs,c));
  row.eligibleCandidates+=eligible.length;if(eligible.length)row.eligibleChoices++;
  row.sharedCappedOut+=eligible.filter(c=>continuityDelta(c,true,false)<=0).length;
  const rank=(variant:'ZERO'|'SHARED'|'INDEPENDENT')=>{
   const score=(c:BotChoiceCandidate)=>c.score+(variant==='ZERO'?0:continuityDelta(c,this.eligible(id,obs,c),variant==='INDEPENDENT'));
   const attack=[...attacks].sort((a,b)=>score(b)-score(a))[0];
   const pool=[...(attack?[{...attack,ordinal:0}]:[]),...others];
   pool.sort((a,b)=>score(b)-score(a)||(a.ordinal??0)-(b.ordinal??0));
   return pool.find(c=>!this.safe(obs,[...c.path],c.goal).blocked);
  };
  const zero=rank('ZERO');if(key(zero)!==key(actual))row.zeroCheckMismatches++;
  const shared=rank('SHARED'),independent=rank('INDEPENDENT'),changedShared=key(shared)!==key(actual),changedIndependent=key(independent)!==key(actual);
  if(changedShared)row.sharedChanged++;if(changedIndependent)row.independentChanged++;
  if(actual)this.pending.set(id,{actual,shared:changedShared,independent:changedIndependent});
  if(changedShared||changedIndependent)this.examples.push({slot:obs.self.slot,tick:obs.tick,actual:key(actual),shared:key(shared),independent:key(independent)});
 }
 beforeTick(){this.pending.clear();for(const p of this.match.participants){const h=this.history.get(p.participantId);if(h&&(p.lifeId!==h.lifeId||p.lifeState!=='ALIVE'||this.match.tick-h.tick>6*this.match.config.simulationHz))this.history.delete(p.participantId);}}
 afterInputs(traces:ReadonlyMap<string,BotDecisionTrace>){
  for(const p of this.match.participants){const id=p.participantId,m=this.memories.get(id)!,t=traces.get(id),pending=this.pending.get(id);
   if(pending&&m.goal===pending.actual.goal&&(m.goal!=='ATTACK'||m.attackSlot===pending.actual.slot&&m.attackTarget===pending.actual.target)){
    const row=this.rows.get(id)!;if(pending.shared)row.sharedAppliedChanged++;if(pending.independent)row.independentAppliedChanged++;
   }
   if(t?.safetyOverride)this.active.delete(id);
   if(t?.expansionPlan&&['EXPAND','STEAL'].includes(m.goal))this.active.set(id,{lifeId:p.lifeId,tick:this.match.tick,anchor:t.expansionPlan.anchor,damage:(t.expansionPlan.response?.reclaimCells??0)>0});
   else if(m.goal==='ATTACK'&&['ATTACK_SCORE','ATTACK_OPPORTUNITY','COUNTER_STRIKE'].includes(t?.reason??'')){
    const victim=this.match.participants.find(q=>q.slot===m.attackSlot);this.active.set(id,{lifeId:p.lifeId,tick:this.match.tick,victimSlot:m.attackSlot??undefined,victimId:victim?.participantId,victimLife:victim?.lifeId,damage:false});
   }
  }
 }
 afterTick(captured:ReadonlySet<string>){for(const p of this.match.participants){const id=p.participantId,a=this.active.get(id);
  if(p.lifeState!=='ALIVE'||a&&a.lifeId!==p.lifeId){this.active.delete(id);this.history.delete(id);continue;}
  if(captured.has(id)&&a){if(a.damage||a.victimSlot!==undefined)this.history.set(id,{...a,tick:this.match.tick});else this.history.delete(id);this.active.delete(id);}
 }}
 snapshot(){return {participants:this.match.participants.map(p=>({slot:p.slot,personality:p.personality,...this.rows.get(p.participantId)!})),examples:this.examples};}
}
