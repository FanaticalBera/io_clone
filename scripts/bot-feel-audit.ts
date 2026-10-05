import {BotOutcomeTracker,summarizeAttackEpisodes} from '../tests/bot-outcome-tracker.js';
import {BotExpansionTracker} from '../tests/bot-expansion-tracker.js';
import type {BotDecisionTrace} from '../src/shared/bot.js';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions} from '../src/shared/bot.js';
import {hexDistance} from '../src/shared/hex.js';

// Normal spawns and shared simulation only. Run the same seeds before/after.
const reports=[];
for(const seed of (process.argv.includes('--extended')?[4,19,73,115,17,81,32,123]:[4,19,73])){
 const match=createMatch({},seed,botSpecs(8)),memories=match.participants.map((_,i)=>createBotMemory(seed+i));
 const trackers=memories.map(()=>new BotOutcomeTracker()),latest:(BotDecisionTrace|undefined)[]=memories.map(()=>undefined);
 const expansions=memories.map(()=>new BotExpansionTracker()),lastLargeSteal=memories.map(()=>-Infinity),largeConsecutiveSteals=memories.map(()=>0),exposedDeaths=memories.map(()=>0);
 const stats=match.participants.map(p=>({personality:p.personality,frames:0,exposure:0,homeDistance:0,captures:0,gained:0,stolen:0,entered:0,exited:0,retargeted:0,attackFrames:0,escapes:0,returns:0,walls:0,reasons:{} as Record<string,number>}));
 match.participants.forEach((p,i)=>{let target:number|null=null;watchBotDecisions(memories[i],t=>{const s=stats[i];latest[i]=t;
  if(t.to==='ATTACK'){s.attackFrames++;if(t.from!=='ATTACK')s.entered++;else if(target!==t.attackTarget)s.retargeted++;}
  if(t.from==='ATTACK'&&t.to!=='ATTACK')s.exited++;
  if(t.from!=='RETURN'&&t.to==='RETURN')s.returns++;
  if(t.from!=='ESCAPE'&&t.to==='ESCAPE')s.escapes++;
  for(const a of t.attacks)s.reasons[a.reason]=(s.reasons[a.reason]??0)+1;target=t.attackTarget;
 });});
 for(let tick=0;tick<(process.argv.includes('--extended')?3600:900);tick++){
  const before=match.eventCounter,owners=match.owners.slice(),inputs=new Map(),exposed=match.participants.map(p=>p.trailCells.size>0);
  match.participants.forEach((p,i)=>{latest[i]=undefined;const obs=observeBot(match,p.participantId),input=getBotInput(obs,memories[i]);if(input)inputs.set(p.participantId,input);trackers[i].before(match,p,memories[i],latest[i]);
   if(p.lifeState==='ALIVE'){const s=stats[i];s.frames++;s.exposure+=p.trailCells.size;s.homeDistance+=Math.min(...match.map.cells.filter(c=>owners[c.id]===p.slot+1).map(c=>hexDistance(c,match.map.cells[p.cellId])));}
   expansions[i].before(match,p,latest[i]);
  });stepMatch(match,inputs);
  match.participants.forEach((p,i)=>trackers[i].after(match,p,before));
  match.participants.forEach((p,i)=>{expansions[i].after(match,p,before,owners);if(exposed[i]&&p.lifeState!=='ALIVE')exposedDeaths[i]++;});
  for(const e of match.events)if(Number(e.eventId.split(':').at(-1))>before&&e.type==='DEATH'&&e.reason==='WALL_HIT')stats[match.participants.findIndex(p=>p.participantId===e.participantId)].walls++;
  for(const e of match.events)if(Number(e.eventId.split(':').at(-1))>before&&e.type==='CAPTURE'){const i=match.participants.findIndex(p=>p.participantId===e.participantId);stats[i].captures++;stats[i].gained+=e.amount??0;}
  for(let id=0;id<owners.length;id++)if(owners[id]&&match.owners[id]&&owners[id]!==match.owners[id])stats[match.owners[id]-1].stolen++;
  match.participants.forEach((p,i)=>{const stolen=owners.reduce((sum,o,id)=>sum+Number(o!==0&&o!==p.slot+1&&match.owners[id]===p.slot+1),0);if(stolen>=12){if(match.tick-lastLargeSteal[i]<=15*match.config.simulationHz)largeConsecutiveSteals[i]++;lastLargeSteal[i]=match.tick;}});
 }
 reports.push({seed,bots:stats.map((s,i)=>({...s,traits:memories[i].traits,...summarizeAttackEpisodes(trackers[i].episodes),episodes:trackers[i].episodes,expansions:expansions[i].episodes,shapesGenerated:expansions[i].generated,shapesAccepted:expansions[i].accepted,largeConsecutiveSteals:largeConsecutiveSteals[i],exposedDeaths:exposedDeaths[i],meanCapture:s.gained/(s.captures||1),meanExposure:s.exposure/(s.frames||1),meanHomeDistance:s.homeDistance/(s.frames||1),kills:match.participants[i].kills,deaths:match.participants[i].deaths}))});
}
console.log(JSON.stringify(reports,null,2));
