import {watchDepartureSafety,type DepartureEvent} from './bot-immediate-safety.js';
// Observer-only metrics: one runtime event per discarded expansion attempt.
// Consecutive attempts reset on an actual departure or a life change, not patrol.
export class BotDepartureDiagnostics {
 private stops:(()=>void)[]=[];
 private rows=new Map<string,{lifeId:number;aliveTicks:number;checks:number;prefilterSkipped:number;candidateRejected:number;blocks:number;noOwnedRoute:number;consecutiveBlocks:number;maxConsecutiveBlocks:number;reasons:Record<string,number>;lastBlock:Extract<DepartureEvent,{type:'block'}>|null}>();
 constructor(memories:ReadonlyMap<string,object>,private hz:number){for(const [id,memory] of memories){const row={lifeId:0,aliveTicks:0,checks:0,prefilterSkipped:0,candidateRejected:0,blocks:0,noOwnedRoute:0,consecutiveBlocks:0,maxConsecutiveBlocks:0,reasons:{} as Record<string,number>,lastBlock:null as Extract<DepartureEvent,{type:'block'}>|null};this.rows.set(id,row);this.stops.push(watchDepartureSafety(memory,event=>{
  if(event.type==='tick'){if(event.lifeId!==row.lifeId){row.lifeId=event.lifeId;row.consecutiveBlocks=0;row.lastBlock=null;}if(event.alive)row.aliveTicks++;if(event.alive&&event.outside)row.consecutiveBlocks=0;}
  if(event.type==='candidate')row.candidateRejected++;
  if(event.type==='check'){row.checks++;if(event.result.skipped)row.prefilterSkipped++;}
  if(event.type==='block'){row.blocks++;row.consecutiveBlocks++;row.maxConsecutiveBlocks=Math.max(row.maxConsecutiveBlocks,row.consecutiveBlocks);if(!event.fallback)row.noOwnedRoute++;const reason=event.result.reason??'UNKNOWN';row.reasons[reason]=(row.reasons[reason]??0)+1;row.lastBlock=structuredClone(event);}
 }));}}
 snapshot(id:string,tick:number){const row=this.rows.get(id);if(!row)return null;return {...row,reasons:{...row.reasons},lastBlock:row.lastBlock?structuredClone(row.lastBlock):null,blocksPerMatchMinute:tick?row.blocks*60*this.hz/tick:0,blocksPerAliveMinute:row.aliveTicks?row.blocks*60*this.hz/row.aliveTicks:0};}
 all(tick:number){return [...this.rows.keys()].map(participantId=>({participantId,...this.snapshot(participantId,tick)!}));}
 dispose(){for(const stop of this.stops)stop();this.stops=[];}
}
