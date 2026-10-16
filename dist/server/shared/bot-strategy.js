import { botCandidateListener } from './bot-candidate-diagnostics.js';
import { hexDistance } from './hex.js';
import { normalizeDirection, stepSteering } from './movement.js';
import { GAME_MODES } from './modes.js';
import { damageExpansionAnchors, expansionDamageBonus } from './bot-damage.js';
import { emotionIndividual, memoryValuable, grudgeBonus, grudgeAmount } from './bot-emotion.js';
import { survivalCounterAllowed } from './bot-policy.js';
import { evaluateShadowOpportunities, shadowTravelSeconds } from './bot-opportunity.js';
import { expansionSides, EXPANSION_SHAPES, crowdedExpansionShape } from './bot-expansion.js';
import { evaluateDepartureSafety, recordDepartureSafety, expansionPerimeterBlocked } from './bot-immediate-safety.js';
import { selectReposition, startReposition } from './bot-reposition.js';
import { decisionTraces, attackPolicies } from './bot-runtime.js';
import { shortestPath, returnPath, travelSeconds, observedHeading, forecastHead } from './bot-navigation.js';
import { holdingRiskMultiplier } from './bot-holding-risk.js';
import { explorerEncounterFootprint, hunterEncounterFootprint } from './bot-encounter-experiment.js';
import { BOT_LOOP_CEILING, quietLoopEligible } from './bot-loop-ceiling.js';
import { openSpaceExpansionAnchor } from './bot-open-space.js';
import { innerExpansionAnchor } from './bot-inner-anchor.js';
// Anchor/shape enumeration and existing score terms remain intact.
const behavior = {
    EXPAND: { length: 5, width: 4, attack: 0.08, pointWeight: 4, risk: 0.7, trailLimit: 20, steal: 0.3, attackRange: 6 },
    ATTACK: { length: 3, width: 2, attack: 0.85, pointWeight: 3, risk: 0.4, trailLimit: 18, steal: 0.5, attackRange: 9 },
    DEFEND: { length: 2, width: 2, attack: 0.02, pointWeight: 1, risk: 1.3, trailLimit: 12, steal: 0.1, attackRange: 5 },
    SEEK_POINT: { length: 3, width: 3, attack: 0.2, pointWeight: 30, risk: 0.8, trailLimit: 18, steal: 3, attackRange: 7 }
};
const individualSettings = new WeakMap();
export function settingsFor(obs, memory) {
    const personality = obs.self.personality ?? 'EXPAND';
    let cache = individualSettings.get(memory);
    if (!cache) {
        cache = new Map();
        individualSettings.set(memory, cache);
    }
    let settings = cache.get(personality);
    if (!settings) {
        const base = behavior[personality], t = memory.traits;
        settings = { ...base, length: base.length * t.expansionScale, width: base.width * t.expansionScale, risk: base.risk * t.riskScale, steal: base.steal * t.stealScale, attack: memory.identity?.individual.attackChance ?? base.attack };
        cache.set(personality, settings);
    }
    const emotional = emotionIndividual(obs, memory.emotion, memory.identity);
    return emotional ? { ...settings, length: behavior[personality].length * emotional.expansionScale, width: behavior[personality].width * emotional.expansionScale, risk: behavior[personality].risk * emotional.riskScale } : settings;
}
function observedReturnSeconds(obs, victim, home) {
    const earliest = travelSeconds(obs, victim, home);
    if (!home.length)
        return earliest;
    const target = obs.map.cells[home[0]].center, toward = normalizeDirection(target.x - victim.position.x, target.y - victim.position.y);
    // A head already turning home gets the conservative immediate-return estimate.
    // Otherwise forecast only half a second from its observed heading. The opponent
    // can react and close sooner, so every subsequent decision rechecks the line.
    const intent = observedHeading(obs, victim);
    if (toward && intent.x * toward.x + intent.y * toward.y > .55)
        return earliest;
    let position = victim.position, heading = victim.direction, cellId = victim.cellId;
    const ticks = Math.ceil(obs.config.simulationHz * .5);
    for (let tick = 1; tick <= ticks; tick++) {
        const next = stepSteering(obs.map, position, cellId, heading, intent, obs.config);
        if (next.blocked)
            return earliest;
        position = next.position;
        heading = next.direction;
        cellId = next.cellId;
        if (obs.owners[cellId] === victim.slot + 1)
            return Math.min(earliest, tick / obs.config.simulationHz);
    }
    const back = shortestPath(obs.map, cellId, id => obs.owners[id] === victim.slot + 1, () => true, 24);
    return back ? Math.min(earliest + .5, ticks / obs.config.simulationHz + travelSeconds(obs, { ...victim, position, direction: heading, cellId }, back)) : earliest;
}
export function planAttack(obs, memory, interrupt = false, locked = false) {
    const listener = botCandidateListener(memory), diagnostic = listener ? [] : undefined;
    if (!obs.trails.length) {
        listener?.(obs, { kind: 'ATTACK', interrupt, candidates: [], selectedIndex: -1 });
        return null;
    }
    const settings = settingsFor(obs, memory), owner = obs.self.slot + 1, counts = new Map();
    for (const trail of obs.trails)
        counts.set(trail.slot, (counts.get(trail.slot) ?? 0) + 1);
    const targetId = (slot) => obs.roster?.find(p => p.slot === slot)?.participantId ?? obs.others.find(p => p.slot === slot)?.participantId;
    const targetAttack = (slot) => { const id = targetId(slot); return emotionIndividual(obs, memory.emotion, memory.identity, id)?.attackChance ?? settings.attack; };
    const incursions = new Set(obs.trails.filter(t => obs.owners[t.cellId] === owner || obs.map.cells[t.cellId].neighbors.some(id => id >= 0 && obs.owners[id] === owner)).map(t => t.slot));
    const valuable = (cellId, slot) => obs.owners[cellId] === owner || incursions.has(slot) || (counts.get(slot) ?? 0) >= 5 || !!targetId(slot) && memoryValuable(memory.emotion, targetId(slot));
    const attackRoll = !interrupt && obs.trails.length > 0 ? memory.random() : 1;
    const targets = [...obs.trails].sort((a, b) => hexDistance(obs.map.cells[a.cellId], obs.map.cells[obs.self.cellId]) - hexDistance(obs.map.cells[b.cellId], obs.map.cells[obs.self.cellId]));
    // Do not lay our approach across an observed head's immediate forward path.
    // This is a short prediction from public position/heading, not future inputs.
    const headPaths = new Set();
    for (const enemy of obs.others)
        for (const cellId of forecastHead(obs, enemy))
            headPaths.add(cellId);
    let best = null;
    const returnTimes = new Map();
    // Reserve candidates for each observed opponent; one long nearby trail must
    // not consume every evaluation and hide another opponent entering our home.
    const perSlot = new Map();
    const lockedTarget = locked && obs.trails.some(t => t.slot === memory.attackSlot && t.cellId === memory.attackTarget) ? memory.attackTarget : null;
    const considered = targets.filter(t => !locked || (t.slot === memory.attackSlot && (lockedTarget !== null ? t.cellId === lockedTarget : obs.others.some(p => p.slot === t.slot)))).filter(t => { const count = perSlot.get(t.slot) ?? 0; perSlot.set(t.slot, count + 1); return count < 3; }).slice(0, 12);
    for (const target of considered) {
        const trace = decisionTraces.get(memory);
        const record = trace ? { target: target.cellId, slot: target.slot, distance: hexDistance(obs.map.cells[target.cellId], obs.map.cells[obs.self.cellId]), interrupt, reason: 'SELECTABLE' } : undefined;
        if (record)
            trace.attacks.push(record);
        const ordinary = !interrupt && attackRoll < targetAttack(target.slot);
        const reward = valuable(target.cellId, target.slot), range = obs.self.personality === 'DEFEND' ? settings.attackRange : reward ? Math.max(8, settings.attackRange) : settings.attackRange;
        const outward = shortestPath(obs.map, obs.self.cellId, id => id === target.cellId, id => id === target.cellId || !headPaths.has(id), range);
        if (!outward) {
            if (record)
                record.reason = 'NO_APPROACH';
            continue;
        }
        const back = shortestPath(obs.map, target.cellId, id => obs.owners[id] === owner, () => true, 10);
        if (!back || outward.length + back.length > 18 || obs.ownTrail.length + outward.filter(id => obs.owners[id] !== owner).length + back.length > settings.trailLimit) {
            if (record)
                record.reason = 'TRAIL_BUDGET';
            continue;
        }
        if (!returnTimes.has(target.slot)) {
            const victim = obs.others.find(p => p.slot === target.slot), home = victim && shortestPath(obs.map, victim.cellId, id => obs.owners[id] === target.slot + 1, () => true, 24);
            returnTimes.set(target.slot, home && victim ? observedReturnSeconds(obs, victim, home) : null);
        }
        const seconds = travelSeconds(obs, obs.self, outward), returnTime = returnTimes.get(target.slot);
        if (record) {
            record.seconds = seconds;
            record.returnTime = returnTime;
            record.returnSeconds = back.length / obs.config.moveCellsPerSecond;
        }
        const margin = !locked && obs.self.personality === 'ATTACK' ? (outward.length >= 6 ? .4 : outward.length >= 4 ? .25 : .1) : .1;
        if (record)
            record.etaMargin = margin;
        if (returnTime !== null && returnTime !== undefined && seconds + margin >= returnTime) {
            if (record)
                record.reason = 'VICTIM_RETURNS_FIRST';
            continue;
        }
        const opportunity = outward.length <= 4 && seconds <= 1.25 && returnTime !== null && returnTime !== undefined && seconds + .2 < returnTime;
        if (!locked && !reward && !ordinary && !opportunity && !(obs.self.personality === 'ATTACK' && returnTime !== null && returnTime !== undefined)) {
            if (record)
                record.reason = 'LOW_PRIORITY';
            continue;
        }
        // Compare the cut with a counter-cut of our already exposed line. A cheap
        // winning strike can beat retreat; a duel we arrive at too late cannot.
        let counterTime = Infinity;
        for (const enemy of obs.others)
            if (obs.ownTrail.length) {
                const nearest = obs.ownTrail.reduce((best, id) => hexDistance(obs.map.cells[enemy.cellId], obs.map.cells[id]) < hexDistance(obs.map.cells[enemy.cellId], obs.map.cells[best]) ? id : best);
                const route = shortestPath(obs.map, enemy.cellId, id => id === nearest, () => true, 8);
                if (route)
                    counterTime = Math.min(counterTime, travelSeconds(obs, enemy, route));
            }
        if (record)
            record.counterTime = counterTime;
        if (counterTime <= seconds + .05) {
            if (record)
                record.reason = 'COUNTER_CUT_FIRST';
            continue;
        }
        if (!locked && obs.self.personality === 'ATTACK') {
            const exposed = [...obs.ownTrail, ...outward, ...back].filter(id => obs.owners[id] !== owner);
            const total = seconds + back.length / obs.config.moveCellsPerSecond;
            if (obs.others.some(p => p.slot !== target.slot && exposed.some(id => hexDistance(obs.map.cells[p.cellId], obs.map.cells[id]) / obs.config.moveCellsPerSecond <= total + .15))) {
                if (record)
                    record.reason = 'UNSAFE_RETURN';
                continue;
            }
        }
        // A thief keeps its territory route unless a short interception lies on it,
        // a very close cut is clear, or its own exposed line needs a counterstrike.
        if (!locked && obs.self.personality === 'SEEK_POINT') {
            const onRoute = memory.path.slice(0, 6).some(id => hexDistance(obs.map.cells[id], obs.map.cells[target.cellId]) <= 1);
            const defending = incursions.has(target.slot) && outward.length <= 4;
            if (outward.length > 4 || (!onRoute && !defending && outward.length > 2) || (!opportunity && !defending)) {
                // A short, demonstrably safe interception is not a long kill diversion.
                // Reassess this candidate independently of the optional diagnostic trace:
                // conservative opponent bounds and shared steering must permit cut+home.
                const close = opportunity && outward.length <= 3 && back.length <= 3 && evaluateShadowOpportunities({ ...obs, trails: [target] }, { path: (_map, start) => start === obs.self.cellId ? outward : back, seconds: shadowTravelSeconds }).candidates[0];
                if (!close || close.reason !== 'CLEAR_KILL_OPPORTUNITY' || close.returnSeconds === null || close.returnSeconds > 2) {
                    if (record)
                        record.reason = 'STEAL_DIVERSION_LIMIT';
                    continue;
                }
            }
        }
        const urgent = outward.length <= 2 && seconds <= .75 && opportunity;
        const defenseBonus = incursions.has(target.slot) ? (memory.identity?.individual.defenseBonus ?? (obs.self.personality === 'DEFEND' ? 12 : 0)) : 0;
        const advantage = returnTime === null || returnTime === undefined ? 0 : Math.max(0, returnTime - seconds);
        const qualityBonus = obs.self.personality === 'ATTACK' ? Math.min(12, advantage * 6) + (opportunity ? 12 : 0) - Math.max(0, outward.length - 4) * 3 : 0;
        let score = qualityBonus + defenseBonus + (reward ? 60 : opportunity ? 50 + targetAttack(target.slot) * 15 : 50 * targetAttack(target.slot)) - seconds * 8 - back.length * .3 + (obs.owners[target.cellId] === owner ? 15 : 0) + grudgeBonus(memory.emotion, targetId(target.slot) ?? '', memory.identity);
        const victim = obs.others.find(p => p.slot === target.slot), id = targetId(target.slot);
        let survival = false;
        if (victim && obs.ownTrail.length) {
            const nearest = obs.ownTrail.reduce((best, id) => hexDistance(obs.map.cells[victim.cellId], obs.map.cells[id]) < hexDistance(obs.map.cells[victim.cellId], obs.map.cells[best]) ? id : best);
            const cut = shortestPath(obs.map, victim.cellId, id => id === nearest, () => true, 8), home = returnPath(obs);
            const threat = cut ? travelSeconds(obs, victim, cut) : Infinity, homeEta = home ? travelSeconds(obs, obs.self, home) : null;
            survival = survivalCounterAllowed(obs.ownTrail.length, threat, homeEta, seconds);
        }
        const targetLife = obs.roster?.find(p => p.slot === target.slot)?.lifeId ?? victim?.lifeId;
        const rawScore = score;
        const policy = attackPolicies.get(memory), adjusted = id && targetLife !== undefined ? policy?.evaluate(id, targetLife, score, survival) : undefined;
        if (record) {
            record.grudge = grudgeAmount(memory.emotion, id ?? '');
            record.grudgeBonus = grudgeBonus(memory.emotion, id ?? '', memory.identity);
            record.attackChance = targetAttack(target.slot);
            record.survival = survival;
            record.otherReservations = adjusted?.otherReservations;
            record.reservationFactor = adjusted?.factor;
        }
        if (adjusted?.reason) {
            if (record)
                record.reason = adjusted.reason;
            continue;
        }
        if (adjusted)
            score = adjusted.score;
        if (record) {
            record.qualityBonus = qualityBonus;
            record.score = score;
        }
        diagnostic?.push({ survival, path: [...outward, ...back], score, rawScore, reservationFactor: adjusted?.factor ?? 1, goal: 'ATTACK', target: target.cellId, slot: target.slot });
        if (!best || score > best.score)
            best = { survival, path: [...outward, ...back], score, goal: 'ATTACK', target: target.cellId, slot: target.slot, urgent, seconds, totalSeconds: seconds + back.length / obs.config.moveCellsPerSecond };
    }
    listener?.(obs, { kind: 'ATTACK', interrupt, candidates: diagnostic, selectedIndex: best ? diagnostic.findIndex(c => c.slot === best.slot && c.target === best.target) : -1 });
    return best;
}
// Evaluate the same enclosure rule as capture: home plus the planned trail
// blocks flood-fill from the outer edge. Retracing a line has no area bonus.
const plannedCaptureWork = new WeakMap();
/** Reference full-map flood (the frozen rule). plannedCapture must always return exactly this. */
export function plannedCaptureFull(obs, path) {
    let work = plannedCaptureWork.get(obs.map);
    if (!work) {
        const count = obs.map.cells.length;
        work = { blocked: new Uint8Array(count), visited: new Uint8Array(count), queue: new Int32Array(count), boundary: obs.map.cells.filter(c => c.neighbors.includes(-1)).map(c => c.id) };
        plannedCaptureWork.set(obs.map, work);
    }
    const owner = obs.self.slot + 1, { blocked, visited, queue, boundary } = work;
    blocked.fill(0);
    visited.fill(0);
    for (const id of path)
        blocked[id] = 1;
    let tail = 0;
    for (const id of boundary)
        if (obs.owners[id] !== owner && !blocked[id]) {
            visited[id] = 1;
            queue[tail++] = id;
        }
    for (let head = 0; head < tail; head++)
        for (const id of obs.map.cells[queue[head]].neighbors) {
            if (id < 0 || visited[id] || obs.owners[id] === owner || blocked[id])
                continue;
            visited[id] = 1;
            queue[tail++] = id;
        }
    const result = [];
    for (let id = 0; id < obs.map.cells.length; id++)
        if (obs.owners[id] !== owner && !visited[id])
            result.push(id);
    return result;
}
const captureBases = new WeakMap();
const captureScratch = new WeakMap();
const UNSEEN = -2, SEED = -1;
function captureBase(obs, owner) {
    let byOwner = captureBases.get(obs.map);
    if (!byOwner) {
        byOwner = new Map();
        captureBases.set(obs.map, byOwner);
    }
    const cached = byOwner.get(owner), count = obs.map.cells.length;
    if (cached && cached.owners.length === obs.owners.length) {
        let same = true;
        for (let i = 0; i < count; i++)
            if (cached.owners[i] !== obs.owners[i]) {
                same = false;
                break;
            }
        if (same)
            return cached;
    }
    const parent = cached?.parent.length === count ? cached.parent : new Int32Array(count), queue = new Int32Array(count);
    parent.fill(UNSEEN);
    let tail = 0;
    for (let id = 0; id < count; id++)
        if (obs.map.cells[id].neighbors.includes(-1) && obs.owners[id] !== owner) {
            parent[id] = SEED;
            queue[tail++] = id;
        }
    for (let head = 0; head < tail; head++) {
        const from = queue[head];
        for (const id of obs.map.cells[from].neighbors) {
            if (id < 0 || parent[id] !== UNSEEN || obs.owners[id] === owner)
                continue;
            parent[id] = from;
            queue[tail++] = id;
        }
    }
    const enclosed = [];
    for (let id = 0; id < count; id++)
        if (obs.owners[id] !== owner && parent[id] === UNSEEN)
            enclosed.push(id);
    const base = { owner, owners: Uint8Array.from(obs.owners), parent, enclosed };
    byOwner.set(owner, base);
    return base;
}
export function plannedCapture(obs, path) {
    const owner = obs.self.slot + 1, base = captureBase(obs, owner), count = obs.map.cells.length, { parent } = base;
    let work = captureScratch.get(obs.map);
    if (!work) {
        work = { blocked: new Int32Array(count), state: new Int32Array(count), dirty: new Int32Array(count), queue: new Int32Array(count), stamp: 0 };
        captureScratch.set(obs.map, work);
    }
    // Stamps avoid clearing the scratch arrays: blocked[id]===stamp marks a path cell; state[id] holds
    // stamp*4+k with k: 1 reachable, 2 unreachable, 3 queued in the current component search;
    // dirty[id]===stamp marks a cell whose parent chain is known to cross the path.
    const stamp = ++work.stamp, { blocked, state, dirty, queue } = work, REACH = stamp * 4 + 1, CUT = stamp * 4 + 2, OPEN = stamp * 4 + 3;
    for (const id of path)
        blocked[id] = stamp;
    // A reached cell stays reachable when its whole parent chain to the edge avoids the path.
    const clean = (id) => {
        let cur = id, steps = 0;
        while (true) {
            if (blocked[cur] === stamp || dirty[cur] === stamp)
                break;
            if (state[cur] === REACH || parent[cur] === SEED) {
                for (let c = id, k = 0; k < steps; k++, c = parent[c])
                    state[c] = REACH;
                return true;
            }
            cur = parent[cur];
            steps++;
        }
        for (let c = id, k = 0; k < steps; k++, c = parent[c])
            dirty[c] = stamp;
        return false;
    };
    const extra = [];
    for (const id of path)
        if (obs.owners[id] !== owner && parent[id] !== UNSEEN && state[id] !== CUT) {
            state[id] = CUT;
            extra.push(id);
        }
    for (const b of path)
        for (const start of obs.map.cells[b].neighbors) {
            if (start < 0 || obs.owners[start] === owner || blocked[start] === stamp || parent[start] === UNSEEN)
                continue;
            const known = state[start];
            if (known === REACH || known === CUT)
                continue;
            let tail = 0, head = 0, reachable = false;
            queue[tail++] = start;
            state[start] = OPEN;
            while (head < tail) {
                const cell = queue[head++];
                if (clean(cell)) {
                    reachable = true;
                    break;
                }
                for (const id of obs.map.cells[cell].neighbors) {
                    if (id < 0 || obs.owners[id] === owner || blocked[id] === stamp || state[id] === OPEN)
                        continue;
                    if (state[id] === REACH) {
                        reachable = true;
                        break;
                    }
                    state[id] = OPEN;
                    queue[tail++] = id;
                }
                if (reachable)
                    break;
            }
            for (let i = 0; i < tail; i++) {
                const id = queue[i];
                state[id] = reachable ? REACH : CUT;
                if (!reachable)
                    extra.push(id);
            }
        }
    if (!extra.length)
        return base.enclosed.slice();
    extra.sort((a, b) => a - b);
    const result = [], enclosed = base.enclosed;
    let i = 0, j = 0;
    while (i < enclosed.length || j < extra.length) {
        if (j >= extra.length || i < enclosed.length && enclosed[i] < extra[j])
            result.push(enclosed[i++]);
        else
            result.push(extra[j++]);
    }
    return result;
}
// A shortened enclosure avoids retracing the existing trail. Emergency escape
// still uses returnPath; this is only a pre-emptive, area-preserving closure.
export function earlyClosurePath(obs, remaining, trailLimit) {
    if (!obs.ownTrail.length || remaining.length < 5)
        return null;
    const owner = obs.self.slot + 1, used = new Set(obs.ownTrail), forbidden = new Set(obs.trails.map(t => t.cellId));
    const safe = (id) => !used.has(id) && !forbidden.has(id) && obs.others.every(p => hexDistance(obs.map.cells[p.cellId], obs.map.cells[id]) > 2);
    const back = shortestPath(obs.map, obs.self.cellId, id => obs.owners[id] === owner, safe, Math.min(10, remaining.length - 3));
    if (!back || !back.length)
        return null;
    const external = new Set([...obs.ownTrail, ...back].filter(id => obs.owners[id] !== owner));
    if (external.size > trailLimit || plannedCapture(obs, [...obs.ownTrail, ...back]).length <= external.size)
        return null;
    return back;
}
export function planExpansion(obs, memory) {
    const settings = settingsFor(obs, memory), forbidden = new Set(obs.trails.map(t => t.cellId));
    const owner = obs.self.slot + 1, own = obs.map.cells.filter(c => obs.owners[c.id] === owner);
    const boundary = own.filter(c => c.neighbors.some(n => n >= 0 && obs.owners[n] !== owner)).sort((a, b) => hexDistance(a, obs.map.cells[obs.self.cellId]) - hexDistance(b, obs.map.cells[obs.self.cellId]));
    // Only nearby, visible borders influence the thief's choice of launch point.
    if (obs.self.personality === 'SEEK_POINT') {
        const rank = (cell) => hexDistance(cell, obs.map.cells[obs.self.cellId]) - (hexDistance(cell, obs.map.cells[obs.self.cellId]) < obs.config.botObservationRange && cell.neighbors.some(id => id >= 0 && obs.owners[id] !== 0 && obs.owners[id] !== owner) ? 3 : 0);
        boundary.sort((a, b) => rank(a) - rank(b));
    }
    const holdingRisk = holdingRiskMultiplier(obs.self.territoryCount, obs.map.cells.length, obs.roster?.length ?? obs.config.maxSlots);
    const candidates = [];
    memory.attackTarget = null;
    memory.attackSlot = null;
    const attack = planAttack(obs, memory);
    if (attack)
        candidates.push(attack);
    for (const cp of GAME_MODES[obs.gameMode.id].usesControlPoints ? obs.map.controlPoints : [])
        if (obs.owners[cp.cellId] !== owner) {
            const outward = shortestPath(obs.map, obs.self.cellId, id => id === cp.cellId, id => !forbidden.has(id), 12);
            const used = new Set(outward ?? []);
            const back = outward && shortestPath(obs.map, cp.cellId, id => obs.owners[id] === owner, id => !used.has(id) && !forbidden.has(id), 12);
            if (outward && back && outward.length + back.length <= 24)
                candidates.push({ path: [...outward, ...back], score: settings.pointWeight - outward.length * 0.3, goal: 'SEEK_POINT' });
        }
    const crowded = !explorerEncounterFootprint(memory, obs.self.personality) && !hunterEncounterFootprint(memory, obs.self.personality) && obs.others.some(p => hexDistance(obs.map.cells[p.cellId], obs.map.cells[obs.self.cellId]) <= 6);
    // The explorer's extra reach is for quiet space. Visible opponents keep its
    // footprint at the Phase 1 size even before they enter the crowded radius.
    const cautiousExplorer = obs.self.personality === 'EXPAND' && obs.others.length > 0;
    const quietLarge = BOT_LOOP_CEILING.enabled && quietLoopEligible(obs), pathLimit = quietLarge ? BOT_LOOP_CEILING.pathLimit : 24;
    const trailLimit = quietLarge ? settings.trailLimit * BOT_LOOP_CEILING.trailScale : settings.trailLimit;
    const loopLength = cautiousExplorer ? Math.min(settings.length, 4) : settings.length;
    const loopWidth = cautiousExplorer ? Math.min(settings.width, 3) : settings.width;
    const damageBoundary = damageExpansionAnchors(obs, memory.emotion.damage, boundary);
    // Preserve the complete original anchor order and its RNG/shape enumeration.
    // Only the appended anchor generates extra candidates; all filters below apply.
    const openBoundary = openSpaceExpansionAnchor(obs, damageBoundary.anchors.map(c => c.id));
    if (openBoundary)
        damageBoundary.anchors.push(obs.map.cells[openBoundary.id]);
    const innerBoundary = innerExpansionAnchor(obs, damageBoundary.anchors.map(c => c.id));
    if (innerBoundary !== null)
        damageBoundary.anchors.push(obs.map.cells[innerBoundary]);
    const boundaryTrace = decisionTraces.get(memory);
    if (boundaryTrace)
        boundaryTrace.damageBoundary = { anchors: damageBoundary.damageAnchors, unreachable: damageBoundary.unreachable };
    for (const [anchorIndex, anchor] of damageBoundary.anchors.entries())
        for (let d = 0; d < 6; d++) {
            const prefix = shortestPath(obs.map, obs.self.cellId, id => id === anchor.id, id => obs.owners[id] === owner, 10);
            if (!prefix)
                continue;
            let current = anchor.id;
            const path = [...prefix];
            let valid = true, leftHome = false, closed = false;
            const lengthSpan = quietLarge ? (loopLength + 2) * BOT_LOOP_CEILING.dimensionScale - (loopLength - 1) : 3;
            const widthSpan = quietLarge ? (loopWidth + 2) * BOT_LOOP_CEILING.dimensionScale - (loopWidth - 1) : 3;
            let length = crowded ? 1 + Math.floor(memory.random() * 2) : Math.max(2, Math.floor(loopLength - 1 + memory.random() * lengthSpan));
            let width = crowded ? 1 : Math.max(1, Math.floor(loopWidth - 1 + memory.random() * widthSpan));
            const crowdedShape = crowded ? crowdedExpansionShape(obs.self.personality === 'DEFEND', anchorIndex * 6 + d + memory.seq) : null;
            const bevel = crowded ? (crowdedShape === 'BEVEL' ? 1 : 0) : Math.floor(memory.random() * 3);
            const naturalClosure = !crowded && memory.random() < .35;
            const shape = crowdedShape ?? (obs.self.personality === 'DEFEND' ? (naturalClosure ? 'NATURAL' : bevel ? 'BEVEL' : 'RHOMBUS') : EXPANSION_SHAPES[(anchorIndex * 6 + d + memory.seq) % EXPANSION_SHAPES.length]);
            // Observed pressure retains the original explorer downscale. Quiet plans
            // use their approved ceilings; head/proximity predicates are unchanged.
            const nearestHead = Math.min(...obs.others.map(p => hexDistance(anchor, obs.map.cells[p.cellId])));
            const downScaled = obs.self.personality === 'EXPAND' && !crowded && nearestHead < 2 * (length + width) * .65;
            if (downScaled) {
                length = Math.max(2, length - 1);
                width = Math.max(1, width - 1);
            }
            const trace = decisionTraces.get(memory);
            if (trace)
                (trace.expansionCandidates ??= []).push(shape);
            const sides = expansionSides(shape, d, length, width, bevel);
            for (const [direction, length] of sides) {
                if (!valid || closed)
                    break;
                for (let step = 0; step < length; step++) {
                    const next = obs.map.cells[current].neighbors[direction];
                    if (next < 0 || forbidden.has(next)) {
                        valid = false;
                        break;
                    }
                    path.push(next);
                    current = next;
                    if (obs.owners[next] !== owner)
                        leftHome = true;
                    else if (leftHome) {
                        closed = true;
                        break;
                    }
                }
            }
            if (valid && ['NATURAL', 'HOOK', 'ASYMMETRIC'].includes(shape) && leftHome && !closed) {
                const used = new Set(path), back = shortestPath(obs.map, current, id => obs.owners[id] === owner, id => !used.has(id) && !forbidden.has(id), pathLimit - path.length);
                if (back) {
                    path.push(...back);
                    current = back.at(-1) ?? current;
                }
                else
                    valid = false;
            }
            const reject = (reason) => { if (trace) {
                const reasons = trace.expansionRejected ??= {};
                reasons[reason] = (reasons[reason] ?? 0) + 1;
            } };
            if (!valid || path.length > pathLimit) {
                reject(!valid ? 'BLOCKED_PATH' : 'PATH_BUDGET');
                continue;
            }
            if (!leftHome || obs.owners[current] !== owner) {
                reject('NOT_CLOSED');
                continue;
            }
            const external = path.filter(id => obs.owners[id] !== owner);
            // Any outside path cell is blocked from the capture flood, so these rejected
            // candidates cannot have zero gain. Keep the same guards/reason order/RNG,
            // but avoid a full-map flood whose result would immediately be discarded.
            if (external.length > trailLimit || (crowded && external.length > 6)) {
                reject('TRAIL_BUDGET');
                continue;
            }
            if (obs.others.some(enemy => external.some(id => hexDistance(obs.map.cells[id], obs.map.cells[enemy.cellId]) <= 2))) {
                reject('NEAR_HEAD');
                continue;
            }
            const gain = plannedCapture(obs, path), stolen = gain.filter(id => obs.owners[id] !== 0).length;
            if (!gain.length) {
                reject('NO_GAIN');
                continue;
            }
            const risk = external.reduce((sum, id) => sum + obs.others.reduce((danger, p) => danger + Math.max(0, 4 - hexDistance(obs.map.cells[id], obs.map.cells[p.cellId])), 0), 0);
            const first = obs.map.cells[path[0] ?? anchor.id].center, heading = normalizeDirection(first.x - obs.self.position.x, first.y - obs.self.position.y);
            const turn = heading ? 1 - (heading.x * obs.self.direction.x + heading.y * obs.self.direction.y) : 0;
            const threatDistance = Math.min(...obs.others.flatMap(enemy => external.map(id => hexDistance(obs.map.cells[id], obs.map.cells[enemy.cellId]))));
            const excursionRisk = obs.self.personality === 'EXPAND' ? Math.max(0, (external.length - threatDistance) / obs.config.moveCellsPerSecond) * settings.risk * 2 : 0;
            const repeatPenalty = obs.self.personality !== 'DEFEND' && memory.lastExpansionShape === shape ? 1.5 : 0;
            if (trace)
                (trace.expansionAccepted ??= []).push(shape);
            const baseScore = gain.length * (obs.self.personality === 'EXPAND' ? 1.25 : 1) + stolen * settings.steal - path.length * 0.35 - risk * settings.risk * holdingRisk - turn * 2 - excursionRisk * holdingRisk - repeatPenalty + memory.random() * 0.5;
            const response = expansionDamageBonus(obs, memory.emotion, gain, baseScore, memory.identity);
            candidates.push({ path, score: baseScore + response.bonus, goal: stolen > gain.length / 2 ? 'STEAL' : 'EXPAND', expansion: { response, anchor: anchor.id, shape, pathLength: path.length, externalLength: external.length, captureSize: gain.length, stolenCells: stolen, earlyClosed: false, downScaled, threatDistance, ...(quietLarge ? { quietTrailLimit: trailLimit } : {}) } });
        }
    const candidateListener = botCandidateListener(memory), ordinals = candidateListener ? new Map(candidates.map((c, i) => [c, i])) : undefined;
    candidates.sort((a, b) => b.score - a.score);
    const evaluated = decisionTraces.get(memory);
    if (evaluated)
        evaluated.expansionScores = candidates.map(c => ({ shape: c.expansion?.shape, goal: c.goal, score: c.score, response: c.expansion?.response, anchor: c.expansion?.anchor }));
    // Evaluate in score order: a soon-blocked loop cannot be selected. Same pure
    // one-second predicate as the per-tick immediate guard, no additional RNG.
    let selected;
    for (const candidate of candidates) {
        const safety = evaluateDepartureSafety(obs, candidate.path, candidate.goal);
        if (safety.blocked) {
            recordDepartureSafety(memory, { type: 'candidate', tick: obs.tick, result: safety });
            if (evaluated) {
                const score = evaluated.expansionScores?.[candidates.indexOf(candidate)];
                if (score)
                    score.departureBlocked = safety.reason ?? 'UNKNOWN';
                const counts = evaluated.expansionRejected ??= {};
                counts['LAUNCH_' + safety.reason] = (counts['LAUNCH_' + safety.reason] ?? 0) + 1;
            }
            continue;
        }
        if (expansionPerimeterBlocked(obs, candidate.path, candidate.goal))
            continue;
        selected = candidate;
        break;
    }
    memory.attackSurvival = selected?.goal === 'ATTACK' && 'survival' in selected ? !!selected.survival : false;
    memory.goal = selected?.goal ?? 'RETURN';
    memory.attackTarget = selected?.target ?? null;
    memory.attackSlot = selected?.slot ?? null;
    const trace = decisionTraces.get(memory);
    if (trace) {
        trace.reason = selected?.expansion ? 'EXPANSION_SCORE' : selected?.goal === 'ATTACK' ? 'ATTACK_SCORE' : selected ? 'POINT_SCORE' : 'NO_EXPANSION';
        trace.expansionPlan = selected?.expansion;
        if (selected?.expansion)
            trace.expansionPath = [...selected.path];
    }
    memory.expansion = selected?.expansion;
    if (selected?.expansion)
        memory.lastExpansionShape = selected.expansion.shape;
    if (candidateListener)
        candidateListener(obs, { kind: 'STRATEGY', candidates: candidates.map(c => ({ ...c, ordinal: ordinals.get(c), path: [...c.path], expansion: c.expansion ? { ...c.expansion, response: c.expansion.response ? { ...c.expansion.response } : undefined } : undefined })), selectedIndex: selected ? candidates.indexOf(selected) : -1 });
    return selected?.path ?? returnPath(obs) ?? [];
}
export function selectBotStrategicPlan(obs, memory, returnOnly, atHome, setPath, trace) {
    if (!memory.path.length && returnOnly) {
        const safe = obs.map.cells[obs.self.cellId].neighbors.filter(id => obs.owners[id] === obs.self.slot + 1);
        if (safe.length)
            setPath([safe[Math.floor(memory.random() * safe.length)]], true);
    }
    if (!memory.path.length && !returnOnly && atHome) {
        const selection = !obs.ownTrail.length ? selectReposition(obs, memory.emotion, memory.reposition, memory.identity, shortestPath) : null;
        memory.reposition.selection = selection;
        if (selection?.plan) {
            startReposition(obs, memory.reposition, selection.plan);
            setPath(selection.plan.path, true);
            memory.goal = 'REPOSITION';
            memory.expansion = undefined;
            memory.attackTarget = null;
            memory.attackSlot = null;
            if (trace)
                trace.reason = 'REPOSITION_START';
        }
        else
            setPath(planExpansion(obs, memory), true);
    }
    // No useful expansion: patrol an owned cell in front, never aim at (0,0).
    if (!memory.path.length) {
        const safe = obs.map.cells[obs.self.cellId].neighbors.filter(id => id >= 0 && obs.owners[id] === obs.self.slot + 1);
        safe.sort((a, b) => { const score = (id) => { const c = obs.map.cells[id].center, d = normalizeDirection(c.x - obs.self.position.x, c.y - obs.self.position.y); return d.x * obs.self.direction.x + d.y * obs.self.direction.y; }; return score(b) - score(a); });
        if (safe.length) {
            setPath([safe[0]], true);
            if (trace)
                trace.reason = 'HOME_PATROL';
        }
    }
}
