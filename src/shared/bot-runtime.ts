import type {BotMemory,BotObservation,BotDecisionTrace} from './bot.js';
import type {BotVariant} from './bot-experiment.js';
import type {BotAttackPolicy} from './bot-policy.js';
// Internal weak registries; never serialized into memory or supplied by the HUD.
export const memoryVariants=new WeakMap<BotMemory,BotVariant>();
export const observationVariants=new WeakMap<BotObservation,BotVariant>();
export const decisionTraces=new WeakMap<BotMemory,BotDecisionTrace>();
export const attackPolicies=new WeakMap<BotMemory,BotAttackPolicy>();
