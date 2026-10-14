import type {BotMemory,BotObservation} from './bot.js';
import {holdingRiskThreshold} from './bot-holding-risk.js';
// Pending growth experiment. Fresh regular matches keep the accepted baseline;
// frozen exploration sources enable 32/40/48 independently.
export const BOT_LOOP_CEILING=Object.freeze({enabled:false,pathLimit:40,trailScale:1.75,dimensionScale:1.75});
export function quietLoopEligible(obs:BotObservation):boolean {
 return obs.others.length===0&&obs.self.territoryCount>=holdingRiskThreshold(obs.map.cells.length,obs.roster?.length??obs.config.maxSlots);
}
// This allowance belongs to the selected expansion, including its return.
// Seeing a new head does not revoke its budget; all head/danger guards still run.
export function activeExpansionTrailLimit(memory:BotMemory,base:number):number {
 return ['EXPAND','STEAL','RETURN','ESCAPE'].includes(memory.goal)?memory.expansion?.quietTrailLimit??base:base;
}
