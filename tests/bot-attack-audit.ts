import type {BotDecisionTrace} from '../src/shared/bot.js';
import type {GameEvent,Personality} from '../src/shared/model.js';
export interface AttackFrame {id:string;slot:number;personality:Personality;lifeId:number;alive:boolean;goal:string;targetId:string|null;targetLife:number|null;targetAlive:boolean;targetCell:number|null;survival:boolean}
interface Episode {id:number;attackerId:string;slot:number;personality:Personality;attackerLife:number;targetId:string;targetLife:number;startTick:number;endTick?:number;endReason?:string;frames:number;survival:boolean;startReason:string;successTick?:number;successCause?:string}
const counts=()=>({starts:0,successes:0,ordinaryStarts:0,survivalStarts:0,ordinarySuccesses:0,survivalSuccesses:0,attackFrames:0,decisions:0,candidateJudgments:0,candidateObservations:0,rejectedObservations:0,reasons:{} as Record<string,number>,layers:{STRATEGY:{judgments:0,reasons:{} as Record<string,number>},TACTICAL:{judgments:0,reasons:{} as Record<string,number>}}});
const inc=(r:Record<string,number>,key:string)=>r[key]=(r[key]??0)+1;
// Read-only snapshots/events in; never calls AI, consumes RNG or writes memory.
// A new target cell on the same opponent/life does not create a new episode.
export class BotAttackAudit {
 private active=new Map<string,Episode>();private rows=new Map<string,{slot:number;personality:Personality;counts:ReturnType<typeof counts>}>();
 readonly episodes:Episode[]=[];
 private close(id:string,tick:number,reason:string){const e=this.active.get(id);if(e){e.endTick=tick;e.endReason=reason;this.active.delete(id);}}
 afterInputs(tick:number,frames:readonly AttackFrame[],traces:ReadonlyMap<string,BotDecisionTrace>){
  const present=new Set(frames.map(f=>f.id));for(const id of this.active.keys())if(!present.has(id))this.close(id,tick,'DEPARTED');
  for(const f of frames){let row=this.rows.get(f.id);if(!row){row={slot:f.slot,personality:f.personality,counts:counts()};this.rows.set(f.id,row);}const c=row.counts,t=traces.get(f.id);
   if(t){c.decisions++;if(t.attacks.length){c.candidateJudgments++;const layer=t.cadence?.strategy===false?'TACTICAL':'STRATEGY';c.layers[layer].judgments++;
    const unique=new Map(t.attacks.map(a=>[[a.slot,a.target,a.interrupt,a.reason].join(':'),a]));
    for(const a of unique.values()){c.candidateObservations++;inc(c.reasons,a.reason);inc(c.layers[layer].reasons,a.reason);if(a.reason!=='SELECTABLE')c.rejectedObservations++;}
   }}
   if(!f.alive||f.goal!=='ATTACK'||!f.targetAlive||f.targetId===null||f.targetLife===null){this.close(f.id,tick,!f.alive?'SELF_DEAD':f.goal!=='ATTACK'?(t?.exitReason??t?.safetyOverride??'GOAL_'+f.goal):'TARGET_GONE');continue;}
   let e=this.active.get(f.id);
   if(e&&(e.attackerLife!==f.lifeId||e.targetId!==f.targetId||e.targetLife!==f.targetLife)){this.close(f.id,tick,'LIFE_OR_TARGET_CHANGE');e=undefined;}
   if(!e){e={id:this.episodes.length+1,attackerId:f.id,slot:f.slot,personality:f.personality,attackerLife:f.lifeId,targetId:f.targetId,targetLife:f.targetLife,startTick:tick,frames:0,survival:f.survival,startReason:t?.reason??'UNRECORDED'};this.active.set(f.id,e);this.episodes.push(e);c.starts++;c[f.survival?'survivalStarts':'ordinaryStarts']++;}
   e.frames++;c.attackFrames++;
  }
 }
 afterEvents(events:readonly GameEvent[]){
  for(const event of events)if(event.type==='DEATH'&&event.killerId){const e=this.active.get(event.killerId);
   if(e&&e.successTick===undefined&&event.participantId===e.targetId&&event.lifeId===e.targetLife){e.successTick=event.tick;e.successCause=event.deathContext?.cause??event.reason??'UNKNOWN';const c=this.rows.get(e.attackerId)!.counts;c.successes++;c[e.survival?'survivalSuccesses':'ordinarySuccesses']++;}
  }
 }
 snapshot(){return {definition:'Start = final ATTACK entry/re-entry or attacker/target life or target participant change; same target cell/path updates are continuation. Success = DEATH attributed to this attacker for the chosen target life while that episode is active after inputs and before step. Post-exit/unrelated kills excluded. All final open episodes censored at replay horizon.',participants:[...this.rows].map(([id,r])=>({id,...r.counts,slot:r.slot,personality:r.personality})),episodes:this.episodes.map(e=>({...e})),openEpisodes:[...this.active.values()].map(e=>e.id)};}
}
