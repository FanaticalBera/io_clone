export const ADOPTED_BOT_ENCOUNTER = 'hunter-commit';
const experiments = new WeakMap();
export function setBotEncounterExperiment(memory, experiment) {
    if (experiment === null)
        experiments.delete(memory);
    else if (experiment === 'explorer-footprint' || experiment === 'explorer-commit' || experiment === 'hunter-footprint' || experiment === 'hunter-commit')
        experiments.set(memory, experiment);
    else
        throw new Error('Unknown bot encounter experiment');
}
export function explorerEncounterFootprint(memory, personality) {
    return personality === 'EXPAND' && experiments.has(memory);
}
export function explorerEncounterCommit(memory, personality) {
    const mode = experiments.get(memory);
    return personality === 'EXPAND' && (mode === 'explorer-commit' || mode === 'hunter-footprint' || mode === 'hunter-commit');
}
export function hunterEncounterFootprint(memory, personality) {
    const mode = experiments.get(memory);
    return personality === 'ATTACK' && (mode === 'hunter-footprint' || mode === 'hunter-commit');
}
export function hunterEncounterCommit(memory, personality) {
    return personality === 'ATTACK' && experiments.get(memory) === 'hunter-commit';
}
