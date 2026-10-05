import { territoryPercent } from './modes.js';
const resolutions = new WeakMap();
export function startRun(match, p, atTick = match.tick) {
    if (p.kind !== 'HUMAN' || p.lifeState !== 'ALIVE' || p.run?.lifeId === p.lifeId)
        return;
    p.run = { runId: match.matchId + ':' + p.participantId + ':life:' + p.lifeId, lifeId: p.lifeId, startedAtTick: atTick, initialKills: p.kills, bestTerritoryCells: p.territoryCount, pendingDeathAtTick: null, result: null };
}
export function recordBestTerritories(match) {
    for (const p of match.participants)
        if (p.kind === 'HUMAN' && p.lifeState === 'ALIVE') {
            startRun(match, p);
            if (p.run && !p.run.result && p.run.pendingDeathAtTick === null)
                p.run.bestTerritoryCells = Math.max(p.run.bestTerritoryCells, p.territoryCount);
        }
}
export function queueRunDeath(match, p, atTick) {
    startRun(match, p, atTick);
    if (p.run && !p.run.result && p.run.pendingDeathAtTick === null) {
        p.run.bestTerritoryCells = Math.max(p.run.bestTerritoryCells, p.territoryCount);
        p.run.pendingDeathAtTick = atTick;
    }
}
function finishRun(match, p, endReason, atTick) {
    const run = p.run;
    if (!run || run.result)
        return;
    const best = run.bestTerritoryCells;
    run.result = Object.freeze({ runId: run.runId, matchId: match.matchId, participantId: p.participantId, lifeId: run.lifeId, endReason, startedAtTick: run.startedAtTick, endedAtTick: atTick, durationTicks: Math.max(0, atTick - run.startedAtTick), simulationHz: match.config.simulationHz, mapCellCount: match.map.cells.length, kills: Math.max(0, p.kills - run.initialKills), bestTerritoryCells: best, bestTerritoryPercent: territoryPercent(best, match.map.cells.length) });
}
export function settleRuns(match) {
    recordBestTerritories(match);
    for (const p of match.participants)
        if (p.run?.pendingDeathAtTick !== null && p.run?.pendingDeathAtTick !== undefined)
            finishRun(match, p, 'DEATH', p.run.pendingDeathAtTick);
}
export function beginRunResolution(match) { recordBestTerritories(match); resolutions.set(match, (resolutions.get(match) ?? 0) + 1); }
export function endRunResolution(match) { const depth = (resolutions.get(match) ?? 1) - 1; resolutions.set(match, depth); if (depth === 0)
    settleRuns(match); }
export function settleUnbatchedRuns(match) { if (!resolutions.get(match))
    settleRuns(match); }
export function finishMatchRuns(match, winnerId, atTick) {
    settleRuns(match);
    for (const p of match.participants)
        if (p.kind === 'HUMAN' && p.lifeState === 'ALIVE')
            finishRun(match, p, p.participantId === winnerId ? 'FULL_CAPTURE_WIN' : 'FULL_CAPTURE_LOSS', atTick);
}
export function copyRun(run) { return run ? { ...run, result: run.result ? { ...run.result } : null } : null; }
