import {it,expect} from 'vitest';
import {stepMatch} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../../src/shared/bot.js';
import type {DirectionInput} from '../../src/shared/model.js';

it.each([4,19,73,115,17,81,32,123])('seed %s: bots cut a normally spawned idle human before it reaches the opposite wall',seed=>{
 const m=createMatch({},seed,[{participantId:'idle',slot:0,nickname:'IDLE',kind:'HUMAN'},...botSpecs(7,1)]),human=m.participants[0];
 const bots=m.participants.slice(1),memories=bots.map(p=>createBotMemory(seed^(p.slot*2654435761)));let longestTrail=0,attackTicks=0;
 // No HUMAN input, no position/ownership/trail edits. The exposed line and
 // opportunity must emerge from the ordinary movement/capture engine.
 while(human.lifeState==='ALIVE'&&m.tick<400){
  const inputs=new Map<string,DirectionInput>();bots.forEach((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);if(memories[i].goal==='ATTACK')attackTicks++;});
  stepMatch(m,inputs);longestTrail=Math.max(longestTrail,human.trailCells.size);
 }
 expect(longestTrail).toBeGreaterThanOrEqual(5);expect(attackTicks).toBeGreaterThan(0);expect(human).toMatchObject({lifeState:'ELIMINATED',deathReason:'TRAIL_CUT',deaths:1});
 const death=m.events.find(e=>e.type==='DEATH'&&e.participantId===human.participantId)!;expect(death.killerId).toBeTruthy();expect(bots.find(p=>p.participantId===death.killerId)?.kills).toBeGreaterThanOrEqual(1);
 expect(human.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&1)===0)).toBe(true);
});
