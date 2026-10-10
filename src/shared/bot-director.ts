import {getBotInput,observeBotForTick,botRepositionDue,type BotObservation,type BotMemory} from './bot.js';
import type {BotAttackPolicy} from './bot-policy.js';
import type {MatchState,DirectionInput,Participant} from './model.js';
import {seededRandom,shuffled} from './random.js';
import {BOT_PHASE02 as C} from './bot-phase02-config.js';
interface Reservation {attackerId:string;attackerLife:number;targetId:string;targetLife:number;tick:number}
export class BotDirector {
 private reservations=new Map<string,Reservation>();private random:()=>number;
 readonly stats={denied:0,nonPositive:0,survival:0,survivalOverCap:0,maxPlanned:0,decisions:0};
 constructor(private match:MatchState){this.random=seededRandom(match.seed^C.reservationSeedDomain);}
 prune(memories:ReadonlyMap<string,BotMemory>){
  for(const [id,r]of this.reservations){const p=this.match.participants.find(p=>p.participantId===id),target=this.match.participants.find(p=>p.participantId===r.targetId),m=memories.get(id);
   if(!p||!target||p.lifeState!=='ALIVE'||target.lifeState!=='ALIVE'||p.lifeId!==r.attackerLife||target.lifeId!==r.targetLife||!m||m.goal!=='ATTACK'||m.attackSlot!==target.slot||m.attackSurvival||!m.path.length||this.match.owners[m.path.at(-1)!]!==p.slot+1||m.attackTarget===null||!target.trailCells.has(m.attackTarget)||this.match.tick-r.tick>=C.reservationTtl*this.match.config.simulationHz)this.reservations.delete(id);
  }
 }
 count(targetId:string,exclude?:string){return [...this.reservations.values()].filter(r=>r.targetId===targetId&&r.attackerId!==exclude).length;}
 policy(attackerId:string):BotAttackPolicy{return {evaluate:(targetId,_life,score,survival)=>{
  const n=this.count(targetId,attackerId);
  if(survival)return {score,otherReservations:n,factor:1};
  if(n>=C.reservationLimit){this.stats.denied++;return {score,otherReservations:n,factor:0,reason:'RESERVATION_FULL'};}
  if(score<=0){this.stats.nonPositive++;return {score,otherReservations:n,factor:0,reason:'NON_POSITIVE_ATTACK'};}
  const factor=C.reservationFactors[n];return {score:score*factor,otherReservations:n,factor};
 }};}
 // Called only after the chosen decision, so rejected candidates never reserve.
 commit(p:Participant,m:BotMemory){
  this.stats.decisions++;this.reservations.delete(p.participantId);
  const target=this.match.participants.find(t=>t.slot===m.attackSlot);
  if(m.goal!=='ATTACK'||!target||target.lifeState!=='ALIVE'||m.attackTarget===null||!target.trailCells.has(m.attackTarget)||!m.path.length)return;
  if(m.attackSurvival){this.stats.survival++;if(this.count(target.participantId)>=C.reservationLimit)this.stats.survivalOverCap++;return;}
  if(this.count(target.participantId)>=C.reservationLimit)return;
  this.reservations.set(p.participantId,{attackerId:p.participantId,attackerLife:p.lifeId,targetId:target.participantId,targetLife:target.lifeId,tick:this.match.tick});
  this.stats.maxPlanned=Math.max(this.stats.maxPlanned,this.count(target.participantId));
 }
 snapshot(){return {version:C.version,seedDomain:C.reservationSeedDomain,stats:{...this.stats},reservations:[...this.reservations.values()].map(r=>({...r}))};}
 inputs(memories:ReadonlyMap<string,BotMemory>,selected?:ReadonlySet<string>,returnOnly:ReadonlySet<string>=new Set()):Map<string,DirectionInput>{
  this.prune(memories);
  const due:Participant[]=[],light:Participant[]=[],inactive:Participant[]=[],observations=new Map<string,BotObservation>();
  for(const p of this.match.participants){const m=memories.get(p.participantId);if(!m)continue;
   if(p.lifeState!=='ALIVE'){inactive.push(p);continue;}
   if(selected?!selected.has(p.participantId):p.kind!=='BOT')continue;
   if(m.reposition.active){const obs=observeBotForTick(this.match,p.participantId,m);observations.set(p.participantId,obs);if(botRepositionDue(obs,m,returnOnly.has(p.participantId)))m.nextDecisionTick=this.match.tick;}
   (p.lifeId!==m.plannedLifeId||this.match.tick>=m.nextDecisionTick?due:light).push(p);
  }
  const inputs=new Map<string,DirectionInput>();
  for(const p of inactive){const m=memories.get(p.participantId)!;getBotInput(observeBotForTick(this.match,p.participantId,m),m);}
  // Cosmetic/assignment/action streams are independent of this actual due order.
  for(const p of [...shuffled(due,this.random),...light]){
   const m=memories.get(p.participantId)!,isDue=due.includes(p),input=getBotInput(observations.get(p.participantId)??observeBotForTick(this.match,p.participantId,m),m,returnOnly.has(p.participantId),p.kind==='BOT'?this.policy(p.participantId):undefined);
   if(input)inputs.set(p.participantId,input);
   if(isDue&&p.kind==='BOT')this.commit(p,m);
   // Perimeter recovery and vanished targets also release between decisions.
   this.prune(memories);
  }
  return inputs;
 }
}
const directors=new WeakMap<MatchState,BotDirector>();
export function botDirector(match:MatchState){let d=directors.get(match);if(!d){d=new BotDirector(match);directors.set(match,d);}return d;}
export function getBotInputs(match:MatchState,memories:ReadonlyMap<string,BotMemory>,selected?:ReadonlySet<string>,returnOnly?:ReadonlySet<string>){return botDirector(match).inputs(memories,selected,returnOnly);}
