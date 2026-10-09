import type {MatchState,Participant} from '../src/shared/model.js';
import type {BotDecisionTrace} from '../src/shared/bot.js';
import {watchDeaths} from '../src/shared/life.js';
// Audit only: 30 Hz samples plus the actual pre-neutralization death count.
export class BotGrowthTracker {
 private rows=new Map<string,{initial:number;previous:number;net:number;deathReset:number;spawnGrants:number;maximum:number;lifeMax:Map<number,number>;plans:number;cancelled:number;early:number;active:boolean}>();
 private stop:()=>void;
 constructor(private match:MatchState){
  for(const p of match.participants)this.rows.set(p.participantId,{initial:p.territoryCount,previous:p.territoryCount,net:0,deathReset:0,spawnGrants:0,maximum:p.territoryCount,lifeMax:new Map([[p.lifeId,p.territoryCount]]),plans:0,cancelled:0,early:0,active:false});
  this.stop=watchDeaths(match,t=>{const r=this.rows.get(t.victimId);if(!r)return;r.deathReset+=t.territoryCount;r.net+=t.territoryCount;r.maximum=Math.max(r.maximum,t.territoryCount);r.lifeMax.set(t.lifeId,Math.max(r.lifeMax.get(t.lifeId)??0,t.territoryCount));});
 }
 before(p:Participant,trace?:BotDecisionTrace){
  const r=this.rows.get(p.participantId)!;
  if(trace?.earlyClosure&&r.active){r.early++;r.active=false;}
  else if(trace&&r.active&&(['ATTACK','RETURN','ESCAPE'].includes(trace.to)||trace.expansionPlan)){r.cancelled++;r.active=false;}
  if(trace?.expansionPlan){r.plans++;r.active=true;}
 }
 after(eventCounter:number){
  for(const e of this.match.events)if(Number(e.eventId.split(':').at(-1))>eventCounter){const r=this.rows.get(e.participantId);if(!r)continue;if(e.type==='SPAWN'){const grant=1+3*this.match.config.spawnRadius*(this.match.config.spawnRadius+1);r.spawnGrants+=grant;r.net-=grant;}if(e.type==='CAPTURE'||e.type==='DEATH')r.active=false;}
  for(const p of this.match.participants){const r=this.rows.get(p.participantId)!;r.net+=p.territoryCount-r.previous;r.previous=p.territoryCount;r.maximum=Math.max(r.maximum,p.territoryCount);r.lifeMax.set(p.lifeId,Math.max(r.lifeMax.get(p.lifeId)??0,p.territoryCount));}
 }
 snapshot(){const seconds=this.match.tick/this.match.config.simulationHz,count=this.match.map.cells.length;return {seconds,maximumSampling:'tick boundary plus immediately before death neutralization',participants:[...this.rows].map(([participantId,r])=>({participantId,netTerritoryChange:r.net,netCellsPerMinute:seconds?r.net*60/seconds:0,netCellsPerHour:seconds?r.net*3600/seconds:0,deathResetLoss:r.deathReset,spawnGrants:r.spawnGrants,actualHoldingChange:r.previous-r.initial,maximumShare:r.maximum/count,lifeMaximumShares:[...r.lifeMax].map(([lifeId,cells])=>({lifeId,share:cells/count})),expansionPlans:r.plans,cancelledExpansions:r.cancelled,earlyReturns:r.early,cancellationRatio:r.plans?r.cancelled/r.plans:0,earlyReturnRatio:r.plans?r.early/r.plans:0}))};}
 dispose(){this.stop();}
}
