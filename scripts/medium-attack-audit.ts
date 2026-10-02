import {createMatch,stepMatch} from '../src/shared/game.js';
import {createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {axialToWorld} from '../src/shared/hex.js';
import {normalizeDirection} from '../src/shared/movement.js';
const reports=[];
for(const personality of ['DEFEND','ATTACK','EXPAND','SEEK_POINT'] as const)for(const route of [
 [[-2,2],[-4,2],[-4,0],[-2,-2],[0,0]],
 [[-2,2],[-3,2],[-3,0],[-1,-2],[1,-2],[0,0]],
 [[0,2],[-2,4],[-4,4],[-4,2],[-2,0],[0,0]],
 [[-2,2],[-4,2],[-5,3],[-5,1],[-3,-1],[0,0]],
]){
 const match=createMatch({},115,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality}]);
 const [human,bot]=match.participants,origin=match.map.cells[human.cellId],memory=createBotMemory(7),traces:BotDecisionTrace[]=[],samples:unknown[]=[];
 watchBotDecisions(memory,trace=>{if(human.trailCells.size)traces.push(trace);});
 let index=0,seq=0,maxTrail=0;
 while(match.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){
  const [q,r]=route[index],target=axialToWorld(origin.q+q,origin.r+r,match.map.side);
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=normalizeDirection(target.x-human.position.x,target.y-human.position.y)!,inputs=new Map();
  inputs.set(human.participantId,{matchId:match.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  const input=getBotInput(observeBot(match,bot.participantId),memory);if(input)inputs.set(bot.participantId,input);
  if(match.tick%6===0&&human.trailCells.size)samples.push({tick:match.tick,trail:human.trailCells.size,human:[match.map.cells[human.cellId].q,match.map.cells[human.cellId].r],bot:[match.map.cells[bot.cellId].q,match.map.cells[bot.cellId].r],ownTrail:bot.trailCells.size,goal:memory.goal});
  stepMatch(match,inputs);maxTrail=Math.max(maxTrail,human.trailCells.size);
 }
 reports.push({personality,route,maxTrail,tick:match.tick,humanState:human.lifeState,deaths:human.deaths,killer:match.events.find(e=>e.type==='DEATH'&&e.participantId===human.participantId)?.killerId,traces,samples});
}
console.log(JSON.stringify(reports,null,2));
