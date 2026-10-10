import {botDirector} from '../shared/bot-director.js';
import {watchBotGrudges,type BotGrudgeTrace} from '../shared/bot-emotion.js';
import {BOT_PHASE02} from '../shared/bot-phase02-config.js';
import {BOT_PHASE025} from '../shared/bot-phase025-config.js';
import {damageWeight} from '../shared/bot-damage.js';
import {watchBotDecisions,type BotMemory,type BotDecisionTrace} from '../shared/bot.js';
import type {MatchState} from '../shared/model.js';
type GrudgeRecord=BotGrudgeTrace & {slot:number|null;nickname:string};
export type BotDebugSnapshot=ReturnType<BotDebugCollector['snapshot']>;
export class BotDebugCollector {
 private latest=new Map<string,BotDecisionTrace>();
 private plans=new Map<string,{lifeId:number;trace:BotDecisionTrace}>();
 private history=new Map<string,{tick:number;lifeId:number;from:string;to:string;reason:string}[]>();
 private grudgeEvents=new Map<string,GrudgeRecord[]>();
 private grudgeOrigins=new Map<string,Map<string,GrudgeRecord>>();
 private stops:(()=>void)[]=[];
 onDecision?: (trace:BotDecisionTrace)=>void;
 constructor(private match:MatchState,private memories:ReadonlyMap<string,BotMemory>){
  for(const [id,memory] of memories)this.stops.push(watchBotGrudges(memory.emotion,event=>{
   const target=match.participants.find(p=>p.participantId===event.targetId),record={...event,slot:target?.slot??null,nickname:target?.nickname??'이탈한 참가자'};
   const events=this.grudgeEvents.get(id)??[];events.push(record);if(events.length>12)events.shift();this.grudgeEvents.set(id,events);
   if(!event.ignored){const origins=this.grudgeOrigins.get(id)??new Map<string,GrudgeRecord>();origins.set(event.targetId,record);this.grudgeOrigins.set(id,origins);}
  }));
  for(const [id,memory] of memories)this.stops.push(watchBotDecisions(memory,trace=>{
   this.latest.set(id,trace);
   const previous=this.history.get(id)??[],p=match.participants.find(p=>p.participantId===id)!;
   if(trace.planChanged||this.plans.get(id)?.lifeId!==p.lifeId)this.plans.set(id,{lifeId:p.lifeId,trace:structuredClone(trace)});
   if(trace.from!==trace.to||previous.at(-1)?.lifeId!==p.lifeId){previous.push({tick:trace.tick,lifeId:p.lifeId,from:trace.from,to:trace.to,reason:trace.reason??'UNRECORDED'});if(previous.length>8)previous.shift();this.history.set(id,previous);}
   this.onDecision?.(trace);
  },{shadow:false}));
 }
 snapshot(){return {
  seed:this.match.seed,tick:this.match.tick,simulationHz:this.match.config.simulationHz,observationRange:this.match.config.botObservationRange,phase02:BOT_PHASE02,phase025:BOT_PHASE025,director:botDirector(this.match).snapshot(),
  bots:this.match.participants.filter(p=>p.kind==='BOT').map(p=>{const memory=this.memories.get(p.participantId)!,trace=this.latest.get(p.participantId);return {
   participantId:p.participantId,slot:p.slot,nickname:p.nickname,personality:p.personality!,identity:memory.identity,lifeState:p.lifeState,lifeId:p.lifeId,
   emotion:{pressure:memory.emotion.pressure,lineThreat:memory.emotion.lineThreat,recentDamage:memory.emotion.recentDamage,grudges:[...memory.emotion.grudge].map(([id,r])=>({participantId:id,slot:this.match.participants.find(p=>p.participantId===id)?.slot,nickname:this.match.participants.find(p=>p.participantId===id)?.nickname??'이탈한 참가자',lastEvent:this.grudgeOrigins.get(p.participantId)?.get(id)?{...this.grudgeOrigins.get(p.participantId)!.get(id)!}:null,amount:r.amount,valuable:r.amount>=BOT_PHASE02.valuable,bonus:Math.min(BOT_PHASE02.scoreCap,BOT_PHASE02.grudgeScore*r.amount*(memory.identity?.secondaryTrait==='Vengeful'?BOT_PHASE02.vengefulScore:1))}))},
   damage:{regions:[...memory.emotion.damage.regions].map(([cellId,cell])=>({cellId,q:this.match.map.cells[cellId].q,r:this.match.map.cells[cellId].r,attackerId:cell.attackerId,tick:cell.tick,weight:damageWeight(cell,this.match.tick,this.match.config.simulationHz)})),
    opponents:[...memory.emotion.damage.recent].map(([id,samples])=>({participantId:id,slot:this.match.participants.find(p=>p.participantId===id)?.slot,nickname:this.match.participants.find(p=>p.participantId===id)?.nickname??'이탈한 참가자',
     accumulated:(memory.emotion.damage.bank.get(id)??[]).reduce((sum,s)=>sum+s.cells,0),total:samples.reduce((sum,s)=>sum+s.cells,0),local:samples.reduce((sum,s)=>sum+s.observedCells,0),
     cooldownRemaining:Math.max(0,BOT_PHASE02.captureCooldown-(this.match.tick-(memory.emotion.captureAward.get(id)??-Infinity))/this.match.config.simulationHz)}))},
   grudgeEvents:(this.grudgeEvents.get(p.participantId)??[]).map(e=>({...e})),
   shareGap:(Math.max(...this.match.participants.map(p=>p.territoryCount))-p.territoryCount)/this.match.map.cells.length,attackSurvival:memory.attackSurvival,
   goal:memory.goal,attackSlot:memory.attackSlot,trailLength:p.trailCells.size,trace:trace?structuredClone(trace):null,
   planTrace:this.plans.get(p.participantId)?.lifeId===p.lifeId?structuredClone(this.plans.get(p.participantId)!.trace):null,
   history:(this.history.get(p.participantId)??[]).map(h=>({...h}))
  };})
 };}
 dispose(){for(const stop of this.stops)stop();this.stops=[];this.latest.clear();this.plans.clear();this.history.clear();this.grudgeEvents.clear();this.grudgeOrigins.clear();}
}
