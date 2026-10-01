import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {createBotMemory,observeBot,getBotInput,returnPath,botSpecs} from '../../src/shared/bot.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
describe('T14: shared bot navigation',()=>{
 it('limits enemy observation and keeps future/session state out',()=>{
  const m=createMatch({},73,botSpecs(8)),p=m.participants[0],obs=observeBot(m,p.participantId);
  expect(obs.others.length).toBeLessThan(7);expect(obs).not.toHaveProperty('inputs');
  expect(obs.self).not.toHaveProperty('trailCells');
 });
 it('returns to actual owned territory through BFS and plans ordinary direction inputs',()=>{
  const m=createMatch({},73,botSpecs(1)),p=m.participants[0],owned=p.cellId;
  p.cellId=m.map.cells[owned].neighbors[0];setOwner(m,p.cellId,0);addTrail(m,p,p.cellId);p.position={...m.map.cells[p.cellId].center};
  const obs=observeBot(m,p.participantId),path=returnPath(obs)!;expect(path.length).toBeGreaterThan(0);expect(m.owners[path.at(-1)!]).toBe(p.slot+1);
  const memory=createBotMemory(17);expect(getBotInput(obs,memory,true)).toMatchObject({matchId:m.matchId,lifeId:1});
 });
 it('completes real captures in a seeded simulation',()=>{
  const m=createMatch({},73,botSpecs(1)),p=m.participants[0],memory=createBotMemory(73);let captures=0;
  for(let i=0;i<900;i++){
   const before=m.eventCounter,input=getBotInput(observeBot(m,p.participantId),memory);
   stepMatch(m,new Map(input?[[p.participantId,input]]:[]));
   captures+=m.events.filter(e=>Number(e.eventId.split(':').at(-1))>before&&e.type==='CAPTURE'&&(e.amount??0)>0).length;
  }
  expect(captures).toBeGreaterThan(0);expect(p.territoryCount).toBeGreaterThan(19);
 });
});
