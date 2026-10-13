import type {BotObservation,BotMemory} from './bot.js';
// 3A extracts the existing predicates only; invalidation semantics are unchanged.
export function botPlanValidity(obs:BotObservation,memory:BotMemory){
  const stuck=obs.tick-memory.lastProgressTick>=2*obs.config.simulationHz;
  const attacking=memory.goal==='ATTACK';
  const targetPresent=obs.trails.some(t=>t.cellId===memory.attackTarget&&t.slot===memory.attackSlot);
  // Preserve a viable cut instead of switching to each new urgent candidate.
  // A vanished cell may retarget only the same still-observed victim.
  const homeLost=memory.path.length>0&&obs.owners[memory.path.at(-1)!]!==obs.self.slot+1;
  return {stuck,attacking,targetPresent,homeLost};
}
