import type {MapDefinition,MatchState,Participant,Vec} from './model.js';
import type {Movement} from './movement.js';
export const WALL_GRACE_SECONDS=.2;
export const WALL_RECHARGE_SECONDS=1;
export function segmentDistanceSquared(p:Vec,a:Vec,b:Vec):number {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
 return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;
}
export function nearbyBoundaryEdges(map:MapDefinition,p:Vec,radius:number):MapDefinition['boundaryEdges'] {
 const r2=radius*radius;
 return map.boundaryEdges.filter(e=>p.x>=Math.min(e.a.x,e.b.x)-radius&&p.x<=Math.max(e.a.x,e.b.x)+radius&&p.y>=Math.min(e.a.y,e.b.y)-radius&&p.y<=Math.max(e.a.y,e.b.y)+radius&&segmentDistanceSquared(p,e.a,e.b)<=r2);
}
interface Budget {lifeId:number;deadline:number|null;clearTicks:number}
interface Policy {budgets:Map<string,Budget>}
const policies=new WeakMap<MatchState,Policy>();
// Explicit per-match experiment. Ordinary matches, config, protocol and saved
// profiles retain their existing rules. Authority alone decides death.
export function setWallGrace(match:MatchState,enabled:boolean):void {
 if(enabled)policies.set(match,{budgets:new Map()});else policies.delete(match);
}
export function wallGraceState(match:MatchState,p:Participant){
 const b=policies.get(match)?.budgets.get(p.participantId);
 return b?.lifeId===p.lifeId?{...b}:null;
}
export function clearWallGraceLife(match:MatchState,p:Participant):void {policies.get(match)?.budgets.delete(p.participantId);}
// Returns the lethal subtick, not the contact subtick. The geometry still
// clamps at the exact inside boundary; every tick still rotates normally.
export function wallDeathTime(match:MatchState,p:Participant,start:Vec,movement:Movement):number|null {
 const policy=policies.get(match);if(!policy)return movement.boundaryT;
 let b=policy.budgets.get(p.participantId);
 if(!b||b.lifeId!==p.lifeId){b={lifeId:p.lifeId,deadline:null,clearTicks:0};policy.budgets.set(p.participantId,b);}
 if(movement.blocked){
  b.clearTicks=0;
  const contact=movement.boundaryT??0;
  if(b.deadline===null)b.deadline=match.tick+contact+WALL_GRACE_SECONDS*match.config.simulationHz;
  if(b.deadline<=match.tick+1+1e-9)return Math.max(contact,Math.min(1,b.deadline-match.tick));
 }else if(b.deadline!==null){
  // One full hex centre spacing from the actual segments, continuously for
  // one second. Brief escape, parallel rubbing and corner taps cannot refill.
  const clearance=Math.sqrt(3)*match.map.side;
  const clear=!nearbyBoundaryEdges(match.map,start,clearance).length&&!nearbyBoundaryEdges(match.map,movement.position,clearance).length;
  b.clearTicks=clear?b.clearTicks+1:0;
  if(b.clearTicks>=Math.ceil(WALL_RECHARGE_SECONDS*match.config.simulationHz)){b.deadline=null;b.clearTicks=0;}
 }
 return null;
}
