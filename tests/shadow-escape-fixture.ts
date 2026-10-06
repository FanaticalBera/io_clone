import {stepMatch} from '../src/shared/game.js';
import {createMatch} from './baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {moveSpeed} from '../src/shared/config.js';

// Frozen original AI counterfactual witness; new timing is measured separately.
// Phase 3 expansion changes emergent encounters. Seed 5 supplies a real
// ESCAPE cut-and-return witness at tick 229 (cut tick 240). All conditions
// remain verified through normal movement and the independent branch.
export function runShadowEscapeWitness(seed=5){
 const match=createMatch({},seed,botSpecs(8)),memories=match.participants.map(p=>createBotMemory(seed+p.slot,'baseline')),traces:(BotDecisionTrace|undefined)[]=Array(8);
 const stops=memories.map((memory,i)=>watchBotDecisions(memory,t=>{traces[i]=t;}));
 const attempts={escape:0,clear:0,cut:0};
 // Search normal decisions rather than relying on a tick from an old death
 // timeline. Neither game state nor BOT policy/memory is injected.
 try{while(match.tick<7200){const inputs=new Map();
  for(const [i,bot] of match.participants.entries()){
   traces[i]=undefined;const memory=memories[i],actualInput=getBotInput(observeBot(match,bot.participantId,'baseline'),memory);if(actualInput)inputs.set(bot.participantId,actualInput);
   const trace=traces[i] as BotDecisionTrace|undefined;if(trace?.from==='ESCAPE')attempts.escape++;if(trace?.from!=='ESCAPE'||trace.to!=='ESCAPE'||trace.shadow?.missedReason!=='GOAL_ESCAPE_BLOCK')continue;
   const candidate=trace.shadow.candidates.find(c=>c.reason==='CLEAR_KILL_OPPORTUNITY');if(!candidate)continue;attempts.clear++;
   const branch=structuredClone(match),attacker=branch.participants[i],victim=branch.participants.find(p=>p.slot===candidate.slot)!;
 // This branch alone follows the shadow path, with every other head retaining
 // its observed steering intent. The production match and goal remain intact.
 let path=[...candidate.path],seq=memory.seq,cutTick:number|null=null;
 const reach=moveSpeed(branch.config)/branch.config.turnRadiansPerSecond+moveSpeed(branch.config)/branch.config.simulationHz;
 const advance=()=>{
  while(path.length&&attacker.cellId===path[0]&&Math.hypot(branch.map.cells[path[0]].center.x-attacker.position.x,branch.map.cells[path[0]].center.y-attacker.position.y)<reach)path.shift();
  const target=branch.map.cells[path[0]??attacker.cellId].center,d=normalizeDirection(target.x-attacker.position.x,target.y-attacker.position.y)??attacker.direction;
  stepMatch(branch,new Map([[attacker.participantId,{matchId:branch.matchId,lifeId:attacker.lifeId,seq:++seq,dx:d.x,dy:d.y}]]));
 };
 const attackDeadline=match.tick+Math.ceil(((candidate.attackSeconds??2)+.35)*branch.config.simulationHz),returnDeadline=match.tick+Math.ceil(((candidate.returnSeconds??6)+.5)*branch.config.simulationHz);
 while(branch.tick<attackDeadline&&victim.lifeState==='ALIVE'&&attacker.lifeState==='ALIVE')advance();
 if(victim.lifeState==='DEAD_WAIT'){cutTick=branch.tick;path=[...candidate.back];while(branch.tick<returnDeadline&&attacker.lifeState==='ALIVE'&&attacker.trailCells.size)advance();}
   if(cutTick!==null)attempts.cut++;if(cutTick!==null&&victim.deathContext?.cause==='EXISTING_TRAIL_CONTACT'&&attacker.lifeState==='ALIVE'&&attacker.trailCells.size===0&&branch.owners[attacker.cellId]===attacker.slot+1)return {match,bot,memory,actualInput,trace,candidate,branch,attacker,victim,cutTick};
  }stepMatch(match,inputs);
 }}finally{for(const stop of stops)stop();}
 throw new Error('No normal ESCAPE shadow cut-and-return witness found '+JSON.stringify(attempts));
}
