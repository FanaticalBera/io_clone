import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBotForTick,observeBot,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {createBotIdentity,allowedSecondaryTraits,BOT_PERSONALITIES,BOT_RANGES,SECONDARY_TRAITS,ACTIVE_SECONDARY_TRAITS} from '../../src/shared/bot-identity.js';
import {BOT_NICKNAMES} from '../../src/shared/bot-roster.js';
import {seededRandom} from '../../src/shared/random.js';
import {BotDebugCollector} from '../../src/client/bot-debug-model.js';
import type {ParticipantSpec} from '../../src/shared/model.js';

const human:ParticipantSpec={participantId:'human',slot:0,nickname:BOT_NICKNAMES[0],kind:'HUMAN'};
describe('phase 0+1 assignment',()=>{
 it('balances 0–16 bots, is reproducible, and varies both slots and the extra archetype',()=>{
  const extras=new Set<string>(),orders=new Set<string>();
  for(let seed=0;seed<32;seed++)for(let count=0;count<=16;count++){
   const roster=botSpecs(count,0,'bot',{seed});expect(roster).toEqual(botSpecs(count,0,'bot',{seed}));
   const counts=BOT_PERSONALITIES.map(p=>roster.filter(b=>b.personality===p).length);expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1);
   if(count===13){extras.add(BOT_PERSONALITIES[counts.indexOf(4)]);orders.add(roster.map(p=>p.personality).join(','));}
  }
  expect(extras.size).toBe(4);expect(orders.size).toBeGreaterThan(20);
 });
 it('avoids HUMAN, BOT and late-join name collisions including normalized exhausted pools',()=>{
  const roster=botSpecs(13,1,'first',{seed:19,existing:[human]});
  expect(new Set([human.nickname,...roster.map(b=>b.nickname)]).size).toBe(14);
  const late=botSpecs(1,14,'late',{seed:19,existing:[human,...roster]});expect(roster.some(p=>p.nickname===late[0].nickname)).toBe(false);
  const exhausted=botSpecs(3,1,'small',{existing:[{...human,nickname:'TEST'}],nicknamePool:['test','ＴＥＳＴ',' '],seed:1});
  expect(new Set(exhausted.map(p=>p.nickname)).size).toBe(3);expect(exhausted.every(p=>p.nickname.startsWith('산책'))).toBe(true);
 });
 it('late joins choose an underrepresented archetype and slot overrides stay attached to slots',()=>{
  const existing=botSpecs(13,0,'old',{seed:4}).filter(p=>p.personality!=='ATTACK');
  expect(botSpecs(1,14,'late',{seed:1,existing})[0].personality).toBe('ATTACK');
  expect(botSpecs(5,1,'override',{seed:7,overrides:{3:{personality:'DEFEND'}}}).find(p=>p.slot===3)?.personality).toBe('DEFEND');
 });
 it('nickname pool changes do not change personality assignments or per-bot traits',()=>{
  const a=botSpecs(13,1,'bot',{seed:73}),b=botSpecs(13,1,'bot',{seed:73,nicknamePool:['one','two']});
  expect(a.map(p=>p.personality)).toEqual(b.map(p=>p.personality));
  expect(a.map(p=>createBotIdentity(73+p.slot,p.personality!))).toEqual(b.map(p=>createBotIdentity(73+p.slot,p.personality!)));
 });
});
describe('phase 1 individual identity',()=>{
 it('draws only the active traits across seeds, with all compatible traits represented',()=>{
  for(const personality of BOT_PERSONALITIES){const counts=new Map<string,number>();
   for(let seed=0;seed<1024;seed++){const identity=createBotIdentity(seed,personality);expect(identity.active).toBe(true);counts.set(identity.secondaryTrait,(counts.get(identity.secondaryTrait)??0)+1);}
   const expected=ACTIVE_SECONDARY_TRAITS.filter(t=>personality!=='DEFEND'||t!=='Gambler');expect([...counts.keys()].sort()).toEqual([...expected].sort());
   for(const count of counts.values())expect(Math.abs(count-1024/expected.length)).toBeLessThan(80);
  }
 });
 it('all allowed combinations stay inside archetype bounds and leave decision RNG untouched',()=>{
  for(const personality of BOT_PERSONALITIES)for(const secondaryTrait of allowedSecondaryTraits(personality))for(let seed=1;seed<=20;seed++){
   const identity=createBotIdentity(seed,personality,{secondaryTrait}),memory=createBotMemory(seed,'combined',identity),random=seededRandom(seed);
   for(const [key,value] of Object.entries(identity.individual)){const range=BOT_RANGES[personality][key as keyof typeof identity.individual];expect(value).toBeGreaterThanOrEqual(range[0]);expect(value).toBeLessThanOrEqual(range[1]);}
   expect(identity).toEqual(createBotIdentity(seed,personality,{secondaryTrait}));expect(Object.isFrozen(identity.individual)).toBe(true);
   for(let i=0;i<5;i++)expect(memory.random()).toBe(random());
  }
  expect(()=>createBotIdentity(1,'DEFEND',{secondaryTrait:'Gambler'})).toThrow('Incompatible');
 });
 it('Coward, Gambler and Opportunist affect values, while future traits remain inactive',()=>{
  const base=createBotIdentity(7,'EXPAND',{secondaryTrait:'Vengeful'}).individual;
  const coward=createBotIdentity(7,'EXPAND',{secondaryTrait:'Coward'}).individual,gambler=createBotIdentity(7,'EXPAND',{secondaryTrait:'Gambler'}).individual;
  expect(coward.riskScale).toBeGreaterThanOrEqual(base.riskScale);expect(coward.expansionScale).toBeLessThanOrEqual(base.expansionScale);
  expect(gambler.riskScale).toBeLessThanOrEqual(base.riskScale);expect(gambler.expansionScale).toBeGreaterThanOrEqual(base.expansionScale);
  expect(createBotIdentity(7,'EXPAND',{secondaryTrait:'Opportunist'}).individual.attackChance).toBeGreaterThanOrEqual(base.attackChance);
  for(const trait of SECONDARY_TRAITS){const id=createBotIdentity(7,'EXPAND',{secondaryTrait:trait});expect(id.active).toBe(trait!=='Persistent');}
  expect(createBotIdentity(7,'EXPAND',{secondaryTrait:'Persistent'}).individual).toEqual(base);
 });
 it('keeps the same identity and traits through a life change',()=>{
  const m=createMatch({},73,botSpecs(1,0,'bot',{seed:73})),p=m.participants[0],identity=createBotIdentity(7,p.personality!),memory=createBotMemory(7,'combined',identity),traits=memory.traits;
  getBotInput(observeBot(m,p.participantId),memory);p.lifeId++;getBotInput(observeBot(m,p.participantId),memory);
  expect(memory.identity).toBe(identity);expect(memory.traits).toBe(traits);
 });
 it('Territorial raises a non-Guardian attack score only for a home incursion',()=>{
  const m=createMatch({mapRadius:22},115,botSpecs(2)),cell=(q:number,r=0)=>m.map.byKey.get(q+','+r)!,original=observeBot(m,m.participants[0].participantId);
  function score(trait:'Territorial'|'Vengeful',incursion:boolean){
   const obs=structuredClone(original);obs.tick=120;obs.owners=new Uint8Array(m.map.cells.length);obs.owners[cell(0)]=1;obs.owners[cell(-1)]=1;obs.owners[cell(-10)]=2;if(incursion)obs.owners[cell(2,1)]=1;
   obs.self={...obs.self,personality:'EXPAND',cellId:cell(0),position:{...m.map.cells[cell(0)].center},direction:{x:1,y:0}};
   obs.others=[{...obs.self,participantId:'victim',slot:1,cellId:cell(6),position:{...m.map.cells[cell(6)].center},direction:{x:0,y:1}}];obs.trails=[{slot:1,cellId:cell(2)}];obs.ownTrail=[];
   const memory=createBotMemory(7,'combined',createBotIdentity(7,'EXPAND',{secondaryTrait:trait}));memory.plannedLifeId=obs.self.lifeId;memory.path=[cell(-1)];let trace:BotDecisionTrace|undefined;
   watchBotDecisions(memory,t=>trace=t,{shadow:false});getBotInput(obs,memory);
   const record=trace!.attacks.find(a=>a.score!==undefined);expect(record).toBeDefined();return record!.score!;
  }
  expect(score('Territorial',true)-score('Vengeful',true)).toBeCloseTo(6);
  expect(score('Territorial',false)).toBeCloseTo(score('Vengeful',false));
  expect(createBotIdentity(7,'DEFEND',{secondaryTrait:'Vengeful'}).individual.defenseBonus).toBe(12);
  expect(createBotIdentity(7,'DEFEND',{secondaryTrait:'Territorial'}).individual.defenseBonus).toBe(18);
 });
});
it.each([22,56])('HUD collection is bounded, observes real reasons without shadow searches, and changes neither simulation nor RNG (R%s)',radius=>{
 const specs=botSpecs(14,0,'bot',{seed:19}),a=createMatch({mapRadius:radius},19,specs,'equivalent'),b=createMatch({mapRadius:radius},19,specs,'equivalent');
 const memories=(m:typeof a)=>new Map(m.participants.map(p=>[p.participantId,createBotMemory(19+p.slot,'combined',createBotIdentity(19+p.slot,p.personality!))]));
 const ma=memories(a),mb=memories(b),collector=new BotDebugCollector(b,mb);
 for(let tick=0;tick<360;tick++){
  const advance=(m:typeof a,mem:typeof ma)=>{const inputs=new Map();for(const p of m.participants){const memory=mem.get(p.participantId)!,input=getBotInput(observeBotForTick(m,p.participantId,memory),memory);if(input)inputs.set(p.participantId,input);}stepMatch(m,inputs);return inputs;};
  expect(advance(a,ma)).toEqual(advance(b,mb));
 }
 expect(a).toEqual(b);for(const [id,memory]of ma){expect(memory.path).toEqual(mb.get(id)!.path);expect(memory.random()).toBe(mb.get(id)!.random());}
 const snapshot=collector.snapshot();expect(snapshot.bots).toHaveLength(14);expect(snapshot.bots.some(p=>p.trace?.reason)).toBe(true);
 for(const row of snapshot.bots){expect(row.history.length).toBeLessThanOrEqual(8);expect(row.trace?.shadow).toBeUndefined();}
 collector.dispose();expect(collector.snapshot().bots.every(b=>b.trace===null)).toBe(true);
});

it('preserves plan reasons and candidates through continuation, replaces same-goal replans, and invalidates on a new life',()=>{
 const match=createMatch({mapRadius:22},19,botSpecs(1,0,'plan',{seed:19,overrides:{0:{personality:'EXPAND'}}})),p=match.participants[0];
 const memory=createBotMemory(19,'combined',createBotIdentity(19,'EXPAND')),collector=new BotDebugCollector(match,new Map([[p.participantId,memory]]));
 let previous:BotDecisionTrace|null=null,continued=0,replanned=0,progressed=0,lastLength=0;
 collector.onDecision=trace=>{const plan=collector.snapshot().bots[0].planTrace;expect(plan).not.toBeNull();
  if(!trace.planChanged&&previous){expect(plan).toEqual(previous);if(trace.reason==='PLAN_CONTINUE'){continued++;if(memory.path.length<lastLength)progressed++;}}
  else{expect(plan?.tick).toBe(trace.tick);expect(plan?.reason).toBe(trace.reason);expect(plan?.attacks).toEqual(trace.attacks);expect(plan?.expansionScores).toEqual(trace.expansionScores);expect(plan?.expansionRejected).toEqual(trace.expansionRejected);
   if(previous?.to===trace.to&&trace.reason==='EXPANSION_SCORE')replanned++;
  }
  previous=plan;lastLength=memory.path.length;
 };
 for(let t=0;t<1800&&match.phase==='RUNNING';t++){const input=getBotInput(observeBotForTick(match,p.participantId,memory),memory);stepMatch(match,input?new Map([[p.participantId,input]]):new Map());}
 expect(continued).toBeGreaterThan(0);expect(progressed).toBeGreaterThan(0);expect(replanned).toBeGreaterThan(0);
 collector.onDecision=undefined;p.lifeId++;expect(collector.snapshot().bots[0].planTrace).toBeNull();getBotInput(observeBotForTick(match,p.participantId,memory),memory);expect(collector.snapshot().bots[0].planTrace?.tick).toBe(match.tick);collector.dispose();
});

it('records a perimeter plan change between decision ticks without overwriting it on repeated recovery',()=>{
 const match=createMatch({mapRadius:22},19,botSpecs(1)),p=match.participants[0],obs=observeBot(match,p.participantId),id=match.map.byKey.get('20,0')!;
 obs.tick=12;obs.self.cellId=id;obs.self.position={...match.map.cells[id].center};obs.self.direction={x:1,y:0};
 const memory=createBotMemory(19);memory.plannedLifeId=p.lifeId;memory.nextDecisionTick=100;memory.path=[id];
 const collector=new BotDebugCollector(match,new Map([[p.participantId,memory]]));getBotInput(obs,memory);
 const first=collector.snapshot().bots[0];expect(first.trace?.reason).toBe('PERIMETER_GUARD');expect(first.trace?.planChanged).toBe(true);expect(first.planTrace?.tick).toBe(12);
 memory.nextDecisionTick=100;obs.tick=13;getBotInput(obs,memory);const repeated=collector.snapshot().bots[0];
 expect(repeated.trace?.tick).toBe(13);expect(repeated.trace?.planChanged).toBe(false);expect(repeated.planTrace).toEqual(first.planTrace);collector.dispose();
});
