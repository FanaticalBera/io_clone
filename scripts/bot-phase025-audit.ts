import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {hexDistance} from '../src/shared/hex.js';
import type {BotDecisionTrace} from '../src/shared/bot.js';
import type {Personality} from '../src/shared/model.js';
// Same audit against a pristine source snapshot or the current workspace.
const source=resolve(process.argv.find(a=>a.startsWith('--source='))?.slice(9)??'.');
const load=(path:string)=>import(pathToFileURL(resolve(source,path)).href);
const [game,bot,identity,director,respawn,growthModule]=await Promise.all([
 load('src/shared/game.ts'),load('src/shared/bot.ts'),load('src/shared/bot-identity.ts'),load('src/shared/bot-director.ts'),load('src/shared/safe-bot-respawn.ts'),load('tests/bot-growth-tracker.ts')]);
const reports=[];
const increment=(table:Record<string,number>,key:string,n=1)=>table[key]=(table[key]??0)+n;
for(const seed of [4,19,73]){
 const m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const growth=new growthModule.BotGrowthTracker(m),latest=new Map<string,BotDecisionTrace>();
 const stats=new Map<Personality,any>();
 for(const name of identity.BOT_PERSONALITIES)stats.set(name,{aliveFrames:0,goalFrames:{},decisions:0,newPlanDecisions:0,continuationDecisions:0,noAttackCandidates:0,attackCandidateObservations:0,
  attackReasons:{},newPlanAttackReasons:{},continuationAttackReasons:{},selectableAttackCandidates:0,selectedAttackDecisions:0,selectableButNotSelected:0,
  expansionPlans:0,shapes:{},externalLengthSum:0,crowdedPlans:0,crowdedSmallPlans:0,bonusedPlans:0,reclaimPlans:0,vengeancePlans:0,
  captures:0,totalCapture:0,stolenCells:0,reclaimedCells:0,revengeCells:0,actualReclaimCaptures:0,responseSeconds:[],internalCellMoves:0,externalCellMoves:0,deaths:0});
 const lost=new Map<string,Map<number,{attackerId:string;tick:number}>>(m.participants.map((p:any)=>[p.participantId,new Map()])),deathDetails:any[]=[],boundary={decisionsWithDamage:0,unreachableBoundaryObservations:0},memoryPeaks={regions:0,perOpponent:0};
 const trajectory=createHash('sha256');
 let totalCapture=0,captures=0,walls=0;
 for(const [id,memory]of memories)bot.watchBotDecisions(memory,(trace:BotDecisionTrace)=>latest.set(id,trace),{shadow:false});
 for(let t=0;t<3600;t++){
  latest.clear();const before=m.eventCounter,owners=m.owners.slice(),lives=new Map(m.participants.map((p:any)=>[p.participantId,p.lifeId])),cells=new Map(m.participants.map((p:any)=>[p.participantId,p.cellId]));
  const inputs=director.getBotInputs(m,memories);
  for(const p of m.participants){const memory=memories.get(p.participantId)!,trace=latest.get(p.participantId),s=stats.get(p.personality)!;growth.before(p,trace);
   if(p.lifeState==='ALIVE'){s.aliveFrames++;increment(s.goalFrames,memory.goal);}
   const regions=memory.emotion.damage?.regions as Map<number,{attackerId:string}>|undefined;
   if(regions){memoryPeaks.regions=Math.max(memoryPeaks.regions,regions.size);const counts=new Map<string,number>();for(const r of regions.values())counts.set(r.attackerId,(counts.get(r.attackerId)??0)+1);memoryPeaks.perOpponent=Math.max(memoryPeaks.perOpponent,...counts.values());}
   if(!trace)continue;s.decisions++;const fresh=!!trace.expansionPlan||trace.planChanged;s[fresh?'newPlanDecisions':'continuationDecisions']++;if(!trace.attacks.length)s.noAttackCandidates++;
   const unique=new Map(trace.attacks.map(a=>[[a.slot,a.target,a.interrupt,a.reason].join(':'),a]));
   for(const a of unique.values()){s.attackCandidateObservations++;increment(s.attackReasons,a.reason);increment(fresh?s.newPlanAttackReasons:s.continuationAttackReasons,a.reason);if(a.reason==='SELECTABLE')s.selectableAttackCandidates++;}
   if(trace.to==='ATTACK')s.selectedAttackDecisions++;else if([...unique.values()].some(a=>a.reason==='SELECTABLE'))s.selectableButNotSelected++;
   if(trace.damageBoundary){if(memory.emotion.damage.regions.size)boundary.decisionsWithDamage++;boundary.unreachableBoundaryObservations+=trace.damageBoundary.unreachable;}
   const plan=trace.expansionPlan;if(plan){s.expansionPlans++;increment(s.shapes,plan.shape);s.externalLengthSum+=plan.externalLength;
    const crowded=m.participants.some((q:any)=>q!==p&&q.lifeState==='ALIVE'&&hexDistance(m.map.cells[p.cellId],m.map.cells[q.cellId])<=6);
    if(crowded){s.crowdedPlans++;if(plan.externalLength<=6)s.crowdedSmallPlans++;}
    if((plan.response?.bonus??0)>0)s.bonusedPlans++;if((plan.response?.reclaimCells??0)>0)s.reclaimPlans++;if((plan.response?.revengeCells??0)>0)s.vengeancePlans++;
   }
  }
  // Audit-only grudge amounts, never supplied to AI.
  const grudges=new Map([...memories].map(([id,memory])=>[id,new Map(memory.emotion.grudge)]));
  trajectory.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);growth.after(before);
  trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));trajectory.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  const recaptureOwners=new Set<number>();
  for(let id=0;id<owners.length;id++)if(owners[id]&&m.owners[id]&&owners[id]!==m.owners[id]){
   const victim=m.participants.find((p:any)=>p.slot+1===owners[id]),winner=m.participants.find((p:any)=>p.slot+1===m.owners[id]);if(!winner||!victim)continue;
   const s=stats.get(winner.personality)!,remembered=lost.get(winner.participantId)!.get(id);s.stolenCells++;
   if(remembered&&m.tick-remembered.tick<=60*m.config.simulationHz){s.reclaimedCells++;s.responseSeconds.push((m.tick-remembered.tick)/m.config.simulationHz);recaptureOwners.add(winner.slot);}
   if(((grudges.get(winner.participantId)!.get(victim.participantId) as any)?.amount??0)>0)s.revengeCells++;
   lost.get(winner.participantId)!.delete(id);lost.get(victim.participantId)!.set(id,{attackerId:winner.participantId,tick:m.tick});
  }
  for(const slot of recaptureOwners)stats.get(m.participants.find((p:any)=>p.slot===slot).personality)!.actualReclaimCaptures++;
  for(const p of m.participants){const s=stats.get(p.personality)!,memory=lost.get(p.participantId)!;
   if(p.lifeState!=='ALIVE'||p.lifeId!==lives.get(p.participantId))memory.clear();else if(p.cellId!==cells.get(p.participantId))s[m.owners[p.cellId]===p.slot+1?'internalCellMoves':'externalCellMoves']++;
   for(const [id,r]of memory)if(m.owners[id]===p.slot+1||m.tick-r.tick>60*m.config.simulationHz)memory.delete(id);
  }
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before){const p=m.participants.find((p:any)=>p.participantId===e.participantId),s=stats.get(p.personality)!;
   if(e.type==='CAPTURE'&&(e.amount??0)>0){totalCapture+=e.amount;captures++;s.captures++;s.totalCapture+=e.amount;}
   if(e.type==='DEATH'){s.deaths++;if(e.reason==='WALL_HIT')walls++;const mem=memories.get(p.participantId)!;deathDetails.push({slot:p.slot,personality:p.personality,tick:e.tick,reason:e.reason,cause:e.deathContext?.cause,goal:mem.goal,grudge:Math.max(0,...[...mem.emotion.grudge.values()].map((r:any)=>r.amount)),responseBonus:mem.expansion?.response?.bonus??0});}
  }
 }
 const groups=[...stats].map(([personality,s])=>({...s,personality,meanExternalLength:s.externalLengthSum/(s.expansionPlans||1),stolenShare:s.stolenCells/(s.totalCapture||1),meanCapture:s.totalCapture/(s.captures||1),meanReclaimSeconds:s.responseSeconds.length?s.responseSeconds.reduce((a:number,b:number)=>a+b,0)/s.responseSeconds.length:null,responseSeconds:undefined}));
 const goalDistances=[];for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const a=groups[i],b=groups[j],goals=new Set([...Object.keys(a.goalFrames),...Object.keys(b.goalFrames)]);goalDistances.push({a:a.personality,b:b.personality,totalVariation:[...goals].reduce((sum,key)=>sum+Math.abs((a.goalFrames[key]??0)/(a.aliveFrames||1)-(b.goalFrames[key]??0)/(b.aliveFrames||1)),0)/2});}
 reports.push({seed,trajectoryHash:trajectory.digest('hex'),seconds:120,mapRadius:56,spawnCells:7,bots:14,safeRespawn:true,classic:true,totalCapture,captures,walls,deaths:m.participants.reduce((sum:number,p:any)=>sum+p.deaths,0),growth:growth.snapshot(),personalities:groups,goalDistances,boundary,memoryPeaks,deathDetails,director:director.botDirector(m).snapshot()});growth.dispose();
}
console.log(JSON.stringify({source,measurement:'Real movement. Steal/recapture cells sampled at tick boundaries, excluding neutral ownership and respawn grants; transfers neutralized within the same tick may be omitted. Grudge/candidate counts distinguish plan creation and continuation; within-decision identical slot/cell/interrupt/reason is counted once. No behavior tuning.',reposition:'DEFERRED; no relocation or ping-pong measurements claimed',reports},null,2));
