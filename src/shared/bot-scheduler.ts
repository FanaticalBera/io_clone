import type {BotObservation,BotMemory} from './bot.js';
import {botOptions} from './bot-experiment.js';
import {memoryVariants} from './bot-runtime.js';
// 3A keeps the current common cadence and slot phase; no new RNG or profiles.
export function scheduleBotDecision(obs:BotObservation,memory:BotMemory){
  const interval=Math.max(1,Math.round(obs.config.botDecisionMs*obs.config.simulationHz/1000));
  // First life plan and perimeter recovery stay immediate. Normal decisions
  // align to slot phases without consuming AI/cosmetic RNG. Regular cadence
  // remains interval ticks; the first alignment can shorten one interval.
  const phased=botOptions(memoryVariants.get(memory)??'combined').phase&&obs.self.kind==='BOT',offset=obs.self.slot%interval;
  memory.nextDecisionTick=obs.tick+(phased?((offset-obs.tick%interval+interval)%interval||interval):interval);
}
