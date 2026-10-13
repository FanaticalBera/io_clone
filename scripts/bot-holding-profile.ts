import {Session,type Profiler} from 'node:inspector';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {getBotInputs} from '../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
// Function attribution only, not a benchmark delta or balance experiment.
function run(){const seed=19,m=createMatch({mapRadius:56,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));for(let i=0;i<3600;i++)stepMatch(m,getBotInputs(m,memories));return {ticks:m.tick,deaths:m.participants.reduce((n,p)=>n+p.deaths,0)};}
run();const session=new Session();session.connect();
await new Promise<void>((resolve,reject)=>session.post('Profiler.enable',e=>e?reject(e):resolve()));
await new Promise<void>((resolve,reject)=>session.post('Profiler.start',e=>e?reject(e):resolve()));
const behavior=run();const result=await new Promise<Profiler.StopReturnType>((resolve,reject)=>session.post('Profiler.stop',(e,p)=>e?reject(e):resolve(p)));session.disconnect();
const reference=JSON.parse(readFileSync('../bot-holding-review/start.json','utf8')).reports.find((r:any)=>r.seed===19);if(behavior.ticks!==3600||behavior.deaths!==reference.deaths)throw Error('Profile replay differs');
mkdirSync('../bot-holding-review',{recursive:true});writeFileSync('../bot-holding-review/current-cpu.cpuprofile',JSON.stringify(result.profile));console.log(JSON.stringify({behavior,samples:result.profile.samples?.length,scope:'Current production decision + engine, seed19, after one discarded warmup. No HUD/audit observers. Attribution only.'}));
