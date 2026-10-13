import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BotHoldingTracker} from '../tests/bot-holding-tracker.js';
import {BotRecoveryBaselineTracker} from '../tests/bot-recovery-baseline-tracker.js';
const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-phase04-perimeter-analysis');
const protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const source=protocol.instrumented,load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const [game,bot,identity,director,respawn,hex,movement,capture,hook]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','hex','movement','capture-diagnostics','bot-perimeter-audit-hook'].map(load));
for(const [file,hash] of Object.entries(protocol.instrumentedHashes))assert.equal(createHash('sha256').update(readFileSync(resolve(source,'src/shared',file))).digest('hex'),hash);
const referencePath=process.argv.find(v=>v.startsWith('--reference='))?.slice(12);
const reference=JSON.parse(readFileSync(referencePath??resolve(root,'../bot-phase03-closeout/post-master.json'),'utf8'));
const prior=referencePath?undefined:JSON.parse(readFileSync(resolve(root,'../bot-phase03b-tactical-review/tactical.json'),'utf8'));
const candidateModule=await load('bot-candidate-diagnostics'),safety=await load('bot-immediate-safety');
const clone=(v:any)=>JSON.parse(JSON.stringify(v)),inc=(r:any,k:string,n=1)=>r[k]=(r[k]??0)+n;
const memoryHash=(memories:Map<string,any>)=>createHash('sha256').update(JSON.stringify([...memories].map(([id,m])=>[id,{...m,random:undefined}]),(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v)).digest('hex');
const depth=(map:any,id:number)=>map.radius-hex.hexDistance(map.cells[id],{q:0,r:0});
const forecast=(obs:any,intent:any)=>{
 let position=obs.self.position,cell=obs.self.cellId,heading=obs.self.direction;const visited=[cell];
 for(let n=0;n<Math.ceil(obs.config.simulationHz*.65);n++){
  const next=movement.stepSteering(obs.map,position,cell,heading,intent,obs.config);visited.push(...next.entries.map((e:any)=>e.cellId));
  if(next.blocked)return {blocked:true,firstWallSeconds:(n+(next.boundaryT??0))/obs.config.simulationHz,visited:[...new Set(visited)]};
  position=next.position;cell=next.cellId;heading=next.direction;
 }
 return {blocked:false,firstWallSeconds:null,visited:[...new Set(visited)]};
};
const reports=[];
for(const seed of protocol.seeds){
 const match=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(match,true);
 const memories=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const latest=new Map<string,any>(),preludes=new Map<string,any>(),immediates=new Map<string,any>(),alternatives=new Map<string,any>(),alternativeSelections:any[]=[];
 const holding=new BotHoldingTracker(match),legacy=new BotRecoveryBaselineTracker(match,capture.watchCaptureTransfers);
 const trajectory=createHash('sha256'),traceHash=createHash('sha256'),episodes:any[]=[],guards:any[]=[],active=new Map<string,any>(),pending:any[]=[];
 let sequence=0;
 const rows=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,{slot:p.slot,personality:p.personality,trait:memories.get(p.participantId).identity.secondaryTrait,spawn:{cell:p.cellId,q:match.map.cells[p.cellId].q,r:match.map.cells[p.cellId].r,depth:depth(match.map,p.cellId)},aliveTicks:0,nearWallTicks:0,nearWallExpansionTicks:0,life1NearWallTicks:0,otherLifeNearWallTicks:0,selected:0,selectedNearWall:0,adopted:0,guards:0,expansionGuardStops:0,discardedSelections:0,repeatGuardsWithin2s:0,nearByDepth:{},guardsByDepth:{}}]));
 const lifeSpawns=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,{life:p.lifeId,cell:p.cellId,depth:depth(match.map,p.cellId),tick:0}])),spawnRecords=match.participants.map((p:any)=>({participantId:p.participantId,slot:p.slot,personality:p.personality,...lifeSpawns.get(p.participantId)}));
 for(const [id,memory] of memories){
  bot.watchBotDecisions(memory,(t:any)=>latest.set(id,t),{shadow:false});
  if(referencePath)candidateModule.watchBotCandidates(memory,(obs:any,batch:any)=>{
   if(batch.kind!=='STRATEGY')return;
   const oldIndex=batch.candidates.findIndex((c:any)=>!safety.evaluateDepartureSafety(obs,c.path,c.goal).blocked),old=batch.candidates[oldIndex],chosen=batch.candidates[batch.selectedIndex];
   if(old&&safety.expansionPerimeterBlocked(obs,old.path,old.goal))alternatives.set(id,{seed,slot:obs.self.slot,tick:obs.tick,oldIndex,selectedIndex:batch.selectedIndex,oldGoal:old.goal,selectedGoal:chosen?.goal??'RETURN',oldPath:[...old.path],selectedPath:chosen?[...chosen.path]:[],executedExpansion:false});
  });
  hook.watchPerimeterAudit(memory,{prelude:(obs:any,trace:any)=>preludes.set(id,clone(trace)),immediate:(obs:any,m:any,intent:any,escape:any)=>{
   const wallDepth=depth(obs.map,obs.self.cellId);immediates.set(id,{tick:obs.tick,life:obs.self.lifeId,goal:m.goal,path:[...m.path],expansion:m.expansion?clone(m.expansion):null,position:{...obs.self.position},heading:{...obs.self.direction},cell:obs.self.cellId,wallDepth,line:[...match.participants.find((p:any)=>p.participantId===id).trailCells],intent:{...intent},escape:escape?{...escape}:null,
    projection:escape?forecast(obs,intent):null,escapeProjection:escape?forecast(obs,escape):null});
  }});
 }
 const close=(episode:any,reason:string,tick:number)=>{if(episode.ended===null){episode.ended=tick;episode.outcome=reason;active.delete(episode.participantId);}};
 for(let t=0;t<protocol.ticks;t++){
  latest.clear();preludes.clear();immediates.clear();alternatives.clear();const beforeCounter=match.eventCounter;
  const inputs=director.getBotInputs(match,memories);
  trajectory.update(JSON.stringify([...inputs]));traceHash.update(JSON.stringify([...latest]));
  for(const p of match.participants){
   const id=p.participantId,row=rows.get(id),m=memories.get(id),pre=preludes.get(id),im=immediates.get(id),trace=latest.get(id);
   const alternative=alternatives.get(id);if(alternative){alternative.executedExpansion=['EXPAND','STEAL'].includes(m.goal)&&!im?.escape;alternativeSelections.push(alternative);}
   legacy.before(id,p.lifeId,trace);
   let episode=active.get(id);if(episode&&episode.life!==p.lifeId){close(episode,'LIFE_CHANGE',t);episode=undefined;}
   if(p.lifeState!=='ALIVE')continue;
   row.aliveTicks++;const d=depth(match.map,p.cellId);if(d<=2){row.nearWallTicks++;inc(row.nearByDepth,String(d));if(p.lifeId===1)row.life1NearWallTicks++;else row.otherLifeNearWallTicks++;}
   if(pre?.expansionPlan){
    if(episode)close(episode,'RESELECTED',t);
    const firstExternal=(pre.expansionPath??[]).find((cell:number)=>match.owners[cell]!==p.slot+1),anchor=pre.expansionPlan.anchor;
    const directionKey=anchor!==undefined&&firstExternal!==undefined?[match.map.cells[firstExternal].q-match.map.cells[anchor].q,match.map.cells[firstExternal].r-match.map.cells[anchor].r]:null;
    episode={id:[seed,p.slot,p.lifeId,++sequence].join(':'),participantId:id,slot:p.slot,personality:p.personality,life:p.lifeId,selected:t,adopted:false,launched:null,ended:null,outcome:'OPEN',plan:pre.expansionPlan,path:pre.expansionPath??[],firstExternal,directionKey,startDepth:d,nearWallStart:d<=2,nearWallTicks:0,exposedTicks:0,captureCells:0,guardIndex:null};
    episodes.push(episode);row.selected++;if(d<=2)row.selectedNearWall++;
   }
   // A tactical abort occurred before perimeter steering; it is not a wall-caused expansion stop.
   if(episode)episode.closingEarly||=!!pre?.earlyClosure||!!im?.expansion?.earlyClosed;
   const early=episode?.closingEarly;
   const interrupted=episode&&im&&(!['EXPAND','STEAL'].includes(im.goal)&&!(im.goal==='RETURN'&&early));
   if(episode&&(trace?.departure||interrupted)){
    close(episode,trace?.departure?'DEPARTURE_BLOCKED':'TACTICAL_'+im.goal,t);episode=undefined;
   }
   if(im?.escape){
    row.guards++;inc(row.guardsByDepth,String(d));assert.equal(im.projection.blocked,true);assert.equal(im.escapeProjection.blocked,false);
    const sameTick=episode?.selected===t;
    const category=episode?(sameTick?'SELECTION_DISCARDED':episode.launched===null?'ADOPTED_BEFORE_LAUNCH':'EXPOSED_EXPANSION'):'NO_ACTIVE_EXPANSION';
    const signature=episode?JSON.stringify([episode.plan.anchor,episode.plan.shape,episode.path]):JSON.stringify([im.goal,im.path]);
    const boundaryDirectionKey=episode?JSON.stringify([episode.plan.anchor,episode.directionKey]):null;
    const recent=guards.filter((g:any)=>g.participantId===id&&g.life===p.lifeId&&t-g.tick<=60);
    const repeat=recent.some((g:any)=>g.signature===signature),repeatBoundaryDirection=boundaryDirectionKey!==null&&recent.some((g:any)=>g.boundaryDirectionKey===boundaryDirectionKey);
    if(repeat)row.repeatGuardsWithin2s++;
    const spawn=lifeSpawns.get(id);assert.equal(spawn.life,p.lifeId);
    const guard={seed,participantId:id,slot:p.slot,personality:p.personality,trait:row.trait,life:p.lifeId,tick:t,wallDepth:d,spawnDepth:row.spawn.depth,currentSpawnDepth:spawn.depth,currentSpawnCell:spawn.cell,ticksSinceSpawn:t-spawn.tick,spawnDistance:hex.hexDistance(match.map.cells[row.spawn.cell],match.map.cells[p.cellId]),currentSpawnDistance:hex.hexDistance(match.map.cells[spawn.cell],match.map.cells[p.cellId]),category,episodeId:episode?.id??null,signature,boundaryDirectionKey,repeatWithin2s:repeat,repeatBoundaryDirectionWithin2s:repeatBoundaryDirection,D:episode?.plan.response?.bonus??0,anchor:episode?.plan.anchor??null,preludeReason:pre?.reason??null,preludeSafety:pre?.safetyOverride??null,goalBefore:im.goal,pathBefore:im.path,position:im.position,heading:im.heading,intent:im.intent,escape:im.escape,projection:im.projection,escapeProjection:im.escapeProjection,lineCells:im.line.length,
     follow:{stopTick:t+60,observedTicks:0,complete:false,capturedCells:0,captures:0,homeAt:null,expansionRestartAt:null,diedAt:null,deathCause:null,repeatGuardTicks:[]}};
    guards.push(guard);pending.push(guard);
    for(const old of pending)if(old!==guard&&old.participantId===id&&old.life===p.lifeId&&t<=old.follow.stopTick)old.follow.repeatGuardTicks.push(t);
    if(episode){episode.guardIndex=guards.length-1;row.expansionGuardStops++;if(sameTick)row.discardedSelections++;close(episode,'PERIMETER_GUARD',t);episode=undefined;}
   }else if(episode){
    if(!episode.adopted){episode.adopted=true;row.adopted++;active.set(id,episode);}
    if(p.trailCells.size||match.owners[p.cellId]!==p.slot+1)episode.launched??=t;
    if(d<=2){episode.nearWallTicks++;row.nearWallExpansionTicks++;}
    if(p.trailCells.size)episode.exposedTicks++;
   }
  }
  game.stepMatch(match,inputs);holding.afterTick();
  const events=match.events.filter((e:any)=>Number(e.eventId.split(':').at(-1))>beforeCounter);
  for(const e of events){if(e.type==='CAPTURE')legacy.captured(e.participantId);if(e.type==='DEATH')legacy.death(e.participantId);if(e.type==='SPAWN'){const p=match.participants.find((p:any)=>p.participantId===e.participantId),spawn={life:p.lifeId,cell:p.cellId,depth:depth(match.map,p.cellId),tick:match.tick};lifeSpawns.set(p.participantId,spawn);spawnRecords.push({participantId:p.participantId,slot:p.slot,personality:p.personality,...spawn});}}
  legacy.afterTick();
  trajectory.update(match.owners);trajectory.update(Buffer.from(match.trailMasks.buffer,match.trailMasks.byteOffset,match.trailMasks.byteLength));trajectory.update(JSON.stringify(match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  for(const p of match.participants){const episode=active.get(p.participantId);if(episode){
   const died=events.find((e:any)=>e.type==='DEATH'&&e.participantId===p.participantId),captured=events.find((e:any)=>e.type==='CAPTURE'&&e.participantId===p.participantId);
   if(died)close(episode,'DEATH',match.tick);else if(captured){episode.captureCells=captured.amount??0;close(episode,'CAPTURE',match.tick);}else if(p.lifeId!==episode.life)close(episode,'LIFE_CHANGE',match.tick);else if(episode.launched!==null&&!p.trailCells.size&&match.owners[p.cellId]===p.slot+1)close(episode,'HOME',match.tick);
  }}
  for(let i=pending.length-1;i>=0;i--){const g=pending[i],p=match.participants.find((p:any)=>p.participantId===g.participantId),f=g.follow;
   f.observedTicks++;const death=events.find((e:any)=>e.type==='DEATH'&&e.participantId===p.participantId&&e.lifeId===g.life);
   // CAPTURE does not carry lifeId. The participant's resolved life identifies
   // its capture in this step; death retains lifeId and respawn starts a new one.
   for(const e of events)if(e.type==='CAPTURE'&&e.participantId===p.participantId&&p.lifeId===g.life){f.captures++;f.capturedCells+=e.amount??0;}
   if(p.lifeState==='ALIVE'&&p.lifeId===g.life){if(!p.trailCells.size&&match.owners[p.cellId]===p.slot+1)f.homeAt??=match.tick;const m=memories.get(p.participantId);if(['EXPAND','STEAL'].includes(m.goal))f.expansionRestartAt??=match.tick;}
   if(death){f.diedAt=match.tick;f.deathCause=death.deathContext?.cause??death.reason;pending.splice(i,1);}else if(p.lifeId!==g.life||match.tick>=f.stopTick){f.complete=match.tick>=f.stopTick&&p.lifeId===g.life;pending.splice(i,1);}
  }
 }
 for(const episode of active.values())close(episode,'CENSORED',match.tick);
 const equivalenceProof={traceHash:traceHash.digest('hex'),memoryHash:memoryHash(memories),nextRng:Object.fromEntries([...memories].map(([id,m])=>[id,m.random()]))};
 const trajectoryHash=trajectory.digest('hex'),direct=director.botDirector(match).snapshot(),expected=reference.reports.find((r:any)=>r.seed===seed);
 assert.equal(trajectoryHash,expected.trajectoryHash);assert.deepEqual(equivalenceProof,expected.equivalenceProof);assert.deepEqual(direct,expected.director);
 const legacyCounts=legacy.snapshot();if(prior){const old=prior.reports.find((r:any)=>r.seed===seed);assert.deepEqual(legacyCounts,old.supplementaryRecovery);}
 assert.equal(guards.length,legacyCounts.reduce((n:number,p:any)=>n+p.guardTicks,0));
 const result={seed,ticks:match.tick,trajectoryHash,equivalenceProof,director:direct,holding:holding.snapshot(),deaths:match.participants.reduce((n:number,p:any)=>n+p.deaths,0),wallDeaths:match.events.filter((e:any)=>e.type==='DEATH'&&e.reason==='WALL_HIT').length,rows:[...rows.values()],spawnRecords,legacy:legacyCounts,episodes,guards,alternativeSelections,verification:'Trajectory, all native final traces, full memory, next RNG and reservations identical to the same-arm native source. Guard counters cross-checked.'};
 legacy.dispose();writeFileSync(resolve(root,'seed-'+seed+'.json'),JSON.stringify(result,null,2));reports.push({seed,result:'seed-'+seed+'.json',guards:guards.length,episodes:episodes.length,allEquivalent:true});console.error('Finished perimeter seed '+seed+' guards='+guards.length+' episodes='+episodes.length);
}
writeFileSync(resolve(root,'index.json'),JSON.stringify({protocol:resolve(root,'protocol.json'),reports},null,2)+'\n');
