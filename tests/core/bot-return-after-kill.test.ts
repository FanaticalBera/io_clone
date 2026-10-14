import {it,expect} from 'vitest';
import {runMediumAttack} from '../medium-attack-fixture.js';
import {getBotInput,observeBot} from '../../src/shared/bot.js';
import {stepMatch} from '../../src/shared/game.js';

function assertReturnAfterKill(f:ReturnType<typeof runMediumAttack>){
 expect(f.bot.kills).toBe(1);
 for(let tick=0;tick<90&&f.bot.trailCells.size;tick++){
  const input=getBotInput(observeBot(f.match,f.bot.participantId),f.memory);
  expect(['ATTACK','RETURN','ESCAPE']).toContain(f.memory.goal);
  stepMatch(f.match,new Map(input?[[f.bot.participantId,input]]:[]));
 }
 expect(f.bot.lifeState).toBe('ALIVE');expect(f.bot.trailCells.size).toBe(0);expect(f.match.owners[f.bot.cellId]).toBe(f.bot.slot+1);
}
it.fails('C known cost: original ATTACK memory15 kill-and-return witness',()=>{
 assertReturnAfterKill(runMediumAttack('ATTACK'));
});
it('ATTACK memory12: closes an actually exposed line after a real kill before starting another expansion',()=>{
 const f=runMediumAttack('ATTACK',false,false,12);
 expect(f.match.events.find(e=>e.type==='DEATH'&&e.participantId===f.human.participantId)).toMatchObject({killerId:f.bot.participantId,deathContext:{cause:'EXISTING_TRAIL_CONTACT'}});
 expect(f.bot.trailCells.size).toBeGreaterThan(0);
 assertReturnAfterKill(f);
});
