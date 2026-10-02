import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {createBotMemory,observeBot,getBotInput,returnPath,botSpecs,plannedCapture} from '../../src/shared/bot.js';
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
 it('does not discard an adjacent waypoint before entering its cell',()=>{
  const m=createMatch({},73,botSpecs(1)),p=m.participants[0],next=m.map.cells[p.cellId].neighbors[0],memory=createBotMemory(73);
  const center=m.map.cells[next].center,d={x:center.x-p.position.x,y:center.y-p.position.y},length=Math.hypot(d.x,d.y);
  p.position={x:center.x-d.x/length*30,y:center.y-d.y/length*30};
  memory.plannedLifeId=p.lifeId;memory.path=[next];memory.nextDecisionTick=99;
  getBotInput(observeBot(m,p.participantId),memory);expect(memory.path).toEqual([next]);
 });
 it('commits to escaping until home even after an attack opportunity appears',()=>{
  const m=createMatch({},73,botSpecs(2)),p=m.participants[0],enemy=m.participants[1],memory=createBotMemory(1),home=p.cellId;
  p.personality='ATTACK';let outside=home;for(let step=0;step<3;step++)outside=m.map.cells[outside].neighbors[3];
  p.cellId=outside;p.position={...m.map.cells[outside].center};setOwner(m,outside,0);addTrail(m,p,outside);
  enemy.cellId=m.map.cells[outside].neighbors[1];enemy.position={...m.map.cells[enemy.cellId].center};
  getBotInput(observeBot(m,p.participantId),memory);expect(memory.goal).toBe('ESCAPE');const path=[...memory.path];
  enemy.cellId=m.map.byKey.get('-17,0')!;enemy.position={...m.map.cells[enemy.cellId].center};addTrail(m,enemy,m.map.cells[outside].neighbors[2]);m.tick=6;
  getBotInput(observeBot(m,p.participantId),memory);expect(memory.goal).toBe('ESCAPE');expect(memory.path).toEqual(path);
 });
 it('abandons a vanished attack target and returns to owned territory',()=>{
  const m=createMatch({},73,botSpecs(1)),p=m.participants[0],memory=createBotMemory(1),home=p.cellId;
  const outside=m.map.cells[home].neighbors[3];setOwner(m,outside,0);p.cellId=outside;p.position={...m.map.cells[outside].center};addTrail(m,p,outside);
  memory.plannedLifeId=p.lifeId;memory.goal='ATTACK';memory.attackTarget=m.map.cells[outside].neighbors[2];memory.path=[memory.attackTarget,home];
  getBotInput(observeBot(m,p.participantId),memory);expect(memory.goal).toBe('RETURN');expect(m.owners[memory.path.at(-1)!]).toBe(p.slot+1);
 });
 it('scores enclosed area rather than counting a retraced line twice',()=>{
  const m=createMatch({},73,botSpecs(1)),p=m.participants[0],obs=observeBot(m,p.participantId);let current=p.cellId;const line:number[]=[];
  for(let step=0;step<4;step++){current=m.map.cells[current].neighbors[3];line.push(current);}
  const external=line.filter(id=>m.owners[id]!==p.slot+1);expect(plannedCapture(obs,[...line,...line.slice().reverse()])).toHaveLength(external.length);
 });
 it.each([4,19,73])('seed %s: eight bots expand and avoid walls for two real simulation minutes',seed=>{
  const m=createMatch({},seed,botSpecs(8)),memories=m.participants.map((_,i)=>createBotMemory(seed+i)),expanded=new Set<string>();let walls=0,gained=0;
  for(let tick=0;tick<3600;tick++){
   const before=m.eventCounter,inputs=new Map();
   m.participants.forEach((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);if(input)inputs.set(p.participantId,input);});stepMatch(m,inputs);
   for(const p of m.participants)if(p.territoryCount>19)expanded.add(p.participantId);
   for(const event of m.events)if(Number(event.eventId.split(':').at(-1))>before){if(event.type==='DEATH'&&event.reason==='WALL_HIT')walls++;if(event.type==='CAPTURE')gained+=event.amount??0;}
  }
  expect(walls).toBe(0);expect(gained).toBeGreaterThan(2500);expect(expanded.size).toBeGreaterThanOrEqual(6);
 },15000);
});
