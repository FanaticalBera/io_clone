import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {moveSpeed} from '../src/shared/config.js';

export function runShadowEscapeWitness(){
 const seed=115,match=createMatch({},seed,botSpecs(8)),memories=match.participants.map(p=>createBotMemory(seed+p.slot));
 // Ordinary policy and movement create this state. No owners, trails, body
 // positions or memory goals are injected to create the opportunity.
 while(match.tick<3351){const inputs=new Map(match.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(match,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(match,inputs);}
 const bot=match.participants[4],memory=memories[4];let trace:BotDecisionTrace|undefined;
 const stop=watchBotDecisions(memory,t=>{trace=t;});const actualInput=getBotInput(observeBot(match,bot.participantId),memory);stop();
 if(!trace?.shadow)throw new Error('missing normal escape decision');
 const candidate=trace.shadow.candidates.find(c=>c.reason==='CLEAR_KILL_OPPORTUNITY')!;
 const branch=structuredClone(match),attacker=branch.participants[4],victim=branch.participants.find(p=>p.slot===candidate.slot)!;
 // This branch alone follows the shadow path, with every other head retaining
 // its observed steering intent. The production match and goal remain intact.
 let path=[...candidate.path],seq=memory.seq,cutTick:number|null=null;
 const reach=moveSpeed(branch.config)/branch.config.turnRadiansPerSecond+moveSpeed(branch.config)/branch.config.simulationHz;
 const advance=()=>{
  while(path.length&&attacker.cellId===path[0]&&Math.hypot(branch.map.cells[path[0]].center.x-attacker.position.x,branch.map.cells[path[0]].center.y-attacker.position.y)<reach)path.shift();
  const target=branch.map.cells[path[0]??attacker.cellId].center,d=normalizeDirection(target.x-attacker.position.x,target.y-attacker.position.y)??attacker.direction;
  stepMatch(branch,new Map([[attacker.participantId,{matchId:branch.matchId,lifeId:attacker.lifeId,seq:++seq,dx:d.x,dy:d.y}]]));
 };
 while(branch.tick<match.tick+30&&victim.lifeState==='ALIVE'&&attacker.lifeState==='ALIVE')advance();
 if(victim.lifeState==='DEAD_WAIT'){cutTick=branch.tick;path=[...candidate.back];while(branch.tick<match.tick+90&&attacker.lifeState==='ALIVE'&&attacker.trailCells.size)advance();}
 return {match,bot,memory,actualInput,trace,candidate,branch,attacker,victim,cutTick};
}
