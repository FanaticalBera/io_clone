import {watchBotDecisions,type BotMemory,type BotDecisionTrace} from '../shared/bot.js';
import type {MatchState} from '../shared/model.js';
export type BotDebugSnapshot=ReturnType<BotDebugCollector['snapshot']>;
export class BotDebugCollector {
 private latest=new Map<string,BotDecisionTrace>();
 private plans=new Map<string,{lifeId:number;trace:BotDecisionTrace}>();
 private history=new Map<string,{tick:number;lifeId:number;from:string;to:string;reason:string}[]>();
 private stops:(()=>void)[]=[];
 onDecision?: (trace:BotDecisionTrace)=>void;
 constructor(private match:MatchState,private memories:ReadonlyMap<string,BotMemory>){
  for(const [id,memory] of memories)this.stops.push(watchBotDecisions(memory,trace=>{
   this.latest.set(id,trace);
   const previous=this.history.get(id)??[],p=match.participants.find(p=>p.participantId===id)!;
   if(trace.planChanged||this.plans.get(id)?.lifeId!==p.lifeId)this.plans.set(id,{lifeId:p.lifeId,trace:structuredClone(trace)});
   if(trace.from!==trace.to||previous.at(-1)?.lifeId!==p.lifeId){previous.push({tick:trace.tick,lifeId:p.lifeId,from:trace.from,to:trace.to,reason:trace.reason??'UNRECORDED'});if(previous.length>8)previous.shift();this.history.set(id,previous);}
   this.onDecision?.(trace);
  },{shadow:false}));
 }
 snapshot(){return {
  seed:this.match.seed,tick:this.match.tick,
  bots:this.match.participants.filter(p=>p.kind==='BOT').map(p=>{const memory=this.memories.get(p.participantId)!,trace=this.latest.get(p.participantId);return {
   participantId:p.participantId,slot:p.slot,nickname:p.nickname,personality:p.personality!,identity:memory.identity,lifeState:p.lifeState,lifeId:p.lifeId,
   goal:memory.goal,attackSlot:memory.attackSlot,trailLength:p.trailCells.size,trace:trace?structuredClone(trace):null,
   planTrace:this.plans.get(p.participantId)?.lifeId===p.lifeId?structuredClone(this.plans.get(p.participantId)!.trace):null,
   history:(this.history.get(p.participantId)??[]).map(h=>({...h}))
  };})
 };}
 dispose(){for(const stop of this.stops)stop();this.stops=[];this.latest.clear();this.plans.clear();this.history.clear();}
}
