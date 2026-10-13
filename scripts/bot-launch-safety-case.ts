import {evaluateDepartureSafety,selectOwnedDepartureFallback,departureIntent} from '../src/shared/bot-immediate-safety.js';
import {observeBot as currentObservation,getBotInput as currentInput,createBotMemory as currentMemory,watchBotDecisions} from '../src/shared/bot.js';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen current baseline remains replayable after the proposed guard changes.
const source=resolve(process.argv.find(a=>a.startsWith('--source='))?.slice(9)??'../bot-launch-proposal/before');
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const {createMatch,stepMatch}=await load('game') as typeof import('../src/shared/game.js');
const {botSpecs,createBotMemory}=await load('bot') as typeof import('../src/shared/bot.js');
const {botSeed,createBotIdentity}=await load('bot-identity') as typeof import('../src/shared/bot-identity.js');
const {getBotInputs}=await load('bot-director') as typeof import('../src/shared/bot-director.js');
const {setSafeBotRespawn}=await load('safe-bot-respawn') as typeof import('../src/shared/safe-bot-respawn.js');
const {watchDeaths}=await load('life') as typeof import('../src/shared/life.js');
const {stepSteering,normalizeDirection}=await load('movement') as typeof import('../src/shared/movement.js');
const {botSteeringTarget}=await load('bot-steering') as typeof import('../src/shared/bot-steering.js');
const {moveSpeed}=await load('config') as typeof import('../src/shared/config.js');
const {hexDistance}=await load('hex') as typeof import('../src/shared/hex.js');
const seed=137,slot=7,m=createMatch({mapRadius:56,maxSlots:14,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
const selected=[6775,6781,6787,6793,6795,6797,6799,6800,6801],snaps:any[]=[],tape=new Map<number,any>(),hash=createHash('sha256');let prefix='';const deaths:any[]=[];
watchDeaths(m,t=>{if(t.victimId===m.participants[slot].participantId&&m.tick>=6775)deaths.push({tick:m.tick,cause:t.context?.cause,killer:m.participants.find(p=>p.participantId===t.killerId)?.slot,oldTrail:t.trailCells.length});});
for(let t=0;t<6862;t++){
 const inputs=getBotInputs(m,memories);
 if(selected.includes(m.tick))snaps.push({match:structuredClone(m),path:[...memories.get(m.participants[slot].participantId)!.path]});
 if(t>=6775)tape.set(t,structuredClone(inputs));
 if(t<3600)hash.update(JSON.stringify([...inputs]));stepMatch(m,inputs);
 if(t<3600){hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(t===3599)prefix=hash.digest('hex');}
}
const reference=JSON.parse(readFileSync('evidence/bot-launch-safety/seed137-case.json','utf8'));if(prefix!==reference.prefixHash)throw Error('Audited prefix mismatch');
if(!deaths.some(d=>d.tick===6801&&d.cause==='PENDING_TRAIL_CONTACT'&&d.killer===9&&d.oldTrail===0))throw Error('Original first-trail death not reproduced');
function intent(world:any,p:any,path:number[]){const reach=Math.max(Math.sqrt(3)*world.map.side*.18,moveSpeed(world.config)/world.config.turnRadiansPerSecond+moveSpeed(world.config)/world.config.simulationHz);
 while(path.length&&p.cellId===path[0]&&Math.hypot(world.map.cells[path[0]].center.x-p.position.x,world.map.cells[path[0]].center.y-p.position.y)<reach)path.shift();
 if(!path.length){const own=world.map.cells[p.cellId].neighbors.filter((id:number)=>id>=0&&world.owners[id]===p.slot+1);own.sort((a:number,b:number)=>{const score=(id:number)=>{const c=world.map.cells[id].center,d=normalizeDirection(c.x-p.position.x,c.y-p.position.y)!;return d.x*p.direction.x+d.y*p.direction.y;};return score(b)-score(a);});if(own.length)path.push(own[0]);}
 const target=botSteeringTarget(world.map,p,path,world.config,1);return target?normalizeDirection(target.x-p.position.x,target.y-p.position.y)??p.direction:p.direction;
}
function forecast(world:any,p:any,route:number[],horizon=30){const actor={...p,position:{...p.position},direction:{...p.direction}},path=[...route],entries:any[]=[];let first:any=null,blocked=false;
 for(let n=0;n<horizon;n++){const d=intent(world,actor,path),next=stepSteering(world.map,actor.position,actor.cellId,actor.direction,d,world.config);for(const e of next.entries){entries.push({tick:n+e.t,cell:e.cellId,owner:world.owners[e.cellId]});if(!first&&world.owners[e.cellId]!==p.slot+1)first={cell:e.cellId,seconds:(n+e.t)/world.config.simulationHz};}if(next.blocked){blocked=true;break;}actor.position=next.position;actor.direction=next.direction;actor.cellId=next.cellId;}return {first,blocked,entries};}
const rows=snaps.map(s=>{const world=s.match,p=world.participants[slot],f=forecast(world,p,s.path),heads=world.participants.filter((e:any)=>e!==p&&e.lifeState==='ALIVE'&&hexDistance(world.map.cells[p.cellId],world.map.cells[e.cellId])<=world.config.botObservationRange),near=f.first?heads.filter((e:any)=>hexDistance(world.map.cells[e.cellId],world.map.cells[f.first.cell])<=2).map((e:any)=>e.slot):[];
 const predicted:any[]=[];if(f.first)for(const e of heads){let pos=e.position,cell=e.cellId,dir=e.direction;let visits=cell===f.first.cell?[0]:[];for(let n=0;n<30;n++){const next=stepSteering(world.map,pos,cell,dir,e.direction,world.config);if(next.blocked)break;pos=next.position;cell=next.cellId;dir=next.direction;if(cell===f.first.cell)visits.push((n+1)/30);}if(visits.length)predicted.push({slot:e.slot,start:Math.min(...visits),end:Math.max(...visits),conflict:Math.max(...visits)>=f.first.seconds-.15});}
 const fallback=world.map.cells[p.cellId].neighbors.filter((id:number)=>id>=0&&world.owners[id]===slot+1).map((id:number)=>{const path=[id],f=forecast(world,p,path);return {id,path,ownedForecast:!f.first&&!f.blocked,forecast:f};});
 const tests=fallback.filter((c:any)=>c.ownedForecast).map((c:any)=>{const branch=structuredClone(world);setSafeBotRespawn(branch,true);const actor=branch.participants[slot],path=[...c.path];let seq=actor.lastAppliedInputSeq,maxTrail=0;for(let n=0;n<60&&actor.lifeState==='ALIVE';n++){const inputs=structuredClone(tape.get(branch.tick)??new Map());inputs.delete(actor.participantId);const d=intent(branch,actor,path);inputs.set(actor.participantId,{matchId:branch.matchId,lifeId:actor.lifeId,seq:++seq,dx:d.x,dy:d.y});stepMatch(branch,inputs);maxTrail=Math.max(maxTrail,actor.trailCells.size);}return {cell:c.id,endTick:branch.tick,alive:actor.lifeState==='ALIVE',maxTrail,atHome:branch.owners[actor.cellId]===slot+1};});
 const baseline=structuredClone(world);setSafeBotRespawn(baseline,true);while(baseline.tick<6803)stepMatch(baseline,structuredClone(tape.get(baseline.tick)));if(baseline.participants[slot].lifeState!=='DEAD_WAIT'||baseline.participants[slot].deathContext?.cause!=='PENDING_TRAIL_CONTACT')throw Error('Input tape fails to reproduce original death');
 return {tick:world.tick,cell:p.cellId,oldTrail:p.trailCells.size,firstExposure:f.first,headsNearFirst:near,predictedHeads:predicted,ownedNeighbors:fallback.map((c:any)=>({cell:c.id,safeForecast:c.ownedForecast})),branches:tests};});
const implementation=snaps.map(s=>{
 const world=s.match,p=world.participants[slot],obs=currentObservation(world,p.participantId,'combined',true),safety=evaluateDepartureSafety(obs,s.path,'STEAL'),fallback=safety.blocked?selectOwnedDepartureFallback(obs):null;
 if(world.tick===6787){if(safety.prefilterCells!==7||!safety.blocked||safety.enemySlot!==9||!obs.departureHeads?.some(p=>p.slot===9))throw Error('7-cell public-head filter missed frozen t6787');
  const memory=currentMemory(1);memory.plannedLifeId=p.lifeId;memory.path=[...s.path];memory.goal='STEAL';memory.nextDecisionTick=world.tick+6;memory.random=()=>{throw Error('Immediate safety consumed RNG');};let trace:any;watchBotDecisions(memory,t=>trace=t,{shadow:false});currentInput(obs,memory);
  if((memory.goal as string)!=='RETURN'||!trace?.departure||memory.nextDecisionTick!==world.tick+6||memory.expansion)throw Error('Light-tick safety failed to discard plan without rescheduling');
 }
 let branchResult=null;if(fallback){const branch=structuredClone(world);setSafeBotRespawn(branch,true);const actor=branch.participants[slot],path=[...fallback];let seq=actor.lastAppliedInputSeq,maxTrail=0;
  for(let n=0;n<60&&actor.lifeState==='ALIVE';n++){const inputs=structuredClone(tape.get(branch.tick)??new Map()),obs=currentObservation(branch,actor.participantId),d=departureIntent(obs,path,'RETURN',true);inputs.set(actor.participantId,{matchId:branch.matchId,lifeId:actor.lifeId,seq:++seq,dx:d.x,dy:d.y});stepMatch(branch,inputs);maxTrail=Math.max(maxTrail,actor.trailCells.size);}
  branchResult={alive:actor.lifeState==='ALIVE',maxTrail};if([6787,6793].includes(world.tick)&&(!branchResult.alive||maxTrail!==0))throw Error('Selected owned fallback fails actual 2s regression');
 }
 return {tick:world.tick,safety,fallback,branchResult};
});
const result={implementation,seed,slot,source:'c1f2df1',prefixMatchesAudit:true,prefixHash:prefix,originalDeath:deaths,rows,method:'Read-only normal AI replay and frozen actual input tape. Branch changes only #7 input; normal engine movement/turning/collision/ownership. Candidate forecast uses public heading and ownership only; taped future enemy inputs are validation-only, never production policy. 60-tick survival is a controlled counterfactual, not natural AI reaction or global balance.'};writeFileSync('../bot-launch-proposal/case.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
