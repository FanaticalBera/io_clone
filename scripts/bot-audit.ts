import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
const reports=[];
for(const seed of [4,19,73]){
 const match=createMatch({},seed,botSpecs(8)),memories=match.participants.map((p,i)=>createBotMemory(seed+i));
 let captures=0,gained=0,walls=0;
 for(let tick=0;tick<3600;tick++){
  const before=match.eventCounter,inputs=new Map();
  match.participants.forEach((p,i)=>{const input=getBotInput(observeBot(match,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);});
  stepMatch(match,inputs);
  for(const event of match.events)if(Number(event.eventId.split(':').at(-1))>before){
   if(event.type==='CAPTURE'&&(event.amount??0)>0){captures++;gained+=event.amount!;}
   if(event.type==='DEATH'&&event.reason==='WALL_HIT')walls++;
  }
 }
 reports.push({seed,captures,gained,walls,territory:match.participants.map(p=>p.territoryCount),deaths:match.participants.reduce((sum,p)=>sum+p.deaths,0)});
}
console.log(JSON.stringify(reports,null,2));
