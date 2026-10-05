import {performance} from 'node:perf_hooks';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
// Observer-free 8-bot simulation; discard warm-up and compare median batch cost.
const samples:number[]=[];
for(let run=0;run<4;run++){
 const m=createMatch({},19,botSpecs(8)),memories=m.participants.map(p=>createBotMemory(19+p.slot)),start=performance.now();
 for(let tick=0;tick<1800;tick++){
  const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);
 }if(run)samples.push((performance.now()-start)/1800);
}
console.log(JSON.stringify({ticksPerRun:1800,bots:8,msPerTick:samples,medianMsPerTick:[...samples].sort((a,b)=>a-b)[1]},null,2));
