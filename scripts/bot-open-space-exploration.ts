import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BotHoldingTracker} from '../tests/bot-holding-tracker.js';
import {rankOpenBoundaries} from './bot-open-space-model.js';

const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-open-space-exploration'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const probe=process.argv.includes('--probe'),seeds=(process.argv.find(v=>v.startsWith('--seeds='))?.slice(8)??protocol.seeds.join(',')).split(',').map(Number);
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(v,(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v)).digest('hex');
async function replay(seed:number,watched:boolean){
 const source=watched?protocol.audit:protocol.candidate;
 for(const [f,h]of Object.entries(protocol[watched?'auditHashes':'sourceHashes']))assert.equal(createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex'),h);
 const load=(file:string)=>import(pathToFileURL(resolve(source,'src/shared',file+'.ts')).href);
 const [game,bot,identity,director,respawn,capture,life,hex,open]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','capture-diagnostics','life','hex','bot-open-space'].map(load));
 const match=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(match,true);
 const memories=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const holding=new BotHoldingTracker(match),trajectory=createHash('sha256'),captures:any[]=[],deaths:any[]=[],departures:any[]=[],plans=new Map<string,any>(),contexts=new WeakMap<object,Map<number,any>>();let decisions=0,rankChecks=0;
 capture.watchCaptureTransfers(match,(t:any)=>{for(const gain of t.gains){const p=match.participants.find((p:any)=>p.participantId===gain.participantId);captures.push({tick:match.tick,slot:p.slot,personality:p.personality,cells:gain.cells.length});}});
 life.watchDeaths(match,(t:any)=>deaths.push({tick:match.tick,slot:match.participants.find((p:any)=>p.participantId===t.victimId).slot,cause:t.cause??t.context?.cause}));
 if(watched){
  const hook=await load('bot-open-space-audit'),candidates=await load('bot-candidate-diagnostics');
  hook.watchOpenSpaceAudit({before:(_o:any,m:any)=>contexts.set(m,new Map()),geometry:(m:any,index:number,g:any)=>contexts.get(m)!.set(index,g)});
  for(const [id,memory]of memories)candidates.watchBotCandidates(memory,(obs:any,batch:any)=>{
   if(batch.kind!=='STRATEGY')return;decisions++;
   // Verify production ranking against the frozen read-only proposal on actual observations.
   if(rankChecks<100){const existing=contexts.get(memory)!.values();const anchors=[...new Set([...existing].map((g:any)=>g.anchor))];
    const reference=obs.others.length||obs.trails.length?undefined:rankOpenBoundaries(obs,anchors).extra[0];assert.deepEqual(open.openSpaceExpansionAnchor(obs,anchors),reference?Object.fromEntries(Object.entries(reference).filter(([k])=>['id','direction','prefix','neutral','headClearance','trailClearance','score'].includes(k))):null);rankChecks++;
   }
   const chosen=batch.candidates[batch.selectedIndex];
   if(!chosen?.expansion){plans.delete(id);return;}
   const origin=chosen.expansion.anchor;let last=origin;
   const prefixEnd=obs.self.cellId===origin?-1:chosen.path.indexOf(origin);
   const loop=chosen.path.slice(prefixEnd+1);
   const directions=loop.map((cell:number)=>{const d=obs.map.cells[last].neighbors.indexOf(cell);last=cell;return d;});
   const rotation=directions[0]??0,canonicalPath=directions.map((d:number)=>(d-rotation+6)%6).join(',');
   plans.set(id,{life:obs.self.lifeId,crowded:obs.others.some((p:any)=>hex.hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=6),heads:obs.others.length,geometry:contexts.get(memory)!.get(chosen.ordinal),canonicalPath,path:chosen.path.length,external:chosen.expansion.externalLength,capture:chosen.expansion.captureSize});
  });
 }
 for(let tick=0;tick<(probe?450:protocol.ticks);tick++){
  const before=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,{life:p.lifeId,alive:p.lifeState==='ALIVE',cell:p.cellId,trail:p.trailCells.size}]));
  const inputs=director.getBotInputs(match,memories);trajectory.update(JSON.stringify([...inputs]));game.stepMatch(match,inputs);holding.afterTick();
  if(watched)for(const p of match.participants){const previous=before.get(p.participantId),memory=memories.get(p.participantId),plan=plans.get(p.participantId);
   if(previous.life!==p.lifeId||p.lifeState!=='ALIVE'){plans.delete(p.participantId);continue;}
   if(previous.alive&&!previous.trail&&p.trailCells.size&&['EXPAND','STEAL'].includes(memory.goal)&&plan?.life===p.lifeId){const cell=match.map.cells[previous.cell];departures.push({seed,tick:match.tick,slot:p.slot,life:p.lifeId,personality:p.personality,anchor:cell.id,q:cell.q,r:cell.r,direction:cell.neighbors.indexOf(p.cellId),...plan});}
  }
  trajectory.update(match.owners);trajectory.update(Buffer.from(match.trailMasks.buffer,match.trailMasks.byteOffset,match.trailMasks.byteLength));trajectory.update(JSON.stringify(match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
 }
 return {seed,trajectoryHash:trajectory.digest('hex'),memoryHash:digest([...memories].map(([id,m])=>[id,{...m,random:undefined}])),nextRng:Object.fromEntries([...memories].map(([id,m])=>[id,m.random()])),director:director.botDirector(match).snapshot(),holding:holding.snapshot(),captures,deaths,departures,decisions,rankChecks};
}
if(probe){const native=await replay(19,false),audit=await replay(19,true);for(const k of ['trajectoryHash','memoryHash','nextRng','director','holding']as const)assert.deepEqual(native[k],audit[k]);writeFileSync(resolve(root,'probe.json'),JSON.stringify({ticks:450,seed:19,allEqual:true,rankChecks:audit.rankChecks},null,2)+'\n');console.log('450tick native/audit equivalence and ranking PASS');}
else for(const seed of seeds){const result=await replay(seed,true);writeFileSync(resolve(root,'candidate-seed-'+seed+'.json'),JSON.stringify(result)+'\n');console.error(JSON.stringify({seed,holding:result.holding.total.timeAverageCells,deaths:result.deaths.length,captures:result.captures.length}));}
