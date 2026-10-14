import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('../bot-scene-137-late');if(existsSync(root))throw Error('Preserve prior scene');mkdirSync(root,{recursive:true});
const protocol=JSON.parse(readFileSync('../bot-space-shape-adoption/protocol.json','utf8'));
const selected=process.argv.find(v=>v.startsWith('--arm='))?.slice(6);
for(const arm of protocol.arms.filter((a:any)=>!selected||a.name===selected)){
 const load=(f:string)=>import(pathToFileURL(resolve(arm.source,'src/shared',f+'.ts')).href);
 const [game,bot,identity,director,respawn,hex,life,capture,candidates]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','hex','life','capture-diagnostics','bot-candidate-diagnostics'].map(load));
 const match=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},137,bot.botSpecs(14,0,'bot',{seed:137}));respawn.setSafeBotRespawn(match,true);
 const memories=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(137,p.slot),'combined',identity.createBotIdentity(identity.botSeed(137,p.slot),p.personality))]));
 const rows=[{slot:9,start:14000,end:15501},{slot:1,start:14000,end:19001}].map(w=>({...w,p:match.participants.find((p:any)=>p.slot===w.slot),traces:[]as any[],samples:[]as any[],losses:[]as any[],gains:[]as any[],deaths:[]as any[],choices:[]as any[],plans:[]as any[],latest:null as any,lastPlan:null as any,previous:new Map<number,number>(),frames:{}as Record<string,number>,alive:0,holdingSum:0}));
 const active=(r:typeof rows[number])=>match.tick>=r.start&&match.tick<r.end;
 const locate=(id:number)=>{const c=match.map.cells[id];return {q:c.q,r:c.r,wallGap:match.map.radius-hex.hexDistance(c,{q:0,r:0})};};
 const snap=(r:typeof rows[number])=>{
  const memory=memories.get(r.p.participantId),obs=bot.observeBot(match,r.p.participantId),regions=[...memory.emotion.damage.regions.keys()];
  return {tick:match.tick,life:r.p.lifeId,alive:r.p.lifeState==='ALIVE',holding:r.p.territoryCount,...locate(r.p.cellId),goal:memory.goal,trail:r.p.trailCells.size,path:[...memory.path],target:memory.attackSlot,
   heads:obs.others.map((p:any)=>({slot:p.slot,d:hex.hexDistance(match.map.cells[r.p.cellId],match.map.cells[p.cellId]),...locate(p.cellId)})),trails:obs.trails,
   damage:regions.length,nearestDamage:regions.length?Math.min(...regions.map(id=>hex.hexDistance(match.map.cells[r.p.cellId],match.map.cells[id]))):null,
   grudge:[...memory.emotion.grudge].map(([id,g]:any)=>({slot:match.participants.find((p:any)=>p.participantId===id)?.slot,amount:g.amount})),D:memory.expansion?.response?.reclaimCells??0,shape:memory.expansion?.shape??null,reason:r.latest?.reason,planTick:r.lastPlan?.tick??null,reposition:structuredClone(memory.reposition.selection)};
 };
 for(const r of rows){const memory=memories.get(r.p.participantId);
  bot.watchBotDecisions(memory,(trace:any)=>{r.latest=structuredClone(trace);if(trace.expansionPlan)r.lastPlan={tick:trace.tick,plan:structuredClone(trace.expansionPlan),path:[...trace.expansionPath]};if(active(r)){const s=snap(r);r.traces.push({...s,trace:structuredClone(trace)});if(trace.expansionPlan)r.plans.push({...s,plan:structuredClone(trace.expansionPlan)});}},{shadow:false});
  candidates.watchBotCandidates(memory,(obs:any,batch:any)=>{if(!active(r)||batch.kind!=='STRATEGY')return;r.choices.push({tick:match.tick,...locate(r.p.cellId),heads:obs.others.length,selected:structuredClone(batch.candidates[batch.selectedIndex]??null),candidates:batch.candidates.map((c:any)=>({goal:c.goal,score:c.score,target:c.slot,anchor:c.expansion?.anchor,shape:c.expansion?.shape,capture:c.expansion?.captureSize,external:c.expansion?.externalLength,D:c.expansion?.response?.reclaimCells}))});});
 }
 life.watchDeaths(match,(t:any)=>{for(const r of rows)if(active(r)){
  if(t.victimId===r.p.participantId){const killer=match.participants.find((p:any)=>p.participantId===t.killerId);
   r.deaths.push({...snap(r),cause:t.context?.cause??t.reason,killerSlot:killer?.slot,killer:killer?{...locate(killer.cellId),trail:[...killer.trailCells],direction:{...killer.direction}}:null,context:t.context,deathTrail:t.trailCells,originCell:t.originCellId,originOwner:t.originOwner,rootHomeNeighbors:t.rootHomeNeighbors,lastPlan:r.lastPlan,diagnostic:t.diagnostic});r.previous.clear();
  }else if(t.killerId===r.p.participantId)r.deaths.push({tick:match.tick,kill:true,victimSlot:match.participants.find((p:any)=>p.participantId===t.victimId)?.slot,cause:t.context?.cause??t.reason});
 }});
 capture.watchCaptureTransfers(match,(t:any)=>{for(const gain of t.gains)for(const r of rows){
  const loss=gain.cells.filter((c:any)=>c.previousOwner===r.p.slot+1);if(loss.length){for(const cell of loss)r.previous.set(cell.cellId,match.tick);if(active(r))r.losses.push({tick:match.tick,attacker:match.participants.find((p:any)=>p.participantId===gain.participantId).slot,cells:loss.length,locations:loss.map((c:any)=>locate(c.cellId))});}
  if(gain.participantId===r.p.participantId){const recovered=gain.cells.filter((c:any)=>r.previous.has(c.cellId)&&match.tick-r.previous.get(c.cellId)!<=1800).length;if(active(r))r.gains.push({tick:match.tick,cells:gain.cells.length,stolen:gain.cells.filter((c:any)=>c.previousOwner>0).length,recovered,D:memories.get(r.p.participantId).expansion?.response?.reclaimCells??0});for(const cell of gain.cells)r.previous.delete(cell.cellId);}
 }});
 const hash=createHash('sha256');let prefixHash='';
 for(let t=0;t<19001;t++){
  const inputs=director.getBotInputs(match,memories);
  for(const r of rows)if(active(r)){const memory=memories.get(r.p.participantId);r.frames[memory.goal]=(r.frames[memory.goal]??0)+1;r.holdingSum+=r.p.territoryCount;if(r.p.lifeState==='ALIVE')r.alive++;if(match.tick%30===0)r.samples.push(snap(r));}
  if(match.tick<3600)hash.update(JSON.stringify([...inputs]));game.stepMatch(match,inputs);
  if(match.tick<=3600){hash.update(match.owners);hash.update(Buffer.from(match.trailMasks.buffer,match.trailMasks.byteOffset,match.trailMasks.byteLength));hash.update(JSON.stringify(match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(match.tick===3600)prefixHash=hash.digest('hex');}
 }
 const reference=JSON.parse(readFileSync('../bot-space-shape-adoption/'+arm.name+'-seed-137.json','utf8'));assert.equal(prefixHash,reference.checkpoints[0].trajectoryHash);
 const count=(xs:string[])=>Object.fromEntries([...new Set(xs)].map(x=>[x,xs.filter(v=>v===x).length]));
 const summaries=rows.map(r=>({slot:r.slot,nickname:r.p.nickname,personality:r.p.personality,trait:memories.get(r.p.participantId).identity.secondaryTrait,window:[r.start,r.end],alive:r.alive,holdingMean:r.holdingSum/(r.end-r.start),frames:r.frames,reasons:count(r.traces.map(t=>t.trace.reason)),attacks:count(r.traces.flatMap(t=>t.trace.attacks.map((a:any)=>a.reason))),losses:r.losses.reduce((n,t)=>n+t.cells,0),gains:r.gains.reduce((n,t)=>n+t.cells,0),recovered:r.gains.reduce((n,t)=>n+t.recovered,0),damagePlans:r.plans.filter(p=>p.plan.response.reclaimCells>0).length,deaths:r.deaths.map(({diagnostic,...t})=>t)}));
 writeFileSync(resolve(root,arm.name+'.json'),JSON.stringify({arm:arm.name,prefixHash,prefixMatches:true,summaries,rows:rows.map(({p,previous,latest,lastPlan,...r})=>({...r,nickname:p.nickname,personality:p.personality}))},null,2)+'\n');
 console.error(JSON.stringify({arm:arm.name,prefixMatches:true,summaries:summaries.map(({deaths,...r})=>({...r,deaths:deaths.map(d=>({tick:d.tick,cause:d.cause,killer:d.killerSlot,kill:d.kill}))}))}));
}
