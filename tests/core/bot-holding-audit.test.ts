import {it,expect} from 'vitest';
import {BotHoldingTracker} from '../bot-holding-tracker.js';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory} from '../../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../../src/shared/bot-identity.js';
import {getBotInputs,botDirector} from '../../src/shared/bot-director.js';
import {neutralizeTerritory,setOwner} from '../../src/shared/territory.js';
import {markDead} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
it('samples actual holding including zero dead ticks and spawn grants, with no growth correction',()=>{
 const m=createMatch({mapRadius:22,spawnRadius:1},19,botSpecs(2)),[a,b]=m.participants,id=(q:number)=>m.map.byKey.get(q+',0')!;
 for(const p of m.participants)neutralizeTerritory(m,p);a.cellId=id(0);b.cellId=id(12);setOwner(m,id(0),1);setOwner(m,id(12),2);const tracker=new BotHoldingTracker(m);
 for(let q=1;q<=9;q++)setOwner(m,id(q),1);m.tick=1;tracker.afterTick();markDead(m,a,'TRAIL_CUT',b);m.tick=2;tracker.afterTick();a.respawnAtTick=3;m.tick=3;tryRespawns(m);expect(a.territoryCount).toBe(7);tracker.afterTick();
 const out=tracker.snapshot(),row=out.participants[0];expect(out.samples).toBe(3);expect(row.holdingCellTicks).toBe(17);expect(row.timeAverageCells).toBe(17/3);expect(row.finalCells).toBe(7);expect(row.maximumCells).toBe(10);expect(row.maximumTick).toBe(1);expect(out.total.timeAverageCells).toBe(20/3);expect(out.total.finalCells).toBe(8);expect(out.total.maximumCells).toBe(11);expect(row.maximumShare).toBe(10/m.map.cells.length);expect(()=>tracker.afterTick()).toThrow('consecutive');
});
it('whole peak is simultaneous, never the sum of individual peaks at different times',()=>{
 const m=createMatch({mapRadius:8,spawnRadius:1},4,botSpecs(2));for(const p of m.participants)neutralizeTerritory(m,p);const tracker=new BotHoldingTracker(m),[a,b]=m.participants;
 for(let id=0;id<6;id++)setOwner(m,id,a.slot+1);m.tick=1;tracker.afterTick();for(let id=0;id<6;id++)setOwner(m,id,b.slot+1);m.tick=2;tracker.afterTick();const s=tracker.snapshot();expect(s.total.maximumCells).toBe(6);expect(s.participants.reduce((n,p)=>n+p.maximumCells,0)).toBe(12);expect(s.total.timeAverageCells).toBe(6);expect(s.total.maximumShare).toBe(6/m.map.cells.length);expect(s.total.timeAverageCells).toBe(s.participants.reduce((n,p)=>n+p.timeAverageCells!,0));
});
it('holding observer preserves real inputs, RNG, ownership, movement and director ordering',()=>{
 const make=()=>{const seed=19,m=createMatch({mapRadius:22,spawnRadius:1},seed,botSpecs(4,0,'bot',{seed})),memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));return {m,memories};};
 const a=make(),b=make(),tracker=new BotHoldingTracker(b.m);for(let t=0;t<180;t++){const ai=getBotInputs(a.m,a.memories),bi=getBotInputs(b.m,b.memories);expect([...bi]).toEqual([...ai]);stepMatch(a.m,ai);stepMatch(b.m,bi);tracker.afterTick();expect(b.m.owners).toEqual(a.m.owners);expect(b.m.trailMasks).toEqual(a.m.trailMasks);expect(b.m.participants).toEqual(a.m.participants);expect(botDirector(b.m).snapshot()).toEqual(botDirector(a.m).snapshot());}
 expect(tracker.snapshot().samples).toBe(180);for(const [id,memory]of a.memories)expect(memory.random()).toBe(b.memories.get(id)!.random());
});
