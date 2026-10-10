import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const protocol=JSON.parse(readFileSync('evidence/bot-reposition/protocol.json','utf8')),seeds:number[]=protocol.seeds,arms=['baseline','reposition'];
const modules=new Map<string,any>(),references=new Map<string,Map<number,number>>();
for(const arm of arms){const source=arm==='baseline'?resolve('.local/bot-reposition/baseline'):resolve('.');
 for(const [file,hash]of Object.entries(protocol.sourceHashes[arm]))if(createHash('sha256').update(readFileSync(resolve(source,file))).digest('hex')!==hash)throw Error('Source changed '+arm+' '+file);
 const load=(p:string)=>import(pathToFileURL(resolve(source,'src/shared',p+'.ts')).href);
 const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));modules.set(arm,{game,bot,identity,director,respawn});
 references.set(arm,new Map(JSON.parse(readFileSync('.local/bot-reposition/'+arm+'.json','utf8')).reports.map((r:any)=>[r.seed,r.deaths])));
}
function run(arm:string,seed:number){const {game,bot,identity,director,respawn}=modules.get(arm),m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const start=performance.now();for(let i=0;i<3600&&m.phase==='RUNNING';i++)game.stepMatch(m,director.getBotInputs(m,memories));const elapsedMs=performance.now()-start,deaths=m.participants.reduce((n:number,p:any)=>n+p.deaths,0);
 if(m.tick!==3600||deaths!==references.get(arm)!.get(seed))throw Error('Benchmark behavior mismatch '+arm+' seed'+seed);
 return {arm,seed,ticks:m.tick,deaths,elapsedMs,msPerTick:elapsedMs/m.tick};
}
for(const arm of arms){run(arm,19);console.error('Discarded warmup '+arm);}
const batches:any[]=[];
for(let round=0;round<3;round++)for(const [i,seed]of seeds.entries())for(const arm of (round+i)%2?[...arms].reverse():arms){const row={round,...run(arm,seed)};batches.push(row);writeFileSync('.local/bot-reposition/performance.json',JSON.stringify({method:protocol.cost,batches},null,2));console.error('Cost round'+(round+1)+' seed'+seed+' '+arm+' '+row.msPerTick.toFixed(3)+'ms/tick');}
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summary=Object.fromEntries(arms.map(arm=>{const rows=batches.filter(r=>r.arm===arm),rounds=[0,1,2].map(round=>rows.filter(r=>r.round===round).reduce((n,r)=>n+r.elapsedMs,0)/(3600*seeds.length));return [arm,{roundMsPerTick:rounds,medianMsPerTick:median(rounds),bySeed:seeds.map(seed=>({seed,samples:rows.filter(r=>r.seed===seed).map(r=>r.msPerTick),medianMsPerTick:median(rows.filter(r=>r.seed===seed).map(r=>r.msPerTick))}))}];}));
writeFileSync('.local/bot-reposition/performance.json',JSON.stringify({method:protocol.cost,warmup:{seed:19,ticks:3600,perArm:1,discarded:true},summary,batches},null,2));console.log(JSON.stringify(summary));