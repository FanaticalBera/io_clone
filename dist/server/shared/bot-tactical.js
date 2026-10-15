import { hexDistance } from './hex.js';
import { rememberBotEntries, updatePressure, emotionIndividual } from './bot-emotion.js';
import { endReposition } from './bot-reposition.js';
import { settingsFor, planAttack, earlyClosurePath } from './bot-strategy.js';
import { returnPath, travelSeconds } from './bot-navigation.js';
import { botPlanValidity } from './bot-plan-validity.js';
import { holdingDangerDistance } from './bot-holding-risk.js';
import { explorerEncounterCommit } from './bot-encounter-experiment.js';
import { activeExpansionTrailLimit } from './bot-loop-ceiling.js';
// Existing due-decision order, including interrupt attack evaluation, stays intact.
export function runBotTactics(obs, memory, returnOnly, policy, setPath, trace) {
    rememberBotEntries(obs, memory.emotion);
    let settings = settingsFor(obs, memory);
    const home = returnPath(obs), atHome = obs.owners[obs.self.cellId] === obs.self.slot + 1;
    const trailLimit = activeExpansionTrailLimit(memory, settings.trailLimit);
    const dangerDistance = holdingDangerDistance(Math.max(2, Math.min(5, (home?.length ?? 4) * settings.risk)), obs.self.territoryCount, obs.map.cells.length, obs.roster?.length ?? obs.config.maxSlots);
    const danger = obs.ownTrail.length && (obs.ownTrail.length >= trailLimit || obs.others.some(p => obs.ownTrail.some(id => hexDistance(obs.map.cells[id], obs.map.cells[p.cellId]) <= dangerDistance)));
    updatePressure(obs, memory.emotion, !!danger);
    settings = settingsFor(obs, memory);
    if (trace)
        trace.emotion = { pressure: memory.emotion.pressure, lineThreat: memory.emotion.lineThreat, recentDamage: memory.emotion.recentDamage, expansionScale: emotionIndividual(obs, memory.emotion, memory.identity)?.expansionScale ?? memory.traits.expansionScale, riskScale: emotionIndividual(obs, memory.emotion, memory.identity)?.riskScale ?? memory.traits.riskScale };
    const { stuck, attacking, targetPresent, homeLost } = botPlanValidity(obs, memory);
    const attack = !returnOnly && !stuck && !homeLost && memory.goal !== 'ESCAPE' ? planAttack(obs, memory, true, attacking) : null;
    // Keep Phase 1 target locking; Phase 3 owns broader plan invalidation.
    // An exception must still qualify now; otherwise continuation needs a normal slot.
    const victim = obs.roster?.find(p => p.slot === memory.attackSlot) ?? obs.others.find(p => p.slot === memory.attackSlot);
    const continuation = attacking && !attack && policy && victim ? policy.evaluate(victim.participantId, victim.lifeId, 1, false) : undefined;
    const reservationBlocked = attacking && !attack && !!policy && (!victim || !!continuation?.reason);
    const attackFinished = attacking && (!targetPresent && !attack || reservationBlocked);
    if (attacking)
        memory.attackSurvival = attack?.survival ?? false;
    // During danger, a short attack may override retreat only as a survival counter.
    const counterStrike = !!attack && attack.seconds <= 1.25 && obs.ownTrail.length < settings.trailLimit && (!danger || attack.survival);
    const pressuredExpansion = !explorerEncounterCommit(memory, obs.self.personality) && (memory.goal === 'EXPAND' || memory.goal === 'STEAL') && obs.others.some(p => hexDistance(obs.map.cells[p.cellId], obs.map.cells[obs.self.cellId]) <= 6) && obs.ownTrail.length + memory.path.filter(id => obs.owners[id] !== obs.self.slot + 1).length > 6;
    const expanding = memory.goal === 'EXPAND' || memory.goal === 'STEAL';
    const lineDistance = Math.min(...obs.others.flatMap(p => obs.ownTrail.map(id => hexDistance(obs.map.cells[id], obs.map.cells[p.cellId]))));
    if (trace)
        trace.risk = { danger: !!danger, nearestEnemyToTrail: Number.isFinite(lineDistance) ? lineDistance : null, trailLimit };
    const riskGrew = memory.expansion && !memory.expansion.earlyClosed && lineDistance <= 5 && lineDistance + 2 < (memory.expansion.threatDistance ?? Infinity);
    const nearingBudget = obs.ownTrail.length >= trailLimit - 4;
    const early = obs.self.personality === 'EXPAND' && expanding && !returnOnly && !danger && !counterStrike && !stuck && !homeLost && (riskGrew || nearingBudget || pressuredExpansion) ? earlyClosurePath(obs, memory.path, trailLimit) : null;
    if (early) {
        if (trace)
            trace.reason = 'EARLY_CLOSURE';
        setPath(early);
        memory.goal = 'RETURN';
        memory.attackTarget = null;
        memory.attackSlot = null;
        if (memory.expansion)
            memory.expansion.earlyClosed = true;
        if (trace)
            trace.earlyClosure = true;
    }
    if ((memory.goal === 'ESCAPE' || memory.goal === 'RETURN') && atHome && !obs.ownTrail.length) {
        setPath([]);
        memory.goal = 'EXPAND';
        if (memory.expansion?.quietTrailLimit !== undefined)
            delete memory.expansion.quietTrailLimit;
    }
    // Escape is committed until home. Other opportunities cannot replace it.
    if (returnOnly || (danger && !counterStrike) || (pressuredExpansion && !counterStrike && !early) || stuck || attackFinished || homeLost || (!atHome && !memory.path.length)) {
        if (trace) {
            trace.reason = returnOnly ? 'RETURN_ONLY' : stuck ? 'STUCK' : homeLost ? 'HOME_ROUTE_LOST' : danger && !counterStrike ? 'DANGER' : pressuredExpansion ? 'EXPANSION_PRESSURE' : attackFinished ? 'TARGET_GONE' : 'NO_PATH';
            trace.safetyOverride = trace.reason;
        }
        if (memory.reposition.active) {
            const why = returnOnly ? 'RETURN_ONLY' : stuck ? 'STUCK' : 'SAFETY';
            endReposition(obs, memory.reposition, why);
            if (trace)
                trace.repositionEvent = why;
        }
        if (memory.goal !== 'ESCAPE' || !memory.path.length || homeLost || stuck)
            setPath(home ?? []);
        if (trace && attacking)
            trace.exitReason = returnOnly ? 'RETURN_ONLY' : stuck ? 'STUCK' : homeLost ? 'HOME_ROUTE_LOST' : danger && !counterStrike ? 'DANGER' : !targetPresent ? 'TARGET_GONE' : trace.attacks.find(a => a.target === memory.attackTarget)?.reason ?? 'NO_PLAN';
        memory.goal = danger || memory.goal === 'ESCAPE' ? 'ESCAPE' : 'RETURN';
        memory.attackTarget = null;
        memory.attackSlot = null;
        if (stuck)
            memory.lastProgressTick = obs.tick;
    }
    const shortDetour = attack && attack.seconds <= 1.25 && home && attack.totalSeconds <= travelSeconds(obs, obs.self, home) + .85;
    if (attack && !early && (!danger || counterStrike) && (memory.goal === 'EXPAND' || memory.goal === 'STEAL' || memory.goal === 'SEEK_POINT' || memory.goal === 'REPOSITION' || (memory.goal === 'RETURN' && shortDetour) || (memory.goal === 'ATTACK' && !targetPresent))) {
        if (trace) {
            trace.reason = counterStrike && danger ? 'COUNTER_STRIKE' : 'ATTACK_OPPORTUNITY';
            if (counterStrike && danger)
                trace.safetyOverride = 'COUNTER_STRIKE';
        }
        if (memory.reposition.active) {
            endReposition(obs, memory.reposition, 'ATTACK');
            if (trace)
                trace.repositionEvent = 'ATTACK';
        }
        memory.attackSurvival = attack.survival;
        setPath(attack.path);
        memory.goal = 'ATTACK';
        memory.attackTarget = attack.target;
        memory.attackSlot = attack.slot;
        if (memory.expansion?.quietTrailLimit !== undefined)
            delete memory.expansion.quietTrailLimit;
    }
    return { stuck, homeLost, danger, targetPresent, atHome };
}
