import {it,expect} from 'vitest';
import {continuityDelta,BotContinuityAudit} from '../bot-continuity-audit.js';
import {BotPrefixTracker} from '../bot-prefix-tracker.js';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,observeBot,type BotDecisionTrace} from '../../src/shared/bot.js';
import type {BotChoiceCandidate} from '../../src/shared/bot-candidate-diagnostics.js';
import type {DamageBonus} from '../../src/shared/bot-damage.js';
const response=(baseScore:number,raw:number):DamageBonus=>({baseScore,raw,bonus:Math.min(6,.5*Math.max(0,baseScore),raw),reclaimWeight:1,revengeWeight:0,reclaimRaw:raw,revengeRaw:0,reclaimCells:1,revengeCells:0,overlapCells:0});
it('measures C caps separately without changing baseline candidates',()=>{
 const c:BotChoiceCandidate={goal:'EXPAND',score:26,path:[1],expansion:{shape:'RHOMBUS',pathLength:1,externalLength:1,captureSize:1,stolenCells:0,earlyClosed:false,response:response(20,6)}};
 const before=structuredClone(c);expect(continuityDelta(c,true,false)).toBe(0);expect(continuityDelta(c,true,true)).toBe(2);expect(continuityDelta(c,false,true)).toBe(0);expect(c).toEqual(before);
 c.expansion!.response=response(2,.8);expect(continuityDelta(c,true,false)).toBeCloseTo(.2);expect(continuityDelta(c,true,true)).toBeCloseTo(.2);
 c.expansion!.response=response(-2,1);expect(continuityDelta(c,true,true)).toBe(0);
});
it('applies an ordinary attack C before the existing reservation multiplier',()=>{
 expect(continuityDelta({goal:'ATTACK',path:[],score:6,rawScore:12,reservationFactor:.5},true,false)).toBe(.5);
 expect(continuityDelta({goal:'ATTACK',path:[],score:6,rawScore:12,reservationFactor:.5},true,true)).toBeCloseTo(.6);
});
it.each([false,true])('prefix measures physical owned movement, including premature exposure (%s)',exposed=>{
 const match=createMatch({mapRadius:22},19,botSpecs(1)),p=match.participants[0],m=createBotMemory(3),tracker=new BotPrefixTracker(match,new Map([[p.participantId,m]]));
 const start=p.cellId,next=match.map.byKey.get('0,0')!,outside=match.map.byKey.get('1,0')!;match.owners[start]=1;match.owners[next]=1;match.owners[outside]=0;
 m.goal='EXPAND';const trace:BotDecisionTrace={tick:0,from:'EXPAND',to:'EXPAND',ownTrail:0,attackTarget:null,attacks:[],expansionPath:[next,outside,start],expansionPlan:{shape:'RHOMBUS',pathLength:3,externalLength:1,captureSize:1,stolenCells:0,earlyClosed:false}};
 tracker.afterInputs(new Map([[p.participantId,trace]]));match.tick=1;p.cellId=next;if(exposed)p.trailCells.add(outside);tracker.afterTick();
 expect(tracker.snapshot().episodes[0]).toMatchObject({cells:1,ownedFrames:1,end:1,outcome:exposed?'EXPOSED_BEFORE_TARGET':'ARRIVED'});
});

it.each(['valid','replacement','expired','new-life'] as const)('C history checks identity, expiry and own life (%s)',scenario=>{
 const match=createMatch({mapRadius:22},19,botSpecs(2)),[p,victim]=match.participants,m=createBotMemory(7);
 const listeners:((obs:ReturnType<typeof observeBot>,batch:import('../../src/shared/bot-candidate-diagnostics.js').BotCandidateBatch)=>void)[]=[];
 const audit=new BotContinuityAudit(match,new Map([[p.participantId,m],[victim.participantId,createBotMemory(8)]]),(_m,listener)=>{listeners.push(listener);return ()=>{};},()=>({blocked:false}));
 m.goal='ATTACK';m.attackSlot=victim.slot;m.attackTarget=victim.cellId;
 audit.afterInputs(new Map([[p.participantId,{tick:0,from:'EXPAND',to:'ATTACK',ownTrail:0,attackTarget:victim.cellId,attacks:[],reason:'ATTACK_SCORE'}]]));audit.afterTick(new Set([p.participantId]));
 if(scenario==='replacement')victim.participantId='replacement';if(scenario==='expired')match.tick=181;if(scenario==='new-life')p.lifeId++;
 audit.beforeTick();const obs=observeBot(match,p.participantId),c:BotChoiceCandidate={goal:'ATTACK',score:10,rawScore:10,path:[victim.cellId],slot:victim.slot,target:victim.cellId};
 listeners[0](obs,{kind:'ATTACK',candidates:[c],selectedIndex:0});listeners[0](obs,{kind:'STRATEGY',candidates:[c],selectedIndex:0});
 expect(audit.snapshot().participants[0].eligibleChoices).toBe(scenario==='valid'?1:0);expect(audit.snapshot().participants[0].zeroCheckMismatches).toBe(0);
});
