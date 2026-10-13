import {BotAttackAudit,type AttackFrame} from '../tests/bot-attack-audit.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import type {BotDecisionTrace} from '../src/shared/bot.js';
const option=(prefix:string,fallback:string)=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)??fallback;
const source=resolve(option('--source=','.')),out=option('--out=',''),seeds=option('--seeds=','4,19,73,11,31,47,101,137').split(',').map(Number),ticks=Number(option('--ticks=','3600'));
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const [game,bot,identity,director,respawn,hex,movement]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','hex','movement'].map(load));
const frames=(m:any,memories:Map<string,any>):AttackFrame[]=>m.participants.filter((p:any)=>p.kind==='BOT').map((p:any)=>{const memory=memories.get(p.participantId),target=m.participants.find((q:any)=>q.slot===memory.attackSlot);return {id:p.participantId,slot:p.slot,personality:p.personality,lifeId:p.lifeId,alive:p.lifeState==='ALIVE',goal:memory.goal,targetId:target?.participantId??null,targetLife:target?.lifeId??null,targetAlive:target?.lifeState==='ALIVE',targetCell:memory.attackTarget,survival:memory.attackSurvival};});
const memoryHash=(memories:Map<string,any>)=>createHash('sha256').update(JSON.stringify([...memories].map(([id,memory])=>[id,{...memory,random:undefined}]),(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v)).digest('hex');
const newEvents=(m:any,before:number)=>m.events.filter((e:any)=>Number(e.eventId.split(':').at(-1))>before);
const snapshot=(m:any)=>m.participants.map((p:any)=>({slot:p.slot,lifeId:p.lifeId,cellId:p.cellId,position:{...p.position},direction:{...p.direction},trail:[...p.trailCells]}));
if(process.argv.includes('--original-case')){
 const m=game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},115,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality:'EXPAND'}]),[human,self]=m.participants,origin=m.map.cells[human.cellId],memory=bot.createBotMemory(1),memories=new Map([['bot',memory]]),audit=new BotAttackAudit(),history:any[]=[],traces:BotDecisionTrace[]=[],route=[[-2,2],[-3,2],[-3,0],[-1,-2],[1,-2],[0,0]];
 let last:BotDecisionTrace|undefined,index=0,seq=0,maxTrail=0,captures=0,attackTicks=0;
 bot.watchBotDecisions(memory,(t:BotDecisionTrace)=>{last=structuredClone(t);traces.push(last);},{shadow:false});
 while(m.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){const [q,r]=route[index],target=hex.axialToWorld(origin.q+q,origin.r+r,m.map.side);
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=movement.normalizeDirection(target.x-human.position.x,target.y-human.position.y),inputs=new Map(),before=m.eventCounter,pre={tick:m.tick,participants:snapshot(m),goal:memory.goal,path:[...memory.path],nextDecisionTick:memory.nextDecisionTick,nextTacticalTick:memory.schedule?.nextTacticalTick};
  inputs.set('human',{matchId:m.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});last=undefined;
  const input=bot.getBotInput(bot.observeBot(m,'bot'),memory);if(input)inputs.set('bot',input);if(memory.goal==='ATTACK')attackTicks++;
  const latest=new Map(last?[['bot',last]]:[]);audit.afterInputs(m.tick,frames(m,memories),latest);
  history.push({...pre,selectedGoal:memory.goal,selectedPath:[...memory.path],nextStrategy:memory.nextDecisionTick,nextTactical:memory.schedule?.nextTacticalTick,input,trace:last??null});
  game.stepMatch(m,inputs);const events=newEvents(m,before);audit.afterEvents(events);captures+=events.filter((e:any)=>e.type==='CAPTURE'&&e.participantId==='human').length;maxTrail=Math.max(maxTrail,human.trailCells.size);
 }
 const result={source,context:{matchSeed:115,memorySeed:1,personality:'EXPAND',humanSlot:0,botSlot:1,mapRadius:22,spawnRadius:2,directGetBotInput:true,identity:false},tick:m.tick,attackTicks,captures,maxTrail,human:{lifeState:human.lifeState,deaths:human.deaths,deathReason:human.deathReason},bot:{kills:self.kills,deaths:self.deaths},audit:audit.snapshot(),history,traces};
 if(out)writeFileSync(out,JSON.stringify(result,null,2));else console.log(JSON.stringify(result));
}else{
 if(!out||seeds.some(s=>!Number.isSafeInteger(s))||!Number.isSafeInteger(ticks)||ticks<1)throw Error('Invalid arguments');
 const reports=[];
 for(const seed of seeds){const m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
  const memories=new Map<string,any>(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))])),latest=new Map<string,BotDecisionTrace>(),audit=new BotAttackAudit(),trajectory=createHash('sha256'),traceHash=createHash('sha256'),aliveFrames:Record<string,number>={};
  for(const [id,memory]of memories)bot.watchBotDecisions(memory,(t:BotDecisionTrace)=>latest.set(id,t),{shadow:false});
  for(let t=0;t<ticks&&m.phase==='RUNNING';t++){latest.clear();const before=m.eventCounter,inputs=director.getBotInputs(m,memories);
   audit.afterInputs(m.tick,frames(m,memories),latest);for(const p of m.participants)if(p.lifeState==='ALIVE')aliveFrames[p.personality]=(aliveFrames[p.personality]??0)+1;
   trajectory.update(JSON.stringify([...inputs]));traceHash.update(JSON.stringify([...latest]));game.stepMatch(m,inputs);audit.afterEvents(newEvents(m,before));
   trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));trajectory.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  }
  const proof={traceHash:traceHash.digest('hex'),memoryHash:memoryHash(memories),nextRng:Object.fromEntries([...memories].map(([id,memory])=>[id,memory.random()]))};
  reports.push({seed,ticks:m.tick,deaths:m.participants.reduce((n:number,p:any)=>n+p.deaths,0),trajectoryHash:trajectory.digest('hex'),equivalenceProof:proof,director:director.botDirector(m).snapshot(),aliveFrames,audit:audit.snapshot()});console.error('Finished attack seed '+seed);
 }
 writeFileSync(out,JSON.stringify({source,seeds,ticks,reports},null,2));
}
