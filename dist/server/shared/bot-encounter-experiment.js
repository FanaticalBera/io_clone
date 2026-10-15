export const ADOPTED_BOT_ENCOUNTER = 'explorer-commit';
const experiments = new WeakMap();
export function setBotEncounterExperiment(memory, experiment) {
    if (experiment === null)
        experiments.delete(memory);
    else if (experiment === 'explorer-footprint' || experiment === 'explorer-commit')
        experiments.set(memory, experiment);
    else
        throw new Error('Unknown bot encounter experiment');
}
export function explorerEncounterFootprint(memory, personality) {
    return personality === 'EXPAND' && experiments.has(memory);
}
export function explorerEncounterCommit(memory, personality) {
    return personality === 'EXPAND' && experiments.get(memory) === 'explorer-commit';
}
