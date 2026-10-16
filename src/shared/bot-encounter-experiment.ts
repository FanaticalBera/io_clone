import type {BotMemory} from './bot.js';
import type {Personality} from './model.js';

// Raw memories retain historical controls; gameplay factories enable the adopted B policy.
// A: remove the explorer's forced tiny planner footprint near a rival.
// B: additionally let existing actual trail danger/early closure govern return.
// Hunter candidates retain the adopted explorer policy and change ATTACK only.
export type BotEncounterExperiment='explorer-footprint'|'explorer-commit'|'hunter-footprint'|'hunter-commit';
export const ADOPTED_BOT_ENCOUNTER:BotEncounterExperiment='explorer-commit';
const experiments=new WeakMap<BotMemory,BotEncounterExperiment>();
export function setBotEncounterExperiment(memory:BotMemory,experiment:BotEncounterExperiment|null):void {
 if(experiment===null)experiments.delete(memory);
 else if(experiment==='explorer-footprint'||experiment==='explorer-commit'||experiment==='hunter-footprint'||experiment==='hunter-commit')experiments.set(memory,experiment);
 else throw new Error('Unknown bot encounter experiment');
}
export function explorerEncounterFootprint(memory:BotMemory,personality:Personality|undefined):boolean {
 return personality==='EXPAND'&&experiments.has(memory);
}
export function explorerEncounterCommit(memory:BotMemory,personality:Personality|undefined):boolean {
 const mode=experiments.get(memory);
 return personality==='EXPAND'&&(mode==='explorer-commit'||mode==='hunter-footprint'||mode==='hunter-commit');
}
export function hunterEncounterFootprint(memory:BotMemory,personality:Personality|undefined):boolean {
 const mode=experiments.get(memory);
 return personality==='ATTACK'&&(mode==='hunter-footprint'||mode==='hunter-commit');
}
export function hunterEncounterCommit(memory:BotMemory,personality:Personality|undefined):boolean {
 return personality==='ATTACK'&&experiments.get(memory)==='hunter-commit';
}
