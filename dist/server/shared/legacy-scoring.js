import { participantForOwner, clearTrail } from './territory.js';
import { emitEvent } from './life.js';
export function computeLegacyResults(match) {
    const excluded = new Set(match.departed.map(p => p.participantId));
    const rows = match.participants.filter(p => !excluded.has(p.participantId)).map(p => ({
        participantId: p.participantId, nickname: p.nickname, kind: p.kind, score: p.territoryCount + p.controlScore,
        territory: p.territoryCount, controlScore: p.controlScore, kills: p.kills, deaths: p.deaths, rank: null, status: 'FINISHED'
    }));
    rows.sort((a, b) => b.score - a.score || b.territory - a.territory || b.kills - a.kills || a.participantId.localeCompare(b.participantId));
    let rank = 0;
    for (let i = 0; i < rows.length; i++) {
        const p = rows[i], previous = rows[i - 1];
        if (!previous || p.score !== previous.score || p.territory !== previous.territory || p.kills !== previous.kills)
            rank = i + 1;
        p.rank = rank;
    }
    return [...rows, ...match.departed.map(row => ({ ...row }))];
}
export function finishLegacyMatch(match) {
    if (match.phase !== 'RUNNING')
        return;
    match.results = computeLegacyResults(match);
    match.phase = 'FINISHED';
    for (const p of match.participants) {
        clearTrail(match, p);
        p.lifeState = 'FINISHED';
        p.protectedUntilTick = 0;
    }
    emitEvent(match, { type: 'FINISH', participantId: '' });
}
export function legacyScoreTick(match) {
    const total = match.config.roundSeconds * match.config.simulationHz;
    if (match.tick >= total) {
        finishLegacyMatch(match);
        return;
    }
    if (match.tick % match.config.simulationHz !== 0)
        return;
    for (const cp of match.map.controlPoints) {
        const p = participantForOwner(match, match.owners[cp.cellId]);
        if (p && p.lifeState === 'ALIVE') {
            p.controlScore++;
            emitEvent(match, { type: 'POINT', participantId: p.participantId, amount: 1 });
        }
    }
}
