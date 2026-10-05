import type {MatchState,Participant} from '../src/shared/model.js';
import type {BotMemory,BotDecisionTrace} from '../src/shared/bot.js';

export interface AttackEpisode {tick:number;lifeId:number;slot:number;victimLife:number;target:number;distance:number;result?:string;endTick?:number;returnedAlive:boolean;diedDuringAttack:boolean;successfulCut:boolean}
export function summarizeAttackEpisodes(episodes:AttackEpisode[]){
 const count=(test:(e:AttackEpisode)=>boolean)=>episodes.filter(test).length,successfulKills=count(e=>e.result==='SUCCESS_KILL');
 return {attackAttempts:episodes.length,successfulKills,successfulCuts:count(e=>e.successfulCut),returnedAlive:count(e=>e.returnedAlive),diedDuringAttack:count(e=>e.diedDuringAttack),abortedAttack:count(e=>!!e.result&&e.result!=='SUCCESS_KILL'&&e.result!=='DIED_DURING_ATTACK'),unfinished:count(e=>!e.result),attackSuccessRate:episodes.length?successfulKills/episodes.length:0};
}
// Audit only: correlate authoritative events, never feed hidden state into AI.
export class BotOutcomeTracker {
 episodes:AttackEpisode[]=[];
 private active:AttackEpisode|undefined;
 private returning:AttackEpisode[]=[];
 private previous:{goal:BotMemory['goal'];slot:number|null;lifeId:number}|undefined;
 before(match:MatchState,p:Participant,memory:BotMemory,trace?:BotDecisionTrace){
  const entered=this.previous?.goal!=='ATTACK'||this.previous.slot!==memory.attackSlot||this.previous.lifeId!==p.lifeId;
  this.previous={goal:memory.goal,slot:memory.attackSlot,lifeId:p.lifeId};
  if(this.active&&(memory.goal!=='ATTACK'||memory.attackSlot!==this.active.slot))this.finish(match.tick,
   trace?.exitReason==='DANGER'?'DANGER_ABORT':trace?.exitReason==='HOME_ROUTE_LOST'?'HOME_ROUTE_LOST':trace?.exitReason==='TRAIL_BUDGET'?'TRAIL_BUDGET':trace?.exitReason==='COUNTER_CUT_FIRST'?'COUNTER_CUT_AVOIDED':trace?.exitReason==='TARGET_GONE'?'TARGET_GONE':'OTHER_ABORT');
  if(!this.active&&entered&&memory.goal==='ATTACK'&&memory.attackSlot!==null&&memory.attackTarget!==null){
   const victim=match.participants.find(v=>v.slot===memory.attackSlot)!;
   if(p.lifeState!=='ALIVE'||victim.lifeState!=='ALIVE'||!victim.trailCells.size)return;
   const a=match.map.cells[p.cellId],b=match.map.cells[memory.attackTarget];
   this.active={tick:match.tick,lifeId:p.lifeId,slot:victim.slot,victimLife:victim.lifeId,target:memory.attackTarget,distance:Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r)),returnedAlive:false,diedDuringAttack:false,successfulCut:false};
   this.episodes.push(this.active);
  }
 }
 after(match:MatchState,p:Participant,eventCounter:number){
  const events=match.events.filter(e=>Number(e.eventId.split(':').at(-1))>eventCounter),a=this.active;
  if(a){const victim=match.participants.find(v=>v.slot===a.slot)!;
   const death=events.find(e=>e.type==='DEATH'&&e.participantId===victim.participantId&&e.lifeId===a.victimLife);
   if(death){a.successfulCut=death.killerId===p.participantId&&['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT'].includes(death.deathContext?.cause??'');this.finish(match.tick,death.killerId===p.participantId?'SUCCESS_KILL':'TARGET_GONE');}
   else if(events.some(e=>e.type==='CAPTURE'&&e.participantId===victim.participantId)&&!victim.trailCells.size)this.finish(match.tick,'TARGET_RETURNED');
   else if(p.lifeState!=='ALIVE'||p.lifeId!==a.lifeId){a.diedDuringAttack=true;this.finish(match.tick,'DIED_DURING_ATTACK');}
   else if(victim.lifeId!==a.victimLife||victim.lifeState!=='ALIVE')this.finish(match.tick,'TARGET_GONE');
  }
  // A simultaneous trade is a success and also a death during the attack.
  if(a&&(p.lifeState!=='ALIVE'||p.lifeId!==a.lifeId))a.diedDuringAttack=true;
  this.returning=this.returning.filter(e=>{
   if(p.lifeId!==e.lifeId||p.lifeState!=='ALIVE')return false;
   if(!p.trailCells.size&&match.owners[p.cellId]===p.slot+1){e.returnedAlive=true;return false;}return true;
  });
 }
 private finish(tick:number,result:string){const a=this.active!;a.result=result;a.endTick=tick;this.returning.push(a);this.active=undefined;}
}
