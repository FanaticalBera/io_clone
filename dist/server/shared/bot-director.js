import { botDecisionDue } from './bot-scheduler.js';
import { getBotInput, observeBotForTick, botRepositionDue } from './bot.js';
import { seededRandom, shuffled } from './random.js';
import { BOT_PHASE02 as C } from './bot-phase02-config.js';
export class BotDirector {
    match;
    reservations = new Map();
    random;
    stats = { denied: 0, nonPositive: 0, survival: 0, survivalOverCap: 0, maxPlanned: 0, decisions: 0 };
    constructor(match) {
        this.match = match;
        this.random = seededRandom(match.seed ^ C.reservationSeedDomain);
    }
    prune(memories) {
        for (const [id, r] of this.reservations) {
            const p = this.match.participants.find(p => p.participantId === id), target = this.match.participants.find(p => p.participantId === r.targetId), m = memories.get(id);
            if (!p || !target || p.lifeState !== 'ALIVE' || target.lifeState !== 'ALIVE' || p.lifeId !== r.attackerLife || target.lifeId !== r.targetLife || !m || m.goal !== 'ATTACK' || m.attackSlot !== target.slot || m.attackSurvival || !m.path.length || this.match.owners[m.path.at(-1)] !== p.slot + 1 || m.attackTarget === null || !target.trailCells.has(m.attackTarget) || this.match.tick - r.tick >= C.reservationTtl * this.match.config.simulationHz)
                this.reservations.delete(id);
        }
    }
    count(targetId, exclude) { return [...this.reservations.values()].filter(r => r.targetId === targetId && r.attackerId !== exclude).length; }
    policy(attackerId) {
        return { evaluate: (targetId, _life, score, survival) => {
                const n = this.count(targetId, attackerId);
                if (survival)
                    return { score, otherReservations: n, factor: 1 };
                if (n >= C.reservationLimit) {
                    this.stats.denied++;
                    return { score, otherReservations: n, factor: 0, reason: 'RESERVATION_FULL' };
                }
                if (score <= 0) {
                    this.stats.nonPositive++;
                    return { score, otherReservations: n, factor: 0, reason: 'NON_POSITIVE_ATTACK' };
                }
                const factor = C.reservationFactors[n];
                return { score: score * factor, otherReservations: n, factor };
            } };
    }
    // Called only after the chosen decision, so rejected candidates never reserve.
    commit(p, m) {
        this.stats.decisions++;
        this.reservations.delete(p.participantId);
        const target = this.match.participants.find(t => t.slot === m.attackSlot);
        if (m.goal !== 'ATTACK' || !target || target.lifeState !== 'ALIVE' || m.attackTarget === null || !target.trailCells.has(m.attackTarget) || !m.path.length)
            return;
        if (m.attackSurvival) {
            this.stats.survival++;
            if (this.count(target.participantId) >= C.reservationLimit)
                this.stats.survivalOverCap++;
            return;
        }
        if (this.count(target.participantId) >= C.reservationLimit)
            return;
        this.reservations.set(p.participantId, { attackerId: p.participantId, attackerLife: p.lifeId, targetId: target.participantId, targetLife: target.lifeId, tick: this.match.tick });
        this.stats.maxPlanned = Math.max(this.stats.maxPlanned, this.count(target.participantId));
    }
    snapshot() { return { version: C.version, seedDomain: C.reservationSeedDomain, stats: { ...this.stats }, reservations: [...this.reservations.values()].map(r => ({ ...r })) }; }
    inputs(memories, selected, returnOnly = new Set()) {
        this.prune(memories);
        const due = [], light = [], inactive = [], observations = new Map();
        for (const p of this.match.participants) {
            const m = memories.get(p.participantId);
            if (!m)
                continue;
            if (p.lifeState !== 'ALIVE') {
                inactive.push(p);
                continue;
            }
            if (selected ? !selected.has(p.participantId) : p.kind !== 'BOT')
                continue;
            if (m.reposition.active) {
                const obs = observeBotForTick(this.match, p.participantId, m);
                observations.set(p.participantId, obs);
                if (botRepositionDue(obs, m, returnOnly.has(p.participantId)))
                    m.nextDecisionTick = this.match.tick;
            }
            const cadence = botDecisionDue(m, this.match.tick, p, this.match.owners, p.trailCells.size);
            (cadence.strategy || cadence.tactical ? due : light).push(p);
        }
        const inputs = new Map();
        for (const p of inactive) {
            const m = memories.get(p.participantId);
            getBotInput(observeBotForTick(this.match, p.participantId, m), m);
        }
        // Cosmetic/assignment/action streams are independent of this actual due order.
        for (const p of [...shuffled(due, this.random), ...light]) {
            const m = memories.get(p.participantId), isDue = due.includes(p), input = getBotInput(observations.get(p.participantId) ?? observeBotForTick(this.match, p.participantId, m), m, returnOnly.has(p.participantId), p.kind === 'BOT' ? this.policy(p.participantId) : undefined);
            if (input)
                inputs.set(p.participantId, input);
            if (isDue && p.kind === 'BOT')
                this.commit(p, m);
            // Perimeter recovery and vanished targets also release between decisions.
            this.prune(memories);
        }
        return inputs;
    }
}
const directors = new WeakMap();
export function botDirector(match) { let d = directors.get(match); if (!d) {
    d = new BotDirector(match);
    directors.set(match, d);
} return d; }
export function getBotInputs(match, memories, selected, returnOnly) { return botDirector(match).inputs(memories, selected, returnOnly); }
