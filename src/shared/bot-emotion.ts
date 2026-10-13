import type {BotObservation} from './bot.js';
import type {BotIdentity,BotIndividual} from './bot-identity.js';
import {BOT_RANGES} from './bot-identity.js';
import {hexDistance} from './hex.js';
import {BOT_PHASE02 as C} from './bot-phase02-config.js';
import {createBotDamage,recordDamage,pruneBotDamage,type BotDamage} from './bot-damage.js';
export interface Grudge {amount:number;tick:number}
interface Entry {inside:boolean;outsideSince:number|null;visits:number[];lastAward:number;lastEntry:number|null}
export interface BotEmotion {
 damage:BotDamage;
 halfLife?:number;matchId:string;lifeId:number;eventCursor:number;grudge:Map<string,Grudge>;captureAward:Map<string,number>;repeatAward:Map<string,{approach:number;intrusion:number}>;
 entryAwards:Map<string,{approach:number|null;intrusion:number|null;amount:number;tick:number}>;approaches:Map<string,Entry>;intrusions:Map<string,Entry>;losses:{tick:number;cells:number}[];
 territory:{tick:number;cells:number}[];pressure:number;pressureTick:number;recentDamage:number;lineThreat:boolean;
}
export function createBotEmotion():BotEmotion{return {damage:createBotDamage(),matchId:'',lifeId:0,eventCursor:0,grudge:new Map(),captureAward:new Map(),repeatAward:new Map(),entryAwards:new Map(),approaches:new Map(),intrusions:new Map(),losses:[],territory:[],pressure:0,pressureTick:0,recentDamage:0,lineThreat:false};}
export interface BotGrudgeTrace {tick:number;lifeId:number;targetId:string;reason:'DEATH'|'CAPTURE'|'REPEAT_APPROACH'|'REPEAT_INTRUSION';delta:number;balance:number;cells?:number;observedCells?:number;accumulated?:number;ignored?:'BELOW_THRESHOLD'|'COOLDOWN';upgrade?:boolean}
// Diagnostic subscribers live outside bot memory and never feed decisions or RNG.
const grudgeObservers=new WeakMap<BotEmotion,(trace:BotGrudgeTrace)=>void>();
export function watchBotGrudges(state:BotEmotion,observer:(trace:BotGrudgeTrace)=>void):()=>void {
 grudgeObservers.set(state,observer);return()=>{if(grudgeObservers.get(state)===observer)grudgeObservers.delete(state);};
}
function traceGrudge(obs:BotObservation,state:BotEmotion,id:string,reason:BotGrudgeTrace['reason'],tick:number,before:number,cells?:number,ignored?:BotGrudgeTrace['ignored'],upgrade=false,lifeId=obs.self.lifeId,damage?:{observedCells:number;accumulated:number}){
 const observer=grudgeObservers.get(state);if(observer)observer({tick,lifeId,targetId:id,reason,delta:grudgeAmount(state,id)-before,balance:grudgeAmount(state,id),cells,...damage,ignored,upgrade});
}
function awardGrudge(obs:BotObservation,state:BotEmotion,id:string,amount:number,tick:number,reason:BotGrudgeTrace['reason'],cells?:number,upgrade=false,lifeId=obs.self.lifeId,damage?:{observedCells:number;accumulated:number}){
 const before=grudgeAmount(state,id);addGrudge(state,id,amount,tick);traceGrudge(obs,state,id,reason,tick,before,cells,undefined,upgrade,lifeId,damage);
}
export function grudgeAmount(state:BotEmotion,id:string):number{return state.grudge.get(id)?.amount??0;}
export function addGrudge(state:BotEmotion,id:string,amount:number,tick:number){const old=grudgeAmount(state,id);state.grudge.set(id,{amount:Math.min(C.grudgeCap,old+amount),tick});}
export function memoryValuable(state:BotEmotion,id:string){return grudgeAmount(state,id)>=C.valuable;}
export function grudgeBonus(state:BotEmotion,id:string,identity?:Readonly<BotIdentity>){return Math.min(C.scoreCap,C.grudgeScore*grudgeAmount(state,id)*(identity?.secondaryTrait==='Vengeful'?C.vengefulScore:1));}
// Event consumption/decay runs even between decisions and through DEAD_WAIT.
export function updateBotEmotion(obs:BotObservation,state:BotEmotion,identity?:Readonly<BotIdentity>){
 if(state.matchId!==obs.matchId){Object.assign(state,createBotEmotion());state.matchId=obs.matchId;state.pressureTick=obs.tick;}
 const half=identity?.secondaryTrait==='Vengeful'?C.vengefulHalfLife:C.halfLife;state.halfLife=half;
 const active=new Set(obs.roster?.map(p=>p.participantId)??[obs.self.participantId,...obs.others.map(p=>p.participantId)]);
 if(state.lifeId!==obs.self.lifeId){state.lifeId=obs.self.lifeId;state.damage=createBotDamage();state.approaches.clear();state.intrusions.clear();state.entryAwards.clear();state.losses=[];state.territory=[];state.pressure=0;state.recentDamage=0;state.lineThreat=false;state.pressureTick=obs.tick;}
 // Apply each event at its timestamp before decaying to the current tick.
 const decay=(tick:number)=>{for(const [id,r] of state.grudge){r.amount*=2**(-Math.max(0,tick-r.tick)/obs.config.simulationHz/half);r.tick=Math.max(r.tick,tick);if(r.amount<C.forgetBelow)state.grudge.delete(id);}};
 for(const event of obs.events??[]){
  if(event.id<=state.eventCursor)continue;decay(event.tick);
  if(event.type==='DEATH'){
   if(event.victimId===obs.self.participantId)state.damage=createBotDamage();
   state.approaches.delete(event.victimId);state.intrusions.delete(event.victimId);state.entryAwards.delete(event.victimId);
   if(event.victimId===obs.self.participantId&&event.killerId&&event.killerId!==obs.self.participantId)awardGrudge(obs,state,event.killerId,C.death,event.tick,'DEATH',undefined,false,event.lifeId);
   else {const r=state.grudge.get(event.victimId);if(r)r.amount*=event.killerId===obs.self.participantId?C.revengeRelief:C.otherDeathRelief;}
  }else{
   if(event.observedCells)state.losses.push({tick:event.tick,cells:event.observedCells});
   const cooldown=event.tick-(state.captureAward.get(event.attackerId)??-Infinity)<C.captureCooldown*obs.config.simulationHz;
   const accumulated=recordDamage(obs,state.damage,event,cooldown),damage={observedCells:event.observedCells,accumulated};
   if(!cooldown&&accumulated>=C.captureCells){awardGrudge(obs,state,event.attackerId,C.capture,event.tick,'CAPTURE',event.cells,false,obs.self.lifeId,damage);state.captureAward.set(event.attackerId,event.tick);state.damage.bank.delete(event.attackerId);}
   else traceGrudge(obs,state,event.attackerId,'CAPTURE',event.tick,grudgeAmount(state,event.attackerId),event.cells,cooldown?'COOLDOWN':'BELOW_THRESHOLD',false,obs.self.lifeId,damage);
  }
  state.eventCursor=Math.max(state.eventCursor,event.id);
 }
 decay(obs.tick);
 if(obs.roster)for(const table of [state.grudge,state.captureAward,state.repeatAward,state.approaches,state.intrusions,state.entryAwards])for(const id of table.keys())if(!active.has(id))table.delete(id);

 pruneBotDamage(obs,state.damage,obs.roster?active:undefined);
 state.losses=state.losses.filter(e=>e.tick>obs.tick-C.lossWindow*obs.config.simulationHz);
}
function entry(state:Map<string,Entry>,id:string,inside:boolean,tick:number,hz:number,previousAward=-Infinity):boolean{
 let e=state.get(id);if(!e){state.set(id,{inside,outsideSince:inside?null:tick,visits:[],lastAward:previousAward,lastEntry:null});return false;}
 e.visits=e.visits.filter(t=>t>=tick-C.repeatWindow*hz);
 if(!inside){if(e.inside||e.outsideSince===null)e.outsideSince=tick;e.inside=false;return false;}
 const entered=!e.inside&&e.outsideSince!==null&&tick-e.outsideSince>=C.reentryOutside*hz;
 e.inside=true;e.outsideSince=null;
 if(!entered)return false;e.lastEntry=tick;
 // Visits during cooldown do not form a deferred award.
 if(tick-e.lastAward<C.repeatCooldown*hz){e.visits=[];return false;}
 e.visits.push(tick);
 return e.visits.length>=C.repeatCount;
}
export function rememberBotEntries(obs:BotObservation,state:BotEmotion){
 const visible=new Set(obs.others.map(p=>p.participantId));
 for(const table of [state.approaches,state.intrusions])for(const [id,e]of table)if(!visible.has(id)){e.outsideSince=null;e.visits=[];e.lastEntry=null;state.entryAwards.delete(id);}
 for(const p of obs.others){
  const near=obs.ownTrail.length>0&&obs.ownTrail.some(id=>hexDistance(obs.map.cells[id],obs.map.cells[p.cellId])<=C.approachDistance);
  const intrusion=obs.owners[p.cellId]===obs.self.slot+1;
  const awards=state.repeatAward.get(p.participantId)??{approach:-Infinity,intrusion:-Infinity};
  const a=entry(state.approaches,p.participantId,near,obs.tick,obs.config.simulationHz,awards.approach),i=entry(state.intrusions,p.participantId,intrusion,obs.tick,obs.config.simulationHz,awards.intrusion);
  if(a||i){
   const ae=state.approaches.get(p.participantId)!,ie=state.intrusions.get(p.participantId)!,previous=state.entryAwards.get(p.participantId);
   const amount=i?C.intrusion:C.approach,same=previous&&((near&&ae.lastEntry!==null&&previous.approach===ae.lastEntry)||(intrusion&&ie.lastEntry!==null&&previous.intrusion===ie.lastEntry));
   if(!same||amount>previous.amount){
    const half=state.halfLife??C.halfLife;
    const old=same?previous.amount*2**(-(obs.tick-previous.tick)/obs.config.simulationHz/half):0;
    awardGrudge(obs,state,p.participantId,amount-old,obs.tick,i?'REPEAT_INTRUSION':'REPEAT_APPROACH',undefined,!!same);
    state.entryAwards.set(p.participantId,{approach:ae.lastEntry,intrusion:ie.lastEntry,amount,tick:obs.tick});
   }
   // Consume both when one physical entry satisfies both predicates.
   for(const [table,award,key] of [[state.approaches,a,'approach'],[state.intrusions,i,'intrusion']] as const){const e=table.get(p.participantId)!;if(award||near&&intrusion){e.visits=[];e.lastAward=obs.tick;awards[key]=obs.tick;}}
   state.repeatAward.set(p.participantId,awards);
  }
 }
}
export function updatePressure(obs:BotObservation,state:BotEmotion,lineThreat:boolean){
 const window=C.lossWindow*obs.config.simulationHz;
 state.territory.push({tick:obs.tick,cells:obs.self.territoryCount});
 // Keep the last sample at/before the window boundary plus recent samples.
 while(state.territory.length>1&&state.territory[1].tick<=obs.tick-window)state.territory.shift();
 const baseline=Math.max(state.territory[0]?.cells??obs.self.territoryCount,obs.spawnCells??7);
 state.recentDamage=Math.min(1,state.losses.reduce((sum,e)=>sum+e.cells,0)/baseline);state.lineThreat=lineThreat;
 const target=(Number(lineThreat)*C.lineWeight+state.recentDamage*C.lossWeight)/(C.lineWeight+C.lossWeight);
 const dt=Math.max(0,obs.tick-state.pressureTick)/obs.config.simulationHz;
 state.pressure+=(target-state.pressure)*(1-Math.exp(-dt/(target>state.pressure?C.pressureRise:C.pressureFall)));
 state.pressure=Math.max(0,Math.min(1,state.pressure));state.pressureTick=obs.tick;
}
export function emotionIndividual(obs:BotObservation,state:BotEmotion,identity?:Readonly<BotIdentity>,targetId?:string):BotIndividual|null{
 if(!identity)return null;
 const ranges=BOT_RANGES[obs.self.personality??identity.personality],base=identity.individual;
 const clamp=(key:keyof BotIndividual,value:number)=>Math.max(ranges[key][0],Math.min(ranges[key][1],value));
 return {...base,expansionScale:clamp('expansionScale',base.expansionScale*(1-C.expansionReduction*state.pressure)),riskScale:clamp('riskScale',base.riskScale*(1+C.riskIncrease*state.pressure)),
 attackChance:clamp('attackChance',base.attackChance+(targetId?grudgeAmount(state,targetId)/C.grudgeCap:0)*(ranges.attackChance[1]-ranges.attackChance[0])*C.attackRangeFraction)};
}
