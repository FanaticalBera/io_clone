import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BotHoldingTracker} from '../tests/bot-holding-tracker.js';
const root=resolve('../bot-inner-anchor-adoption'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const seeds=(process.argv.find(v=>v.startsWith('--seeds='))?.slice(8)??protocol.seeds.join(',')).split(',').map(Number);
const modules=new Map<string,any>();
for(const arm of protocol.arms){
 for(const [f,h]of Object.entries(arm.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(resolve(arm.source,f))).digest('hex'),h);
 const load=(f:string)=>import(pathToFileURL(resolve(arm.source,'src/shared',f+'.ts')).href);
 const loaded=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','capture-diagnostics','life'].map(load));modules.set(arm.name,loaded);
}
for(const seed of seeds)for(const arm of protocol.arms.filter((a:any)=>a.name==='candidate')){
 const [game,bot,identity,director,respawn,capture,life]=modules.get(arm.name),m=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const holding=new BotHoldingTracker(m),trajectory=createHash('sha256'),captures:any[]=[],deaths:any[]=[],checkpoints:any[]=[],lastAttack=new Map<string,string>(),roles=new Map<string,any>(['DEFEND','ATTACK','EXPAND','SEEK_POINT'].map(role=>[role,{role,aliveTicks:0,goals:{},captured:0,stolen:0,attackStarts:0,targetKills:0}]));
 capture.watchCaptureTransfers(m,(t:any)=>{for(const gain of t.gains){const p=m.participants.find((p:any)=>p.participantId===gain.participantId),stolen=gain.cells.filter((c:any)=>c.previousOwner>0).length;captures.push({tick:m.tick,slot:p.slot,role:p.personality,cells:gain.cells.length,stolen});roles.get(p.personality).captured+=gain.cells.length;roles.get(p.personality).stolen+=stolen;}});
 life.watchDeaths(m,(t:any)=>{const p=m.participants.find((p:any)=>p.participantId===t.victimId),killer=m.participants.find((p:any)=>p.participantId===t.killerId),memory=killer&&memories.get(killer.participantId);
  deaths.push({tick:t.tick,slot:p.slot,role:p.personality,cells:t.territoryCount,cause:t.context?.cause??t.reason,goal:memories.get(p.participantId).goal,killerRole:killer?.personality});
  if(killer&&memory.goal==='ATTACK'&&memory.attackSlot===p.slot)roles.get(killer.personality).targetKills++;
 });
 for(let tick=0;tick<protocol.ticks;tick++){
  const inputs=director.getBotInputs(m,memories);
  for(const p of m.participants){const memory=memories.get(p.participantId),r=roles.get(p.personality);if(p.lifeState!=='ALIVE'){lastAttack.delete(p.participantId);continue;}r.aliveTicks++;r.goals[memory.goal]=(r.goals[memory.goal]??0)+1;
   const attack=memory.goal==='ATTACK'?p.lifeId+':'+memory.attackSlot:'';if(attack&&lastAttack.get(p.participantId)!==attack)r.attackStarts++;lastAttack.set(p.participantId,attack);
  }
  trajectory.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);holding.afterTick();
  trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));trajectory.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  if(m.tick===3600||m.tick===7200){
   const hash=trajectory.copy().digest('hex');if(m.tick===3600&&arm.name==='baseline'){const ref=JSON.parse(readFileSync(resolve(root,arm.name+'.json'),'utf8')).reports.find((r:any)=>r.seed===seed);assert.equal(hash,ref.trajectoryHash);assert.equal(deaths.length,ref.deaths);}
   checkpoints.push({tick:m.tick,trajectoryHash:hash,holding:holding.snapshot(),deaths:deaths.length,roles:structuredClone([...roles.values()])});
  }
 }
 writeFileSync(resolve(root,arm.name+'-seed-'+seed+'.json'),JSON.stringify({arm:arm.name,seed,ticks:m.tick,captures,deaths,checkpoints})+'\n');
 console.error(JSON.stringify({arm:arm.name,seed,holding:holding.snapshot().total.timeAverageCells,deaths:deaths.length,captures:captures.length}));
}
