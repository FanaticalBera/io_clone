import { memoryVariants, observationVariants, decisionTraces, attackPolicies } from './bot-runtime.js';
import { shortestPath } from './bot-navigation.js';
import { scheduleBotDecision, scheduleBotTactics, botDecisionDue, createBotSchedule } from './bot-scheduler.js';
import { runBotTactics } from './bot-tactical.js';
import { selectBotStrategicPlan } from './bot-strategy.js';
export { shortestPath, returnPath } from './bot-navigation.js';
export { plannedCapture, earlyClosurePath } from './bot-strategy.js';
import { immediateLookAhead, perimeterEscapeDirection, evaluateDepartureSafety, selectOwnedDepartureFallback, departureIntent, recordDepartureSafety } from './bot-immediate-safety.js';
import { createRepositionState, endReposition, repositionProgress, repositionImmediateReason, repositionRegularReason } from './bot-reposition.js';
import { botEvents } from './bot-events.js';
import { createBotEmotion, updateBotEmotion } from './bot-emotion.js';
import { hexDistance } from './hex.js';
import { assignBotSpecs } from './bot-roster.js';
import { seededRandom } from './random.js';
import { normalizeDirection, setMovementNormalCaching } from './movement.js';
import { botOptions } from './bot-experiment.js';
import { moveSpeed } from './config.js';
import { botSteeringTarget } from './bot-steering.js';
import { setBotEncounterExperiment, ADOPTED_BOT_ENCOUNTER } from './bot-encounter-experiment.js';
import { evaluateShadowOpportunities, shadowTravelSeconds } from './bot-opportunity.js';
export function createBotMemory(seed, variant = 'combined', identity) {
    // Independent stream: traits neither consume decision RNG nor change on respawn.
    const random = seededRandom(seed), traitRandom = seededRandom(seed ^ 0x51f15e), scale = () => .9 + traitRandom() * .2;
    const traits = Object.freeze({ expansionScale: scale(), riskScale: scale(), stealScale: scale() });
    const memory = { schedule: variant === 'combined' ? createBotSchedule(seed) : undefined, reposition: createRepositionState(), identity, traits: identity ? Object.freeze({ expansionScale: identity.individual.expansionScale, riskScale: identity.individual.riskScale, stealScale: identity.individual.stealScale }) : traits, path: [], nextDecisionTick: 0, seq: 0, random, goal: 'EXPAND', lastCell: -1, lastProgressTick: 0, plannedLifeId: 0, attackTarget: null, attackSlot: null, emotion: createBotEmotion(), attackSurvival: false };
    memoryVariants.set(memory, variant);
    return memory;
}
// Single-player, initial room bots, replacements and room-loop recovery share
// the player-approved explorer policy. Raw memories stay available for controls
// and HUMAN return-only fallback, without changing action RNG or wire state.
export function createGameplayBotMemory(seed, variant = 'combined', identity) {
    const memory = createBotMemory(seed, variant, identity);
    setBotEncounterExperiment(memory, ADOPTED_BOT_ENCOUNTER);
    return memory;
}
const botObservers = new WeakMap();
const shadowObservers = new WeakMap();
// Optional tactical audit: production decisions do not allocate trace records.
export function watchBotDecisions(memory, observer, options = {}) {
    botObservers.set(memory, observer);
    shadowObservers.set(memory, options.shadow !== false);
    return () => { botObservers.delete(memory); shadowObservers.delete(memory); };
}
function publicParticipant(p) {
    const { trailCells: _, spawnCells: __, trailOriginCellId: ___, ...rest } = p;
    return { ...rest, position: { ...p.position }, direction: { ...p.direction }, targetDirection: p.targetDirection ? { ...p.targetDirection } : null, protected: false };
}
// Explicit opponent snapshot: do not copy or read hidden targetDirection/run/input
// data. Keep targetDirection null for compatibility with public movement types.
function observableParticipant(p) {
    return { participantId: p.participantId, slot: p.slot, nickname: p.nickname, kind: p.kind, personality: p.personality,
        position: { ...p.position }, direction: { ...p.direction }, targetDirection: null, cellId: p.cellId, lifeId: p.lifeId, lifeState: p.lifeState,
        territoryCount: p.territoryCount, controlScore: p.controlScore, kills: p.kills, deaths: p.deaths, respawnAtTick: p.respawnAtTick,
        protectedUntilTick: p.protectedUntilTick, deathReason: p.deathReason, deathContext: p.deathContext, lastAppliedInputSeq: 0, run: null, protected: false };
}
export function observeBot(match, participantId, variant = 'combined', steeringOnly = false) {
    const self = match.participants.find(p => p.participantId === participantId);
    if (!self)
        throw new Error('Unknown bot');
    const origin = match.map.cells[self.cellId] ?? { q: 0, r: 0 }, range = match.config.botObservationRange, options = botOptions(variant);
    setMovementNormalCaching(match.map, options.cache);
    const snapshot = options.fair ? observableParticipant : publicParticipant;
    const departureHeads = [], others = [], trails = [];
    // Between decisions only the live near-head/near-trail predicates used by
    // botLookAhead are needed. Preserve observation range and source order.
    for (const p of match.participants)
        if (p !== self) {
            if (steeringOnly && self.trailCells.size === 0 && match.owners[self.cellId] === self.slot + 1 && p.lifeState === 'ALIVE' && hexDistance(origin, match.map.cells[p.cellId]) <= range)
                departureHeads.push(observableParticipant(p));
            if (p.lifeState === 'ALIVE' && hexDistance(origin, match.map.cells[p.cellId]) <= Math.min(range, steeringOnly ? 3 : range) && (!steeringOnly || others.length === 0))
                others.push(snapshot(p));
            if (!steeringOnly || trails.length === 0)
                for (const cellId of p.trailCells)
                    if (hexDistance(origin, match.map.cells[cellId]) <= Math.min(range, steeringOnly ? 2 : range)) {
                        trails.push({ cellId, slot: p.slot });
                        if (steeringOnly)
                            break;
                    }
        }
    const obs = { matchId: match.matchId, tick: match.tick, config: match.config, map: match.map, owners: match.owners, gameMode: match.gameMode,
        roster: match.participants.filter(p => p.lifeState !== 'FINISHED').map(p => ({ participantId: p.participantId, slot: p.slot, lifeId: p.lifeId, lifeState: p.lifeState })),
        standings: steeringOnly ? undefined : [...match.participants].filter(p => p.lifeState !== 'FINISHED').sort((a, b) => b.territoryCount - a.territoryCount || a.slot - b.slot).map((p, i) => ({ participantId: p.participantId, territory: p.territoryCount, share: p.territoryCount / match.map.cells.length, rank: i + 1 })), events: botEvents(match, participantId), spawnCells: 1 + 3 * match.config.spawnRadius * (match.config.spawnRadius + 1),
        actualOwnTrailLength: steeringOnly ? self.trailCells.size : undefined, departureHeads: steeringOnly ? departureHeads : undefined, self: publicParticipant(self), ownTrail: steeringOnly ? [] : [...self.trailCells], others, trails };
    observationVariants.set(obs, variant);
    return obs;
}
export function observeBotForTick(match, participantId, memory) {
    const variant = memoryVariants.get(memory) ?? 'combined', self = match.participants.find(p => p.participantId === participantId);
    const due = self ? botDecisionDue(memory, match.tick, self, match.owners, self.trailCells.size) : undefined;
    const light = botOptions(variant).cache && self?.lifeId === memory.plannedLifeId && !due?.strategy && !due?.tactical && !memory.reposition.active;
    return observeBot(match, participantId, variant, light);
}
export function botRepositionDue(obs, memory, returnOnly = false) { return !!repositionImmediateReason(obs, memory.reposition, memory.path, returnOnly); }
const tickObservers = new WeakMap();
export function watchBotTicks(memory, observer) { tickObservers.set(memory, observer); return () => tickObservers.delete(memory); }
export const botLookAhead = immediateLookAhead;
export function getBotInput(obs, memory, returnOnly = false, policy) {
    if (policy)
        attackPolicies.set(memory, policy);
    else
        attackPolicies.delete(memory);
    updateBotEmotion(obs, memory.emotion, memory.identity);
    recordDepartureSafety(memory, { type: 'tick', tick: obs.tick, lifeId: obs.self.lifeId, alive: obs.self.lifeState === 'ALIVE', outside: (obs.actualOwnTrailLength ?? obs.ownTrail.length) > 0 || obs.owners[obs.self.cellId] !== obs.self.slot + 1 });
    if (obs.self.lifeState !== 'ALIVE') {
        endReposition(obs, memory.reposition, 'DEATH');
        return null;
    }
    let finishTrace, perimeterReturn = false;
    let departure;
    const observer = botObservers.get(memory), planGoal = memory.goal, planTarget = memory.attackTarget, planSlot = memory.attackSlot;
    let planChanged = memory.plannedLifeId !== obs.self.lifeId;
    const setPath = (path, force = false) => { if (observer && (force || path.length !== memory.path.length || path.some((id, i) => id !== memory.path[i])))
        planChanged = true; memory.path = path; };
    repositionProgress(obs, memory.reposition);
    let repositionEvent = repositionImmediateReason(obs, memory.reposition, memory.path, returnOnly);
    if (!repositionEvent && (() => { const d = botDecisionDue(memory, obs.tick, obs.self, obs.owners, obs.actualOwnTrailLength ?? obs.ownTrail.length); return d.strategy || d.tactical; })())
        repositionEvent = repositionRegularReason(obs, memory.reposition, memory.emotion);
    if (repositionEvent) {
        endReposition(obs, memory.reposition, repositionEvent);
        setPath([]);
        memory.goal = 'RETURN';
        memory.nextDecisionTick = obs.tick;
    }
    const lifeChanged = memory.plannedLifeId !== obs.self.lifeId, fromGoal = planGoal;
    const decisionReason = lifeChanged ? 'LIFE' : memory.nextDecisionTick <= obs.tick - 1 ? 'URGENT' : 'REGULAR';
    if (memory.plannedLifeId !== obs.self.lifeId) {
        setPath([]);
        memory.seq = 0;
        memory.nextDecisionTick = 0;
        memory.plannedLifeId = obs.self.lifeId;
        if (memory.schedule)
            memory.schedule.nextTacticalTick = obs.tick;
        memory.lastCell = -1;
        memory.attackTarget = null;
        memory.attackSlot = null;
        memory.goal = 'EXPAND';
        memory.attackSurvival = false;
        memory.expansion = undefined;
        memory.lastExpansionShape = undefined;
        memory.departureOwned = false;
    }
    if (memory.lastCell !== obs.self.cellId) {
        memory.lastCell = obs.self.cellId;
        memory.lastProgressTick = obs.tick;
    }
    const cadence = botDecisionDue(memory, obs.tick, obs.self, obs.owners, obs.actualOwnTrailLength ?? obs.ownTrail.length);
    let strategyDue = cadence.strategy;
    const due = strategyDue || cadence.tactical;
    if (due) {
        if (strategyDue)
            memory.departureOwned = false;
        const trace = observer ? { tick: obs.tick, from: planGoal, to: memory.goal, repositionEvent: repositionEvent ?? undefined, ownTrail: obs.ownTrail.length, attackTarget: null, attacks: [] } : undefined;
        if (trace)
            decisionTraces.set(memory, trace);
        if (trace && shadowObservers.get(memory) !== false) {
            trace.shadow = evaluateShadowOpportunities(obs, { path: shortestPath, seconds: shadowTravelSeconds });
            trace.shadow.goalBefore = memory.goal;
        }
        if (strategyDue)
            scheduleBotDecision(obs, memory);
        scheduleBotTactics(obs, memory);
        const { stuck, homeLost, danger, targetPresent, atHome } = runBotTactics(obs, memory, returnOnly, policy, setPath, trace);
        if (!strategyDue && !memory.path.length && atHome) {
            strategyDue = true;
            scheduleBotDecision(obs, memory);
        }
        if (strategyDue)
            selectBotStrategicPlan(obs, memory, returnOnly, atHome, setPath, trace);
        if (trace)
            trace.cadence = { strategy: strategyDue, tactical: true, strategyTicks: cadence.strategyTicks ?? null, tacticalTicks: memory.schedule && obs.self.kind === 'BOT' ? 3 : null };
        if (trace && observer) {
            decisionTraces.delete(memory);
            finishTrace = () => {
                trace.repositionEvent ??= repositionEvent ?? undefined;
                if (departure) {
                    trace.departure = departure;
                    trace.expansionPlan = undefined;
                    trace.expansionPath = undefined;
                    trace.reason = departure.fallback ? 'LAUNCH_BLOCKED' : 'LAUNCH_NO_SAFE_OWNED_ROUTE';
                    trace.safetyOverride = trace.reason;
                }
                trace.planChanged = planChanged || planGoal !== memory.goal || planTarget !== memory.attackTarget || planSlot !== memory.attackSlot;
                trace.to = memory.goal;
                trace.attackTarget = memory.attackTarget;
                trace.attackSlot = memory.attackSlot;
                trace.personality = obs.self.personality;
                trace.pathLength = memory.path.length;
                trace.traits = memory.traits;
                trace.lookAheadUsed = perimeterReturn || !target ? 1 : Math.max(1, memory.path.findIndex(id => obs.map.cells[id].center === target) + 1);
                trace.reason = perimeterReturn ? 'PERIMETER_GUARD' : trace.reason ?? (memory.goal === 'ESCAPE' ? 'ESCAPE_COMMITMENT' : 'PLAN_CONTINUE');
                if (perimeterReturn)
                    trace.safetyOverride = 'PERIMETER_GUARD';
                const shadow = trace.shadow;
                if (shadow) {
                    const clear = shadow.candidates.filter(c => c.reason === 'CLEAR_KILL_OPPORTUNITY');
                    shadow.selectedGoal = memory.goal;
                    shadow.selectedTarget = memory.attackTarget;
                    shadow.missed = clear.length > 0 && !(memory.goal === 'ATTACK' && clear.some(c => c.target === memory.attackTarget && c.slot === memory.attackSlot));
                    if (shadow.missed)
                        shadow.event = 'MISSED_KILL_OPPORTUNITY';
                    shadow.missedReason = !shadow.missed ? null : perimeterReturn ? 'PERIMETER_GUARD' : returnOnly ? 'RETURN_ONLY_BLOCK' : trace.from === 'ESCAPE' && memory.goal === 'ESCAPE' ? 'GOAL_ESCAPE_BLOCK' : stuck ? 'STUCK_RECOVERY' : homeLost ? 'HOME_ROUTE_LOST' : memory.goal === 'ATTACK' ? 'GOAL_ATTACK_TARGET_LOCK' : danger ? 'DANGER_POLICY_BLOCK' : trace.from === 'RETURN' ? 'GOAL_RETURN_DETOUR_LIMIT' : trace.attacks.find(a => clear.some(c => c.target === a.target && c.slot === a.slot))?.reason ?? 'CANDIDATE_OR_PRIORITY_BLOCK';
                }
                observer(trace);
            };
        }
    }
    // Begin the next leg within a turn radius, before overshooting a waypoint.
    // A point-seeking bot otherwise orbits centers it cannot reach while turning.
    const reach = Math.max(Math.sqrt(3) * obs.map.side * 0.18, moveSpeed(obs.config) / obs.config.turnRadiansPerSecond + moveSpeed(obs.config) / obs.config.simulationHz);
    while (memory.path.length && obs.self.cellId === memory.path[0] && Math.hypot(obs.map.cells[memory.path[0]].center.x - obs.self.position.x, obs.map.cells[memory.path[0]].center.y - obs.self.position.y) < reach)
        memory.path.shift();
    // Immediate safety runs on light ticks too, without rescheduling strategy.
    if (memory.departureOwned && ((obs.actualOwnTrailLength ?? obs.ownTrail.length) > 0 || obs.owners[obs.self.cellId] !== obs.self.slot + 1))
        memory.departureOwned = false;
    if (memory.departureOwned && memory.path.some(id => obs.owners[id] !== obs.self.slot + 1)) {
        setPath([]);
        memory.departureOwned = false;
    }
    if (!returnOnly && ['EXPAND', 'STEAL'].includes(memory.goal) && (obs.actualOwnTrailLength ?? obs.ownTrail.length) === 0 && obs.owners[obs.self.cellId] === obs.self.slot + 1) {
        const safety = evaluateDepartureSafety(obs, memory.path, memory.goal);
        recordDepartureSafety(memory, { type: 'check', tick: obs.tick, result: safety });
        if (safety.blocked) {
            const fallback = selectOwnedDepartureFallback(obs);
            departure = { ...safety, fallback };
            recordDepartureSafety(memory, { type: 'block', tick: obs.tick, result: safety, fallback });
            setPath(fallback ?? []);
            memory.departureOwned = !!fallback;
            memory.goal = 'RETURN';
            memory.expansion = undefined;
            memory.attackTarget = null;
            memory.attackSlot = null;
            memory.attackSurvival = false;
        }
    }
    if (memory.departureOwned)
        departureIntent(obs, memory.path, 'RETURN', true);
    const lookAhead = memory.departureOwned ? 1 : botLookAhead(obs, memory.goal);
    const target = botSteeringTarget(obs.map, obs.self, memory.path, obs.config, lookAhead);
    let direction = target ? normalizeDirection(target.x - obs.self.position.x, target.y - obs.self.position.y) ?? obs.self.direction : obs.self.direction;
    // Predict bot steering near the perimeter. Shared movement and player input
    // stay unchanged; bots start turning while there is still room to survive.
    const escape = perimeterEscapeDirection(obs, direction);
    if (escape) {
        if (memory.reposition.active) {
            endReposition(obs, memory.reposition, 'PERIMETER_GUARD');
            repositionEvent = 'PERIMETER_GUARD';
        }
        direction = escape;
        setPath([]);
        memory.goal = 'RETURN';
        memory.nextDecisionTick = obs.tick;
        perimeterReturn = true;
    }
    if (perimeterReturn) {
        memory.attackTarget = null;
        memory.attackSlot = null;
        memory.departureOwned = false;
    }
    if (departure && !due && observer)
        observer({ tick: obs.tick, from: planGoal, to: memory.goal, planChanged: true, reason: departure.fallback ? 'LAUNCH_BLOCKED' : 'LAUNCH_NO_SAFE_OWNED_ROUTE', safetyOverride: departure.fallback ? 'LAUNCH_BLOCKED' : 'LAUNCH_NO_SAFE_OWNED_ROUTE', departure, ownTrail: obs.actualOwnTrailLength ?? obs.ownTrail.length, attackTarget: null, attackSlot: null, attacks: [], pathLength: memory.path.length });
    // Perimeter recovery can happen between tactical decisions; record that real override too.
    if (perimeterReturn && !due && observer && shadowObservers.get(memory) === false)
        observer({ tick: obs.tick, from: planGoal, to: memory.goal, planChanged: planChanged || planGoal !== memory.goal || planTarget !== memory.attackTarget || planSlot !== memory.attackSlot, reason: 'PERIMETER_GUARD', safetyOverride: 'PERIMETER_GUARD', ownTrail: obs.ownTrail.length, attackTarget: null, attackSlot: null, attacks: [], pathLength: 0 });
    if (memory.goal !== 'ATTACK')
        memory.attackSurvival = false;
    finishTrace?.();
    if (due)
        tickObservers.get(memory)?.({ tick: obs.tick, slot: obs.self.slot, lifeId: obs.self.lifeId, goal: memory.goal, from: fromGoal, reason: decisionReason, layer: strategyDue ? 'BOTH' : 'TACTICAL', nextTacticalTick: memory.schedule?.nextTacticalTick, nextDecisionTick: memory.nextDecisionTick, attackTarget: memory.attackTarget, attackSlot: memory.attackSlot });
    if (!direction)
        return null;
    return { matchId: obs.matchId, lifeId: obs.self.lifeId, seq: ++memory.seq, dx: direction.x, dy: direction.y };
}
export function botSpecs(count, startSlot = 0, prefix = 'bot', options = {}) {
    return assignBotSpecs(count, startSlot, prefix, options);
}
