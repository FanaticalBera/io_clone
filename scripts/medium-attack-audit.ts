import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import type {BotDecisionTrace} from '../src/shared/bot.js';
const source=resolve(process.argv.find(a=>a.startsWith('--source='))?.slice(9)??'.');
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const [game,ai,identity,director,hex,movement]=await Promise.all(['game','bot','bot-identity','bot-director','hex','movement'].map(load));
const {getBotInputs,botDirector}=director,{createBotIdentity}=identity,{stepMatch}=game,{createBotMemory,getBotInput,observeBot,watchBotDecisions}=ai,{axialToWorld}=hex,{normalizeDirection}=movement;
// Preserve the historical tests/baseline.ts fixture for either frozen source.
const createMatch=(overrides:any,...args:any[])=>game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2,...overrides},...args);
const phase02=process.argv.includes('--phase02');if(phase02&&!process.argv.includes('--phase01'))throw Error('--phase02 requires --phase01');
const reports=[];
for(const personality of ['DEFEND','ATTACK','EXPAND','SEEK_POINT'] as const)for(const route of [
 [[-2,2],[-4,2],[-4,0],[-2,-2],[0,0]],
 [[-2,2],[-3,2],[-3,0],[-1,-2],[1,-2],[0,0]],
 [[0,2],[-2,4],[-4,4],[-4,2],[-2,0],[0,0]],
 [[-2,2],[-4,2],[-5,3],[-5,1],[-3,-1],[0,0]],
]){
 const match=createMatch({},115,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality}]);
 const [human,bot]=match.participants,origin=match.map.cells[human.cellId],memory=createBotMemory(7,'combined',process.argv.includes('--phase01')?createBotIdentity(7,personality):undefined),traces:BotDecisionTrace[]=[],samples:unknown[]=[];
 watchBotDecisions(memory,(trace:BotDecisionTrace)=>{if(human.trailCells.size)traces.push(trace);});
 let index=0,seq=0,maxTrail=0;
 while(match.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){
  const [q,r]=route[index],target=axialToWorld(origin.q+q,origin.r+r,match.map.side);
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=normalizeDirection(target.x-human.position.x,target.y-human.position.y)!,inputs=new Map();
  inputs.set(human.participantId,{matchId:match.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  const input=phase02?getBotInputs(match,new Map([[bot.participantId,memory]])).get(bot.participantId):getBotInput(observeBot(match,bot.participantId),memory);if(input)inputs.set(bot.participantId,input);
  if(match.tick%6===0&&human.trailCells.size)samples.push({tick:match.tick,trail:human.trailCells.size,human:[match.map.cells[human.cellId].q,match.map.cells[human.cellId].r],bot:[match.map.cells[bot.cellId].q,match.map.cells[bot.cellId].r],ownTrail:bot.trailCells.size,goal:memory.goal});
  stepMatch(match,inputs);maxTrail=Math.max(maxTrail,human.trailCells.size);
 }
 const death=match.events.find((e:any)=>e.type==='DEATH'&&e.participantId===human.participantId);
 reports.push({phase02,director:phase02?botDirector(match).snapshot():undefined,personality,route,maxTrail,tick:match.tick,humanState:human.lifeState,deaths:human.deaths,killer:death?.killerId,deathReason:death?.reason,deathCause:death?.deathContext?.cause,confirmedTrailCut:death?.killerId===bot.participantId&&['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT'].includes(death.deathContext?.cause??''),traces,samples});
}
const json=JSON.stringify(reports,null,2),out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out)writeFileSync(out,json);else console.log(json);
