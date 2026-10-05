import {describe,it,expect} from 'vitest';
import {stepMatch} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {createBotMemory,observeBot,getBotInput,botSpecs} from '../../src/shared/bot.js';
import {addTrail} from '../../src/shared/territory.js';
import type {Personality} from '../../src/shared/model.js';
describe('T15: personalities perform the same game rules',()=>{
 it.each(['EXPAND','ATTACK','DEFEND','SEEK_POINT'] as Personality[])('%s completes captures and returns in real steps',personality=>{
  const m=createMatch({},73,[{...botSpecs(1)[0],personality}]),p=m.participants[0],memory=createBotMemory(73);
  let captures=0,largest=0;const goals=new Set<string>();
  for(let i=0;i<1800;i++){
   const old=m.eventCounter,input=getBotInput(observeBot(m,p.participantId),memory);goals.add(memory.goal);
   stepMatch(m,new Map(input?[[p.participantId,input]]:[]));
   for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>old&&e.type==='CAPTURE'){captures++;largest=Math.max(largest,e.amount??0);}
  }
  expect(captures).toBeGreaterThan(0);expect(largest).toBeGreaterThan(0);
  expect(p.territoryCount).toBeGreaterThan(19);
  if(personality==='SEEK_POINT'){expect(goals.has('SEEK_POINT')).toBe(false);expect(p.controlScore).toBe(0);}
 });
 it('attack and defense choose observably different plans for the same observed trail',()=>{
  const m=createMatch({},73,botSpecs(2)),p=m.participants[0],victim=m.participants[1];
  let target=p.cellId;for(let i=0;i<4;i++)target=m.map.cells[target].neighbors.find(n=>n>=0)!;
  addTrail(m,victim,target);
  const obs=observeBot(m,p.participantId),aggressive=createBotMemory(1),defensive=createBotMemory(1);
  obs.self.personality='ATTACK';getBotInput(obs,aggressive);expect(aggressive.goal).toBe('ATTACK');expect(aggressive.path).toContain(target);
  obs.self.personality='DEFEND';getBotInput(obs,defensive);expect(defensive.goal).toBe('EXPAND');expect(defensive.path).not.toContain(target);
 });
 it('fills a mixed personality roster with new ids and empty stats',()=>{
  const roster=botSpecs(7,1,'new');
  expect(new Set(roster.map(p=>p.personality)).size).toBe(4);expect(roster.every(p=>p.kind==='BOT')).toBe(true);
  const m=createMatch({},123,roster);expect(m.participants.every(p=>p.controlScore===0&&p.kills===0&&p.deaths===0)).toBe(true);
 });
});

