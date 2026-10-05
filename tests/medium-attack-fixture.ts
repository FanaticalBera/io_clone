import {stepMatch} from '../src/shared/game.js';
import {createMatch} from './baseline.js';
import {createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {axialToWorld} from '../src/shared/hex.js';
import {normalizeDirection} from '../src/shared/movement.js';
import type {Personality} from '../src/shared/model.js';

export function runMediumAttack(personality:Personality,reverse=false,wide=false){
 const humanSlot=reverse?1:0,botSlot=reverse?0:1;
 const specs=[{participantId:'human',slot:humanSlot,nickname:'H',kind:'HUMAN' as const},{participantId:'bot',slot:botSlot,nickname:'B',kind:'BOT' as const,personality}];
 const match=createMatch({},reverse?17:115,specs),[human,bot]=match.participants,origin=match.map.cells[human.cellId],memory=createBotMemory(7),traces:BotDecisionTrace[]=[];
 watchBotDecisions(memory,trace=>{if(human.trailCells.size)traces.push(trace);});
 const route=wide?[[0,2],[-2,4],[-4,4],[-4,2],[-2,0],[0,0]]:[[-2,2],[-3,2],[-3,0],[-1,-2],[1,-2],[0,0]];
 let index=0,seq=0,maxTrail=0,attackTicks=0,captures=0;
 while(match.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){
  const [q,r]=route[index],target=axialToWorld(origin.q+q,origin.r+r,match.map.side);
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=normalizeDirection(target.x-human.position.x,target.y-human.position.y)!,inputs=new Map();
  inputs.set(human.participantId,{matchId:match.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  const input=getBotInput(observeBot(match,bot.participantId),memory);if(input)inputs.set(bot.participantId,input);
  if(memory.goal==='ATTACK')attackTicks++;
  const before=match.eventCounter;stepMatch(match,inputs);maxTrail=Math.max(maxTrail,human.trailCells.size);
  captures+=match.events.filter(e=>e.type==='CAPTURE'&&e.participantId===human.participantId&&Number(e.eventId.split(':').at(-1))>before).length;
 }
 return {match,human,bot,memory,traces,maxTrail,attackTicks,captures};
}
