import type {BotObservation,BotMemory} from './bot.js';
import type {PublicParticipant,Personality} from './model.js';
import {seededRandom} from './random.js';
import {botOptions} from './bot-experiment.js';
import {memoryVariants} from './bot-runtime.js';
// Adopted Phase 3 tactical cadence. Personal strategy remains defined for
// reproducible historical experiments, but cannot be enabled by the HUD/URL.
export const BOT_PHASE03B=Object.freeze({personalStrategy:false,tacticalTicks:3,fixedStrategyTicks:6,seedDomain:0x6c5e9d13,strategyTicks:{ATTACK:[5,8],EXPAND:[6,10],DEFEND:[4,7],SEEK_POINT:[5,9]} as const});
export interface BotSchedule {seed:number;nextTacticalTick:number;profile?:Readonly<{personality:Personality;strategyTicks:number;strategyPhase:number;tacticalPhase:number}>}
export function createBotSchedule(seed:number):BotSchedule{return {seed,nextTacticalTick:0};}
// Retain all three private draws so the tactical phase matches the isolated
// tactical arm. This stream never consumes action, trait or reservation RNG.
export function personalBotCadence(seed:number,personality:Personality){
 const range=BOT_PHASE03B.strategyTicks[personality],random=seededRandom(seed^BOT_PHASE03B.seedDomain);
 const strategyTicks=range[0]+Math.floor(random()*(range[1]-range[0]+1));
 return {personality,strategyTicks,strategyPhase:Math.floor(random()*strategyTicks),tacticalPhase:Math.floor(random()*BOT_PHASE03B.tacticalTicks)};
}
function profileFor(memory:BotMemory,self:Pick<PublicParticipant,'kind'|'personality'|'slot'>){
 const schedule=memory.schedule;if(!schedule||self.kind!=='BOT')return undefined;
 if(!schedule.profile){const personal=personalBotCadence(schedule.seed,self.personality??'EXPAND');
  schedule.profile=Object.freeze(BOT_PHASE03B.personalStrategy?personal:{...personal,strategyTicks:BOT_PHASE03B.fixedStrategyTicks,strategyPhase:self.slot%BOT_PHASE03B.fixedStrategyTicks});
 }return schedule.profile;
}
export function botDecisionDue(memory:BotMemory,tick:number,self:Pick<PublicParticipant,'kind'|'personality'|'lifeId'|'cellId'|'slot'>,owners:Uint8Array,trailLength:number){
 const profile=profileFor(memory,self),strategy=tick>=memory.nextDecisionTick||self.lifeId!==memory.plannedLifeId;
 const tactical=!!profile&&tick>=memory.schedule!.nextTacticalTick&&(trailLength>0||['ATTACK','RETURN','ESCAPE','REPOSITION'].includes(memory.goal));
 return {strategy,tactical,strategyTicks:profile?.strategyTicks,profile};
}
const nextPhase=(tick:number,interval:number,phase:number)=>tick+((phase-tick%interval+interval)%interval||interval);
export function scheduleBotDecision(obs:BotObservation,memory:BotMemory){
 const profile=profileFor(memory,obs.self);
 if(profile){memory.nextDecisionTick=nextPhase(obs.tick,profile.strategyTicks,profile.strategyPhase);return;}
 const interval=Math.max(1,Math.round(obs.config.botDecisionMs*obs.config.simulationHz/1000));
 const phased=botOptions(memoryVariants.get(memory)??'combined').phase&&obs.self.kind==='BOT',offset=obs.self.slot%interval;
 memory.nextDecisionTick=obs.tick+(phased?((offset-obs.tick%interval+interval)%interval||interval):interval);
}
export function scheduleBotTactics(obs:BotObservation,memory:BotMemory){const p=profileFor(memory,obs.self);if(p)memory.schedule!.nextTacticalTick=nextPhase(obs.tick,BOT_PHASE03B.tacticalTicks,p.tacticalPhase);}
