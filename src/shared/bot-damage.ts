import type {BotObservation} from './bot.js';
import type {BotEmotion} from './bot-emotion.js';
import type {BotIdentity} from './bot-identity.js';
import type {BotEvent} from './bot-events.js';
import {hexDistance} from './hex.js';
import {BOT_PHASE025 as C} from './bot-phase025-config.js';
import {BOT_PHASE02} from './bot-phase02-config.js';
export interface DamageSample {tick:number;cells:number;observedCells:number}
export interface DamageCell {attackerId:string;tick:number}
export interface BotDamage {bank:Map<string,DamageSample[]>;recent:Map<string,DamageSample[]>;regions:Map<number,DamageCell>}
export function createBotDamage():BotDamage{return {bank:new Map(),recent:new Map(),regions:new Map()};}
export function damageWeight(cell:DamageCell,tick:number,hz:number){return 2**(-Math.max(0,tick-cell.tick)/hz/C.regionHalfLife);}
function pruneSamples(table:Map<string,DamageSample[]>,tick:number,hz:number,active?:ReadonlySet<string>){
 for(const [id,samples] of table){const recent=samples.filter(s=>s.tick>tick-C.captureWindow*hz);if(recent.length&&(!active||active.has(id)))table.set(id,recent);else table.delete(id);}
}
export function pruneBotDamage(obs:BotObservation,state:BotDamage,active?:ReadonlySet<string>){
 pruneSamples(state.bank,obs.tick,obs.config.simulationHz,active);pruneSamples(state.recent,obs.tick,obs.config.simulationHz,active);
 for(const [id,cell] of state.regions)if(obs.owners[id]===obs.self.slot+1||obs.tick-cell.tick>=C.regionLifetime*obs.config.simulationHz||active&&!active.has(cell.attackerId))state.regions.delete(id);
}
function sample(table:Map<string,DamageSample[]>,id:string,value:DamageSample){
 const samples=table.get(id)??[],last=samples.at(-1);
 if(last?.tick===value.tick){last.cells+=value.cells;last.observedCells+=value.observedCells;}else samples.push({...value});
 table.set(id,samples);
}
export function recordDamage(obs:BotObservation,state:BotDamage,event:Extract<BotEvent,{type:'LOSS'}>,cooldown:boolean):number {
 pruneSamples(state.bank,event.tick,obs.config.simulationHz);pruneSamples(state.recent,event.tick,obs.config.simulationHz);
 const value={tick:event.tick,cells:event.cells,observedCells:event.observedCells};sample(state.recent,event.attackerId,value);
 if(!cooldown)sample(state.bank,event.attackerId,value);
 for(const id of event.cellIds)state.regions.set(id,{attackerId:event.attackerId,tick:event.tick});
 // Exact aggregate counts are not truncated by the spatial memory cap.
 const origin=obs.map.cells[obs.self.cellId],counts=new Map<string,number>();
 const ordered=[...state.regions].sort((a,b)=>b[1].tick-a[1].tick||hexDistance(obs.map.cells[a[0]],origin)-hexDistance(obs.map.cells[b[0]],origin)||a[0]-b[0]);
 state.regions.clear();
 for(const [id,cell]of ordered){const n=counts.get(cell.attackerId)??0;if(n>=C.regionPerOpponent||state.regions.size>=C.regionTotal)continue;state.regions.set(id,cell);counts.set(cell.attackerId,n+1);}
 return (state.bank.get(event.attackerId)??[]).reduce((sum,s)=>sum+s.cells,0);
}
export interface DamageBonus {baseScore:number;reclaimWeight:number;revengeWeight:number;reclaimRaw:number;revengeRaw:number;raw:number;bonus:number;reclaimCells:number;revengeCells:number;overlapCells:number}
export function expansionDamageBonus(obs:BotObservation,state:BotEmotion,gain:readonly number[],baseScore:number,identity?:Readonly<BotIdentity>):DamageBonus {
 if(!state.grudge.size&&!state.damage.regions.size)return {baseScore,reclaimWeight:0,revengeWeight:0,reclaimRaw:0,revengeRaw:0,raw:0,bonus:0,reclaimCells:0,revengeCells:0,overlapCells:0};
 let reclaimWeight=0,revengeWeight=0,reclaimCells=0,revengeCells=0,overlapCells=0;
 const idsByOwner=new Map(obs.roster?.map(p=>[p.slot+1,p.participantId])??obs.others.map(p=>[p.slot+1,p.participantId]));
 for(const id of gain){
  if(hexDistance(obs.map.cells[obs.self.cellId],obs.map.cells[id])>obs.config.botObservationRange)continue;
  const region=state.damage.regions.get(id),attacker=idsByOwner.get(obs.owners[id]),grudge=attacker?state.grudge.get(attacker)?.amount??0:0;
  if(region){reclaimWeight+=damageWeight(region,obs.tick,obs.config.simulationHz);reclaimCells++;}
  if(grudge>0){revengeWeight+=grudge/BOT_PHASE02.grudgeCap;revengeCells++;}
  // The same cell intentionally contributes to both D and V, then the sum is capped.
  if(region&&grudge>0)overlapCells++;
 }
 reclaimWeight=Math.min(C.weightedCellCap,reclaimWeight);revengeWeight=Math.min(C.weightedCellCap,revengeWeight);
 const reclaimRaw=C.reclaimPerCell*reclaimWeight*(identity?.secondaryTrait==='Territorial'?C.territorialMultiplier:1);
 const revengeRaw=C.revengePerCell*revengeWeight*(identity?.secondaryTrait==='Vengeful'?C.vengefulMultiplier:1),raw=reclaimRaw+revengeRaw;
 return {baseScore,reclaimWeight,revengeWeight,reclaimRaw,revengeRaw,raw,bonus:Math.min(raw,C.bonusCap,C.bonusRatio*Math.max(0,baseScore)),reclaimCells,revengeCells,overlapCells};
}
type Cell=BotObservation['map']['cells'][number];
export function damageExpansionAnchors(obs:BotObservation,state:BotDamage,boundary:Cell[]){
 if(!state.regions.size)return {anchors:boundary.slice(0,C.boundaryTotal),damageAnchors:[] as number[],unreachable:0};
 const boundaryIds=new Set(boundary.map(c=>c.id)),weights=new Map<number,number>();
 // At most 96 regions * 37 nearby cells; do not multiply all boundaries by all damage.
 for(const [id,region]of state.regions){const seen=new Set([id]),queue=[id],origin=obs.map.cells[id],weight=damageWeight(region,obs.tick,obs.config.simulationHz);
  for(let i=0;i<queue.length;i++){const current=queue[i];if(boundaryIds.has(current))weights.set(current,(weights.get(current)??0)+weight);
   for(const n of obs.map.cells[current].neighbors)if(n>=0&&!seen.has(n)&&hexDistance(origin,obs.map.cells[n])<=C.boundaryRadius){seen.add(n);queue.push(n);}
  }
 }
 const distances=new Map([[obs.self.cellId,0]]),queue=[obs.self.cellId];
 for(let i=0;i<queue.length;i++){const id=queue[i],depth=distances.get(id)!;if(depth>=C.approachLimit)continue;
  for(const n of obs.map.cells[id].neighbors)if(n>=0&&obs.owners[n]===obs.self.slot+1&&!distances.has(n)){distances.set(n,depth+1);queue.push(n);}
 }
 const damaged=boundary.filter(c=>weights.has(c.id)),unreachable=damaged.filter(c=>!distances.has(c.id)).length;
 damaged.sort((a,b)=>weights.get(b.id)!-weights.get(a.id)!||(distances.get(a.id)??Infinity)-(distances.get(b.id)??Infinity)||a.id-b.id);
 // Keep the caller's personality-specific border order intact; damage never evicts a normal anchor.
 const anchors=boundary.slice(0,C.boundaryTotal),chosen=new Set(anchors.map(c=>c.id)),damageAnchors:number[]=[];
 for(const cell of damaged)if(distances.has(cell.id)&&!chosen.has(cell.id)&&damageAnchors.length<C.boundarySlots){anchors.push(cell);chosen.add(cell.id);damageAnchors.push(cell.id);}
 return {anchors,damageAnchors,unreachable};
}
