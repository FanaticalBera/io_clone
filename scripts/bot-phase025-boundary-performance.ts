import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const local=resolve('.local/bot-phase025-boundary'),out=resolve('evidence/bot-phase025-boundary/performance.json');
const protocol=JSON.parse(readFileSync(resolve('evidence/bot-phase025-boundary/protocol.json'),'utf8'));
const seeds:number[]=protocol.seeds,arms:string[]=protocol.arms;
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const references=new Map(arms.map(arm=>[arm,new Map<number,number>(JSON.parse(readFileSync(resolve(local,arm+'.json'),'utf8')).reports.map((r:any)=>[r.seed,r.deaths]))]));
const modules=new Map<string,any>();
for(const arm of arms){
 for(const [file,hash]of Object.entries(protocol.sourceHashes[arm]))if(createHash('sha256').update(readFileSync(resolve(local,arm,file))).digest('hex')!==hash)throw new Error('Source mismatch '+arm);
 const load=(p:string)=>import(pathToFileURL(resolve(local,arm,'src/shared',p+'.ts')).href);
 const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));modules.set(arm,{game,bot,identity,director,respawn});
}
function run(arm:string,seed:number){
 const {game,bot,identity,director,respawn}=modules.get(arm);
 const m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const start=performance.now();for(let t=0;t<3600&&m.phase==='RUNNING';t++){const inputs=director.getBotInputs(m,memories);game.stepMatch(m,inputs);}
 const elapsedMs=performance.now()-start;
 if(m.tick!==3600)throw new Error('Different duration');
 const deaths=m.participants.reduce((s:number,p:any)=>s+p.deaths,0);
 const expected=references.get(arm)!.get(seed);if(deaths!==expected)throw new Error('Behavior mismatch '+arm+' '+seed);
 return {arm,seed,ticks:m.tick,elapsedMs,msPerTick:elapsedMs/m.tick,deaths};
}
for(const arm of arms){run(arm,19);console.error('Warmup discarded: '+arm);}
const batches:any[]=[];
const persist=()=>writeFileSync(out,JSON.stringify({method:protocol.cost,clock:'performance.now desktop elapsed time; no other validation/audits running',warmup:{seed:19,ticks:3600,perArm:1,discarded:true},seeds,batches},null,2));
for(let round=0;round<3;round++)for(const [i,seed]of seeds.entries()){
 const offset=(round+i)%arms.length,order=[...arms.slice(offset),...arms.slice(0,offset)];
 for(const arm of order){const result={round,...run(arm,seed)};batches.push(result);persist();console.error('Cost round '+(round+1)+' seed '+seed+' '+arm+': '+result.msPerTick.toFixed(3)+' ms/tick');}
}
const summary=Object.fromEntries(arms.map(arm=>{
 const rows=batches.filter(r=>r.arm===arm),rounds=[0,1,2].map(round=>rows.filter(r=>r.round===round).reduce((sum,r)=>sum+r.elapsedMs,0)/(3600*seeds.length));
 return [arm,{roundMsPerTick:rounds,medianMsPerTick:median(rounds),bySeed:seeds.map(seed=>{const samples=rows.filter(r=>r.seed===seed).map(r=>r.msPerTick);return {seed,samples,medianMsPerTick:median(samples)};})}];
}));
writeFileSync(out,JSON.stringify({method:protocol.cost,clock:'performance.now desktop elapsed time; no other validation/audits running',warmup:{seed:19,ticks:3600,perArm:1,discarded:true},seeds,batches,summary},null,2));
