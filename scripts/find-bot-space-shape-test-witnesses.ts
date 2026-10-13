import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runMediumAttack} from '../tests/medium-attack-fixture.js';
import {runIdleAttack} from '../tests/bot-idle-attack-fixture.js';
import {getBotInput,observeBot} from '../src/shared/bot.js';
import {stepMatch} from '../src/shared/game.js';
const root=resolve('../bot-space-shape-adoption'),out=resolve(root,'test-witnesses.json');if(existsSync(out))throw Error('Preserve witness search');
const protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
for(const [file,hash]of Object.entries(protocol.arms.find((a:any)=>a.name==='candidate').sourceHashes))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash);
const compact=(f:ReturnType<typeof runMediumAttack>)=>({tick:f.match.tick,attackTicks:f.attackTicks,maxTrail:f.maxTrail,captures:f.captures,kills:f.bot.kills,humanState:f.human.lifeState,reason:f.human.deathReason,cause:f.match.events.find(e=>e.type==='DEATH'&&e.participantId===f.human.participantId)?.deathContext?.cause,botExposed:f.bot.trailCells.size});
const valid=(f:ReturnType<typeof runMediumAttack>)=>f.attackTicks>0&&f.maxTrail>=2&&f.maxTrail<=6&&f.captures===0&&f.human.lifeState==='ELIMINATED'&&f.human.deathReason==='TRAIL_CUT'&&f.human.deaths===1&&f.bot.kills===1&&f.human.trailCells.size===0&&!f.match.trailMasks.some(mask=>(mask&(1<<f.human.slot))!==0)&&f.match.events.some(e=>e.type==='DEATH'&&e.participantId===f.human.participantId&&e.killerId===f.bot.participantId&&e.deathContext?.cause==='EXISTING_TRAIL_CONTACT');
const roles=['DEFEND','ATTACK','SEEK_POINT','EXPAND']as const,attempts:any[]=[],originals:any[]=[],positive:any[]=[];
for(const role of roles)for(const reverse of [false,true]){
 originals.push({role,reverse,...compact(runMediumAttack(role,reverse,false,role==='EXPAND'?3:undefined))});
 let found=false;
 for(let seed=1;seed<=256;seed++){
  const f=runMediumAttack(role,reverse,false,seed),row={role,reverse,memorySeed:seed,...compact(f),valid:valid(f)};attempts.push(row);
  if(row.valid){positive.push(row);found=true;break;}
 }
 assert(found,'No positive short-loop witness '+role+'/'+reverse);
}
let returnWitness:any;
for(let seed=1;seed<=256;seed++){
 const f=runMediumAttack('ATTACK',false,false,seed),before=compact(f);if(!valid(f)||!f.bot.trailCells.size)continue;
 let goalsSafe=true,steps=0;
 for(;steps<90&&f.bot.trailCells.size;steps++){
  const input=getBotInput(observeBot(f.match,f.bot.participantId),f.memory);goalsSafe&&=['ATTACK','RETURN','ESCAPE'].includes(f.memory.goal);
  stepMatch(f.match,new Map(input?[[f.bot.participantId,input]]:[]));
 }
 if(goalsSafe&&f.bot.lifeState==='ALIVE'&&f.bot.trailCells.size===0&&f.match.owners[f.bot.cellId]===f.bot.slot+1){returnWitness={memorySeed:seed,before,steps,goalsSafe,finalOwned:true};break;}
}
assert(returnWitness,'No real exposed post-kill return witness');
const idle=(salt:number)=>{const f=runIdleAttack(123,salt),death=f.match.events.find(e=>e.type==='DEATH'&&e.participantId===f.human.participantId),valid=f.longestTrail>=5&&f.attackTicks>0&&f.human.lifeState==='ELIMINATED'&&f.human.deathReason==='TRAIL_CUT'&&f.human.deaths===1&&!!death?.killerId&&(f.bots.find(p=>p.participantId===death.killerId)?.kills??0)>=1&&f.human.trailCells.size===0&&f.match.trailMasks.every(mask=>(mask&1)===0);return {seed:123,memorySalt:salt,tick:f.match.tick,longestTrail:f.longestTrail,attackTicks:f.attackTicks,reason:f.human.deathReason,killer:death?.killerId,valid};};
const originalIdle=idle(0);let idleWitness:any;
for(let salt=1;salt<=64;salt++){const r=idle(salt);if(r.valid){idleWitness=r;break;}}assert(idleWitness,'No same-spawn idle cut witness');
const result={searchRule:'Positive test witnesses only: ordered memorySeed1..256 per role/unchanged spawn role,then first ATTACK witness with an exposed post-kill line and original90tick return checks;idle match123 unchanged,first XOR memorySalt1..64. Not an attack success-rate audit. Fixed1024 axes and results remain untouched.',originals,originalIdle,positive,returnWitness,idleWitness,attempts};
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({positive,returnWitness,idleWitness},null,2));
