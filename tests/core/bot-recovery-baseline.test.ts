import {describe,it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs} from '../../src/shared/bot.js';
import {BotRecoveryBaselineTracker} from '../bot-recovery-baseline-tracker.js';

function fixture(){
 const m=createMatch({mapRadius:8},19,botSpecs(2,0,'bot',{seed:19}));
 const [a,b]=m.participants,tracker=new BotRecoveryBaselineTracker(m);
 const capture=(tick:number,winner:typeof a,previousOwner:number,...cells:number[])=>tracker.capture({tick,eventTick:tick,gains:[{participantId:winner.participantId,lifeId:winner.lifeId,cells:cells.map(cellId=>({cellId,previousOwner}))}]});
 return{m,a,b,tracker,capture,row:()=>tracker.snapshot().find(r=>r.slot===a.slot)!};
}
describe('supplementary recovery baseline',()=>{
 it('separates neutralized historical damage from ordinary neutral growth and enemy recovery',()=>{
  const f=fixture();f.capture(10,f.b,f.a.slot+1,1,2);
  f.capture(20,f.a,0,1,3);f.capture(20,f.a,f.b.slot+1,2);
  expect(f.row()).toMatchObject({neutralizedRecovery:1,enemyRecovery:1});
  f.capture(21,f.a,0,1);expect(f.row().neutralizedRecovery).toBe(1);
  f.tracker.dispose();
 });
 it('expires losses and discards pre-death damage even if the same participant respawns',()=>{
  const f=fixture();f.capture(10,f.b,f.a.slot+1,1,2);
  f.capture(11+60*f.m.config.simulationHz,f.a,0,1);
  f.tracker.death(f.a.participantId);f.a.lifeId++;f.capture(20+60*f.m.config.simulationHz,f.a,0,2);
  expect(f.row()).toMatchObject({neutralizedRecovery:0,enemyRecovery:0});f.tracker.dispose();
 });
});
