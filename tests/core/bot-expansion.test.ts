import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,plannedCapture,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {expansionSides,EXPANSION_SHAPES} from '../../src/shared/bot-expansion.js';
import {hexDistance} from '../../src/shared/hex.js';
import {createHash} from 'node:crypto';

describe('bounded expansion geometry and real closure',()=>{
 it('keeps aspect variants at equal perimeter and generates distinct hooked/asymmetric legs',()=>{
  const perimeter=(s:typeof EXPANSION_SHAPES[number])=>expansionSides(s,0,5,4).reduce((n,leg)=>n+leg[1],0);
  expect(perimeter('WIDE')).toBe(perimeter('RHOMBUS'));expect(perimeter('DEEP')).toBe(perimeter('RHOMBUS'));
  expect(expansionSides('HOOK',0,5,4)).not.toEqual(expansionSides('RHOMBUS',0,5,4));
  expect(expansionSides('ASYMMETRIC',0,5,4)).not.toEqual(expansionSides('RHOMBUS',0,5,4));
 });
 it('selects deterministic, bounded, neighbouring home-closing plans with real capture area across seeds',()=>{
  const selected=new Set<string>();
  for(let seed=1;seed<=32;seed++){
   const m=createMatch({},73,botSpecs(1)),p=m.participants[0],obs=observeBot(m,p.participantId),a=createBotMemory(seed),b=createBotMemory(seed);let trace:BotDecisionTrace|undefined;
   watchBotDecisions(a,t=>{trace=t;});getBotInput(obs,a);getBotInput(obs,b);
   expect(a.path).toEqual(b.path);expect(a.goal).toEqual(b.goal);expect(trace!.expansionCandidates!.length).toBeLessThanOrEqual(36);
   expect(trace!.expansionPlan).toBeDefined();selected.add(trace!.expansionPlan!.shape);
   let previous=p.cellId;for(const id of a.path){expect(m.map.cells[previous].neighbors).toContain(id);expect(hexDistance(m.map.cells[id],{q:0,r:0})).toBeLessThanOrEqual(22);previous=id;}
   expect(m.owners[a.path.at(-1)!]).toBe(p.slot+1);expect(a.path.filter(id=>m.owners[id]!==p.slot+1).length).toBeLessThanOrEqual(20);
   expect(plannedCapture(obs,a.path).length).toBeGreaterThan(0);
  }
  expect(selected.size).toBeGreaterThanOrEqual(4);expect([...selected].some(s=>s==='HOOK'||s==='ASYMMETRIC'||s==='NATURAL')).toBe(true);
 });
 it('preserves the defender policy in an isolated match',()=>{
  const m=createMatch({},73,[{...botSpecs(1)[0],personality:'DEFEND'}],'isolated-defender'),p=m.participants[0],memory=createBotMemory(73),shapes=new Set<string>(),hash=createHash('sha256');
  watchBotDecisions(memory,t=>{if(t.expansionPlan)shapes.add(t.expansionPlan.shape);});
  for(let tick=0;tick<900;tick++){const input=getBotInput(observeBot(m,p.participantId),memory);stepMatch(m,new Map(input?[[p.participantId,input]]:[]));const {map,...state}=m;hash.update(JSON.stringify(state,(_k,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v));}
  // Independently reproduced from the committed Phase 2 source, including
  // every movement/capture tick; mixed-match outcomes may still change.
  expect(hash.digest('hex')).toBe('ff9a620501417eaf7ce7c9d188cd37aa6860a94273dc85d85d811baf9b48c9de');
  expect(p.deaths).toBe(0);expect([...shapes].every(s=>['RHOMBUS','BEVEL','NATURAL'].includes(s))).toBe(true);
 });
 it('shortens a real exposed excursion and survives the resulting capture when observed pressure grows',()=>{
  const m=createMatch({},4,botSpecs(8)),memories=m.participants.map(p=>createBotMemory(4+p.slot)),p=m.participants[4],memory=memories[4];
  let trace:BotDecisionTrace|undefined,closedAt=-1,oldLength=0,newLength=0,oldTerritory=0,lifeId=0,captures=0,sawTrail=false;
  watchBotDecisions(memory,t=>{trace=t;});
  for(let tick=0;tick<300;tick++){
   trace=undefined;oldLength=closedAt<0?memory.path.length:oldLength;const inputs=new Map();
   m.participants.forEach((bot,i)=>{const input=getBotInput(observeBot(m,bot.participantId),memories[i]);if(input)inputs.set(bot.participantId,input);});
   const decision=trace as BotDecisionTrace|undefined;
   if(decision?.earlyClosure&&closedAt<0){closedAt=m.tick;newLength=memory.path.length;oldTerritory=p.territoryCount;lifeId=p.lifeId;
    expect(sawTrail).toBe(true);expect(p.trailCells.size).toBeGreaterThan(0);expect(memory.goal).toBe('RETURN');expect(memory.expansion?.earlyClosed).toBe(true);
    expect(newLength).toBeLessThan(oldLength-2);expect(m.owners[memory.path.at(-1)!]).toBe(p.slot+1);
   }
   const before=m.eventCounter;stepMatch(m,inputs);sawTrail||=p.trailCells.size>0;
   if(closedAt>=0){captures+=m.events.filter(e=>Number(e.eventId.split(':').at(-1))>before&&e.type==='CAPTURE'&&e.participantId===p.participantId).length;
    expect(p.lifeId).toBe(lifeId);expect(p.lifeState).toBe('ALIVE');
    if(captures){expect(captures).toBe(1);expect(p.territoryCount).toBeGreaterThan(oldTerritory);expect(p.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&(1<<p.slot))===0)).toBe(true);break;}
   }
  }
  expect(closedAt).toBeGreaterThanOrEqual(0);expect(captures).toBe(1);
 });
 it('collecting shape/shadow diagnostics does not change actual movement or capture',()=>{
  const run=(watched:boolean)=>{const m=createMatch({},19,botSpecs(8),'fb3-observer-equivalence'),memories=m.participants.map(p=>createBotMemory(19+p.slot));
   if(watched)memories.forEach(memory=>watchBotDecisions(memory,()=>{}));
   for(let tick=0;tick<600;tick++){const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);}
   return JSON.stringify(m,(_k,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v);
  };
  expect(run(true)).toBe(run(false));
 },10000);
});
