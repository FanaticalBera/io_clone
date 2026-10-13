import type {MatchState} from '../src/shared/model.js';
import type {BotDecisionTrace} from '../src/shared/bot.js';
import {watchCaptureTransfers,type CaptureTransferTrace} from '../src/shared/capture-diagnostics.js';

// Audit only. Exact transfers, one life, 60 s; never supplied to bot memory or RNG.
export class BotRecoveryBaselineTracker {
 private lost=new Map<string,Map<number,{tick:number;lifeId:number}>>();
 private rows=new Map<string,{neutralizedRecovery:number;enemyRecovery:number;guardTicks:number;guardInterruptedPlans:number;guardInterruptedDPlans:number}>();
 private active=new Map<string,{lifeId:number;damage:boolean}>();
 private stop:()=>void;
 constructor(private match:MatchState,watch:typeof watchCaptureTransfers=watchCaptureTransfers){
  for(const p of match.participants){this.lost.set(p.participantId,new Map());this.rows.set(p.participantId,{neutralizedRecovery:0,enemyRecovery:0,guardTicks:0,guardInterruptedPlans:0,guardInterruptedDPlans:0});}
  this.stop=watch(match,t=>this.capture(t));
 }
 capture(trace:CaptureTransferTrace){
  const byOwner=new Map(this.match.participants.map(p=>[p.slot+1,p]));
  for(const gain of trace.gains){
   const ledger=this.lost.get(gain.participantId),row=this.rows.get(gain.participantId);if(!ledger||!row)continue;
   for(const cell of gain.cells){
    const loss=ledger.get(cell.cellId);
    if(loss&&loss.lifeId===gain.lifeId&&trace.tick-loss.tick<=60*this.match.config.simulationHz){
     if(cell.previousOwner===0)row.neutralizedRecovery++;else row.enemyRecovery++;
    }
    ledger.delete(cell.cellId);
    const victim=byOwner.get(cell.previousOwner);
    if(victim&&victim.participantId!==gain.participantId)this.lost.get(victim.participantId)?.set(cell.cellId,{tick:trace.tick,lifeId:victim.lifeId});
   }
  }
 }
 death(id:string){this.lost.get(id)?.clear();this.active.delete(id);}
 before(id:string,lifeId:number,trace?:BotDecisionTrace){
  const row=this.rows.get(id)!;let plan=this.active.get(id);
  if(plan?.lifeId!==lifeId){this.active.delete(id);plan=undefined;}
  if(trace?.expansionPlan){plan={lifeId,damage:(trace.expansionPlan.response?.reclaimCells??0)>0};this.active.set(id,plan);}
  if(trace?.safetyOverride==='PERIMETER_GUARD'||trace?.reason==='PERIMETER_GUARD'){
   row.guardTicks++;
   if(plan){row.guardInterruptedPlans++;if(plan.damage)row.guardInterruptedDPlans++;this.active.delete(id);}
  }else if(trace&&(['ATTACK','REPOSITION'].includes(trace.to)||!trace.earlyClosure&&['RETURN','ESCAPE'].includes(trace.to)))this.active.delete(id);
 }
 captured(id:string){this.active.delete(id);}
 afterTick(){for(const p of this.match.participants)for(const [cell,loss]of this.lost.get(p.participantId)!)if(loss.lifeId!==p.lifeId||p.lifeState!=='ALIVE'||this.match.tick-loss.tick>60*this.match.config.simulationHz)this.lost.get(p.participantId)!.delete(cell);}
 snapshot(){return this.match.participants.map(p=>({slot:p.slot,personality:p.personality,...this.rows.get(p.participantId)!}));}
 dispose(){this.stop();}
}
