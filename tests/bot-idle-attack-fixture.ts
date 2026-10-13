import {stepMatch} from '../src/shared/game.js';
import {createMatch} from './baseline.js';
import {createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {botSpecs} from './bot-fixtures.js';
import type {DirectionInput} from '../src/shared/model.js';

export function runIdleAttack(seed:number,memorySalt=0){
 const match=createMatch({},seed,[{participantId:'idle',slot:0,nickname:'IDLE',kind:'HUMAN'},...botSpecs(7,1)]),human=match.participants[0];
 const bots=match.participants.slice(1),memories=bots.map(p=>createBotMemory(seed^(p.slot*2654435761)^memorySalt));let longestTrail=0,attackTicks=0;
 // Same original fixture: no human input or position/ownership/trail edits.
 while(human.lifeState==='ALIVE'&&match.tick<400){
  const inputs=new Map<string,DirectionInput>();bots.forEach((p,i)=>{const input=getBotInput(observeBot(match,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);if(memories[i].goal==='ATTACK')attackTicks++;});
  stepMatch(match,inputs);longestTrail=Math.max(longestTrail,human.trailCells.size);
 }
 return {match,human,bots,memories,longestTrail,attackTicks};
}
