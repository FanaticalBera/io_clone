import {describe,it,expect} from 'vitest';
import {runMediumAttack} from '../medium-attack-fixture.js';

describe('normally spawned bots exploit medium movement loops',()=>{
 it.each(['DEFEND','ATTACK','EXPAND','SEEK_POINT'] as const)('%s: both spawn roles attack an outward-moving short loop instead of assuming instant retreat',personality=>{
  for(const reverse of [false,true]){
   const f=runMediumAttack(personality,reverse);
   expect(f.attackTicks).toBeGreaterThan(0);expect(f.maxTrail).toBeGreaterThanOrEqual(2);expect(f.maxTrail).toBeLessThanOrEqual(6);
   expect(f.captures).toBe(0);expect(f.human).toMatchObject({lifeState:'DEAD_WAIT',deathReason:'TRAIL_CUT',deaths:1});
   expect(f.match.events.find(e=>e.type==='DEATH'&&e.participantId===f.human.participantId)).toMatchObject({killerId:f.bot.participantId,deathContext:{cause:'EXISTING_TRAIL_CONTACT'}});
   expect(f.bot.kills).toBe(1);expect(f.human.trailCells.size).toBe(0);expect(f.match.trailMasks.some(mask=>(mask&(1<<f.human.slot))!==0)).toBe(false);
  }
 });
 it('a defender attacks a moderate radius loop with fewer than eight trail cells in both roles',()=>{
  for(const reverse of [false,true]){const f=runMediumAttack('DEFEND',reverse,true);
   expect(f.attackTicks).toBeGreaterThan(0);expect(f.maxTrail).toBeGreaterThan(3);expect(f.maxTrail).toBeLessThan(8);
   expect(f.captures).toBe(0);expect(f.human.lifeState).toBe('DEAD_WAIT');expect(f.bot.kills).toBe(1);
  }
 });
});
