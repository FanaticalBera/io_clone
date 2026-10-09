import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs} from '../tests/bot-fixtures.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {botSpecs as liveBotSpecs,createBotMemory,getBotInput,observeBotForTick,observeBot} from '../src/shared/bot.js';
const runtime=process.argv.includes('--runtime');
const assignmentSeed=(seed:number,slot:number)=>runtime?botSeed(seed,slot):seed+slot;
const phase01=process.argv.includes('--phase01');
const reports=[],count=Number(process.argv.find(arg=>arg.startsWith('--bots='))?.split('=')[1]??8);
for(const seed of [4,19,73]){
 const match=createMatch({},seed,phase01?liveBotSpecs(count,0,'bot',{seed}):botSpecs(count)),memories=match.participants.map((p,i)=>createBotMemory(assignmentSeed(seed,p.slot),'combined',phase01?createBotIdentity(assignmentSeed(seed,p.slot),p.personality!):undefined));
 if(runtime){if(!phase01)throw Error('--runtime requires --phase01');setSafeBotRespawn(match,true);}
 let captures=0,gained=0,walls=0;
 for(let tick=0;tick<3600;tick++){
  const before=match.eventCounter,inputs=new Map();
  match.participants.forEach((p,i)=>{const input=getBotInput(runtime?observeBotForTick(match,p.participantId,memories[i]):observeBot(match,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);});
  stepMatch(match,inputs);
  for(const event of match.events)if(Number(event.eventId.split(':').at(-1))>before){
   if(event.type==='CAPTURE'&&(event.amount??0)>0){captures++;gained+=event.amount!;}
   if(event.type==='DEATH'&&event.reason==='WALL_HIT')walls++;
  }
 }
 reports.push({seed,captures,gained,walls,territory:match.participants.map(p=>p.territoryCount),deaths:match.participants.reduce((sum,p)=>sum+p.deaths,0)});
}
console.log(JSON.stringify(reports,null,2));
