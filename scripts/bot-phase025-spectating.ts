import {watchCaptureTransfers} from '../src/shared/capture-diagnostics.js';
import {BotReclaimDiagnostics} from '../src/shared/bot-reclaim-diagnostics.js';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {getBotInputs} from '../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
import {watchReposition,watchRepositionSelection} from '../src/shared/bot-reposition.js';
import {hexDistance} from '../src/shared/hex.js';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const local='../bot-phase025-spectating';mkdirSync(local,{recursive:true});
const cases=[{seed:137,windows:[{slot:5,start:1000,end:3900}]},{seed:47,windows:[{slot:9,start:1000,end:2650},{slot:5,start:2600,end:5000}]},{seed:73,windows:[{slot:13,start:1300,end:3750}]},{seed:19,windows:[{slot:2,start:0,end:3600}]}];
const increment=(r:Record<string,number>,key:string,n=1)=>r[key]=(r[key]??0)+n;
const reference=JSON.parse(readFileSync('../bot-phase025-closeout/current.json','utf8'));
const requested=process.argv.find(a=>a.startsWith('--seeds='))?.slice(8).split(',').map(Number);
for(const c of cases.filter(c=>!requested||requested.includes(c.seed))){
 const m=createMatch({mapRadius:56,spawnRadius:1},c.seed,botSpecs(14,0,'bot',{seed:c.seed}));setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(c.seed,p.slot),'combined',createBotIdentity(botSeed(c.seed,p.slot),p.personality!))]));
 const traces=new Map<string,BotDecisionTrace>(),lost=new Map(m.participants.map(p=>[p.participantId,new Map<number,number>()])),hash=createHash('sha256');let prefixHash='';
 const rows=c.windows.map(w=>({window:w,slot:w.slot,nickname:m.participants[w.slot].nickname,personality:m.participants[w.slot].personality,trait:memories.get(m.participants[w.slot].participantId)!.identity?.secondaryTrait,aliveFrames:0,deadFrames:0,goalFrames:{} as Record<string,number>,nearestSum:0,near2Frames:0,near6Frames:0,visibleHeadSum:0,holdingSum:0,startHolding:0,endHolding:0,reasons:{} as Record<string,number>,rejections:{} as Record<string,number>,candidateCalls:0,acceptedCandidates:0,noSafeCandidates:0,totalCapture:0,stolenCells:0,reclaimedCells:0,lostToCapture:0,losses:[] as any[],deaths:[] as any[],kills:[] as any[],captures:[] as any[],plans:[] as any[],samples:[] as any[],rp:[] as any[],hudPlans:[] as any[],captureTransfers:[] as any[],rpSelection:{} as Record<string,number>,blocks:[] as any[]}));
 const active=(r:typeof rows[number],tick:number)=>tick>=r.window.start&&tick<r.window.end;
 const stopTransfers=watchCaptureTransfers(m,transfer=>{for(const gain of transfer.gains)for(const r of rows)if(gain.participantId===m.participants[r.slot].participantId&&active(r,m.tick))r.captureTransfers.push({tick:transfer.eventTick,cells:gain.cells});});
 const watched=new Map(rows.map(r=>{const p=m.participants[r.slot];return [p.participantId,memories.get(p.participantId)!] as const;})),hudReclaim=new BotReclaimDiagnostics(m,watched);
 hudReclaim.onClose=plan=>{for(const r of rows)if(plan.slot===r.slot&&(active(r,plan.selectedTick)||plan.endedTick!==null&&active(r,plan.endedTick)))r.hudPlans.push(plan);};
 for(const [id,memory]of memories)watchBotDecisions(memory,t=>{traces.set(id,t);if(watched.has(id))hudReclaim.decision(id,t);},{shadow:false});
 for(const r of rows){const mem=memories.get(m.participants[r.slot].participantId)!;
  watchReposition(mem.reposition,e=>{if(active(r,e.startedTick)||e.endedTick!==null&&active(r,e.endedTick))r.rp.push(e);});
  watchRepositionSelection(mem.reposition,s=>{if(active(r,m.tick))increment(r.rpSelection,s.reason);});
 }
 const ticks=Math.max(3600,...c.windows.map(w=>w.end));
 for(let i=0;i<ticks;i++){
  const reclaimBefore=new Map(rows.map(r=>[r.slot,r.reclaimedCells]));
  const t=m.tick,before=m.eventCounter,owners=m.owners.slice(),lives=new Map(m.participants.map(p=>[p.participantId,p.lifeId]));traces.clear();
  const inputs=getBotInputs(m,memories);
  for(const r of rows)if(active(r,t)){
   const p=m.participants[r.slot],memory=memories.get(p.participantId)!,trace=traces.get(p.participantId),heads=m.participants.filter(q=>q!==p&&q.lifeState==='ALIVE').map(q=>({slot:q.slot,d:hexDistance(m.map.cells[p.cellId],m.map.cells[q.cellId])})).filter(q=>q.d<=m.config.botObservationRange),nearest=Math.min(...heads.map(q=>q.d));
   if(t===r.window.start)r.startHolding=p.territoryCount;
   r.endHolding=p.territoryCount;r.holdingSum+=p.territoryCount;
   if(p.lifeState==='ALIVE'){r.aliveFrames++;increment(r.goalFrames,memory.goal);r.nearestSum+=Number.isFinite(nearest)?nearest:m.config.botObservationRange+1;r.visibleHeadSum+=heads.length;r.near2Frames+=Number(nearest<=2);r.near6Frames+=Number(nearest<=6);}else r.deadFrames++;
   const snapshot={attackSlot:memory.attackSlot,damageRecent:Object.fromEntries([...memory.emotion.damage.recent].map(([id,ss])=>[id,ss.reduce((n,q)=>n+q.cells,0)])),tick:t,lifeId:p.lifeId,life:p.lifeState,holding:p.territoryCount,goal:memory.goal,ownTrail:p.trailCells.size,nearest:Number.isFinite(nearest)?nearest:null,heads:heads.filter(q=>q.d<=7),damageRegions:memory.emotion.damage.regions.size,reason:trace?.reason,rejected:trace?.expansionRejected,safety:trace?.safetyOverride,repositionEvent:trace?.repositionEvent,bonus:memory.expansion?.response?.bonus??0,D:memory.expansion?.response?.reclaimCells??0,planPath:memory.path.length};
   if(t%30===0||trace?.planChanged)r.samples.push(snapshot);
   if(trace){increment(r.reasons,trace.reason??'NONE');for(const [why,n]of Object.entries(trace.expansionRejected??{}))increment(r.rejections,why,n);
    if(trace.expansionCandidates){r.candidateCalls++;r.acceptedCandidates+=trace.expansionScores?.length??0;if(!trace.expansionScores?.some(q=>!q.departureBlocked))r.noSafeCandidates++;}
    if(trace.planChanged||trace.reason==='HOME_PATROL')r.plans.push({...snapshot,candidates:trace.expansionScores,plan:trace.expansionPlan});
   }
  }
  if(t<3600)hash.update(JSON.stringify([...inputs]));stepMatch(m,inputs);hudReclaim.afterTick();
  if(t<3600){hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(m.tick===3600)prefixHash=hash.digest('hex');}
  for(let id=0;id<owners.length;id++)if(owners[id]&&m.owners[id]&&owners[id]!==m.owners[id]){
   const victim=m.participants[owners[id]-1],winner=m.participants[m.owners[id]-1],remembered=lost.get(winner.participantId)!.get(id);
   for(const r of rows)if(active(r,t)){if(r.slot===victim.slot){r.lostToCapture++;const last=r.losses.at(-1);if(last?.tick===m.tick&&last.attackerSlot===winner.slot)last.cells++;else r.losses.push({tick:m.tick,attackerSlot:winner.slot,cells:1});}if(r.slot===winner.slot){r.stolenCells++;if(remembered!==undefined&&m.tick-remembered<=60*m.config.simulationHz)r.reclaimedCells++;}}
   lost.get(winner.participantId)!.delete(id);lost.get(victim.participantId)!.set(id,m.tick);
  }
  for(const p of m.participants){const bank=lost.get(p.participantId)!;if(p.lifeState!=='ALIVE'||p.lifeId!==lives.get(p.participantId))bank.clear();else for(const [id,tick]of bank)if(m.owners[id]===p.slot+1||m.tick-tick>60*m.config.simulationHz)bank.delete(id);}
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before)for(const r of rows)if(active(r,t)){
   const p=m.participants[r.slot],memory=memories.get(p.participantId)!;
   if(e.participantId===p.participantId&&e.type==='CAPTURE'){r.totalCapture+=e.amount??0;r.captures.push({reclaimedOnTick:r.reclaimedCells-reclaimBefore.get(r.slot)!,tick:e.tick,amount:e.amount,holding:p.territoryCount,goal:memory.goal,plannedD:memory.expansion?.response?.reclaimCells??0});}
   if(e.participantId===p.participantId&&e.type==='DEATH')r.deaths.push({tick:e.tick,killerSlot:m.participants.find(q=>q.participantId===e.killerId)?.slot,reason:e.reason,context:e.deathContext,goal:memory.goal,lastSample:r.samples.at(-1)});
   if(e.type==='DEATH'&&e.killerId===p.participantId)r.kills.push({tick:e.tick,victimSlot:m.participants.find(q=>q.participantId===e.participantId)?.slot,reason:e.reason,context:e.deathContext});
  }
 }
 const ref=reference.reports.find((r:any)=>r.seed===c.seed);if(prefixHash!==ref.trajectoryHash)throw Error('Observed replay differs seed '+c.seed);
 for(const r of rows){for(let t=r.window.start;t<r.window.end;t+=300){const ss=r.samples.filter(q=>q.tick>=t&&q.tick<Math.min(r.window.end,t+300));r.blocks.push({start:t,end:Math.min(r.window.end,t+300),goals:ss.reduce((a,q)=>{increment(a,q.goal);return a;},{} as Record<string,number>),firstHolding:ss[0]?.holding,lastHolding:ss.at(-1)?.holding,captures:r.captures.filter(q=>q.tick>=t&&q.tick<t+300),deaths:r.deaths.filter(q=>q.tick>=t&&q.tick<t+300)});}}
 hudReclaim.dispose();stopTransfers();
 writeFileSync(local+'/seed'+c.seed+'.json',JSON.stringify({seed:c.seed,ticks,prefixHash,prefixMatches:true,definition:'Current c84fc7a behavior; windows [start,end), pre-step frame goals and head distances; ownership transfer/reclaim sampled at tick boundaries; no behavior changes.',rows},null,2));
 console.error('Scene seed '+c.seed+' complete');
 console.log(JSON.stringify(rows.map(({samples,plans,blocks,...r})=>({...r,near6Percent:100*r.near6Frames/r.aliveFrames,near2Percent:100*r.near2Frames/r.aliveFrames,meanVisibleHeads:r.visibleHeadSum/r.aliveFrames,meanNearest:r.nearestSum/r.aliveFrames,stolenShare:r.stolenCells/r.totalCapture})),null,2));
}
