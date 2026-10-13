import { observeBot, plannedCapture } from './bot.js';
import { hexDistance } from './hex.js';
import { watchCaptureTransfers } from './capture-diagnostics.js';
// Read-only observer. Runtime keeps six recent plans per bot; audit can stream
// completed records to a local archive with onClose. Never consumes action RNG.
export class BotReclaimDiagnostics {
    match;
    memories;
    active = new Map();
    recent = new Map();
    sequence = 0;
    stop;
    cursor = 0;
    acquired = new Set();
    onClose;
    constructor(match, memories) {
        this.match = match;
        this.memories = memories;
        this.stop = watchCaptureTransfers(match, t => this.capture(t));
    }
    close(id, outcome) { const row = this.active.get(id); if (!row)
        return; row.outcome = outcome; row.endedTick = this.match.tick; this.active.delete(id); this.onClose?.(structuredClone(row)); }
    decision(id, trace) {
        const p = this.match.participants.find(p => p.participantId === id), memory = this.memories.get(id);
        if (!p || !memory)
            return;
        let row = this.active.get(id);
        if (row && row.lifeId !== p.lifeId) {
            this.close(id, 'LIFE_RESET');
            row = undefined;
        }
        if (row && trace.departure) {
            row.interruptions.push({ tick: trace.tick, goal: trace.to, reason: trace.reason ?? 'LAUNCH_BLOCKED' });
            if (row.interruptions.length > 8)
                row.interruptions.shift();
            this.close(id, 'LAUNCH_BLOCKED');
            row = undefined;
        }
        if (trace.expansionPlan && trace.expansionPath) {
            if (row) {
                row.interruptions.push({ tick: trace.tick, goal: trace.to, reason: trace.safetyOverride ?? 'NEW_EXPANSION' });
                if (row.interruptions.length > 8)
                    row.interruptions.shift();
            }
            this.close(id, 'REPLANNED');
            const obs = observeBot(this.match, id);
            const expected = plannedCapture(obs, trace.expansionPath).filter(cell => memory.emotion.damage.regions.has(cell) && hexDistance(obs.map.cells[obs.self.cellId], obs.map.cells[cell]) <= obs.config.botObservationRange);
            row = { id: ++this.sequence, participantId: id, slot: p.slot, lifeId: p.lifeId, selectedTick: trace.tick, endedTick: null, outcome: 'OPEN',
                startCellId: p.cellId, plannedPath: [...trace.expansionPath], movementCells: [p.cellId], movementTruncated: false, dRaw: trace.expansionPlan.response?.reclaimRaw ?? 0, appliedBonus: trace.expansionPlan.response?.bonus ?? 0,
                expectedCellIds: expected, actualCellIds: [], otherReclaimCellIds: [], ordinaryStolenCells: 0, neutralCells: 0, retainedCells: 0, launched: false,
                interruptions: [], damageActors: [...new Set([...memory.emotion.damage.regions.values()].map(r => r.attackerId))], relatedDeaths: [] };
            const rows = this.recent.get(id) ?? [];
            rows.push(row);
            if (rows.length > 6)
                rows.shift();
            this.recent.set(id, rows);
            this.active.set(id, row);
        }
        if (row && trace.planChanged && ['ATTACK', 'RETURN', 'ESCAPE', 'REPOSITION'].includes(trace.to)) {
            row.interruptions.push({ tick: trace.tick, goal: trace.to, reason: trace.reason ?? 'UNRECORDED' });
            if (row.interruptions.length > 8)
                row.interruptions.shift();
            if (trace.to === 'ATTACK' || trace.to === 'REPOSITION')
                this.close(id, trace.to);
        }
    }
    capture(trace) {
        for (const gain of trace.gains) {
            const row = this.active.get(gain.participantId), memory = this.memories.get(gain.participantId);
            if (!row || !memory || row.lifeId !== gain.lifeId)
                continue;
            this.acquired.add(gain.participantId);
            const expected = new Set(row.expectedCellIds), actual = new Set(row.actualCellIds), other = new Set(row.otherReclaimCellIds);
            for (const cell of gain.cells) {
                if (expected.has(cell.cellId))
                    actual.add(cell.cellId);
                else if (memory.emotion.damage.regions.has(cell.cellId))
                    other.add(cell.cellId);
                else if (cell.previousOwner)
                    row.ordinaryStolenCells++;
                else
                    row.neutralCells++;
            }
            row.actualCellIds = [...actual];
            row.otherReclaimCellIds = [...other];
        }
    }
    afterTick() {
        const fresh = this.match.events.filter(e => Number(e.eventId.split(':').at(-1)) > this.cursor);
        for (const event of fresh) {
            if (event.type === 'DEATH')
                this.death(event);
            this.cursor = Math.max(this.cursor, Number(event.eventId.split(':').at(-1)));
        }
        for (const [id, row] of this.active) {
            const p = this.match.participants.find(p => p.participantId === id);
            if (row.movementCells.at(-1) !== p.cellId) {
                if (row.movementCells.length < 64)
                    row.movementCells.push(p.cellId);
                else
                    row.movementTruncated = true;
            }
            row.retainedCells = [...row.actualCellIds, ...row.otherReclaimCellIds].filter(cell => this.match.owners[cell] === p.slot + 1).length;
            if (p.lifeId !== row.lifeId) {
                this.close(id, 'LIFE_RESET');
                continue;
            }
            if (p.lifeState !== 'ALIVE') {
                this.close(id, 'DEATH');
                continue;
            }
            if (p.trailCells.size || this.match.owners[p.cellId] !== p.slot + 1)
                row.launched = true;
            if (this.acquired.has(id))
                this.close(id, 'CAPTURE');
            else if (row.launched && !p.trailCells.size && this.match.owners[p.cellId] === p.slot + 1)
                this.close(id, 'HOME');
        }
        this.acquired.clear();
    }
    death(event) {
        for (const [id, rows] of this.recent)
            for (const row of rows) {
                if (row.lifeId !== this.match.participants.find(p => p.participantId === id).lifeId || event.tick < row.selectedTick || event.tick - row.selectedTick > 60 * this.match.config.simulationHz)
                    continue;
                if (event.participantId !== id && event.killerId !== id && !row.damageActors.includes(event.participantId))
                    continue;
                row.relatedDeaths.push({ tick: event.tick, victimId: event.participantId, killerId: event.killerId ?? null, cause: event.deathContext?.cause ?? event.reason ?? 'UNKNOWN' });
                if (row.relatedDeaths.length > 4)
                    row.relatedDeaths.shift();
            }
    }
    snapshot(id) { const p = this.match.participants.find(p => p.participantId === id); return { active: this.active.has(id) && this.active.get(id).lifeId === p.lifeId ? structuredClone(this.active.get(id)) : null, recent: structuredClone(this.recent.get(id) ?? []) }; }
    finish() { for (const id of [...this.active.keys()])
        this.close(id, 'CENSORED'); }
    dispose() { this.stop(); this.active.clear(); this.recent.clear(); this.acquired.clear(); }
}
