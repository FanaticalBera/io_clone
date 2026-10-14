import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('../bot-scene-137-slot7-1500-4000');if(existsSync(root))throw Error('Preserve prior scene evidence');mkdirSync(root,{recursive:true});
const p=JSON.parse(readFileSync('../bot-space-shape-adoption/protocol.json','utf8'));
const arms=[{name:'master',source:p.arms[0].source,reference:resolve('../bot-space-shape-adoption/baseline-seed-137.json')},{name:'B-quiet',source:resolve('../bot-open-space-quiet-exploration/candidate'),reference:resolve('../bot-open-space-quiet-exploration/candidate-seed-137.json')},{name:'B-quiet+C',source:p.arms[1].source,reference:resolve('../bot-space-shape-adoption/candidate-seed-137.json')}];
const active=(tick:number)=>tick>=1500&&tick<4000;
for(const arm of arms){
 const load=(f:string)=>import(pathToFileURL(resolve(arm.source,'src/shared',f+'.ts')).href);
 const [game,bot,identity,director,respawn,hex,life,capture,candidates]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','hex','life','capture-diagnostics','bot-candidate-diagnostics'].map(load));
 const m=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},137,bot.botSpecs(14,0,'bot',{seed:137}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(137,p.slot),'combined',identity.createBotIdentity(identity.botSeed(137,p.slot),p.personality))]));
 const self=m.participants.find((p:any)=>p.slot===7),memory=memories.get(self.participantId),hash=createHash('sha256');
 const traces:any[]=[],samples:any[]=[],losses:any[]=[],gains:any[]=[],deaths:any[]=[],choices:any[]=[],goalTicks:Record<string,number>={},lost=new Map<number,number>();
 let latest:any,lastPlan:any,nearWallTicks=0,visibleTicks=0,aliveTicks=0,holdingSum=0,reclaimed=0;
 const loc=(id:number)=>{const c=m.map.cells[id];return {q:c.q,r:c.r,wallGap:m.map.radius-hex.hexDistance(c,{q:0,r:0})};};
 const snapshot=()=>{const obs=bot.observeBot(m,self.participantId),damage=[...memory.emotion.damage.regions.keys()];
  return {tick:m.tick,life:self.lifeId,alive:self.lifeState==='ALIVE',holding:self.territoryCount,...loc(self.cellId),goal:memory.goal,trail:self.trailCells.size,pathLength:memory.path.length,target:memory.attackSlot,
   heads:obs.others.map((o:any)=>({slot:o.slot,d:hex.hexDistance(m.map.cells[self.cellId],m.map.cells[o.cellId]),...loc(o.cellId)})),visibleTrails:obs.trails.length,
   damage:damage.length,nearestDamage:damage.length?Math.min(...damage.map(id=>hex.hexDistance(m.map.cells[self.cellId],m.map.cells[id]))):null,
   grudge:[...memory.emotion.grudge].map(([id,g]:any)=>({slot:m.participants.find((p:any)=>p.participantId===id)?.slot,amount:g.amount})),
   D:memory.expansion?.response?.reclaimCells??0,bonus:memory.expansion?.response?.bonus??0,shape:memory.expansion?.shape??null,reason:latest?.reason,planTick:lastPlan?.tick??null,reposition:memory.reposition.selection};
 };
 bot.watchBotDecisions(memory,(t:any)=>{latest=structuredClone(t);if(t.expansionPlan)lastPlan={tick:t.tick,plan:structuredClone(t.expansionPlan)};if(active(m.tick))traces.push({...snapshot(),trace:structuredClone(t)});},{shadow:false});
 candidates.watchBotCandidates(memory,(obs:any,batch:any)=>{if(!active(m.tick)||batch.kind!=='STRATEGY')return;
  choices.push({tick:m.tick,...loc(self.cellId),heads:obs.others.length,selected:batch.candidates[batch.selectedIndex]??null,candidates:batch.candidates.map((c:any)=>({goal:c.goal,score:c.score,target:c.slot,anchor:c.expansion?.anchor,shape:c.expansion?.shape,capture:c.expansion?.captureSize,external:c.expansion?.externalLength,D:c.expansion?.response?.reclaimCells,bonus:c.expansion?.response?.bonus,anchorLocation:c.expansion?.anchor===undefined?null:loc(c.expansion.anchor)}))});
 });
 life.watchDeaths(m,(t:any)=>{if(!active(m.tick))return;if(t.victimId===self.participantId){deaths.push({...snapshot(),cause:t.context?.cause??t.reason,killerSlot:m.participants.find((p:any)=>p.participantId===t.killerId)?.slot});lost.clear();}if(t.killerId===self.participantId)deaths.push({tick:m.tick,kill:true,victimSlot:m.participants.find((p:any)=>p.participantId===t.victimId)?.slot,cause:t.context?.cause??t.reason});});
 capture.watchCaptureTransfers(m,(t:any)=>{for(const gain of t.gains){const stolen=gain.cells.filter((c:any)=>c.previousOwner===self.slot+1);if(stolen.length){for(const c of stolen)lost.set(c.cellId,m.tick);if(active(m.tick))losses.push({tick:m.tick,attacker:m.participants.find((p:any)=>p.participantId===gain.participantId).slot,cells:stolen.length,locations:stolen.map((c:any)=>loc(c.cellId))});}
   if(gain.participantId===self.participantId&&active(m.tick)){const recovered=gain.cells.filter((c:any)=>lost.has(c.cellId)&&m.tick-lost.get(c.cellId)!<=1800).length;reclaimed+=recovered;gains.push({tick:m.tick,cells:gain.cells.length,stolen:gain.cells.filter((c:any)=>c.previousOwner>0).length,recovered,goal:memory.goal,D:memory.expansion?.response?.reclaimCells??0});for(const c of gain.cells)lost.delete(c.cellId);}
  }});
 let prefixHash='';
 for(let tick=0;tick<4000;tick++){
  const inputs=director.getBotInputs(m,memories);
  if(active(m.tick)){goalTicks[memory.goal]=(goalTicks[memory.goal]??0)+1;holdingSum+=self.territoryCount;if(self.lifeState==='ALIVE'){aliveTicks++;if(loc(self.cellId).wallGap<=2)nearWallTicks++;const obs=bot.observeBot(m,self.participantId);if(obs.others.length)visibleTicks++;}if(m.tick%30===0)samples.push(snapshot());}
  if(m.tick<3600)hash.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);
  if(m.tick<=3600){hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(m.tick===3600)prefixHash=hash.digest('hex');}
 }
 const reference=JSON.parse(readFileSync(arm.reference,'utf8')),expected=reference.trajectoryHash??reference.checkpoints.find((c:any)=>c.tick===3600).trajectoryHash;assert.equal(prefixHash,expected);
 const counts=(values:string[])=>Object.fromEntries([...new Set(values)].map(v=>[v,values.filter(x=>x===v).length]));
 const summary={arm:arm.name,slot:7,nickname:self.nickname,personality:self.personality,trait:memory.identity.secondaryTrait,window:[1500,4000],aliveTicks,nearWallTicks,nearWallPercent:100*nearWallTicks/aliveTicks,visibleHeadPercent:100*visibleTicks/aliveTicks,holdingMean:holdingSum/2500,goalTicks,reasons:counts(traces.map(t=>t.trace.reason)),attackReasons:counts(traces.flatMap(t=>t.trace.attacks.map((a:any)=>a.reason))),attacksChosen:traces.filter(t=>t.trace.to==='ATTACK'&&t.trace.from!=='ATTACK').length,
  losses:losses.reduce((n,r)=>n+r.cells,0),gained:gains.reduce((n,r)=>n+r.cells,0),reclaimed,deaths,first:samples[0],last:samples.at(-1),strategyChoices:choices.length,damagePlans:choices.filter(c=>c.selected?.expansion?.response?.reclaimCells>0).length,prefixHash,prefixMatches:true};
 writeFileSync(resolve(root,arm.name.replaceAll('+','-')+'.json'),JSON.stringify({summary,traces,samples,losses,gains,choices},null,2)+'\n');console.log(JSON.stringify(summary));
}
