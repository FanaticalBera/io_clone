import { slotBit } from './slots.js';
import { clearTrail, neutralizeTerritory } from './territory.js';
export function emitEvent(match, event) {
    match.events.push({ ...event, eventId: match.matchId + ':' + (++match.eventCounter), tick: match.tick });
    match.events = match.events.filter(e => e.tick >= match.tick - match.config.simulationHz).slice(-64);
}
const deathObservers = new WeakMap();
export function watchDeaths(match, observer) {
    deathObservers.set(match, observer);
    return () => deathObservers.delete(match);
}
export function hasDeathObserver(match) { return deathObservers.has(match); }
export function markDead(match, p, reason, killer, context, diagnostic) {
    if (p.lifeState !== 'ALIVE' || match.phase !== 'RUNNING')
        return false;
    const observer = deathObservers.get(match);
    if (observer) {
        const first = p.trailCells.values().next().value;
        observer({ tick: match.tick, victimId: p.participantId, victimKind: p.kind, lifeId: p.lifeId, reason, context, killerId: killer?.participantId, killerCell: killer?.cellId, victimCell: p.cellId, position: { ...p.position }, trailCells: [...p.trailCells], territoryCount: p.territoryCount,
            ownerCells: match.owners.reduce((sum, owner) => sum + Number(owner === p.slot + 1), 0), trailMaskCells: match.map.cells.filter(c => (match.trailMasks[c.id] & (slotBit(p.slot))) !== 0).map(c => c.id),
            rootHomeNeighbors: first === undefined ? [] : match.map.cells[first].neighbors.filter(id => id >= 0 && match.owners[id] === p.slot + 1), pendingContact: diagnostic?.pendingTrailContact ?? (context?.cause === 'PENDING_TRAIL_CONTACT'), originCellId: p.trailOriginCellId, originOwner: p.trailOriginCellId === null ? null : match.owners[p.trailOriginCellId], diagnostic });
    }
    clearTrail(match, p);
    neutralizeTerritory(match, p);
    p.lifeState = 'DEAD_WAIT';
    p.deaths++;
    match.modeState.holds = match.modeState.holds.filter(h => h.participantId !== p.participantId);
    p.deathReason = reason;
    p.deathContext = context ? { ...context } : undefined;
    p.protectedUntilTick = 0;
    p.lastAppliedInputSeq = 0;
    p.targetDirection = null;
    p.respawnAtTick = match.tick + Math.ceil(match.config.respawnSeconds * match.config.simulationHz);
    if (killer && killer.participantId !== p.participantId)
        killer.kills++;
    emitEvent(match, { type: 'DEATH', participantId: p.participantId, reason, lifeId: p.lifeId, position: { ...p.position }, ...(context ? { deathContext: { ...context } } : {}), ...(killer && killer.participantId !== p.participantId ? { killerId: killer.participantId } : {}) });
    return true;
}
export function leaveParticipant(match, p) {
    if (match.departed.some(row => row.participantId === p.participantId))
        return;
    clearTrail(match, p);
    neutralizeTerritory(match, p);
    p.lifeState = 'FINISHED';
    p.protectedUntilTick = 0;
    match.modeState.holds = match.modeState.holds.filter(h => h.participantId !== p.participantId);
    const row = { participantId: p.participantId, nickname: p.nickname, kind: p.kind, score: p.controlScore, territory: 0,
        controlScore: p.controlScore, kills: p.kills, deaths: p.deaths, rank: null, status: 'LEFT' };
    match.departed.push(row);
}
