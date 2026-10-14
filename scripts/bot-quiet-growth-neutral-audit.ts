import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-quiet-growth-review'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const arm=process.argv.find(v=>v.startsWith('--arm='))?.slice(6)??'candidate',source=protocol.arms?protocol[arm]:arm==='baseline'?protocol.native:protocol.candidate;
const ticks=Number(process.argv.find(v=>v.startsWith('--ticks='))?.slice(8)??7200);
const reference=process.argv.find(v=>v.startsWith('--reference='))?.slice(12)??arm;
const load=(f:string)=>import(pathToFileURL(resolve(source,'src/shared',f+'.ts')).href);
const [game,bot,identity,director,respawn,random]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','random'].map(load));
const hashMemory=(memories:Map<string,any>)=>createHash('sha256').update(JSON.stringify([...memories].map(([id,m])=>[id,{...m,random:undefined}]),(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v)).digest('hex');
const reports=[];
for(const seed of protocol.seeds){
 const ref=JSON.parse(readFileSync(resolve(root,reference+'-seed-'+seed+'.json'),'utf8'));
 const m=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const draws=new Map<string,number>();for(const [id,memory]of memories){const actual=memory.random;draws.set(id,0);memory.random=()=>{draws.set(id,draws.get(id)!+1);return actual();};}
 const nextRng=()=>Object.fromEntries([...memories].map(([id])=>[id,random.seededRandom((identity.botSeed(seed,m.participants.find((p:any)=>p.participantId===id).slot)+Math.imul(draws.get(id)!,0x6d2b79f5))>>>0)()]));
 const roles=new Map<string,any>(identity.BOT_PERSONALITIES.map((personality:string)=>[personality,{personality,aliveFrames:0,goalFrames:{},captured:0,stolen:0,reclaimed:0}]));
 const lost=new Map<string,Map<number,number>>(m.participants.map((p:any)=>[p.participantId,new Map()])),trajectory=createHash('sha256'),checkpoints=[];
 let holdingSum=0,spawnGrants=0;
 for(let t=0;t<ticks;t++){
  const owners=m.owners.slice(),before=m.eventCounter,lives=new Map(m.participants.map((p:any)=>[p.participantId,p.lifeId])),inputs=director.getBotInputs(m,memories);
  for(const p of m.participants)if(p.lifeState==='ALIVE'){const r=roles.get(p.personality),goal=memories.get(p.participantId).goal;r.aliveFrames++;r.goalFrames[goal]=(r.goalFrames[goal]??0)+1;}
  trajectory.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);
  for(let id=0;id<owners.length;id++)if(owners[id]&&m.owners[id]&&owners[id]!==m.owners[id]){
   const victim=m.participants.find((p:any)=>p.slot+1===owners[id]),winner=m.participants.find((p:any)=>p.slot+1===m.owners[id]),r=roles.get(winner.personality),remembered=lost.get(winner.participantId)!.get(id);r.stolen++;
   if(remembered!==undefined&&m.tick-remembered<=1800)r.reclaimed++;
   lost.get(winner.participantId)!.delete(id);lost.get(victim.participantId)!.set(id,m.tick);
  }
  for(const p of m.participants){const ledger=lost.get(p.participantId)!;if(p.lifeState!=='ALIVE'||p.lifeId!==lives.get(p.participantId))ledger.clear();else for(const [id,tick]of ledger)if(m.owners[id]===p.slot+1||m.tick-tick>1800)ledger.delete(id);}
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before){if(e.type==='CAPTURE')roles.get(m.participants.find((p:any)=>p.participantId===e.participantId).personality).captured+=e.amount??0;if(e.type==='SPAWN')spawnGrants+=7;}
  holdingSum+=m.participants.reduce((n:number,p:any)=>n+p.territoryCount,0);
  trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));trajectory.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  if(m.tick===3600||m.tick===7200){
   const expected=ref.checkpoints.find((c:any)=>c.tick===m.tick),proof={trajectoryHash:trajectory.copy().digest('hex'),memoryHash:hashMemory(memories),nextRng:nextRng(),director:director.botDirector(m).snapshot()};
   assert.equal(proof.trajectoryHash,expected.trajectoryHash);assert.equal(proof.memoryHash,expected.equivalenceProof.memoryHash);assert.deepEqual(proof.nextRng,expected.equivalenceProof.nextRng);assert.deepEqual(proof.director,expected.director);assert.equal(holdingSum/m.tick,expected.holding.total.timeAverageCells);
   const a=roles.get('EXPAND'),b=roles.get('SEEK_POINT'),TV=.5*[...new Set([...Object.keys(a.goalFrames),...Object.keys(b.goalFrames)])].reduce((sum,k)=>sum+Math.abs((a.goalFrames[k]??0)/a.aliveFrames-(b.goalFrames[k]??0)/b.aliveFrames),0);
   checkpoints.push({tick:m.tick,...proof,holding:holdingSum/m.tick,spawnGrants,roles:structuredClone([...roles.values()]),TV});
  }
 }
 reports.push({seed,checkpoints});console.error('Observer-free equivalence '+arm+' seed'+seed);
}
writeFileSync(resolve(root,arm+'-neutral.json'),JSON.stringify({arm,observerFree:true,allEightHashesMemoryRngDirectorAndHoldingIdentical:true,reports},null,2)+'\n');
