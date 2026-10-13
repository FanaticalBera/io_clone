const observers = new WeakMap();
export function watchCaptureTransfers(match, observer) {
    const set = observers.get(match) ?? new Set();
    set.add(observer);
    observers.set(match, set);
    return () => { set.delete(observer); if (!set.size)
        observers.delete(match); };
}
// Opt-in only: freeze prior ownership, notify after the winning transfers and
// before pruning/deaths. Same-tick later losses never erase acquisition facts.
export function prepareCaptureTransfers(match, winners, eventTick) {
    const set = observers.get(match);
    if (!set?.size)
        return;
    const byId = new Map();
    for (const [cellId, p] of winners) {
        const previousOwner = match.owners[cellId];
        if (previousOwner === p.slot + 1)
            continue;
        const gain = byId.get(p.participantId) ?? { participantId: p.participantId, lifeId: p.lifeId, cells: [] };
        gain.cells.push({ cellId, previousOwner });
        byId.set(p.participantId, gain);
    }
    const trace = { tick: match.tick, eventTick, gains: [...byId.values()] };
    return () => { for (const observer of set)
        observer(trace); };
}
