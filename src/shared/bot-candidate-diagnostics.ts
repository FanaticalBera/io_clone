import type {BotMemory,BotObservation,BotGoal,ExpansionPlan} from './bot.js';
export interface BotChoiceCandidate {goal:BotGoal;score:number;path:readonly number[];ordinal?:number;target?:number;slot?:number;expansion?:ExpansionPlan;rawScore?:number;reservationFactor?:number;survival?:boolean}
export interface BotCandidateBatch {kind:'ATTACK'|'STRATEGY';interrupt?:boolean;candidates:readonly BotChoiceCandidate[];selectedIndex:number}
type Listener=(obs:BotObservation,batch:BotCandidateBatch)=>void;
const listeners=new WeakMap<BotMemory,Listener>();
// Opt-in audit channel, independent of HUD traces and action RNG.
export function watchBotCandidates(memory:BotMemory,listener:Listener){listeners.set(memory,listener);return()=>listeners.delete(memory);}
export function botCandidateListener(memory:BotMemory){return listeners.get(memory);}
