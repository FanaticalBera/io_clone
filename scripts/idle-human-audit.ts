import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import type {DirectionInput} from '../src/shared/model.js';
const reports=[];
const seeds=process.argv.includes('--sweep')?Array.from({length:128},(_,i)=>i+1):[4,19,73,115,17,81,32,123];
for(const seed of seeds){
 const match=createMatch({},seed,[{participantId:'idle-human',slot:0,nickname:'IDLE',kind:'HUMAN'},...botSpecs(7,1)]),human=match.participants[0];
 const memories=match.participants.slice(1).map(p=>createBotMemory(seed^(p.slot*2654435761)));let attacks=0,interrupts=0;
 while(human.lifeState==='ALIVE'&&match.tick<1200){const inputs=new Map<string,DirectionInput>();
  match.participants.slice(1).forEach((p,i)=>{const memory=memories[i],expanding=['EXPAND','STEAL','SEEK_POINT'].includes(memory.goal)&&memory.path.length>0;
   const input=getBotInput(observeBot(match,p.participantId),memory);if(input)inputs.set(p.participantId,input);if(memory.goal==='ATTACK'){attacks++;if(expanding)interrupts++;}});stepMatch(match,inputs);
 }
 reports.push({seed,tick:match.tick,reason:human.deathReason,killer:match.events.find(e=>e.type==='DEATH'&&e.participantId===human.participantId)?.killerId??null,attackTicks:attacks,interrupts});
}
console.log(JSON.stringify(reports,null,2));
