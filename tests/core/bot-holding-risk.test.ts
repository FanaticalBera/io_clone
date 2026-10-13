import {expect,it} from 'vitest';
import {holdingRiskThreshold,holdingRiskMultiplier,holdingDangerDistance} from '../../src/shared/bot-holding-risk.js';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,observeBot,getBotInput,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {setOwner} from '../../src/shared/territory.js';import {hexDistance} from '../../src/shared/hex.js';
it('expresses risk in map quota while preserving exact approved R56/14 arithmetic and never weakening distance',()=>{
 expect(holdingRiskThreshold(9577,14)).toBe(256);expect(holdingRiskThreshold(9577*2,14)).toBe(512);expect(holdingRiskThreshold(9577,7)).toBe(512);
 for(let cells=0;cells<=2048;cells++){
  const approved=cells<256?1:1.15+.1*Math.max(0,Math.min(2,Math.log2(cells/256)));
  expect(holdingRiskMultiplier(cells,9577,14)).toBe(approved);
  for(const base of [2,2.13,3,4.12,5,8]){const distance=holdingDangerDistance(base,cells,9577,14);expect(distance).toBeGreaterThanOrEqual(base);expect(distance).toBe(cells<256?base:Math.max(base,Math.min(7,Math.ceil(base*approved))));}
 }
 expect(holdingRiskMultiplier(512,9577,14)).toBe(1.25);expect(holdingRiskMultiplier(1024,9577,14)).toBeCloseTo(1.35,14);
});
it('includes respawn-wait bots in quota and starts retreat at the approved one-cell wider danger boundary',()=>{
 const run=(holdings:number)=>{const m=createMatch({mapRadius:56,spawnRadius:1},73,botSpecs(14)),p=m.participants[0],enemy=m.participants[1],id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
  m.owners.fill(0);for(const actor of m.participants){actor.territoryCount=0;actor.lifeState='DEAD_WAIT';}p.lifeState=enemy.lifeState='ALIVE';p.personality='DEFEND';p.cellId=id(1);p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};p.protectedUntilTick=0;
  enemy.cellId=id(4);enemy.position={...m.map.cells[enemy.cellId].center};enemy.direction={x:-1,y:0};enemy.protectedUntilTick=0;
  const home=m.map.cells.filter(c=>c.q<=0).sort((a,b)=>hexDistance(a,{q:0,r:0})-hexDistance(b,{q:0,r:0}));for(const cell of home.slice(0,holdings))setOwner(m,cell.id,p.slot+1);p.trailCells.add(id(1));
  const memory=createBotMemory(73);memory.plannedLifeId=p.lifeId;memory.lastCell=p.cellId;memory.goal='EXPAND';memory.path=[id(1,-1),id(0,-1)];memory.schedule=undefined;
  let trace:BotDecisionTrace|undefined;watchBotDecisions(memory,t=>trace=t,{shadow:false});const obs=observeBot(m,p.participantId);expect(obs.roster?.length).toBe(14);getBotInput(obs,memory);return trace!;
 };
 expect(run(255).risk?.danger).toBe(false);expect(run(256).risk?.danger).toBe(true);expect(run(256).reason).toBe('DANGER');
});
