import {it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {createBotMemory,botSpecs,observeBot,getBotInput,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {botDecisionDue,scheduleBotDecision,scheduleBotTactics,BOT_PHASE03B,personalBotCadence} from '../../src/shared/bot-scheduler.js';
import {getBotInputs,botDirector} from '../../src/shared/bot-director.js';
import {addTrail,setOwner,neutralizeTerritory} from '../../src/shared/territory.js';
import {botSpecs as fixedSpecs} from '../bot-fixtures.js';
import {createMatch as testMatch} from '../baseline.js';

it('keeps personal strategy inactive and preserves the isolated tactical phase without consuming action RNG',()=>{
 const match=createMatch({mapRadius:22},19,botSpecs(14)),profiles=[];
 for(const p of match.participants){const m=createBotMemory(19+p.slot),control=createBotMemory(19+p.slot);m.plannedLifeId=p.lifeId;
  const a=botDecisionDue(m,0,p,match.owners,0),b=botDecisionDue(control,0,p,match.owners,0),range=BOT_PHASE03B.strategyTicks[p.personality!];
  expect(a.profile).toEqual(b.profile);expect(BOT_PHASE03B.personalStrategy).toBe(false);expect(a.strategyTicks).toBe(6);expect(a.profile!.strategyPhase).toBe(p.slot%6);const dormant=personalBotCadence(19+p.slot,p.personality!);expect(dormant.strategyTicks).toBeGreaterThanOrEqual(range[0]);expect(dormant.strategyTicks).toBeLessThanOrEqual(range[1]);expect(a.profile!.tacticalPhase).toBe(dormant.tacticalPhase);
  expect(a.profile!.strategyPhase).toBeLessThan(a.strategyTicks!);expect(a.profile!.tacticalPhase).toBeLessThan(3);profiles.push(a.profile);
  const untouched=createBotMemory(19+p.slot);expect(Array.from({length:5},()=>m.random())).toEqual(Array.from({length:5},()=>untouched.random()));
 }
 expect(new Set(profiles.map(p=>JSON.stringify(p))).size).toBeGreaterThan(4);
});
it('uses fixed strategy slot phases and retains the tactical profile across lives',()=>{
 const match=createMatch({mapRadius:22},4,botSpecs(2)),p=match.participants[0],m=createBotMemory(9),obs=observeBot(match,p.participantId);
 const profile=botDecisionDue(m,0,p,match.owners,0).profile!;
 for(let tick=0;tick<30;tick++){obs.tick=tick;scheduleBotDecision(obs,m);scheduleBotTactics(obs,m);
  expect(m.nextDecisionTick-tick).toBeGreaterThan(0);expect(m.nextDecisionTick-tick).toBeLessThanOrEqual(profile.strategyTicks);
  expect(m.nextDecisionTick%profile.strategyTicks).toBe(profile.strategyPhase);expect(m.schedule!.nextTacticalTick%3).toBe(profile.tacticalPhase);
 }
 p.lifeId++;m.nextDecisionTick=1000;m.schedule!.nextTacticalTick=1000;getBotInput(observeBot(match,p.participantId),m);
 expect(m.plannedLifeId).toBe(p.lifeId);expect(m.schedule!.profile).toBe(profile);expect(m.nextDecisionTick).toBeLessThanOrEqual(10);
});
it('runs tactical retreat while strategy sleeps, without a strategy draw or deadline change',()=>{
 const match=createMatch({mapRadius:22},73,botSpecs(2)),p=match.participants[0],m=createBotMemory(4),id=(q:number,r=0)=>match.map.byKey.get(q+','+r)!;
 for(const player of match.participants)neutralizeTerritory(match,player);
 for(const cell of match.map.cells)if(cell.q<=0)setOwner(match,cell.id,p.slot+1);
 p.cellId=id(1);p.position={...match.map.cells[p.cellId].center};p.direction={x:-1,y:0};match.participants[1].lifeState='DEAD_WAIT';
 for(const cell of match.map.cells.filter(c=>c.q>0).slice(0,100))addTrail(match,p,cell.id);
 m.plannedLifeId=p.lifeId;m.goal='EXPAND';m.path=[id(2),id(1),id(0)];m.nextDecisionTick=1000;m.schedule!.nextTacticalTick=0;m.random=()=>{throw Error('action RNG');};
 let trace:BotDecisionTrace|undefined;watchBotDecisions(m,t=>trace=t,{shadow:false});getBotInput(observeBot(match,p.participantId),m);
 expect(m.goal).toBe('ESCAPE');expect(m.nextDecisionTick).toBe(1000);expect(trace?.cadence).toMatchObject({strategy:false,tactical:true,tacticalTicks:3});expect(trace?.risk?.danger).toBe(true);
});
it('keeps historical phase controls and HUMAN return-only cadence unchanged',()=>{
 const match=createMatch({mapRadius:22},4,[{participantId:'h',slot:0,nickname:'h',kind:'HUMAN'},...botSpecs(1,1)]);
 const historical=createBotMemory(3,'phase');expect(historical.schedule).toBeUndefined();scheduleBotDecision(observeBot(match,match.participants[1].participantId),historical);expect(historical.nextDecisionTick).toBe(1);
 const human=createBotMemory(3);const obs=observeBot(match,'h');scheduleBotDecision(obs,human);expect(human.schedule!.profile).toBeUndefined();expect(human.nextDecisionTick).toBe(6);
});
it('commits ordinary tactical-only attacks and refreshes them while strategy sleeps',()=>{
 let tacticalReservations=0;
 for(const seed of [4,19,73,115,17,81,32,123]){
  const match=testMatch({},seed,[{participantId:'idle',slot:0,nickname:'IDLE',kind:'HUMAN'},...fixedSpecs(7,1)]),human=match.participants[0];
  const memories=new Map(match.participants.slice(1).map(p=>[p.participantId,createBotMemory(seed^(p.slot*2654435761))])),latest=new Map<string,BotDecisionTrace>();
  for(const [id,m]of memories)watchBotDecisions(m,t=>latest.set(id,t),{shadow:false});
  while(human.lifeState==='ALIVE'&&match.tick<400){latest.clear();const inputs=getBotInputs(match,memories),snapshot=botDirector(match).snapshot();
   for(const [id,t]of latest){const m=memories.get(id)!;if(t.cadence?.strategy===false&&m.goal==='ATTACK'&&!m.attackSurvival){
    const target=match.participants.find(p=>p.slot===m.attackSlot)!;expect(snapshot.reservations).toContainEqual(expect.objectContaining({attackerId:id,targetId:target.participantId,targetLife:target.lifeId,tick:match.tick}));tacticalReservations++;
   }}
   expect(snapshot.stats.maxPlanned).toBeLessThanOrEqual(3);stepMatch(match,inputs);
  }
 }
 expect(tacticalReservations).toBeGreaterThan(0);
});
