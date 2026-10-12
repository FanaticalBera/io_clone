import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='../bot-perf-rp-review',source=resolve(root+'/duplicate-source'),load=(p:string)=>import(pathToFileURL(resolve(source,'src/shared',p+'.ts')).href);
const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));
const seeds:number[]=JSON.parse(readFileSync('evidence/bot-perf-rp-review/protocol.json','utf8')).seeds,reports:any[]=[];
for(const seed of seeds){const m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const stats={plans:0,plansWithDuplicates:0,queries:0,hits:0,maxHitsInPlan:0},byBot=new Map<number,any>();
 for(const [id,memory]of memories)bot.watchCaptureDuplicates(memory,(r:any)=>{stats.plans++;stats.plansWithDuplicates+=Number(r.hits>0);stats.queries+=r.queries;stats.hits+=r.hits;stats.maxHitsInPlan=Math.max(stats.maxHitsInPlan,r.hits);const b=byBot.get(r.slot)??{slot:r.slot,queries:0,hits:0,plans:0};b.queries+=r.queries;b.hits+=r.hits;b.plans++;byBot.set(r.slot,b);});
 const hash=createHash('sha256');for(let i=0;i<3600;i++){const inputs=director.getBotInputs(m,memories);hash.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));}
 reports.push({seed,...stats,hitRatio:stats.queries?stats.hits/stats.queries:0,trajectoryHash:hash.digest('hex'),byBot:[...byBot.values()],nextRng:Object.fromEntries([...memories].map(([id,memory])=>[id,memory.random()]))});console.error('Duplicate replay seed'+seed+' '+stats.hits+'/'+stats.queries);
}
writeFileSync(root+'/duplicates.json',JSON.stringify({scope:'Exact ordered full path equality within one planExpansion call; optimized guard order; no memoized reuse; no cross-owner/decision cache',source,reports},null,2));
