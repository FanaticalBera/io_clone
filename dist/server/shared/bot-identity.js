import { seededRandom } from './random.js';
export const BOT_PERSONALITIES = ['EXPAND', 'ATTACK', 'DEFEND', 'SEEK_POINT'];
export const SECONDARY_TRAITS = ['Coward', 'Gambler', 'Opportunist', 'Territorial', 'Vengeful', 'Persistent'];
export const BOT_RANGES = {
    EXPAND: { expansionScale: [.85, 1.3], riskScale: [.8, 1.25], stealScale: [.7, 1.3], attackChance: [.04, .18], defenseBonus: [0, 6] },
    ATTACK: { expansionScale: [.8, 1.2], riskScale: [.75, 1.25], stealScale: [.7, 1.3], attackChance: [.8, 1], defenseBonus: [0, 6] },
    DEFEND: { expansionScale: [.8, 1.15], riskScale: [.9, 1.3], stealScale: [.7, 1.2], attackChance: [.01, .06], defenseBonus: [12, 18] },
    SEEK_POINT: { expansionScale: [.85, 1.2], riskScale: [.8, 1.2], stealScale: [.85, 1.3], attackChance: [.12, .3], defenseBonus: [0, 6] }
};
// Phase 3C is closed. Persistent stays definition-only for explicit fixtures, never automatic assignment.
export const ACTIVE_SECONDARY_TRAITS = ['Coward', 'Gambler', 'Opportunist', 'Territorial', 'Vengeful'];
export function botSeed(seed, slot) { return seed ^ (slot * 2654435761); }
export function allowedSecondaryTraits(personality) {
    return personality === 'DEFEND' ? SECONDARY_TRAITS.filter(t => t !== 'Gambler') : SECONDARY_TRAITS;
}
export function createBotIdentity(seed, personality, override = {}) {
    if (!BOT_PERSONALITIES.includes(personality))
        throw new Error('Invalid bot personality');
    // Each assignment stream has its own domain; adding names or traits never draws from decisions.
    const traitRandom = seededRandom(seed ^ 0x7ac311), individualRandom = seededRandom(seed ^ 0x51f15e);
    const allowed = allowedSecondaryTraits(personality), active = allowed.filter(t => ACTIVE_SECONDARY_TRAITS.includes(t)), secondaryTrait = override.secondaryTrait ?? active[Math.floor(traitRandom() * active.length)];
    if (!allowed.includes(secondaryTrait))
        throw new Error('Incompatible bot secondary trait');
    const ranges = BOT_RANGES[personality], individual = {};
    for (const key of ['expansionScale', 'riskScale', 'stealScale', 'attackChance']) {
        const [lo, hi] = ranges[key];
        individual[key] = lo + individualRandom() * (hi - lo);
    }
    individual.defenseBonus = personality === 'DEFEND' ? 12 : 0;
    Object.assign(individual, override.individual);
    if (secondaryTrait === 'Coward') {
        individual.expansionScale *= .9;
        individual.riskScale *= 1.15;
        individual.attackChance *= .8;
    }
    if (secondaryTrait === 'Gambler') {
        individual.expansionScale *= 1.15;
        individual.riskScale *= .85;
        individual.attackChance *= 1.1;
    }
    if (secondaryTrait === 'Opportunist') {
        individual.attackChance += .05;
        individual.stealScale *= 1.15;
    }
    if (secondaryTrait === 'Territorial')
        individual.defenseBonus += 6;
    for (const key of Object.keys(ranges)) {
        if (!Number.isFinite(individual[key]))
            throw new Error('Invalid bot individual value');
        individual[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], individual[key]));
    }
    return Object.freeze({ personality, secondaryTrait, active: secondaryTrait !== 'Persistent', individual: Object.freeze(individual) });
}
export const BOT_PERSONALITY_LABELS = { EXPAND: '영역탐험가', ATTACK: '선사냥꾼', DEFEND: '안전지킴이', SEEK_POINT: '영역도둑' };
export const SECONDARY_TRAIT_LABELS = { Coward: '겁쟁이', Gambler: '도박꾼', Opportunist: '기회주의', Territorial: '영토집착', Vengeful: '복수심', Persistent: '집요함' };
