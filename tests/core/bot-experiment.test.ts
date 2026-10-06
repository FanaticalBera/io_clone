import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,observeBotForTick,botLookAhead,watchBotTicks,type BotMemory,type BotTickMetric} from '../../src/shared/bot.js';
import {BOT_VARIANTS,type BotVariant} from '../../src/shared/bot-experiment.js';
import {traceMovement,setMovementNormalCaching} from '../../src/shared/movement.js';
import type {MatchState} from '../../src/shared/model.js';
const make=(seed=4,radius=22,slots=8)=>createMatch({mapRadius:radius,maxSlots:slots},seed,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},...botSpecs(slots-1,1)]);
const memories=(m:MatchState,variant:BotVariant)=>m.participants.slice(1).map(p=>createBotMemory(m.seed^(p.slot*2654435761),variant));
const state=(m:MatchState)=>({tick:m.tick,owners:[...m.owners],trails:[...m.trailMasks],participants:m.participants,events:m.events});
const memState=(memory:BotMemory)=>({...memory,random:undefined});
function advance(m:MatchState,mem:BotMemory[],light=true){const inputs=new Map();m.participants.slice(1).forEach((p,i)=>{if(p.lifeState==='ALIVE'){const obs=light?observeBotForTick(m,p.participantId,mem[i]):observeBot(m,p.participantId,'cache');const input=getBotInput(obs,mem[i]);if(input)inputs.set(p.participantId,input);}});stepMatch(m,inputs);return inputs;}
describe('adopted BOT defaults and comparison controls',()=>{
 it('fair observations never read opponent input intent, including a throwing getter',()=>{
  const m=make(),human=m.participants[0],bot=m.participants[1];bot.cellId=human.cellId;bot.position={...human.position};
  Object.defineProperty(human,'targetDirection',{get(){throw Error('Hidden input read');}});
  const obs=observeBot(m,bot.participantId,'fairness');expect(obs.others.find(p=>p.slot===0)?.targetDirection).toBeNull();
  expect(()=>getBotInput(obs,createBotMemory(19,'fairness'))).not.toThrow();
 });
 it.each(['fairness','combined'] as const)('%s decisions are invariant to hidden HUMAN intent',variant=>{
  const a=make(78),b=make(78),botA=a.participants[2],botB=b.participants[2];
  for(const [m,bot]of [[a,botA],[b,botB]] as const){const h=m.participants[0];h.cellId=bot.cellId;h.position={...bot.position};h.trailCells=new Set(m.map.cells[bot.cellId].neighbors.filter(id=>id>=0));}
  a.participants[0].targetDirection={x:1,y:0};b.participants[0].targetDirection={x:0,y:-1};
  const ma=createBotMemory(92,variant),mb=createBotMemory(92,variant);
  expect(getBotInput(observeBot(a,botA.participantId,variant),ma)).toEqual(getBotInput(observeBot(b,botB.participantId,variant),mb));
  expect(memState(ma)).toEqual(memState(mb));expect(ma.random()).toBe(mb.random());
 });
 it.each([4,78])('cache only preserves complete board, decisions and RNG, seed %s',seed=>{
  const a=make(seed),b=make(seed),ma=memories(a,'baseline'),mb=memories(b,'cache');
  for(let tick=0;tick<360;tick++){expect(advance(a,ma)).toEqual(advance(b,mb));expect(state(a)).toEqual(state(b));ma.forEach((m,i)=>expect(memState(m)).toEqual(memState(mb[i])));}
  ma.forEach((m,i)=>{for(let j=0;j<5;j++)expect(m.random()).toBe(mb[i].random());});
 });
 it('light observations retain fresh near-head/trail steering and produce identical inputs',()=>{
  const a=make(19),b=make(19),ma=memories(a,'cache'),mb=memories(b,'cache');
  for(let tick=0;tick<240;tick++)expect(advance(a,ma,true)).toEqual(advance(b,mb,false));
  expect(state(a)).toEqual(state(b));
  const bot=a.participants[1],h=a.participants[0];h.cellId=a.map.cells[bot.cellId].neighbors.find(id=>id>=0)!;
  h.trailCells=new Set([h.cellId]);const full=observeBot(a,bot.participantId,'cache'),light=observeBot(a,bot.participantId,'cache',true);
  for(const goal of ['EXPAND','ATTACK','ESCAPE','RETURN','STEAL','SEEK_POINT'] as const)expect(botLookAhead(light,goal)).toBe(botLookAhead(full,goal));
 });
 it('15 BOT normal decisions spread over six phases, retaining six-tick cadence and immediate first plans',()=>{
  const m=make(4,56,16),mem=memories(m,'phase'),ticks:BotTickMetric[][]=mem.map(()=>[]);
  mem.forEach((memory,i)=>watchBotTicks(memory,t=>ticks[i].push(t)));
  // Fixed visible scene: isolates scheduler from life/urgent replanning.
  for(let tick=0;tick<31;tick++){m.tick=tick;m.participants.slice(1).forEach((p,i)=>getBotInput(observeBotForTick(m,p.participantId,mem[i]),mem[i]));}
  ticks.forEach((records,i)=>{expect(records[0].tick).toBe(0);const normal=records.slice(1);expect(normal.length).toBeGreaterThan(3);normal.forEach(t=>expect(t.tick%6).toBe((i+1)%6));for(let j=1;j<normal.length;j++)expect(normal[j].tick-normal[j-1].tick).toBe(6);});
  const counts=Array.from({length:6},(_,phase)=>ticks.flat().filter(t=>t.tick===12+phase).length);expect(counts.sort()).toEqual([2,2,2,3,3,3]);
  m.participants[1].lifeId++;m.tick=31;getBotInput(observeBotForTick(m,m.participants[1].participantId,mem[0]),mem[0]);expect(ticks[0].at(-1)?.reason).toBe('LIFE');
  mem[1].nextDecisionTick=31;m.tick=32;getBotInput(observeBotForTick(m,m.participants[2].participantId,mem[1]),mem[1]);expect(ticks[1].at(-1)?.reason).toBe('URGENT');
 });
 it('return-only HUMAN fallback retains the old regular phase',()=>{
  const m=make(),h=m.participants[0],memory=createBotMemory(4,'combined'),ticks:number[]=[];h.slot=5;
  watchBotTicks(memory,t=>ticks.push(t.tick));for(let tick=0;tick<20;tick++){m.tick=tick;getBotInput(observeBotForTick(m,h.participantId,memory),memory,true);}expect(ticks).toEqual([0,6,12,18]);
 });
 it('normal cache preserves exact entry/boundary results and handles side invalidation',()=>{
  const m=make(),cells=m.map.cells.filter((_,i)=>i%31===0);
  for(const cell of cells)for(const angle of [0,.1,Math.PI/3,2.9,Math.PI]){const direction={x:Math.cos(angle),y:Math.sin(angle)};setMovementNormalCaching(m.map,false);const original=traceMovement(m.map,cell.center,cell.id,direction,m.map.side*4);setMovementNormalCaching(m.map,true);expect(traceMovement(m.map,cell.center,cell.id,direction,m.map.side*4)).toEqual(original);}
  m.map.side=33;const cell=m.map.cells[m.map.byKey.get('0,0')!];setMovementNormalCaching(m.map,false);const expected=traceMovement(m.map,cell.center,cell.id,{x:1,y:0},2);setMovementNormalCaching(m.map,true);expect(traceMovement(m.map,cell.center,cell.id,{x:1,y:0},2)).toEqual(expected);
 });
 it.each(BOT_VARIANTS)('%s repeats deterministically with independent unchanged trait RNG',variant=>{
  const a=make(19),b=make(19),ma=memories(a,variant),mb=memories(b,variant);
  for(let tick=0;tick<90;tick++)expect(advance(a,ma)).toEqual(advance(b,mb));expect(state(a)).toEqual(state(b));
  expect(createBotMemory(19,variant).traits).toEqual(createBotMemory(19,'baseline').traits);
 });
});

// Defaults used by both PracticeSession and the server must stay on the adopted AI.
it('default observation does not read hidden opponent intent',()=>{
 const m=make(),h=m.participants[0],b=m.participants[1];b.cellId=h.cellId;b.position={...h.position};
 Object.defineProperty(h,'targetDirection',{get(){throw Error('Hidden input read');}});
 const memory=createBotMemory(19),obs=observeBotForTick(m,b.participantId,memory);
 expect(obs.others.find(p=>p.slot===0)?.targetDirection).toBeNull();expect(()=>getBotInput(obs,memory)).not.toThrow();
});
it('default runtime produces the same R56/16 simulation and RNG as the approved combined variant',()=>{
 const a=make(19,56,16),b=make(19,56,16),ma=a.participants.slice(1).map(p=>createBotMemory(a.seed^(p.slot*2654435761))),mb=memories(b,'combined');
 for(let tick=0;tick<120;tick++)expect(advance(a,ma)).toEqual(advance(b,mb));expect(state(a)).toEqual(state(b));
 ma.forEach((m,i)=>{expect(memState(m)).toEqual(memState(mb[i]));expect(m.random()).toBe(mb[i].random());});
});
