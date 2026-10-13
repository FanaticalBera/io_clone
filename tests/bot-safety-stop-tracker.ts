import type {BotDecisionTrace,BotMemory} from '../src/shared/bot.js';
import type {MatchState} from '../src/shared/model.js';
export const STOP_REASONS=['DANGER','EARLY_CLOSURE','EXPANSION_PRESSURE'] as const;
export type StopReason=typeof STOP_REASONS[number];
const counts=()=>Object.fromEntries(STOP_REASONS.map(r=>[r,0])) as Record<StopReason,number>;
export function stopReason(trace:BotDecisionTrace|undefined):StopReason|null {
 if(trace?.earlyClosure)return 'EARLY_CLOSURE';
 const reason=trace?.safetyOverride??trace?.reason;return STOP_REASONS.includes(reason as StopReason)?reason as StopReason:null;
}
// Audit only. A repeated ESCAPE danger notification is not another expansion stop.
export class BotSafetyStopTracker {
 private active=new Map<string,{lifeId:number;kind:'EXPANSION'|'OTHER';exposed:boolean}>();
 private rows=new Map<string,{notifications:Record<StopReason,number>;planStops:Record<StopReason,number>;expansionStops:Record<StopReason,number>;aliveFrames:number}>();
 constructor(private match:MatchState){for(const p of match.participants)this.rows.set(p.participantId,{notifications:counts(),planStops:counts(),expansionStops:counts(),aliveFrames:0});}
 afterInputs(memories:ReadonlyMap<string,BotMemory>,traces:ReadonlyMap<string,BotDecisionTrace>){for(const p of this.match.participants){const id=p.participantId,m=memories.get(id),t=traces.get(id),row=this.rows.get(id)!;if(!m)continue;
  if(p.lifeState!=='ALIVE'){this.active.delete(id);continue;}row.aliveFrames++;
  let active=this.active.get(id);if(active?.lifeId!==p.lifeId){this.active.delete(id);active=undefined;}
  const reason=stopReason(t);if(reason){row.notifications[reason]++;if(active){row.planStops[reason]++;if(active.kind==='EXPANSION')row.expansionStops[reason]++;this.active.delete(id);}}
  else if(t?.safetyOverride||t&&['RETURN','ESCAPE'].includes(t.to))this.active.delete(id);
  if(t?.expansionPlan&&['EXPAND','STEAL'].includes(m.goal))this.active.set(id,{lifeId:p.lifeId,kind:'EXPANSION',exposed:p.trailCells.size>0});
  else if(t&&['ATTACK_SCORE','ATTACK_OPPORTUNITY','COUNTER_STRIKE','POINT_SCORE','REPOSITION_START'].includes(t.reason??'')&&['ATTACK','SEEK_POINT','REPOSITION'].includes(m.goal))this.active.set(id,{lifeId:p.lifeId,kind:'OTHER',exposed:p.trailCells.size>0});
 }}
 afterTick(captured:ReadonlySet<string>){for(const p of this.match.participants){const a=this.active.get(p.participantId);if(!a)continue;
  if(p.lifeState!=='ALIVE'||p.lifeId!==a.lifeId||captured.has(p.participantId)||a.exposed&&!p.trailCells.size&&this.match.owners[p.cellId]===p.slot+1)this.active.delete(p.participantId);else a.exposed||=p.trailCells.size>0;
 }}
 snapshot(){return {definition:'Notifications count diagnostic ticks. Plan stops count once per adopted expansion/attack/point/reposition plan, closed on capture/home/life change. Expansion stops are a subset. EARLY_CLOSURE means truncation, not failed capture.',participants:this.match.participants.map(p=>({slot:p.slot,personality:p.personality,...this.rows.get(p.participantId)!}))};}
}
