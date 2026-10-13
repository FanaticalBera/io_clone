import type {MatchState} from '../src/shared/model.js';
import type {BotMemory,BotDecisionTrace} from '../src/shared/bot.js';
interface Episode {slot:number;lifeId:number;start:number;end:number|null;target:number;cells:number;ownedFrames:number;outcome:string}
export class BotPrefixTracker {
 private active=new Map<string,Episode>();readonly episodes:Episode[]=[];
 constructor(private match:MatchState,private memories:ReadonlyMap<string,BotMemory>){}
 afterInputs(traces:ReadonlyMap<string,BotDecisionTrace>){for(const p of this.match.participants){const id=p.participantId,m=this.memories.get(id)!,t=traces.get(id),a=this.active.get(id);
  if(a&&(p.lifeId!==a.lifeId||p.lifeState!=='ALIVE'||t?.safetyOverride||['ATTACK','RETURN','ESCAPE','REPOSITION'].includes(m.goal))){a.end=this.match.tick;a.outcome=t?.safetyOverride??'PLAN_INTERRUPTED';this.active.delete(id);}
  if(t?.expansionPlan&&t.expansionPath&&['EXPAND','STEAL'].includes(m.goal)){
   const old=this.active.get(id);if(old){old.end=this.match.tick;old.outcome='REPLANNED';this.active.delete(id);}
   const prefix:number[]=[];for(const cell of t.expansionPath){if(this.match.owners[cell]!==p.slot+1)break;prefix.push(cell);}
   const e:Episode={slot:p.slot,lifeId:p.lifeId,start:this.match.tick,end:prefix.length?null:this.match.tick,target:prefix.at(-1)??p.cellId,cells:prefix.length,ownedFrames:0,outcome:prefix.length?'OPEN':'NO_PREFIX'};
   this.episodes.push(e);if(prefix.length)this.active.set(id,e);
  }
  const current=this.active.get(id);if(current&&this.match.owners[p.cellId]===p.slot+1&&!p.trailCells.size)current.ownedFrames++;
 }}
 afterTick(){for(const p of this.match.participants){const e=this.active.get(p.participantId);if(!e)continue;
  const owned=this.match.owners[p.cellId]===p.slot+1&&!p.trailCells.size;
  const outcome=p.lifeId!==e.lifeId||p.lifeState!=='ALIVE'?'LIFE_RESET':!owned?'EXPOSED_BEFORE_TARGET':this.match.owners[e.target]!==p.slot+1?'TARGET_LOST':p.cellId===e.target?'ARRIVED':null;
  if(outcome){e.end=this.match.tick;e.outcome=outcome;this.active.delete(p.participantId);}
 }}
 snapshot(){for(const e of this.active.values()){e.end=this.match.tick;e.outcome='CENSORED';}return {episodes:this.episodes};}
}
