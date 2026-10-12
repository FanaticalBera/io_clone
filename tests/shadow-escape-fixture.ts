import {stepMatch} from '../src/shared/game.js';
import {createMatch} from './baseline.js';
import {createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../src/shared/bot.js';
import {botSpecs} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {moveSpeed} from '../src/shared/config.js';

import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
// Freeze the real e4e2f08 ESCAPE scene, so testing current counter/escape policy
// does not depend on finding the same encounter after departure paths change.
// The current classifier, decision and actual cut/return movement still run.
export function runShadowEscapeWitness(){
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/bot-shadow-escape-e4e2f08.json',import.meta.url),'utf8'));
 const revive=(_k:string,v:any)=>v?.$map?new Map(v.$map):v?.$set?new Set(v.$set):v?.$u8?new Uint8Array(v.$u8):v?.$u16?new Uint16Array(v.$u16):v;
 const saved=JSON.parse(inflateSync(Buffer.from(fixture.snapshot,'base64')).toString('utf8'),revive);
 const match=createMatch(saved.state.config,fixture.seed,botSpecs(fixture.bots,0,'bot',{seed:fixture.seed}));Object.assign(match,saved.state);
 const i=saved.slot,bot=match.participants[i],memory=createBotMemory(botSeed(fixture.seed,bot.slot),'combined',createBotIdentity(botSeed(fixture.seed,bot.slot),bot.personality!));Object.assign(memory,saved.memory);memory.nextDecisionTick=match.tick;
 let trace:BotDecisionTrace|undefined;const stop=watchBotDecisions(memory,t=>trace=t);const actualInput=getBotInput(observeBot(match,bot.participantId,'combined'),memory);stop();
 const candidate=trace?.shadow?.candidates.find(c=>c.reason==='CLEAR_KILL_OPPORTUNITY');if(!candidate)throw Error('Frozen ESCAPE scene lost clear opportunity under current classifier');
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
 if(cutTick===null||victim.deathContext?.cause!=='EXISTING_TRAIL_CONTACT'||attacker.lifeState!=='ALIVE'||attacker.trailCells.size||branch.owners[attacker.cellId]!==attacker.slot+1)throw Error('Current physical cut and safe return failed in frozen ESCAPE scene');
 return {match,bot,memory,actualInput,trace:trace!,candidate,branch,attacker,victim,cutTick};
}
