import {describe,it,expect} from 'vitest';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,type BotObservation,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import type {Personality} from '../../src/shared/model.js';

// Controlled PUBLIC observations isolate scoring. Actual cuts and life/return
// outcomes remain covered by medium-attack and normally spawned idle targets.
function window(personality:Personality,targets=[2,5],thirdParty=false){
 const m=createMatch({},115,botSpecs(2)),cell=(q:number,r=0)=>m.map.byKey.get(`${q},${r}`)!,obs:BotObservation=observeBot(m,m.participants[0].participantId);
 obs.tick=120;obs.owners=new Uint8Array(m.map.cells.length);obs.owners[cell(0)]=1;obs.owners[cell(-1)]=1;obs.owners[cell(0,-1)]=1;obs.owners[cell(-10)]=2;
 obs.self={...obs.self,personality,cellId:cell(0),position:{...m.map.cells[cell(0)].center},direction:{x:1,y:0},protectedUntilTick:0};
 obs.others=[{...observeBot(m,m.participants[1].participantId).self,cellId:cell(7,3),position:{...m.map.cells[cell(7,3)].center},direction:{x:0,y:1},targetDirection:{x:0,y:1}}];
 if(thirdParty)obs.others.push({...obs.others[0],participantId:'third',slot:2,cellId:cell(3,2),position:{...m.map.cells[cell(3,2)].center}});
 obs.trails=targets.map(q=>({slot:1,cellId:cell(q)}));obs.ownTrail=[];
 const memory=createBotMemory(7);memory.plannedLifeId=obs.self.lifeId;memory.goal='STEAL';memory.path=[cell(0,-1),cell(-1)];memory.grievances.set(1,{amount:6,tick:obs.tick});let trace:BotDecisionTrace|undefined;
 watchBotDecisions(memory,t=>{trace=t;});getBotInput(obs,memory);return {obs,memory,trace:trace!,cell};
}
describe('personality-specific kill windows',()=>{
 it('hunter prefers a short clear window with larger quality bonus while retaining medium range',()=>{
  const f=window('ATTACK');expect(f.memory.goal).toBe('ATTACK');expect(f.memory.attackTarget).toBe(f.cell(2));
  const near=f.trace.attacks.find(a=>a.target===f.cell(2))!,far=f.trace.attacks.find(a=>a.target===f.cell(5))!;
  expect(near.score!).toBeGreaterThan(far.score!);expect(near.qualityBonus!).toBeGreaterThan(far.qualityBonus!);expect(far.etaMargin).toBeGreaterThan(near.etaMargin!);
  expect(window('ATTACK',[5]).memory.goal).toBe('ATTACK');
 });
 it('thief retains the stealing route for a distant chase but takes a very close clear cut',()=>{
  const far=window('SEEK_POINT',[5]);expect(far.memory.goal).toBe('STEAL');expect(far.memory.path).toEqual([far.cell(0,-1),far.cell(-1)]);
  expect(far.trace.attacks.some(a=>a.reason==='STEAL_DIVERSION_LIMIT')).toBe(true);
  const near=window('SEEK_POINT',[2]);expect(near.memory.goal).toBe('ATTACK');expect(near.memory.attackTarget).toBe(near.cell(2));
 });
 it('hunter rejects a winning victim race when a third observed head threatens the exposed return route',()=>{
  const f=window('ATTACK',[2],true);expect(f.memory.goal).toBe('STEAL');expect(f.trace.attacks.some(a=>a.reason==='UNSAFE_RETURN')).toBe(true);
 });
 it('thief takes an independently safe three-cell interception and rejects the same diversion near a third head',()=>{
  const safe=window('SEEK_POINT',[3]);expect(safe.memory.goal).toBe('ATTACK');expect(safe.memory.attackTarget).toBe(safe.cell(3));
  const unsafe=window('SEEK_POINT',[3],true);expect(unsafe.memory.goal).toBe('STEAL');expect(unsafe.trace.attacks.some(a=>a.reason==='STEAL_DIVERSION_LIMIT')).toBe(true);
 });
});
