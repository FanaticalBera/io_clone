import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createBotMemory,getBotInput,watchBotDecisions} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
const arg=(p:string)=>process.argv.find(a=>a.startsWith(p))?.slice(p.length);
const before=arg('--before='),reference=arg('--reference='),out=arg('--out=');
if(!before||!reference||!out)throw Error('Provide --before, --reference and --out');
const load=(file:string)=>import(pathToFileURL(resolve(before,'src/shared',file+'.ts')).href);
const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));
const seed=137,m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
const draws=new Map<string,number>(),memories=new Map<string,any>(m.participants.map((p:any)=>{const mem=bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality)),rng=mem.random;draws.set(p.participantId,0);mem.random=()=>{draws.set(p.participantId,draws.get(p.participantId)!+1);return rng();};return [p.participantId,mem];}));
const cases:any[]=[],hash=createHash('sha256');
for(let i=0;i<3600;i++){
 for(const slot of m.tick===3591?[9]:m.tick===3592?[4]:[]){const p=m.participants[slot],original=memories.get(p.participantId),clone=createBotMemory(botSeed(seed,slot),'combined',createBotIdentity(botSeed(seed,slot),p.personality)),rng=clone.random;for(let draw=0;draw<draws.get(p.participantId)!;draw++)rng();Object.assign(clone,structuredClone({...original,random:null}));clone.random=rng;
 let trace:any;watchBotDecisions(clone,t=>trace=t,{shadow:false});const obs=bot.observeBot(m,p.participantId),input=getBotInput(obs,clone,false,director.botDirector(m).policy(p.participantId));cases.push({tick:m.tick,slot,originalLifeId:p.lifeId,goal:clone.goal,reason:trace.reason,danger:trace.risk.danger,selectedNonSurvival:trace.attacks.filter((a:any)=>a.reason==='SELECTABLE'&&a.survival===false).map((a:any)=>({slot:a.slot,target:a.target,seconds:a.seconds,survival:a.survival})),rngDrawsBefore:draws.get(p.participantId),input});
 if(clone.goal!=='ESCAPE'||trace.reason!=='DANGER'||!trace.risk.danger)throw Error('Original duel state did not retreat after guard '+slot);
 }
 const inputs=director.getBotInputs(m,memories);hash.update(JSON.stringify([...inputs]));game.stepMatch(m,inputs);hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
}
const ref=JSON.parse(readFileSync(reference,'utf8')).reports.find((r:any)=>r.seed===137),actual=hash.digest('hex');if(actual!==ref.trajectoryHash)throw Error('Frozen trajectory changed');writeFileSync(out,JSON.stringify({seed,source:before,ticks:3600,frozenTrajectoryMatches:true,cases,notes:'New decision evaluated in the exact old state with cloned emotion/path and an independent action RNG advanced to the same draw count. The frozen production replay remains unchanged. Final life outcomes belong to the separate new trajectory.'},null,2));console.log(JSON.stringify({frozenTrajectoryMatches:true,cases}));
