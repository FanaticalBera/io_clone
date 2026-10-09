import {BotDebugCollector} from '../src/client/bot-debug-model.js';
import {performance} from 'node:perf_hooks';
import {getBotInputs,botDirector} from '../src/shared/bot-director.js';
import {BOT_PHASE02} from '../src/shared/bot-phase02-config.js';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs} from '../tests/bot-fixtures.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {botSpecs as liveBotSpecs,createBotMemory,getBotInput,observeBotForTick,observeBot} from '../src/shared/bot.js';
// Observer-free 8-bot simulation; discard warm-up and compare median batch cost.
const phase02=process.argv.includes('--phase02');
if(phase02&&!process.argv.includes('--runtime'))throw Error('--phase02 requires --runtime');
const runtime=process.argv.includes('--runtime');
const assignmentSeed=(seed:number,slot:number)=>runtime?botSeed(seed,slot):seed+slot;
const phase01=process.argv.includes('--phase01'),hud=process.argv.includes('--hud');
const samples:number[]=[],count=Number(process.argv.find(arg=>arg.startsWith('--bots='))?.split('=')[1]??8);
for(let run=0;run<4;run++){
 const m=createMatch({},19,phase01?liveBotSpecs(count,0,'bot',{seed:19}):botSpecs(count)),memories=m.participants.map(p=>createBotMemory(assignmentSeed(19,p.slot),'combined',phase01?createBotIdentity(assignmentSeed(19,p.slot),p.personality!):undefined));
 if(runtime){if(!phase01)throw Error('--runtime requires --phase01');setSafeBotRespawn(m,true);}
 const collector=hud?new BotDebugCollector(m,new Map(m.participants.map((p,i)=>[p.participantId,memories[i]]))):null,start=performance.now();
 for(let tick=0;tick<1800;tick++){
  const inputs=phase02?getBotInputs(m,new Map(m.participants.map((p,i)=>[p.participantId,memories[i]]))):new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(runtime?observeBotForTick(m,p.participantId,memories[i]):observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);if(collector&&tick%8===0)collector.snapshot();
 }if(run)samples.push((performance.now()-start)/1800);collector?.dispose();
}
console.log(JSON.stringify({ticksPerRun:1800,bots:count,hud,runtime,phase02:phase02?BOT_PHASE02:undefined,msPerTick:samples,medianMsPerTick:[...samples].sort((a,b)=>a-b)[1]},null,2));
