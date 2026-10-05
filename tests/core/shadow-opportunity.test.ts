import {describe,it,expect} from 'vitest';
import {stepMatch} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,shortestPath,watchBotDecisions,type BotObservation,type BotDecisionTrace} from '../../src/shared/bot.js';
import {evaluateShadowOpportunities} from '../../src/shared/bot-opportunity.js';
import {runShadowEscapeWitness} from '../shadow-escape-fixture.js';

// Classifier-only observations use a known geometric layout and deterministic
// navigation time. Gameplay reproduction is separately covered below.
function observation():BotObservation {
 const m=createMatch({},115,botSpecs(2)),obs=observeBot(m,m.participants[0].participantId),cell=(q:number,r=0)=>m.map.byKey.get(`${q},${r}`)!;
 obs.owners=new Uint8Array(m.map.cells.length);obs.self={...obs.self,cellId:cell(0),position:{...m.map.cells[cell(0)].center},direction:{x:1,y:0},protectedUntilTick:0};
 obs.others=[{...observeBot(m,m.participants[1].participantId).self,cellId:cell(6),position:{...m.map.cells[cell(6)].center}}];
 obs.owners[cell(0)]=1;obs.owners[cell(-6)]=2;obs.trails=[{slot:1,cellId:cell(1)}];return obs;
}
const nav={path:shortestPath,seconds:(_obs:BotObservation,_p:BotObservation['self'],path:number[])=>path.length*.25};
const serialize=(value:unknown)=>JSON.stringify(value,(_key,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v);

describe('independent shadow opportunities',()=>{
 it('normal movement creates a favorable cut ignored in ESCAPE; a separate movement branch cuts and returns alive',()=>{
  const f=runShadowEscapeWitness();expect(f.trace).toMatchObject({from:'ESCAPE',to:'ESCAPE',shadow:{event:'MISSED_KILL_OPPORTUNITY',missedReason:'GOAL_ESCAPE_BLOCK',selectedGoal:'ESCAPE'}});
  expect(f.memory.goal).toBe('ESCAPE');expect(f.bot.lifeState).toBe('ALIVE');expect(f.match.trailMasks[f.candidate.target]&(1<<f.victim.slot)).not.toBe(0);
  expect(f.cutTick).not.toBeNull();expect(f.victim.deathContext?.cause).toBe('EXISTING_TRAIL_CONTACT');expect(f.attacker.kills).toBe(f.bot.kills+1);
  expect(f.attacker.lifeState).toBe('ALIVE');expect(f.attacker.trailCells.size).toBe(0);expect(f.branch.owners[f.attacker.cellId]).toBe(f.attacker.slot+1);
 },20000);
 it('separates favorable cuts, early victim returns, counters and range without mutating observation',()=>{
  const obs=observation(),before=serialize(obs),clear=evaluateShadowOpportunities(obs,nav);
  expect(clear.clearCount).toBe(1);expect(clear.candidates[0].reason).toBe('CLEAR_KILL_OPPORTUNITY');expect(serialize(obs)).toBe(before);
  const returns=observation();returns.owners[returns.others[0].cellId]=2;expect(evaluateShadowOpportunities(returns,nav).candidates[0].reason).toBe('VICTIM_RETURNS_FIRST');
  const counter=observation();counter.ownTrail=[counter.map.byKey.get('5,0')!];expect(evaluateShadowOpportunities(counter,nav).candidates[0].reason).toBe('COUNTER_CUT_FIRST');
  const far=observation();far.trails=[{slot:1,cellId:far.map.byKey.get('5,0')!}];expect(evaluateShadowOpportunities(far,nav).candidates[0].reason).toBe('OUT_OF_RANGE');
 });
 it.each([4,73])('seed %s: instrumentation preserves every input, goal, RNG call and gameplay state across real movement',seed=>{
  const matches=[createMatch({},seed,botSpecs(8),'same-match'),createMatch({},seed,botSpecs(8),'same-match')],memories=matches.map(m=>m.participants.map((p)=>createBotMemory(seed+p.slot))),calls=matches.map(()=>Array(8).fill(0)),traces:BotDecisionTrace[]=[];
  const state=(m:typeof matches[number])=>{const {map,...dynamic}=m;return dynamic;};expect(serialize(matches[1].map)).toBe(serialize(matches[0].map));
  for(let run=0;run<2;run++)memories[run].forEach((memory,i)=>{const random=memory.random;memory.random=()=>{calls[run][i]++;return random();};});
  memories[1].forEach(memory=>watchBotDecisions(memory,t=>traces.push(t)));
  for(let tick=0;tick<900;tick++){
   const commands=matches.map((m,run)=>new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[run][i]);return input?[[p.participantId,input] as const]:[];})));
   expect(serialize(commands[1]),`input tick ${tick}`).toBe(serialize(commands[0]));expect(calls[1],`RNG tick ${tick}`).toEqual(calls[0]);
   expect(serialize(memories[1]),`goals/paths tick ${tick}`).toBe(serialize(memories[0]));
   matches.forEach((m,i)=>stepMatch(m,commands[i]));expect(serialize(state(matches[1])),`gameplay tick ${tick}`).toBe(serialize(state(matches[0])));
  }
  const escape=traces.filter(t=>t.from==='ESCAPE');expect(escape.length).toBeGreaterThan(0);expect(escape.every(t=>!!t.shadow)).toBe(true);
  expect(serialize(matches[1].map)).toBe(serialize(matches[0].map));
 },45000);
});
