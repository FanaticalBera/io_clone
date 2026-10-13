import { hexDistance } from './hex.js';
const journals = new WeakMap();
function append(match, events) {
    const journal = journals.get(match) ?? [];
    journal.push(...events);
    // Runtime directors consume every tick, including while a bot is dead.
    while (journal.length && journal[0].tick < match.tick - match.config.simulationHz)
        journal.shift();
    journals.set(match, journal);
}
export function recordBotDeath(match, event) {
    if (event.type === 'DEATH')
        append(match, [{ id: match.eventCounter, tick: event.tick, type: 'DEATH', victimId: event.participantId, lifeId: event.lifeId ?? 0, killerId: event.killerId }]);
}
export function recordBotCapture(match, attacker, transfers) {
    append(match, [...transfers].map(([victim, loss]) => ({ id: match.eventCounter, tick: match.tick, type: 'LOSS', victimId: victim.participantId, attackerId: attacker.participantId, cells: loss.cellIds.length, cellIds: loss.cellIds, observedCells: loss.observedCells })));
}
export function botEvents(match, selfId) {
    return (journals.get(match) ?? []).filter(e => e.type === 'DEATH' || e.victimId === selfId);
}
// Capture the actual attacker and prior owner BEFORE simultaneous transfers.
// Remote public losses remain facts; only the local count feeds pressure.
export function captureLosses(match, winners) {
    const losses = new Map(), byOwner = new Map(match.participants.map(p => [p.slot + 1, p]));
    for (const [cellId, attacker] of winners) {
        const victim = byOwner.get(match.owners[cellId]);
        if (!victim || victim === attacker || victim.lifeState !== 'ALIVE')
            continue;
        const byVictim = losses.get(attacker) ?? new Map(), loss = byVictim.get(victim) ?? { cellIds: [], observedCells: 0 };
        loss.cellIds.push(cellId);
        if (match.map.cells[victim.cellId] && hexDistance(match.map.cells[victim.cellId], match.map.cells[cellId]) <= match.config.botObservationRange)
            loss.observedCells++;
        byVictim.set(victim, loss);
        losses.set(attacker, byVictim);
    }
    return losses;
}
