import {it,expect} from 'vitest';
import {runIdleAttack} from '../bot-idle-attack-fixture.js';

function assertIdleCut(seed:number,memorySalt=0){
 const {match:m,human,bots,longestTrail,attackTicks}=runIdleAttack(seed,memorySalt);
 expect(longestTrail).toBeGreaterThanOrEqual(5);expect(attackTicks).toBeGreaterThan(0);expect(human).toMatchObject({lifeState:'ELIMINATED',deathReason:'TRAIL_CUT',deaths:1});
 const death=m.events.find(e=>e.type==='DEATH'&&e.participantId===human.participantId)!;expect(death.killerId).toBeTruthy();expect(bots.find(p=>p.participantId===death.killerId)?.kills).toBeGreaterThanOrEqual(1);
 expect(human.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&1)===0)).toBe(true);
}
it.each([4,19,73,115,17,81,32])('seed %s: bots cut a normally spawned idle human before it reaches the opposite wall',seed=>{
 assertIdleCut(seed);
});
it.fails('C known cost: original seed123 / original memory seeds misses the idle human cut',()=>{
 assertIdleCut(123);
});
it('seed123 / memory XOR1: bots really cut the same normally spawned idle human before the wall',()=>{
 assertIdleCut(123,1);
});
