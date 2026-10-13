import {it,expect} from 'vitest';
import {BotGrowthTracker} from '../bot-growth-tracker.js';
import {createMatch} from '../baseline.js';
import {botSpecs} from '../bot-fixtures.js';
import {applySimultaneousCaptures} from '../../src/shared/engine.js';
import {markDead} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
import {setOwner,neutralizeTerritory,addTrail} from '../../src/shared/territory.js';
it('growth audit separates capture loss, death reset and actual respawn grants',()=>{
 const m=createMatch({},19,botSpecs(2)),[a,b]=m.participants,id=(q:number)=>m.map.byKey.get(q+',0')!;
 for(const p of m.participants)neutralizeTerritory(m,p);a.cellId=id(0);b.cellId=id(9);setOwner(m,id(0),1);setOwner(m,id(9),2);for(let q=1;q<=6;q++)setOwner(m,id(q),1);
 const tracker=new BotGrowthTracker(m);let before=m.eventCounter;for(let q=1;q<=6;q++)addTrail(m,b,id(q));applySimultaneousCaptures(m,[b]);m.tick++;tracker.after(before);
 expect(tracker.snapshot().participants[0].netTerritoryChange).toBe(-6);before=m.eventCounter;markDead(m,a,'TRAIL_CUT',b);m.tick++;tracker.after(before);
 let row=tracker.snapshot().participants[0];expect(row.netTerritoryChange).toBe(-6);expect(row.deathResetLoss).toBe(1);expect(row.actualHoldingChange).toBe(-7);
 before=m.eventCounter;m.tick=a.respawnAtTick;tryRespawns(m);tracker.after(before);row=tracker.snapshot().participants[0];expect(row.spawnGrants).toBe(19);expect(row.netTerritoryChange).toBe(-6);expect(row.actualHoldingChange).toBe(row.netTerritoryChange-row.deathResetLoss+row.spawnGrants);expect(row.lifeMaximumShares).toHaveLength(2);tracker.dispose();
});
