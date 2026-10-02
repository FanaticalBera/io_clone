import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {hexDistance} from '../src/shared/hex.js';
const m=createMatch({},4,[{participantId:'idle',slot:0,nickname:'IDLE',kind:'HUMAN'},...botSpecs(7,1)]),human=m.participants[0],memories=m.participants.slice(1).map(p=>createBotMemory(4^(p.slot*2654435761)));
while(human.lifeState==='ALIVE'&&m.tick<400){const inputs=new Map();
 m.participants.slice(1).forEach((p,i)=>{const memory=memories[i],before=memory.goal,obs=observeBot(m,p.participantId),input=getBotInput(obs,memory);if(input)inputs.set(p.participantId,input);
  if(m.tick%6===0){const dist=human.trailCells.size?Math.min(...[...human.trailCells].map(id=>hexDistance(m.map.cells[id],m.map.cells[p.cellId]))):99;
  if(p.lifeState==='ALIVE'&&(dist<=3||memory.attackSlot===0)&&obs.trails.some(t=>t.slot===0))console.log(JSON.stringify({tick:m.tick,bot:p.slot,cell:[m.map.cells[p.cellId].q,m.map.cells[p.cellId].r],dist,before,after:memory.goal,ownTrail:[...p.trailCells].map(id=>[m.map.cells[id].q,m.map.cells[id].r]),target:memory.attackSlot,targetCell:memory.attackTarget===null?null:[m.map.cells[memory.attackTarget].q,m.map.cells[memory.attackTarget].r],heading:p.direction,humanCell:[m.map.cells[human.cellId].q,m.map.cells[human.cellId].r],path:memory.path.map(id=>[m.map.cells[id].q,m.map.cells[id].r]),others:obs.others.map(p=>p.slot)}));}
 });const count=m.eventCounter;stepMatch(m,inputs);for(const event of m.events)if(Number(event.eventId.split(':').at(-1))>count&&event.type==='DEATH')console.log('DEATH',JSON.stringify(event));
}
