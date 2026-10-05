import {it,expect} from 'vitest';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,botLookAhead,type BotGoal} from '../../src/shared/bot.js';
import {seededRandom} from '../../src/shared/random.js';

it('assigns bounded stable traits without consuming the decision random stream',()=>{
 const variants=new Set<string>();
 for(let seed=1;seed<=32;seed++){
  const memory=createBotMemory(seed),repeat=createBotMemory(seed),random=seededRandom(seed);
  expect(memory.traits).toEqual(repeat.traits);expect(Object.isFrozen(memory.traits)).toBe(true);
  for(const value of Object.values(memory.traits)){expect(value).toBeGreaterThanOrEqual(.9);expect(value).toBeLessThan(1.1);}
  variants.add(JSON.stringify(memory.traits));for(let i=0;i<10;i++)expect(memory.random()).toBe(random());
 }
 expect(variants.size).toBe(32);
});
it('keeps individual traits across life resets and reproduces the same plan',()=>{
 const m=createMatch({},73,botSpecs(1)),obs=observeBot(m,m.participants[0].participantId),a=createBotMemory(7),b=createBotMemory(7),traits=a.traits;
 expect(getBotInput(obs,a)).toEqual(getBotInput(obs,b));expect(a.path).toEqual(b.path);
 obs.self.lifeId++;getBotInput(obs,a);expect(a.traits).toBe(traits);
});
it.each(['RETURN','ESCAPE','STEAL','SEEK_POINT','EXPAND'] as BotGoal[])('%s uses a longer safe corridor but falls back near an observed head',goal=>{
 const m=createMatch({},73,botSpecs(2)),obs=observeBot(m,m.participants[0].participantId);
 obs.self.cellId=m.map.byKey.get('0,0')!;obs.others=[];obs.trails=[];
 expect(botLookAhead(obs,goal)).toBe(2);
 obs.others=[{...obs.self,slot:1,cellId:m.map.byKey.get('1,0')!}];expect(botLookAhead(obs,goal)).toBe(1);
 obs.others=[];obs.trails=[{slot:1,cellId:m.map.byKey.get('2,0')!}];expect(botLookAhead(obs,goal)).toBe(1);
});
it('retains short defensive expansion and waypoint fallback at the perimeter',()=>{
 const m=createMatch({},73,botSpecs(1)),obs=observeBot(m,m.participants[0].participantId);
 obs.self.personality='DEFEND';obs.self.cellId=m.map.byKey.get('0,0')!;
 expect(botLookAhead(obs,'EXPAND')).toBe(1);expect(botLookAhead(obs,'RETURN')).toBe(2);
 obs.self.cellId=m.map.byKey.get(`${m.map.radius},0`)!;expect(botLookAhead(obs,'RETURN')).toBe(1);
});
