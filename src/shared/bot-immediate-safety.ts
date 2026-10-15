import type {BotObservation,BotGoal} from './bot.js';
import type {PublicParticipant,Vec} from './model.js';
import {hexDistance} from './hex.js';
import {moveSpeed} from './config.js';
import {normalizeDirection,stepSteering} from './movement.js';
import {botSteeringTarget} from './bot-steering.js';
// Phase 3 immediate-safety layer: pure public-state prediction, no strategy/RNG.
export const BOT_DEPARTURE_SAFETY=Object.freeze({horizonSeconds:1,nearHeadCells:2,etaMarginSeconds:.15,prefilterSlackCells:.8});
export function departurePrefilterCells(obs:BotObservation){return Math.ceil(Math.max(obs.config.moveCellsPerSecond*BOT_DEPARTURE_SAFETY.horizonSeconds+BOT_DEPARTURE_SAFETY.nearHeadCells+BOT_DEPARTURE_SAFETY.prefilterSlackCells,2/Math.sqrt(3)*obs.config.moveCellsPerSecond*BOT_DEPARTURE_SAFETY.horizonSeconds+2));}
export function immediateLookAhead(obs:BotObservation,goal:BotGoal):number {
 if(goal==='ATTACK')return 3;
 if((goal==='EXPAND'&&obs.self.personality==='DEFEND')||obs.map.inset[obs.self.cellId]<=2)return 1;
 if(obs.others.some(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=3)||obs.trails.some(t=>hexDistance(obs.map.cells[t.cellId],obs.map.cells[obs.self.cellId])<=2))return 1;
 return 2;
}
export function ownedForwardPath(obs:BotObservation):number[]{
 const cells=obs.map.cells[obs.self.cellId].neighbors.filter(id=>id>=0&&obs.owners[id]===obs.self.slot+1);
 const score=(id:number)=>{const c=obs.map.cells[id].center,d=normalizeDirection(c.x-obs.self.position.x,c.y-obs.self.position.y);return d?d.x*obs.self.direction.x+d.y*obs.self.direction.y:-Infinity;};
 return cells.sort((a,b)=>score(b)-score(a)||a-b);
}
export function departureIntent(obs:BotObservation,route:number[],goal:BotGoal,ownedPatrol=false){
 const reach=Math.max(Math.sqrt(3)*obs.map.side*.18,moveSpeed(obs.config)/obs.config.turnRadiansPerSecond+moveSpeed(obs.config)/obs.config.simulationHz);
 while(route.length&&obs.self.cellId===route[0]&&Math.hypot(obs.map.cells[route[0]].center.x-obs.self.position.x,obs.map.cells[route[0]].center.y-obs.self.position.y)<reach)route.shift();
 if(ownedPatrol&&!route.length){const next=ownedForwardPath(obs)[0];if(next!==undefined)route.push(next);}
 const target=botSteeringTarget(obs.map,obs.self,route,obs.config,ownedPatrol?1:immediateLookAhead(obs,goal));
 return target?normalizeDirection(target.x-obs.self.position.x,target.y-obs.self.position.y)??obs.self.direction:obs.self.direction;
}
export interface DepartureProjection {firstCell:number|null;entrySeconds:number|null;exposureEnd:number;blocked:boolean;allOwned:boolean}
export function projectDeparture(obs:BotObservation,route:readonly number[],goal:BotGoal,ownedPatrol=false):DepartureProjection {
 const path=[...route],actor={...obs.self},local={...obs,self:actor};let firstCell:number|null=null,entrySeconds:number|null=null,exposureEnd=1,closed=false,allOwned=true,blocked=false;
 const hz=obs.config.simulationHz;
 for(let n=0;n<Math.ceil(hz*BOT_DEPARTURE_SAFETY.horizonSeconds);n++){
  const intent=departureIntent(local,path,goal,ownedPatrol),next=stepSteering(obs.map,actor.position,actor.cellId,actor.direction,intent,obs.config);
  for(const e of next.entries){if(obs.owners[e.cellId]!==actor.slot+1){allOwned=false;if(firstCell===null){firstCell=e.cellId;entrySeconds=(n+e.t)/hz;}}else if(firstCell!==null&&!closed){closed=true;exposureEnd=(n+e.t)/hz;}}
  if(obs.owners[next.cellId]!==actor.slot+1)allOwned=false;
  if(next.blocked){blocked=true;break;}
  actor.position=next.position;actor.direction=next.direction;actor.cellId=next.cellId;
 }
 return {firstCell,entrySeconds,exposureEnd,blocked,allOwned};
}
interface Visit {cell:number;start:number;end:number}
const headCache=new WeakMap<BotObservation['map'],{tick:number;values:Map<string,{signature:string;visits:Visit[]}>}>();
function headVisits(obs:BotObservation,p:PublicParticipant):Visit[]{
 let cache=headCache.get(obs.map);if(cache?.tick!==obs.tick){cache={tick:obs.tick,values:new Map()};headCache.set(obs.map,cache);}
 const signature=[p.lifeId,p.cellId,p.position.x,p.position.y,p.direction.x,p.direction.y,obs.config.simulationHz,obs.config.moveCellsPerSecond,obs.config.turnRadiansPerSecond,obs.config.hexSideWorldUnits,obs.map.side].join(':');
 const cached=cache.values.get(p.participantId);if(cached?.signature===signature)return cached.visits;
 const visits:Visit[]=[];let position=p.position,heading=p.direction,cellId=p.cellId,start=0;const hz=obs.config.simulationHz;
 for(let n=0;n<Math.ceil(hz);n++){
  const next=stepSteering(obs.map,position,cellId,heading,p.direction,obs.config);
  for(const e of next.entries){const time=(n+e.t)/hz;visits.push({cell:cellId,start,end:time});cellId=e.cellId;start=time;}
  if(next.blocked)break;position=next.position;heading=next.direction;cellId=next.cellId;
 }
 visits.push({cell:cellId,start,end:1});cache.values.set(p.participantId,{signature,visits});return visits;
}
export interface DepartureSafety {blocked:boolean;reason:'NEAR_HEAD'|'PREDICTED_OVERLAP'|null;enemySlot:number|null;firstCell:number|null;entrySeconds:number|null;prefilterCells:number;consideredHeads:number;skipped:boolean}
export function evaluateDepartureSafety(obs:BotObservation,path:readonly number[],goal:BotGoal):DepartureSafety {
 const radius=departurePrefilterCells(obs),result:DepartureSafety={blocked:false,reason:null,enemySlot:null,firstCell:null,entrySeconds:null,prefilterCells:radius,consideredHeads:0,skipped:true};
 if(!['EXPAND','STEAL'].includes(goal)||(obs.actualOwnTrailLength??obs.ownTrail.length)>0||obs.owners[obs.self.cellId]!==obs.self.slot+1)return result;
 // Broad bound includes ego travel and cell-centre rounding. Never use a nominal
 // path cell: steering can enter a different exterior cell around a corner.
 const heads=(obs.departureHeads??obs.others).filter(p=>p.lifeState==='ALIVE'&&hexDistance(obs.map.cells[obs.self.cellId],obs.map.cells[p.cellId])<=obs.config.botObservationRange&&hexDistance(obs.map.cells[obs.self.cellId],obs.map.cells[p.cellId])<=radius+Math.ceil(2/Math.sqrt(3)*obs.config.moveCellsPerSecond)+2);
 if(!heads.length)return result;
 const f=projectDeparture(obs,path,goal);result.firstCell=f.firstCell;result.entrySeconds=f.entrySeconds;if(f.firstCell===null)return result;
 const close=heads.filter(p=>hexDistance(obs.map.cells[f.firstCell!],obs.map.cells[p.cellId])<=radius);result.consideredHeads=close.length;if(!close.length)return result;result.skipped=false;
 for(const p of close){
  if(hexDistance(obs.map.cells[f.firstCell],obs.map.cells[p.cellId])<=BOT_DEPARTURE_SAFETY.nearHeadCells){result.blocked=true;result.reason='NEAR_HEAD';result.enemySlot=p.slot;return result;}
  if(headVisits(obs,p).some(v=>v.cell===f.firstCell&&v.end>=Math.max(0,f.entrySeconds!-.15)&&v.start<=Math.min(1,f.exposureEnd+.15))){result.blocked=true;result.reason='PREDICTED_OVERLAP';result.enemySlot=p.slot;return result;}
 }
 return result;
}
export function selectOwnedDepartureFallback(obs:BotObservation):number[]|null {
 for(const id of ownedForwardPath(obs)){const f=projectDeparture(obs,[id],'RETURN',true);if(f.allOwned&&!f.blocked)return [id];}return null;
}
export type DepartureEvent={type:'tick';tick:number;lifeId:number;alive:boolean;outside:boolean}|{type:'candidate';tick:number;result:DepartureSafety}|{type:'check';tick:number;result:DepartureSafety}|{type:'block';tick:number;result:DepartureSafety;fallback:number[]|null};
const observers=new WeakMap<object,Set<(event:DepartureEvent)=>void>>();
export function watchDepartureSafety(memory:object,observer:(event:DepartureEvent)=>void){let set=observers.get(memory);if(!set){set=new Set();observers.set(memory,set);}set.add(observer);return()=>{set!.delete(observer);};}
export function recordDepartureSafety(memory:object,event:DepartureEvent){for(const observer of observers.get(memory)??[])observer(event);}

export interface RepositionStartSafety {safe:boolean;reason:'INVALID_START'|'LEAVES_HOME'|'WALL'|null;firstCell:number|null;entrySeconds:number|null;blocked:boolean}
// One second of actual steering with current ownership held fixed. Start only:
// active relocation keeps its existing immediate/regular invalidation rules.
export function evaluateRepositionStartSafety(obs:BotObservation,path:readonly number[]):RepositionStartSafety {
 if(obs.self.lifeState!=='ALIVE'||(obs.actualOwnTrailLength??obs.ownTrail.length)>0||obs.owners[obs.self.cellId]!==obs.self.slot+1)return {safe:false,reason:'INVALID_START',firstCell:null,entrySeconds:null,blocked:false};
 const p=projectDeparture(obs,path,'REPOSITION');return {safe:p.allOwned&&!p.blocked,reason:p.blocked?'WALL':p.allOwned?null:'LEAVES_HOME',firstCell:p.firstCell,entrySeconds:p.entrySeconds,blocked:p.blocked};
}

// Same 0.65 s perimeter steering check, extracted without changing turn geometry.
// Candidate check only: match the immediate intent after waypoint consumption.
// Do not simulate the prefix or reject goals handled by other safety layers.
export function expansionPerimeterBlocked(obs:BotObservation,path:readonly number[],goal:BotGoal):boolean {
 if((goal!=='EXPAND'&&goal!=='STEAL')||obs.map.inset[obs.self.cellId]>2)return false;
 return perimeterEscapeDirection(obs,departureIntent(obs,[...path],goal))!==null;
}
export function perimeterEscapeDirection(obs:BotObservation,direction:Vec):Vec|null {
 if(obs.map.inset[obs.self.cellId]>2)return null;
 const safe=(intent:typeof direction)=>{let position=obs.self.position,cellId=obs.self.cellId,heading=obs.self.direction;
   for(let step=0;step<Math.ceil(obs.config.simulationHz*0.65);step++){const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)return false;position=next.position;cellId=next.cellId;heading=next.direction;}return true;};
 if(!safe(direction)){
   const alternatives=obs.map.cells[obs.self.cellId].neighbors.filter(id=>id>=0).map(id=>{const c=obs.map.cells[id].center;return normalizeDirection(c.x-obs.self.position.x,c.y-obs.self.position.y)!;});
   alternatives.sort((a,b)=>(b.x*direction.x+b.y*direction.y)-(a.x*direction.x+a.y*direction.y));
   return alternatives.find(safe)??null;
 }
 return null;
}
