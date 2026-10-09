import {BotDebugCollector} from '../src/client/bot-debug-model.js';
import {performance} from 'node:perf_hooks';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs} from '../tests/bot-fixtures.js';
import {createBotIdentity} from '../src/shared/bot-identity.js';
import {botSpecs as liveBotSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
// Observer-free 8-bot simulation; discard warm-up and compare median batch cost.
const phase01=process.argv.includes('--phase01'),hud=process.argv.includes('--hud');
const samples:number[]=[],count=Number(process.argv.find(arg=>arg.startsWith('--bots='))?.split('=')[1]??8);
for(let run=0;run<4;run++){
 const m=createMatch({},19,phase01?liveBotSpecs(count,0,'bot',{seed:19}):botSpecs(count)),memories=m.participants.map(p=>createBotMemory(19+p.slot,'combined',phase01?createBotIdentity(19+p.slot,p.personality!):undefined));
 const collector=hud?new BotDebugCollector(m,new Map(m.participants.map((p,i)=>[p.participantId,memories[i]]))):null,start=performance.now();
 for(let tick=0;tick<1800;tick++){
  const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);if(collector&&tick%8===0)collector.snapshot();
 }if(run)samples.push((performance.now()-start)/1800);collector?.dispose();
}
console.log(JSON.stringify({ticksPerRun:1800,bots:count,hud,msPerTick:samples,medianMsPerTick:[...samples].sort((a,b)=>a-b)[1]},null,2));
