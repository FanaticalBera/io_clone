import {BotGrowthTracker} from '../tests/bot-growth-tracker.js';
import {watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {getBotInputs,botDirector} from '../src/shared/bot-director.js';
import {BOT_PHASE02} from '../src/shared/bot-phase02-config.js';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs} from '../tests/bot-fixtures.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {botSpecs as liveBotSpecs,createBotMemory,getBotInput,observeBotForTick,observeBot} from '../src/shared/bot.js';
const phase02=process.argv.includes('--phase02');
if(phase02&&!process.argv.includes('--runtime'))throw Error('--phase02 requires --runtime');
const runtime=process.argv.includes('--runtime');
const assignmentSeed=(seed:number,slot:number)=>runtime?botSeed(seed,slot):seed+slot;
const phase01=process.argv.includes('--phase01');
const reports=[],count=Number(process.argv.find(arg=>arg.startsWith('--bots='))?.split('=')[1]??8);
for(const seed of [4,19,73]){
 const mapRadius=Number(process.argv.find(arg=>arg.startsWith('--radius='))?.split('=')[1]??56),spawnRadius=Number(process.argv.find(arg=>arg.startsWith('--spawn-radius='))?.split('=')[1]??1);
 const match=createMatch({mapRadius,spawnRadius},seed,phase01?liveBotSpecs(count,0,'bot',{seed}):botSpecs(count)),memories=match.participants.map((p,i)=>createBotMemory(assignmentSeed(seed,p.slot),'combined',phase01?createBotIdentity(assignmentSeed(seed,p.slot),p.personality!):undefined));
 if(runtime){if(!phase01)throw Error('--runtime requires --phase01');setSafeBotRespawn(match,true);}
 const emotions=memories.map(()=>({maximumPressure:0,maximumGrudge:0}));
 const growth=new BotGrowthTracker(match),latest:(BotDecisionTrace|undefined)[]=memories.map(()=>undefined);
 memories.forEach((memory,i)=>watchBotDecisions(memory,t=>latest[i]=t,{shadow:false}));
 let captures=0,gained=0,walls=0;
 for(let tick=0;tick<3600;tick++){
  const before=match.eventCounter,inputs=new Map();latest.fill(undefined);
  if(phase02)for(const [id,input]of getBotInputs(match,new Map(match.participants.map((p,i)=>[p.participantId,memories[i]]))))inputs.set(id,input);
  else match.participants.forEach((p,i)=>{const input=getBotInput(runtime?observeBotForTick(match,p.participantId,memories[i]):observeBot(match,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);});
  match.participants.forEach((p,i)=>{growth.before(p,latest[i]);emotions[i].maximumPressure=Math.max(emotions[i].maximumPressure,memories[i].emotion.pressure);emotions[i].maximumGrudge=Math.max(emotions[i].maximumGrudge,...[...memories[i].emotion.grudge.values()].map(r=>r.amount));});stepMatch(match,inputs);growth.after(before);
  for(const event of match.events)if(Number(event.eventId.split(':').at(-1))>before){
   if(event.type==='CAPTURE'&&(event.amount??0)>0){captures++;gained+=event.amount!;}
   if(event.type==='DEATH'&&event.reason==='WALL_HIT')walls++;
  }
 }
 reports.push({seed,mapRadius,spawnRadius,emotions:emotions.map((e,i)=>({...e,slot:match.participants[i].slot,trait:memories[i].identity?.secondaryTrait})),growth:growth.snapshot(),phase02:phase02?BOT_PHASE02:undefined,director:phase02?botDirector(match).snapshot():undefined,captures,gained,walls,territory:match.participants.map(p=>p.territoryCount),deaths:match.participants.reduce((sum,p)=>sum+p.deaths,0)});growth.dispose();
}
console.log(JSON.stringify(reports,null,2));
