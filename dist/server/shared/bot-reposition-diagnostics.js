import { watchReposition, watchRepositionSelection } from './bot-reposition.js';
import { BOT_REPOSITION as C } from './bot-phase025-config.js';
export function isRepositionPingPong(rows, hz) {
    if (rows.length !== 3)
        return false;
    const [a, b, c] = rows;
    if (rows.some(r => r.outcome === 'OPEN' || r.movedCells < 2) || a.lifeId !== b.lifeId || b.lifeId !== c.lifeId || a.attackerId !== c.attackerId || a.attackerId === b.attackerId || c.startedTick - a.startedTick > C.pingPongWindow * hz)
        return false;
    const opposed = (x, y) => { const dx = x.end.x - x.start.x, dy = x.end.y - x.start.y, ex = y.end.x - y.start.x, ey = y.end.y - y.start.y, n = Math.hypot(dx, dy) * Math.hypot(ex, ey); return n > 0 && (dx * ex + dy * ey) / n <= -.5 + 1e-12; };
    return opposed(a, b) && opposed(b, c);
}
export class BotRepositionDiagnostics {
    hz;
    stops = [];
    rows = new Map();
    stats = { starts: 0, arrivals: 0, aborts: 0, censored: 0, executed: 0, unexecuted: 0, pingPong: 0, startChecked: 0, startRejected: 0, unsafeSelections: 0, reasons: {} };
    onEpisode;
    constructor(memories, hz) {
        this.hz = hz;
        for (const [id, memory] of memories)
            this.stops.push(watchReposition(memory.reposition, row => {
                const rows = this.rows.get(id) ?? [];
                if (row.outcome === 'OPEN') {
                    this.stats.starts++;
                    rows.push(row);
                    if (rows.length > 6)
                        rows.shift();
                }
                else {
                    const at = rows.findIndex(r => r.sequence === row.sequence);
                    if (at >= 0)
                        rows[at] = row;
                    else
                        rows.push(row);
                    if (rows.length > 6)
                        rows.shift();
                    if (row.outcome === 'ARRIVED')
                        this.stats.arrivals++;
                    else
                        this.stats.aborts++;
                    this.stats.reasons[row.outcome] = (this.stats.reasons[row.outcome] ?? 0) + 1;
                    this.stats[row.movedCells > 0 ? 'executed' : 'unexecuted']++;
                    if (isRepositionPingPong(rows.filter(r => r.outcome !== 'OPEN').slice(-3), hz))
                        this.stats.pingPong++;
                    this.onEpisode?.(id, structuredClone(row));
                }
                this.rows.set(id, rows);
            }));
        for (const memory of memories.values())
            this.stops.push(watchRepositionSelection(memory.reposition, row => { this.stats.startChecked += row.startChecked; this.stats.startRejected += row.startRejected; if (row.reason === 'PHYSICAL_START_UNSAFE')
                this.stats.unsafeSelections++; }));
    }
    snapshot(id) { return structuredClone(this.rows.get(id) ?? []); }
    finish(memories) { this.stats.censored = [...memories.values()].filter(m => m.reposition.active).length; }
    dispose() { for (const stop of this.stops)
        stop(); this.stops = []; this.rows.clear(); }
}
