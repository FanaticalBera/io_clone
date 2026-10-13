import {botCandidateListener,type BotChoiceCandidate} from './bot-candidate-diagnostics.js';
import type {BotObservation,BotMemory,BotGoal,BotAttackTrace,BotDecisionTrace,ExpansionPlan,ExpansionShape} from './bot.js';
import type {Personality,PublicParticipant,MapDefinition} from './model.js';
import type {BotAttackPolicy} from './bot-policy.js';
import {hexDistance} from './hex.js';
import {normalizeDirection,stepSteering} from './movement.js';
import {moveSpeed} from './config.js';
import {GAME_MODES} from './modes.js';
import {damageExpansionAnchors,expansionDamageBonus} from './bot-damage.js';
import {emotionIndividual,memoryValuable,grudgeBonus,grudgeAmount} from './bot-emotion.js';
import {survivalCounterAllowed} from './bot-policy.js';
import {evaluateShadowOpportunities,shadowTravelSeconds} from './bot-opportunity.js';
import {expansionSides,EXPANSION_SHAPES} from './bot-expansion.js';
import {evaluateDepartureSafety,recordDepartureSafety,expansionPerimeterBlocked} from './bot-immediate-safety.js';
import {selectReposition,startReposition} from './bot-reposition.js';
import {decisionTraces,attackPolicies} from './bot-runtime.js';
import {shortestPath,returnPath,travelSeconds,observedHeading,forecastHead} from './bot-navigation.js';
import {holdingRiskMultiplier} from './bot-holding-risk.js';
// Candidate enumeration, score arithmetic and RNG draw order are unchanged.
const behavior:Record<Personality,{length:number;width:number;attack:number;pointWeight:number;risk:number;trailLimit:number;steal:number;attackRange:number}>={
 EXPAND:{length:5,width:4,attack:0.08,pointWeight:4,risk:0.7,trailLimit:20,steal:0.3,attackRange:6},
 ATTACK:{length:3,width:2,attack:0.85,pointWeight:3,risk:0.4,trailLimit:18,steal:0.5,attackRange:9},
 DEFEND:{length:2,width:2,attack:0.02,pointWeight:1,risk:1.3,trailLimit:12,steal:0.1,attackRange:5},
 SEEK_POINT:{length:3,width:3,attack:0.2,pointWeight:30,risk:0.8,trailLimit:18,steal:3,attackRange:7}
};
const individualSettings=new WeakMap<BotMemory,Map<Personality,typeof behavior[Personality]>>();
export function settingsFor(obs:BotObservation,memory:BotMemory){
 const personality=obs.self.personality??'EXPAND';let cache=individualSettings.get(memory);
 if(!cache){cache=new Map();individualSettings.set(memory,cache);}
 let settings=cache.get(personality);if(!settings){const base=behavior[personality],t=memory.traits;
  settings={...base,length:base.length*t.expansionScale,width:base.width*t.expansionScale,risk:base.risk*t.riskScale,steal:base.steal*t.stealScale,attack:memory.identity?.individual.attackChance??base.attack};cache.set(personality,settings);
 }const emotional=emotionIndividual(obs,memory.emotion,memory.identity);
 return emotional?{...settings,length:behavior[personality].length*emotional.expansionScale,width:behavior[personality].width*emotional.expansionScale,risk:behavior[personality].risk*emotional.riskScale}:settings;
}
interface AttackPlan {survival:boolean;path:number[];score:number;goal:'ATTACK';target:number;slot:number;urgent:boolean;seconds:number;totalSeconds:number}
function observedReturnSeconds(obs:BotObservation,victim:PublicParticipant,home:number[]):number {
 const earliest=travelSeconds(obs,victim,home);if(!home.length)return earliest;
 const target=obs.map.cells[home[0]].center,toward=normalizeDirection(target.x-victim.position.x,target.y-victim.position.y);
 // A head already turning home gets the conservative immediate-return estimate.
 // Otherwise forecast only half a second from its observed heading. The opponent
 // can react and close sooner, so every subsequent decision rechecks the line.
 const intent=observedHeading(obs,victim);
 if(toward&&intent.x*toward.x+intent.y*toward.y>.55)return earliest;
 let position=victim.position,heading=victim.direction,cellId=victim.cellId;
 const ticks=Math.ceil(obs.config.simulationHz*.5);
 for(let tick=1;tick<=ticks;tick++){
  const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)return earliest;
  position=next.position;heading=next.direction;cellId=next.cellId;
  if(obs.owners[cellId]===victim.slot+1)return Math.min(earliest,tick/obs.config.simulationHz);
 }
 const back=shortestPath(obs.map,cellId,id=>obs.owners[id]===victim.slot+1,()=>true,24);
 return back?Math.min(earliest+.5,ticks/obs.config.simulationHz+travelSeconds(obs,{...victim,position,direction:heading,cellId},back)):earliest;
}
export function planAttack(obs:BotObservation,memory:BotMemory,interrupt=false,locked=false):AttackPlan|null {
 const listener=botCandidateListener(memory),diagnostic:BotChoiceCandidate[]|undefined=listener?[]:undefined;
 if(!obs.trails.length){listener?.(obs,{kind:'ATTACK',interrupt,candidates:[],selectedIndex:-1});return null;}
 const settings=settingsFor(obs,memory),owner=obs.self.slot+1,counts=new Map<number,number>();
 for(const trail of obs.trails)counts.set(trail.slot,(counts.get(trail.slot)??0)+1);
 const targetId=(slot:number)=>obs.roster?.find(p=>p.slot===slot)?.participantId??obs.others.find(p=>p.slot===slot)?.participantId;
 const targetAttack=(slot:number)=>{const id=targetId(slot);return emotionIndividual(obs,memory.emotion,memory.identity,id)?.attackChance??settings.attack;};
 const incursions=new Set(obs.trails.filter(t=>obs.owners[t.cellId]===owner||obs.map.cells[t.cellId].neighbors.some(id=>id>=0&&obs.owners[id]===owner)).map(t=>t.slot));
 const valuable=(cellId:number,slot:number)=>obs.owners[cellId]===owner||incursions.has(slot)||(counts.get(slot)??0)>=5||!!targetId(slot)&&memoryValuable(memory.emotion,targetId(slot)!);
 const attackRoll=!interrupt&&obs.trails.length>0?memory.random():1;
 const targets=[...obs.trails].sort((a,b)=>hexDistance(obs.map.cells[a.cellId],obs.map.cells[obs.self.cellId])-hexDistance(obs.map.cells[b.cellId],obs.map.cells[obs.self.cellId]));
 // Do not lay our approach across an observed head's immediate forward path.
 // This is a short prediction from public position/heading, not future inputs.
 const headPaths=new Set<number>();
 for(const enemy of obs.others)for(const cellId of forecastHead(obs,enemy))headPaths.add(cellId);
 let best:AttackPlan|null=null;const returnTimes=new Map<number,number|null>();
 // Reserve candidates for each observed opponent; one long nearby trail must
 // not consume every evaluation and hide another opponent entering our home.
 const perSlot=new Map<number,number>();
 const lockedTarget=locked&&obs.trails.some(t=>t.slot===memory.attackSlot&&t.cellId===memory.attackTarget)?memory.attackTarget:null;
 const considered=targets.filter(t=>!locked||(t.slot===memory.attackSlot&&(lockedTarget!==null?t.cellId===lockedTarget:obs.others.some(p=>p.slot===t.slot)))).filter(t=>{const count=perSlot.get(t.slot)??0;perSlot.set(t.slot,count+1);return count<3;}).slice(0,12);
 for(const target of considered){
  const trace=decisionTraces.get(memory);const record:BotAttackTrace|undefined=trace?{target:target.cellId,slot:target.slot,distance:hexDistance(obs.map.cells[target.cellId],obs.map.cells[obs.self.cellId]),interrupt,reason:'SELECTABLE'}:undefined;
  if(record)trace!.attacks.push(record);
  const ordinary=!interrupt&&attackRoll<targetAttack(target.slot);
  const reward=valuable(target.cellId,target.slot),range=obs.self.personality==='DEFEND'?settings.attackRange:reward?Math.max(8,settings.attackRange):settings.attackRange;
  const outward=shortestPath(obs.map,obs.self.cellId,id=>id===target.cellId,id=>id===target.cellId||!headPaths.has(id),range);
  if(!outward){if(record)record.reason='NO_APPROACH';continue;}
  const back=shortestPath(obs.map,target.cellId,id=>obs.owners[id]===owner,()=>true,10);
  if(!back||outward.length+back.length>18||obs.ownTrail.length+outward.filter(id=>obs.owners[id]!==owner).length+back.length>settings.trailLimit){if(record)record.reason='TRAIL_BUDGET';continue;}
  if(!returnTimes.has(target.slot)){
   const victim=obs.others.find(p=>p.slot===target.slot),home=victim&&shortestPath(obs.map,victim.cellId,id=>obs.owners[id]===target.slot+1,()=>true,24);
   returnTimes.set(target.slot,home&&victim?observedReturnSeconds(obs,victim,home):null);
  }
  const seconds=travelSeconds(obs,obs.self,outward),returnTime=returnTimes.get(target.slot);
  if(record){record.seconds=seconds;record.returnTime=returnTime;record.returnSeconds=back.length/obs.config.moveCellsPerSecond;}
  const margin=!locked&&obs.self.personality==='ATTACK'?(outward.length>=6?.4:outward.length>=4?.25:.1):.1;
  if(record)record.etaMargin=margin;
  if(returnTime!==null&&returnTime!==undefined&&seconds+margin>=returnTime){if(record)record.reason='VICTIM_RETURNS_FIRST';continue;}
  const opportunity=outward.length<=4&&seconds<=1.25&&returnTime!==null&&returnTime!==undefined&&seconds+.2<returnTime;
  if(!locked&&!reward&&!ordinary&&!opportunity&&!(obs.self.personality==='ATTACK'&&returnTime!==null&&returnTime!==undefined)){if(record)record.reason='LOW_PRIORITY';continue;}
  // Compare the cut with a counter-cut of our already exposed line. A cheap
  // winning strike can beat retreat; a duel we arrive at too late cannot.
  let counterTime=Infinity;
  for(const enemy of obs.others)if(obs.ownTrail.length){
   const nearest=obs.ownTrail.reduce((best,id)=>hexDistance(obs.map.cells[enemy.cellId],obs.map.cells[id])<hexDistance(obs.map.cells[enemy.cellId],obs.map.cells[best])?id:best);
   const route=shortestPath(obs.map,enemy.cellId,id=>id===nearest,()=>true,8);if(route)counterTime=Math.min(counterTime,travelSeconds(obs,enemy,route));
  }
  if(record)record.counterTime=counterTime;
  if(counterTime<=seconds+.05){if(record)record.reason='COUNTER_CUT_FIRST';continue;}
  if(!locked&&obs.self.personality==='ATTACK'){
   const exposed=[...obs.ownTrail,...outward,...back].filter(id=>obs.owners[id]!==owner);
   const total=seconds+back.length/obs.config.moveCellsPerSecond;
   if(obs.others.some(p=>p.slot!==target.slot&&exposed.some(id=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[id])/obs.config.moveCellsPerSecond<=total+.15))){
    if(record)record.reason='UNSAFE_RETURN';continue;
   }
  }
  // A thief keeps its territory route unless a short interception lies on it,
  // a very close cut is clear, or its own exposed line needs a counterstrike.
  if(!locked&&obs.self.personality==='SEEK_POINT'){
   const onRoute=memory.path.slice(0,6).some(id=>hexDistance(obs.map.cells[id],obs.map.cells[target.cellId])<=1);
   const defending=incursions.has(target.slot)&&outward.length<=4;
   if(outward.length>4||(!onRoute&&!defending&&outward.length>2)||(!opportunity&&!defending)){
    // A short, demonstrably safe interception is not a long kill diversion.
    // Reassess this candidate independently of the optional diagnostic trace:
    // conservative opponent bounds and shared steering must permit cut+home.
    const close=opportunity&&outward.length<=3&&back.length<=3&&evaluateShadowOpportunities({...obs,trails:[target]},
     {path:(_map,start)=>start===obs.self.cellId?outward:back,seconds:shadowTravelSeconds}).candidates[0];
    if(!close||close.reason!=='CLEAR_KILL_OPPORTUNITY'||close.returnSeconds===null||close.returnSeconds>2){
     if(record)record.reason='STEAL_DIVERSION_LIMIT';continue;
    }
   }
  }
  const urgent=outward.length<=2&&seconds<=.75&&opportunity;
  const defenseBonus=incursions.has(target.slot)?(memory.identity?.individual.defenseBonus??(obs.self.personality==='DEFEND'?12:0)):0;
  const advantage=returnTime===null||returnTime===undefined?0:Math.max(0,returnTime-seconds);
  const qualityBonus=obs.self.personality==='ATTACK'?Math.min(12,advantage*6)+(opportunity?12:0)-Math.max(0,outward.length-4)*3:0;
  let score=qualityBonus+defenseBonus+(reward?60:opportunity?50+targetAttack(target.slot)*15:50*targetAttack(target.slot))-seconds*8-back.length*.3+(obs.owners[target.cellId]===owner?15:0)+grudgeBonus(memory.emotion,targetId(target.slot)??'',memory.identity);
  const victim=obs.others.find(p=>p.slot===target.slot),id=targetId(target.slot);
  let survival=false;
  if(victim&&obs.ownTrail.length){
   const nearest=obs.ownTrail.reduce((best,id)=>hexDistance(obs.map.cells[victim.cellId],obs.map.cells[id])<hexDistance(obs.map.cells[victim.cellId],obs.map.cells[best])?id:best);
   const cut=shortestPath(obs.map,victim.cellId,id=>id===nearest,()=>true,8),home=returnPath(obs);
   const threat=cut?travelSeconds(obs,victim,cut):Infinity,homeEta=home?travelSeconds(obs,obs.self,home):null;
   survival=survivalCounterAllowed(obs.ownTrail.length,threat,homeEta,seconds);
  }
  const targetLife=obs.roster?.find(p=>p.slot===target.slot)?.lifeId??victim?.lifeId;
  const rawScore=score;
  const policy=attackPolicies.get(memory),adjusted=id&&targetLife!==undefined?policy?.evaluate(id,targetLife,score,survival):undefined;
  if(record){record.grudge=grudgeAmount(memory.emotion,id??'');record.grudgeBonus=grudgeBonus(memory.emotion,id??'',memory.identity);record.attackChance=targetAttack(target.slot);record.survival=survival;record.otherReservations=adjusted?.otherReservations;record.reservationFactor=adjusted?.factor;}
  if(adjusted?.reason){if(record)record.reason=adjusted.reason;continue;}
  if(adjusted)score=adjusted.score;
  if(record){record.qualityBonus=qualityBonus;record.score=score;}
  diagnostic?.push({survival,path:[...outward,...back],score,rawScore,reservationFactor:adjusted?.factor??1,goal:'ATTACK',target:target.cellId,slot:target.slot});
  if(!best||score>best.score)best={survival,path:[...outward,...back],score,goal:'ATTACK',target:target.cellId,slot:target.slot,urgent,seconds,totalSeconds:seconds+back.length/obs.config.moveCellsPerSecond};
 }
 listener?.(obs,{kind:'ATTACK',interrupt,candidates:diagnostic!,selectedIndex:best?diagnostic!.findIndex(c=>c.slot===best!.slot&&c.target===best!.target):-1});
 return best;
}
// Evaluate the same enclosure rule as capture: home plus the planned trail
// blocks flood-fill from the outer edge. Retracing a line has no area bonus.
const plannedCaptureWork=new WeakMap<MapDefinition,{blocked:Uint8Array;visited:Uint8Array;queue:Int32Array;boundary:number[]}>();
export function plannedCapture(obs:BotObservation,path:number[]):number[] {
 // Profiling R56/16 identified candidate flood fills as the main hotspot.
 // Reuse storage and index exterior seeds, retaining the same full-map flood,
 // neighbor order and ascending result order (no local approximation).
 let work=plannedCaptureWork.get(obs.map);if(!work){const count=obs.map.cells.length;
  work={blocked:new Uint8Array(count),visited:new Uint8Array(count),queue:new Int32Array(count),boundary:obs.map.cells.filter(c=>c.neighbors.includes(-1)).map(c=>c.id)};plannedCaptureWork.set(obs.map,work);
 }
 const owner=obs.self.slot+1,{blocked,visited,queue,boundary}=work;blocked.fill(0);visited.fill(0);for(const id of path)blocked[id]=1;
 let tail=0;
 for(const id of boundary)if(obs.owners[id]!==owner&&!blocked[id]){visited[id]=1;queue[tail++]=id;}
 for(let head=0;head<tail;head++)for(const id of obs.map.cells[queue[head]].neighbors){
  if(id<0||visited[id]||obs.owners[id]===owner||blocked[id])continue;visited[id]=1;queue[tail++]=id;
 }
 const result:number[]=[];for(let id=0;id<obs.map.cells.length;id++)if(obs.owners[id]!==owner&&!visited[id])result.push(id);return result;
}
// A shortened enclosure avoids retracing the existing trail. Emergency escape
// still uses returnPath; this is only a pre-emptive, area-preserving closure.
export function earlyClosurePath(obs:BotObservation,remaining:number[],trailLimit:number):number[]|null {
 if(!obs.ownTrail.length||remaining.length<5)return null;
 const owner=obs.self.slot+1,used=new Set(obs.ownTrail),forbidden=new Set(obs.trails.map(t=>t.cellId));
 const safe=(id:number)=>!used.has(id)&&!forbidden.has(id)&&obs.others.every(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[id])>2);
 const back=shortestPath(obs.map,obs.self.cellId,id=>obs.owners[id]===owner,safe,Math.min(10,remaining.length-3));
 if(!back||!back.length)return null;
 const external=new Set([...obs.ownTrail,...back].filter(id=>obs.owners[id]!==owner));
 if(external.size>trailLimit||plannedCapture(obs,[...obs.ownTrail,...back]).length<=external.size)return null;
 return back;
}
export function planExpansion(obs:BotObservation,memory:BotMemory):number[] {
 const settings=settingsFor(obs,memory),forbidden=new Set(obs.trails.map(t=>t.cellId));
 const owner=obs.self.slot+1,own=obs.map.cells.filter(c=>obs.owners[c.id]===owner);
 const boundary=own.filter(c=>c.neighbors.some(n=>n>=0&&obs.owners[n]!==owner)).sort((a,b)=>hexDistance(a,obs.map.cells[obs.self.cellId])-hexDistance(b,obs.map.cells[obs.self.cellId]));
 // Only nearby, visible borders influence the thief's choice of launch point.
 if(obs.self.personality==='SEEK_POINT'){
  const rank=(cell:typeof own[number])=>hexDistance(cell,obs.map.cells[obs.self.cellId])-(hexDistance(cell,obs.map.cells[obs.self.cellId])<obs.config.botObservationRange&&cell.neighbors.some(id=>id>=0&&obs.owners[id]!==0&&obs.owners[id]!==owner)?3:0);
  boundary.sort((a,b)=>rank(a)-rank(b));
 }
 const holdingRisk=holdingRiskMultiplier(obs.self.territoryCount,obs.map.cells.length,obs.roster?.length??obs.config.maxSlots);
 const candidates:{path:number[];score:number;goal:BotGoal;target?:number;slot?:number;expansion?:ExpansionPlan}[]=[];
 memory.attackTarget=null;memory.attackSlot=null;
 const attack=planAttack(obs,memory);if(attack)candidates.push(attack);
 for(const cp of GAME_MODES[obs.gameMode.id].usesControlPoints?obs.map.controlPoints:[])if(obs.owners[cp.cellId]!==owner){
  const outward=shortestPath(obs.map,obs.self.cellId,id=>id===cp.cellId,id=>!forbidden.has(id),12);
  const used=new Set(outward??[]);
  const back=outward&&shortestPath(obs.map,cp.cellId,id=>obs.owners[id]===owner,id=>!used.has(id)&&!forbidden.has(id),12);
  if(outward&&back&&outward.length+back.length<=24)candidates.push({path:[...outward,...back],score:settings.pointWeight-outward.length*0.3,goal:'SEEK_POINT'});
 }
 const crowded=obs.others.some(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=6);
 // The explorer's extra reach is for quiet space. Visible opponents keep its
 // footprint at the Phase 1 size even before they enter the crowded radius.
 const cautiousExplorer=obs.self.personality==='EXPAND'&&obs.others.length>0;
 const loopLength=cautiousExplorer?Math.min(settings.length,4):settings.length;
 const loopWidth=cautiousExplorer?Math.min(settings.width,3):settings.width;
 const damageBoundary=damageExpansionAnchors(obs,memory.emotion.damage,boundary);
 const boundaryTrace=decisionTraces.get(memory);if(boundaryTrace)boundaryTrace.damageBoundary={anchors:damageBoundary.damageAnchors,unreachable:damageBoundary.unreachable};
 for(const [anchorIndex,anchor] of damageBoundary.anchors.entries())for(let d=0;d<6;d++){
  const prefix=shortestPath(obs.map,obs.self.cellId,id=>id===anchor.id,id=>obs.owners[id]===owner,10);if(!prefix)continue;
  let current=anchor.id;const path=[...prefix];let valid=true,leftHome=false,closed=false;
  let length=crowded?1+Math.floor(memory.random()*2):Math.max(2,Math.floor(loopLength-1+memory.random()*3));
  let width=crowded?1:Math.max(1,Math.floor(loopWidth-1+memory.random()*3));
  const bevel=crowded?0:Math.floor(memory.random()*3);
  const naturalClosure=!crowded&&memory.random()<.35;
  const shape:ExpansionShape=obs.self.personality==='DEFEND'||crowded?(naturalClosure?'NATURAL':bevel?'BEVEL':'RHOMBUS'):EXPANSION_SHAPES[(anchorIndex*6+d+memory.seq)%EXPANSION_SHAPES.length];
  // Only an explorer near observed pressure scales down. Quiet-space reach
  // and all hard path/trail/proximity limits remain intact.
  const nearestHead=Math.min(...obs.others.map(p=>hexDistance(anchor,obs.map.cells[p.cellId])));
  const downScaled=obs.self.personality==='EXPAND'&&!crowded&&nearestHead<2*(length+width)*.65;
  if(downScaled){length=Math.max(2,length-1);width=Math.max(1,width-1);}
  const trace=decisionTraces.get(memory);if(trace)(trace.expansionCandidates??=[]).push(shape);
  const sides=expansionSides(shape,d,length,width,bevel);
  for(const [direction,length]of sides){if(!valid||closed)break;for(let step=0;step<length;step++){
   const next=obs.map.cells[current].neighbors[direction];if(next<0||forbidden.has(next)){valid=false;break;}
   path.push(next);current=next;
   if(obs.owners[next]!==owner)leftHome=true;else if(leftHome){closed=true;break;}
  }
  }
  if(valid&&['NATURAL','HOOK','ASYMMETRIC'].includes(shape)&&leftHome&&!closed){
   const used=new Set(path),back=shortestPath(obs.map,current,id=>obs.owners[id]===owner,id=>!used.has(id)&&!forbidden.has(id),24-path.length);
   if(back){path.push(...back);current=back.at(-1)??current;}else valid=false;
  }
  const reject=(reason:string)=>{if(trace){const reasons=trace.expansionRejected??={};reasons[reason]=(reasons[reason]??0)+1;}};
  if(!valid||path.length>24){reject(!valid?'BLOCKED_PATH':'PATH_BUDGET');continue;}
  if(!leftHome||obs.owners[current]!==owner){reject('NOT_CLOSED');continue;}
  const external=path.filter(id=>obs.owners[id]!==owner);
  // Any outside path cell is blocked from the capture flood, so these rejected
  // candidates cannot have zero gain. Keep the same guards/reason order/RNG,
  // but avoid a full-map flood whose result would immediately be discarded.
  if(external.length>settings.trailLimit||(crowded&&external.length>6)){reject('TRAIL_BUDGET');continue;}
  if(obs.others.some(enemy=>external.some(id=>hexDistance(obs.map.cells[id],obs.map.cells[enemy.cellId])<=2))){reject('NEAR_HEAD');continue;}
  const gain=plannedCapture(obs,path),stolen=gain.filter(id=>obs.owners[id]!==0).length;
  if(!gain.length){reject('NO_GAIN');continue;}
  const risk=external.reduce((sum,id)=>sum+obs.others.reduce((danger,p)=>danger+Math.max(0,4-hexDistance(obs.map.cells[id],obs.map.cells[p.cellId])),0),0);
  const first=obs.map.cells[path[0]??anchor.id].center,heading=normalizeDirection(first.x-obs.self.position.x,first.y-obs.self.position.y);
  const turn=heading?1-(heading.x*obs.self.direction.x+heading.y*obs.self.direction.y):0;
  const threatDistance=Math.min(...obs.others.flatMap(enemy=>external.map(id=>hexDistance(obs.map.cells[id],obs.map.cells[enemy.cellId]))));
  const excursionRisk=obs.self.personality==='EXPAND'?Math.max(0,(external.length-threatDistance)/obs.config.moveCellsPerSecond)*settings.risk*2:0;
  const repeatPenalty=obs.self.personality!=='DEFEND'&&memory.lastExpansionShape===shape?1.5:0;
  if(trace)(trace.expansionAccepted??=[]).push(shape);
  const baseScore=gain.length*(obs.self.personality==='EXPAND'?1.25:1)+stolen*settings.steal-path.length*0.35-risk*settings.risk*holdingRisk-turn*2-excursionRisk*holdingRisk-repeatPenalty+memory.random()*0.5;
  const response=expansionDamageBonus(obs,memory.emotion,gain,baseScore,memory.identity);
  candidates.push({path,score:baseScore+response.bonus,goal:stolen>gain.length/2?'STEAL':'EXPAND',expansion:{response,anchor:anchor.id,shape,pathLength:path.length,externalLength:external.length,captureSize:gain.length,stolenCells:stolen,earlyClosed:false,downScaled,threatDistance}});
 }
 const candidateListener=botCandidateListener(memory),ordinals=candidateListener?new Map(candidates.map((c,i)=>[c,i])):undefined;
 candidates.sort((a,b)=>b.score-a.score);
 const evaluated=decisionTraces.get(memory);if(evaluated)evaluated.expansionScores=candidates.map(c=>({shape:c.expansion?.shape,goal:c.goal,score:c.score,response:c.expansion?.response,anchor:c.expansion?.anchor}));
 // Evaluate in score order: a soon-blocked loop cannot be selected. Same pure
 // one-second predicate as the per-tick immediate guard, no additional RNG.
 let selected:typeof candidates[number]|undefined;
 for(const candidate of candidates){const safety=evaluateDepartureSafety(obs,candidate.path,candidate.goal);
  if(safety.blocked){recordDepartureSafety(memory,{type:'candidate',tick:obs.tick,result:safety});if(evaluated){const score=evaluated.expansionScores?.[candidates.indexOf(candidate)];if(score)score.departureBlocked=safety.reason??'UNKNOWN';const counts=evaluated.expansionRejected??={};counts['LAUNCH_'+safety.reason]=(counts['LAUNCH_'+safety.reason]??0)+1;}continue;}
  if(expansionPerimeterBlocked(obs,candidate.path,candidate.goal))continue;
  selected=candidate;break;
 }memory.attackSurvival=selected?.goal==='ATTACK'&&'survival' in selected?!!selected.survival:false;memory.goal=selected?.goal??'RETURN';memory.attackTarget=selected?.target??null;memory.attackSlot=selected?.slot??null;
 const trace=decisionTraces.get(memory);if(trace){trace.reason=selected?.expansion?'EXPANSION_SCORE':selected?.goal==='ATTACK'?'ATTACK_SCORE':selected?'POINT_SCORE':'NO_EXPANSION';trace.expansionPlan=selected?.expansion;if(selected?.expansion)trace.expansionPath=[...selected.path];}
 memory.expansion=selected?.expansion;if(selected?.expansion)memory.lastExpansionShape=selected.expansion.shape;
 if(candidateListener)candidateListener(obs,{kind:'STRATEGY',candidates:candidates.map(c=>({...c,ordinal:ordinals!.get(c),path:[...c.path],expansion:c.expansion?{...c.expansion,response:c.expansion.response?{...c.expansion.response}:undefined}:undefined})),selectedIndex:selected?candidates.indexOf(selected):-1});
 return selected?.path??returnPath(obs)??[];
}

export function selectBotStrategicPlan(obs:BotObservation,memory:BotMemory,returnOnly:boolean,atHome:boolean,setPath:(path:number[],force?:boolean)=>void,trace?:BotDecisionTrace){
  if(!memory.path.length&&returnOnly){const safe=obs.map.cells[obs.self.cellId].neighbors.filter(id=>obs.owners[id]===obs.self.slot+1);if(safe.length)setPath([safe[Math.floor(memory.random()*safe.length)]],true);}
  if(!memory.path.length&&!returnOnly&&atHome){
   const selection=!obs.ownTrail.length?selectReposition(obs,memory.emotion,memory.reposition,memory.identity,shortestPath):null;memory.reposition.selection=selection;
   if(selection?.plan){startReposition(obs,memory.reposition,selection.plan);setPath(selection.plan.path,true);memory.goal='REPOSITION';memory.expansion=undefined;memory.attackTarget=null;memory.attackSlot=null;if(trace)trace.reason='REPOSITION_START';}
   else setPath(planExpansion(obs,memory),true);
  }
  // No useful expansion: patrol an owned cell in front, never aim at (0,0).
  if(!memory.path.length){
   const safe=obs.map.cells[obs.self.cellId].neighbors.filter(id=>id>=0&&obs.owners[id]===obs.self.slot+1);
   safe.sort((a,b)=>{const score=(id:number)=>{const c=obs.map.cells[id].center,d=normalizeDirection(c.x-obs.self.position.x,c.y-obs.self.position.y)!;return d.x*obs.self.direction.x+d.y*obs.self.direction.y;};return score(b)-score(a);});
   if(safe.length){setPath([safe[0]],true);if(trace)trace.reason='HOME_PATROL';}
  }
}
