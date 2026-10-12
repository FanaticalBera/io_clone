import type {MatchState,Personality,Vec} from '../src/shared/model.js';
import type {BotMemory,BotObservation,BotDecisionTrace} from '../src/shared/bot.js';
import type {BotCandidateBatch,BotChoiceCandidate} from '../src/shared/bot-candidate-diagnostics.js';
import {hexDistance} from '../src/shared/hex.js';
const ORIGINAL_FAILURES=new Set(['DANGER','EXPANSION_PRESSURE','LAUNCH_BLOCKED']);
interface Route {anchor:number;exit:number;direction:Vec}
interface Failure extends Route {lifeId:number;cancelTick:number;returnTick:number|null;exposed:boolean;capturesOnReturn:number;threatId?:string;threatLife?:number;reason:string}
interface Episode extends Route {lifeId:number;selectedTick:number;launchTick:number|null;exposed:boolean;restart?:Failure;eligibleAtSelection:boolean}
const fingerprint=(c:BotChoiceCandidate|undefined)=>c?JSON.stringify([c.goal,c.slot,c.target,c.expansion?.anchor,c.path]):null;
const empty=()=>({choices:0,eligibleChoices:0,eligibleCandidates:0,wouldChange:0,wouldChangeApplied:0,wouldChangeWithoutReturnCapture:0,zeroCheckMismatches:0,failures:0,unknownThreat:0,realReturns:0,atHomeFailures:0,matchedSelections:0,actualRestarts:0,realReturnRestarts:0,atHomeRetryRestarts:0,reCancelled:0,earlyClosedAgain:0,atHomeRetryReCancelled:0,recancelReasons:{} as Record<string,number>});
function route(obs:BotObservation,path:readonly number[],anchor:number|undefined):Route|null {
 if(anchor===undefined)return null;const first=path.findIndex(id=>obs.owners[id]!==obs.self.slot+1);if(first<0)return null;
 const start=obs.map.cells[first?path[first-1]:anchor].center,end=obs.map.cells[path[first]].center,dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);return length?{anchor,exit:path[first],direction:{x:dx/length,y:dy/length}}:null;
}
function matches(obs:BotObservation,a:Route,b:Route){return hexDistance(obs.map.cells[a.anchor],obs.map.cells[b.anchor])<=1&&a.direction.x*b.direction.x+a.direction.y*b.direction.y>=.5-1e-9;}
// Read-only shadow. Scores, reservations and bot memory are never changed.
export class BotNearRestartAudit {
 private active=new Map<string,Episode>();private failed=new Map<string,Failure>();
 private pending=new Map<string,{obs:BotObservation;batch:BotCandidateBatch}>();private rows=new Map<string,ReturnType<typeof empty>>();private stops:(()=>void)[]=[];
 readonly cases:Record<string,unknown>[]=[];readonly changedChoices:Record<string,unknown>[]=[];
 constructor(private match:MatchState,private memories:ReadonlyMap<string,BotMemory>,watch:(m:BotMemory,f:(o:BotObservation,b:BotCandidateBatch)=>void)=>()=>void,private observe:(id:string)=>BotObservation,private safe:(o:BotObservation,path:number[],goal:BotChoiceCandidate['goal'])=>{blocked:boolean}){
  for(const [id,m]of memories){this.rows.set(id,empty());this.stops.push(watch(m,(obs,batch)=>{if(batch.kind==='STRATEGY')this.pending.set(id,{obs,batch});}));}
 }
 beforeTick(){this.pending.clear();for(const p of this.match.participants){const id=p.participantId,f=this.failed.get(id),a=this.active.get(id);if(p.lifeState!=='ALIVE'||f&&p.lifeId!==f.lifeId){this.failed.delete(id);this.active.delete(id);continue;}if(a&&a.lifeId!==p.lifeId)this.active.delete(id);if(f&&(f.returnTick===null?this.match.tick-f.cancelTick>2*this.match.config.simulationHz:this.match.tick-f.returnTick>this.match.config.simulationHz))this.failed.delete(id);}}
 private eligible(obs:BotObservation,f:Failure|undefined){return !!f&&f.lifeId===obs.self.lifeId&&f.returnTick!==null&&obs.tick-f.returnTick<=obs.config.simulationHz&&f.returnTick-f.cancelTick<=2*obs.config.simulationHz&&obs.owners[obs.self.cellId]===obs.self.slot+1&&obs.ownTrail.length===0&&obs.others.some(p=>p.participantId===f.threatId&&p.lifeId===f.threatLife&&hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=6);}
 private threat(obs:BotObservation,trace:BotDecisionTrace,reason:string){
  if(reason==='LAUNCH_BLOCKED')return obs.others.find(p=>p.slot===trace.departure?.enemySlot);
  const distance=(p:BotObservation['others'][number])=>reason==='DANGER'?Math.min(...obs.ownTrail.map(cell=>hexDistance(obs.map.cells[cell],obs.map.cells[p.cellId]))):hexDistance(obs.map.cells[obs.self.cellId],obs.map.cells[p.cellId]);
  return [...obs.others].filter(p=>distance(p)<=(reason==='DANGER'?5:6)).sort((a,b)=>distance(a)-distance(b)||a.slot-b.slot)[0];
 }
 private checkChoices(id:string,trace:BotDecisionTrace|undefined,m:BotMemory){const pending=this.pending.get(id);if(!pending)return;const {obs,batch}=pending,row=this.rows.get(id)!,f=this.failed.get(id),actual=batch.candidates[batch.selectedIndex];row.choices++;
  const eligible=this.eligible(obs,f),penalty=(c:BotChoiceCandidate)=>{const r=c.expansion?route(obs,c.path,c.expansion.anchor):null;return eligible&&r&&matches(obs,r,f!)?Math.min(1.5,.1*Math.max(0,c.expansion?.response?.baseScore??c.score)):0;};
  const positive=batch.candidates.filter(c=>penalty(c)>0);row.eligibleCandidates+=positive.length;if(positive.length)row.eligibleChoices++;
  const rank=(on:boolean)=>[...batch.candidates].sort((a,b)=>(b.score-(on?penalty(b):0))-(a.score-(on?penalty(a):0))||(a.ordinal??0)-(b.ordinal??0)).find(c=>!this.safe(obs,[...c.path],c.goal).blocked);
  const zero=rank(false);if(fingerprint(zero)!==fingerprint(actual)){row.zeroCheckMismatches++;return;}
  const changed=positive.length?rank(true):zero;if(fingerprint(changed)!==fingerprint(actual)){row.wouldChange++;if(!f!.capturesOnReturn)row.wouldChangeWithoutReturnCapture++;
   if(actual&&m.goal===actual.goal&&(!actual.expansion||trace?.expansionPlan?.anchor===actual.expansion.anchor))row.wouldChangeApplied++;
   this.changedChoices.push({slot:obs.self.slot,tick:obs.tick,reason:f!.reason,realReturn:f!.exposed,capturesOnReturn:f!.capturesOnReturn,actual:fingerprint(actual),shadow:fingerprint(changed),penalty:actual?penalty(actual):0});
  }
 }
 afterInputs(traces:ReadonlyMap<string,BotDecisionTrace>){for(const p of this.match.participants){const id=p.participantId,m=this.memories.get(id),t=traces.get(id),row=this.rows.get(id);if(!m||!row||p.lifeState!=='ALIVE')continue;
  const a=this.active.get(id),obs=t||this.pending.has(id)?this.pending.get(id)?.obs??this.observe(id):undefined,cause=t?.earlyClosure?'EARLY_CLOSURE':t?.safetyOverride;
  if(a&&cause){
   if(a.restart&&a.launchTick!==null&&this.match.tick-a.launchTick<=this.match.config.simulationHz){const real=a.restart.exposed;if(cause==='EARLY_CLOSURE')row.earlyClosedAgain++;else{if(real)row.reCancelled++;else row.atHomeRetryReCancelled++;row.recancelReasons[cause]=(row.recancelReasons[cause]??0)+1;}
    this.cases.push({slot:p.slot,tick:this.match.tick,originalReason:a.restart.reason,reason:cause,cancelTick:a.restart.cancelTick,returnTick:a.restart.returnTick,selectedTick:a.selectedTick,launchTick:a.launchTick,realReturn:real,capturesOnReturn:a.restart.capturesOnReturn,eligibleAtSelection:a.eligibleAtSelection,anchor:a.anchor,previousAnchor:a.restart.anchor});
   }
   this.active.delete(id);
   if(ORIGINAL_FAILURES.has(cause)&&obs){const threat=this.threat(obs,t!,cause),atHome=this.match.owners[p.cellId]===p.slot+1&&!p.trailCells.size;
    this.failed.set(id,{...a,lifeId:p.lifeId,cancelTick:this.match.tick,returnTick:atHome?this.match.tick:null,exposed:a.exposed,capturesOnReturn:0,reason:cause,threatId:threat?.participantId,threatLife:threat?.lifeId});row.failures++;if(!threat)row.unknownThreat++;if(atHome){if(a.exposed)row.realReturns++;else row.atHomeFailures++;}
   }else this.failed.delete(id);
  }else if(a&&t&&['ATTACK','REPOSITION','SEEK_POINT','RETURN','ESCAPE'].includes(m.goal))this.active.delete(id);
  this.checkChoices(id,t,m);
  if(t?.expansionPlan&&t.expansionPath&&['EXPAND','STEAL'].includes(m.goal)&&obs){const r=route(obs,t.expansionPath,t.expansionPlan.anchor);if(r){const f=this.failed.get(id),same=obs.ownTrail.length===0&&obs.owners[obs.self.cellId]===obs.self.slot+1&&!!f&&f.returnTick!==null&&this.match.tick-f.returnTick<=this.match.config.simulationHz&&matches(obs,r,f),eligible=this.eligible(obs,f);if(same)row.matchedSelections++;
    this.active.set(id,{...r,lifeId:p.lifeId,selectedTick:this.match.tick,launchTick:p.trailCells.size?this.match.tick:null,exposed:p.trailCells.size>0,restart:same?{...f!}:undefined,eligibleAtSelection:eligible});
   }}
 }}
 afterTick(captured:ReadonlySet<string>,previousOwners:Uint8Array){for(const p of this.match.participants){const id=p.participantId,a=this.active.get(id),f=this.failed.get(id),row=this.rows.get(id);if(!row)continue;
  if(p.lifeState!=='ALIVE'||a&&a.lifeId!==p.lifeId||f&&f.lifeId!==p.lifeId){this.active.delete(id);this.failed.delete(id);continue;}
  const outside=this.match.owners[p.cellId]!==p.slot+1||p.trailCells.size>0;
  if(a){if(outside){a.exposed=true;if(a.launchTick===null&&(previousOwners[p.cellId]!==p.slot+1||[...p.trailCells].some(c=>previousOwners[c]!==p.slot+1))){a.launchTick=this.match.tick;if(a.restart&&a.restart.returnTick!==null){if(this.match.tick-a.restart.returnTick<=this.match.config.simulationHz){row.actualRestarts++;if(a.restart.exposed)row.realReturnRestarts++;else row.atHomeRetryRestarts++;}else a.restart=undefined;}}}
   if(captured.has(id)){this.active.delete(id);this.failed.delete(id);} // Original un-interrupted plan completed normally.
  }
  // Capturing a smaller loop after a safety cancellation is recorded separately;
  // the strict alternative excludes any such CAPTURE from the shadow count.
  const current=this.failed.get(id);if(current&&current.returnTick===null){if(captured.has(id))current.capturesOnReturn++;if(!outside){current.returnTick=this.match.tick;if(current.exposed)row.realReturns++;else row.atHomeFailures++;}}
 }}
 snapshot(){return {definition:{sameBoundary:1,sameDirectionDegrees:60,returnToLaunchSeconds:1,launchToRecancelSeconds:1,cancelToReturnSeconds:2,penaltyMax:1.5,penaltyBaseRatio:.1,threat:'Current observed same ID/life within 6 cells. DANGER uses nearest observed head within 5 of own trail; budget-only or unidentified threat cannot activate B.',capture:'Uninterrupted normal completion clears failure. Capture while returning after safety cancellation is a separate sensitivity count; strict alternative excludes it.',actualRestart:'Physical exposure using pre-step ownership/trail; at-home blocked retries reported separately from real exposure/return.'},participants:this.match.participants.filter(p=>this.rows.has(p.participantId)).map(p=>({slot:p.slot,personality:p.personality as Personality,...this.rows.get(p.participantId)!})),cases:this.cases,changedChoices:this.changedChoices};}
 dispose(){for(const stop of this.stops)stop();this.stops=[];}
}
