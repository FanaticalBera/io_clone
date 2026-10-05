import type {BotDecisionTrace,ExpansionPlan} from '../src/shared/bot.js';
import type {MatchState,Participant} from '../src/shared/model.js';

export interface ExpansionEpisode extends ExpansionPlan {tick:number;lifeId:number;launched:boolean;outsideTicks:number;interrupted:boolean;result?:'CLOSED'|'DIED'|'CANCELLED';actualCapture?:number;actualStolen?:number;actualTurns?:number[];completedAsPlanned?:boolean;deathDuringExcursion?:boolean}
// Authoritative audit only. Candidate labels describe intentions; actualTurns
// records movement so a clipped/early/interrupted plan is never claimed intact.
export class BotExpansionTracker {
 episodes:ExpansionEpisode[]=[];
 generated:Record<string,number>={};accepted:Record<string,number>={};
 private active:ExpansionEpisode|undefined;private cells:number[]=[];private planned:number[]=[];
 before(match:MatchState,p:Participant,trace?:BotDecisionTrace){
  for(const s of trace?.expansionCandidates??[])this.generated[s]=(this.generated[s]??0)+1;
  for(const s of trace?.expansionAccepted??[])this.accepted[s]=(this.accepted[s]??0)+1;
  if(trace?.expansionPlan){if(this.active)this.finish(match,'CANCELLED');
   this.active={...trace.expansionPlan,tick:match.tick,lifeId:p.lifeId,launched:false,outsideTicks:0,interrupted:false};this.cells=[p.cellId];this.planned=[...(trace.expansionPath??[])];this.episodes.push(this.active);
  }
  if(this.active){if(trace?.earlyClosure)this.active.earlyClosed=true;if(trace&&['ATTACK','RETURN','ESCAPE'].includes(trace.to)&&!trace.earlyClosure)this.active.interrupted=true;}
 }
 after(match:MatchState,p:Participant,eventCounter:number,owners:Uint8Array){
  const a=this.active;if(!a)return;
  if(this.cells.at(-1)!==p.cellId)this.cells.push(p.cellId);
  if(p.trailCells.size){a.launched=true;a.outsideTicks++;}
  const events=match.events.filter(e=>Number(e.eventId.split(':').at(-1))>eventCounter&&e.participantId===p.participantId);
  const capture=events.find(e=>e.type==='CAPTURE');
  if(capture){a.launched=true;a.actualCapture=capture.amount??0;a.actualStolen=owners.reduce((sum,o,id)=>sum+Number(o!==0&&o!==p.slot+1&&match.owners[id]===p.slot+1),0);this.finish(match,'CLOSED');}
  else if(p.lifeState!=='ALIVE'||p.lifeId!==a.lifeId){a.deathDuringExcursion=a.launched;this.finish(match,'DIED');}
 }
 private finish(match:MatchState,result:ExpansionEpisode['result']){
  if(!this.active)return;this.active.result=result;this.active.actualTurns=this.cells.slice(1).map((id,i)=>match.map.cells[this.cells[i]].neighbors.indexOf(id)).filter((d,i,all)=>i===0||d!==all[i-1]);this.active.completedAsPlanned=result==='CLOSED'&&this.cells.length===this.planned.length+1&&this.cells.slice(1).every((id,i)=>id===this.planned[i]);this.active=undefined;
 }
}
