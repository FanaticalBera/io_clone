import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,watchBotDecisions} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {getBotInputs,botDirector} from '../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
import {BotReclaimDiagnostics,type ReclaimPlanResult} from '../src/shared/bot-reclaim-diagnostics.js';
const seed=73,m=createMatch({mapRadius:56,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
const tracker=new BotReclaimDiagnostics(m,memories),rows:ReclaimPlanResult[]=[],deaths:any[]=[];
tracker.onClose=row=>{if(row.dRaw>0)rows.push(row);};
for(const [id,memory]of memories)watchBotDecisions(memory,t=>tracker.decision(id,t),{shadow:false});
const trajectory=createHash('sha256');let cursor=0;
for(let t=0;t<3600&&m.phase==='RUNNING';t++){
 const inputs=getBotInputs(m,memories);trajectory.update(JSON.stringify([...inputs]));stepMatch(m,inputs);tracker.afterTick();
 trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));trajectory.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
 for(const e of m.events){const id=Number(e.eventId.split(':').at(-1));if(id<=cursor)continue;if(e.type==='DEATH')deaths.push({tick:e.tick,victimId:e.participantId,killerId:e.killerId??null,cause:e.deathContext?.cause??e.reason});cursor=Math.max(cursor,id);}
}
tracker.finish();const hash=trajectory.digest('hex');
const reference=JSON.parse(readFileSync('evidence/bot-phase025-boundary/summary.json','utf8')).arms.append.bySeed.find((r:any)=>r.seed===seed);
if(hash!==reference.trajectoryHash)throw Error('Diagnostic changed seed73 trajectory');
const counts=Object.fromEntries([...new Set(rows.map(r=>r.outcome))].map(key=>[key,rows.filter(r=>r.outcome===key).length]));
const summarize=(group:ReclaimPlanResult[])=>({plans:group.length,withAppliedBonus:group.filter(r=>r.appliedBonus>0).length,withExpectedRecoveryAndBonus:group.filter(r=>r.appliedBonus>0&&r.actualCellIds.length>0).length,outcomes:Object.fromEntries([...new Set(group.map(r=>r.outcome))].map(key=>[key,group.filter(r=>r.outcome===key).length])),withExpectedRecovery:group.filter(r=>r.actualCellIds.length>0).length,withAnyRecovery:group.filter(r=>r.actualCellIds.length+r.otherReclaimCellIds.length>0).length,expectedCells:group.reduce((n,r)=>n+r.expectedCellIds.length,0),recoveredExpectedCells:group.reduce((n,r)=>n+r.actualCellIds.length,0),otherRecovery:group.reduce((n,r)=>n+r.otherReclaimCellIds.length,0),ordinaryStolen:group.reduce((n,r)=>n+r.ordinaryStolenCells,0),neutral:group.reduce((n,r)=>n+r.neutralCells,0)});
const personalities=Object.fromEntries(['EXPAND','ATTACK','DEFEND','SEEK_POINT'].map(personality=>[personality,summarize(rows.filter(r=>m.participants.find(p=>p.slot===r.slot)!.personality===personality))]));
const explorer=rows.filter(r=>m.participants.find(p=>p.slot===r.slot)!.personality==='EXPAND');
const samples=[explorer.find(r=>r.outcome==='CAPTURE'&&!r.actualCellIds.length),explorer.find(r=>r.actualCellIds.length),rows.find(r=>r.outcome==='ATTACK'),rows.find(r=>r.outcome==='DEATH')].filter((r):r is ReclaimPlanResult=>!!r).map(r=>({...r,relatedDeaths:deaths.filter(e=>e.tick>=r.selectedTick&&e.tick<=r.selectedTick+1800&&(e.victimId===r.participantId||e.killerId===r.participantId||r.damageActors.includes(e.victimId)))}));
mkdirSync('.local/bot-reclaim',{recursive:true});mkdirSync('evidence/bot-reclaim',{recursive:true});
writeFileSync('.local/bot-reclaim/seed73.json',JSON.stringify({seed,ticks:m.tick,trajectoryHash:hash,rows,deaths},null,2));
writeFileSync('evidence/bot-reclaim/seed73-summary.json',JSON.stringify({seed,ticks:m.tick,trajectoryHash:hash,referenceTrajectory:reference.trajectoryHash,trajectoryIdentical:true,deaths:m.participants.reduce((n,p)=>n+p.deaths,0),walls:deaths.filter(e=>e.cause==='WALL_HIT').length,director:botDirector(m).snapshot(),total:summarize(rows),counts,personalities,samples,notes:'D-positive selected plans; exact winning transfers before pruning/death, excludes respawn grants. Expected and unexpected recovery are disjoint. Same cells may recur across plans, not unique map area. ATTACK closes D attribution immediately; later kills are separate facts. CENSORED is not failure. No statistical/balance inference from one seed; raw records local only.'},null,2));
console.log(JSON.stringify({hash,total:summarize(rows),personalities}));tracker.dispose();
