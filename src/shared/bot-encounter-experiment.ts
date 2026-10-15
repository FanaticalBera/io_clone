import type {BotMemory} from './bot.js';
import type {Personality} from './model.js';

// Raw memories retain historical controls; gameplay factories enable the adopted B policy.
// A: remove the explorer's forced tiny planner footprint near a rival.
// B: additionally let existing actual trail danger/early closure govern return.
export type BotEncounterExperiment='explorer-footprint'|'explorer-commit';
export const ADOPTED_BOT_ENCOUNTER:BotEncounterExperiment='explorer-commit';
const experiments=new WeakMap<BotMemory,BotEncounterExperiment>();
export function setBotEncounterExperiment(memory:BotMemory,experiment:BotEncounterExperiment|null):void {
 if(experiment===null)experiments.delete(memory);
 else if(experiment==='explorer-footprint'||experiment==='explorer-commit')experiments.set(memory,experiment);
 else throw new Error('Unknown bot encounter experiment');
}
export function explorerEncounterFootprint(memory:BotMemory,personality:Personality|undefined):boolean {
 return personality==='EXPAND'&&experiments.has(memory);
}
export function explorerEncounterCommit(memory:BotMemory,personality:Personality|undefined):boolean {
 return personality==='EXPAND'&&experiments.get(memory)==='explorer-commit';
}
