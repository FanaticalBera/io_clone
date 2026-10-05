import {describe,it,expect} from 'vitest';
import {createMatch} from '../baseline.js';
import {createBotMemory,getBotInput,observeBot,botSpecs} from '../../src/shared/bot.js';
import {neutralizeTerritory,setOwner,addTrail} from '../../src/shared/territory.js';
import {hexDistance} from '../../src/shared/hex.js';

// Controlled local observations isolate tactical choices. Actual movement,
// contact, captures and idle HUMAN deaths remain covered by the simulation tests.
function duel(outside=false){
 const m=createMatch({},115,[...botSpecs(1),{participantId:'human',slot:1,nickname:'H',kind:'HUMAN'}]);
 const [bot,enemy]=m.participants,origin=m.map.cells[bot.cellId],id=(q:number,r=0)=>m.map.byKey.get(`${origin.q+q},${origin.r+r}`)!;
 for(const p of m.participants)neutralizeTerritory(m,p);
 bot.cellId=id(0);bot.position={...m.map.cells[bot.cellId].center};bot.direction={x:1,y:0};bot.personality='DEFEND';
 enemy.cellId=id(1);enemy.position={...m.map.cells[enemy.cellId].center};enemy.direction={x:-1,y:0};
 setOwner(m,id(outside?-3:0),1);setOwner(m,id(3),2);addTrail(m,enemy,id(2));addTrail(m,enemy,id(1));
 if(outside){addTrail(m,bot,id(-2));addTrail(m,bot,id(-1));addTrail(m,bot,id(0));}
 const memory=createBotMemory(7);memory.plannedLifeId=bot.lifeId;memory.path=[id(outside?-3:0)];memory.goal='EXPAND';
 return {m,bot,enemy,id,memory};
}
describe('local tactical opportunities',()=>{
 it('keeps an existing viable cut instead of switching to a closer urgent target',()=>{
  const f=duel(true);f.enemy.cellId=f.id(8);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};
  f.memory.goal='ATTACK';f.memory.attackSlot=f.enemy.slot;f.memory.attackTarget=f.id(2);
  f.memory.path=[f.id(1),f.id(2),f.id(1),f.id(0),f.id(-1),f.id(-2),f.id(-3)];
  const path=[...f.memory.path];getBotInput(observeBot(f.m,f.bot.participantId),f.memory);
  expect(f.memory.goal).toBe('ATTACK');expect(f.memory.attackTarget).toBe(f.id(2));expect(f.memory.path).toEqual(path);
 });
 it('retargets a vanished cut cell to the same observed victim without leaving ATTACK',()=>{
  const f=duel(true);f.enemy.cellId=f.id(8);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};
  f.memory.goal='ATTACK';f.memory.attackSlot=f.enemy.slot;f.memory.attackTarget=f.id(2);
  f.memory.path=[f.id(1),f.id(2),f.id(1),f.id(0),f.id(-1),f.id(-2),f.id(-3)];
  f.enemy.trailCells.delete(f.id(2));f.m.trailMasks[f.id(2)]&=~(1<<f.enemy.slot);
  getBotInput(observeBot(f.m,f.bot.participantId),f.memory);
  expect(f.memory.goal).toBe('ATTACK');expect(f.memory.attackSlot).toBe(f.enemy.slot);expect(f.memory.attackTarget).toBe(f.id(1));
 });
 it.each(['EXPAND','RETURN'] as const)('a short, exposed two-cell line interrupts %s when a cheap cut beats the victim returning',goal=>{
  const f=duel();f.memory.goal=goal;getBotInput(observeBot(f.m,f.bot.participantId),f.memory);
  expect(f.memory.goal).toBe('ATTACK');expect(f.memory.attackTarget).toBe(f.id(1));
 });
 it('takes an immediate winning counter-cut instead of fleeing solely because an enemy is nearby',()=>{
  const f=duel(true);f.enemy.cellId=f.id(2);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};getBotInput(observeBot(f.m,f.bot.participantId),f.memory);
  expect(f.memory.goal).toBe('ATTACK');expect(f.memory.path.at(-1)).toBe(f.id(-3));
 });
 it('rejects a cut when the opponent reaches our exposed line first',()=>{
  const f=duel(true);f.enemy.cellId=f.id(-1);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};
  getBotInput(observeBot(f.m,f.bot.participantId),f.memory);expect(f.memory.goal).toBe('ESCAPE');
 });
 it('does not chase a short line that its owner can close before the bot arrives',()=>{
  const f=duel();f.enemy.direction={x:1,y:0};f.enemy.cellId=f.id(2);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};
  getBotInput(observeBot(f.m,f.bot.participantId),f.memory);expect(f.memory.goal).not.toBe('ATTACK');
 });
 it('remembers repeated small thefts by the same opponent and cools down without permanent hostility',()=>{
  const f=duel();f.enemy.trailCells.clear();f.m.trailMasks.fill(0);
  for(const q of [-1,-2])setOwner(f.m,f.id(q,1),1);
  getBotInput(observeBot(f.m,f.bot.participantId),f.memory);
  // Five cells away: this is a grievance-driven chase, outside the cheap
  // four-cell opportunity range used even without a previous theft.
  f.enemy.cellId=f.id(5);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};f.enemy.direction={x:0,y:1};setOwner(f.m,f.id(3),0);setOwner(f.m,f.id(9),2);
  for(const q of [8,7,6,5])addTrail(f.m,f.enemy,f.id(q));
  for(const q of [-1,-2]){f.memory.goal='EXPAND';f.memory.path=[f.id(0)];f.m.tick+=6;setOwner(f.m,f.id(q,1),2);getBotInput(observeBot(f.m,f.bot.participantId),f.memory);if(q===-1)expect(f.memory.goal).not.toBe('ATTACK');}
  expect(f.memory.goal).toBe('ATTACK');expect(f.memory.grievances.get(f.enemy.slot)?.amount).toBeGreaterThan(1.5);
  f.m.tick+=f.m.config.simulationHz*120;f.memory.goal='EXPAND';f.memory.path=[f.id(0)];getBotInput(observeBot(f.m,f.bot.participantId),f.memory);expect(f.memory.grievances.has(f.enemy.slot)).toBe(false);expect(f.memory.goal).not.toBe('ATTACK');
 });
 it('uses compact expansion paths away from an enemy near home',()=>{
  const m=createMatch({},115,botSpecs(2)),[bot,enemy]=m.participants,origin=m.map.cells[bot.cellId];
  enemy.cellId=m.map.byKey.get(`${origin.q+5},${origin.r}`)!;enemy.position={...m.map.cells[enemy.cellId].center};
  const memory=createBotMemory(7);getBotInput(observeBot(m,bot.participantId),memory);
  const outside=memory.path.filter(id=>m.owners[id]!==bot.slot+1);expect(outside.length).toBeLessThanOrEqual(6);
  expect(outside.every(id=>hexDistance(m.map.cells[id],m.map.cells[enemy.cellId])>2)).toBe(true);
 });
 it('abandons a large expansion already in progress when a previously distant enemy approaches',()=>{
  const f=duel(true);f.enemy.trailCells.clear();f.m.trailMasks.fill(0);for(const id of f.bot.trailCells)f.m.trailMasks[id]|=1<<f.bot.slot;
  f.enemy.cellId=f.id(6);f.enemy.position={...f.m.map.cells[f.enemy.cellId].center};
  f.memory.path=[f.id(0,1),f.id(1,1),f.id(2,1),f.id(2,2),f.id(1,3),f.id(0,3),f.id(-1,3),f.id(-2,3),f.id(-3)];
  getBotInput(observeBot(f.m,f.bot.participantId),f.memory);expect(f.memory.goal).toBe('RETURN');expect(f.memory.path.at(-1)).toBe(f.id(-3));expect(f.memory.path.length).toBeLessThan(9);
 });
 it('varies safe expansion sizes and corner counts while remaining deterministic by seed',()=>{
  const shapes=new Set<string>();let beveled=0;
  for(let seed=1;seed<=24;seed++){
   const m=createMatch({},73,botSpecs(1)),p=m.participants[0],obs=observeBot(m,p.participantId),memory=createBotMemory(seed),repeat=createBotMemory(seed);
   getBotInput(obs,memory);getBotInput(obs,repeat);expect(memory.path).toEqual(repeat.path);
   let previous=p.cellId,last=-1,corners=0;for(const id of memory.path){const direction=m.map.cells[previous].neighbors.indexOf(id);if(last>=0&&last!==direction)corners++;last=direction;previous=id;}
   shapes.add(`${memory.path.length}:${corners}`);if(corners>=5)beveled++;
  }
  expect(shapes.size).toBeGreaterThan(3);expect(beveled).toBeGreaterThan(0);
 });
});
