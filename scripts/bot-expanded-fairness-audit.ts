import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-expanded-attack-baseline-v2'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const load=(name:string)=>import(pathToFileURL(resolve(protocol.source,'src/shared',name+'.ts')).href);
const [game,bot,identity,director]=await Promise.all(['game','bot','bot-identity','bot-director'].map(load));
const canonical=(v:any)=>JSON.stringify(v,(_k,x)=>x instanceof Map?[...x]:x instanceof Set?[...x]:ArrayBuffer.isView(x)?Array.from(x as Uint8Array):x);
const checks=[];
for(const memorySeed of protocol.axes.memorySeeds)for(const personality of protocol.axes.personalities){
 const evaluate=(mode:string)=>{
  const match=game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},2,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality}]),[human]=match.participants;
  if(mode==='HIDDEN_INTENT')human.targetDirection={x:-human.direction.x,y:-human.direction.y};
  if(mode==='HIDDEN_POSE'){
   human.cellId=[...human.spawnCells].find((id:any)=>id!==human.cellId);human.position={...match.map.cells[human.cellId].center};human.direction={x:-human.direction.y,y:human.direction.x};
  }
  const memory=bot.createBotMemory(memorySeed,'combined',identity.createBotIdentity(memorySeed,personality)),observation=bot.observeBot(match,'bot');
  assert.equal(observation.others.length,0);assert.equal(observation.trails.length,0);
  const input=director.getBotInputs(match,new Map([['bot',memory]]));
  return {input:canonical([...input]),memory:canonical(memory),nextRng:memory.random(),director:director.botDirector(match).snapshot()};
 };
 const control=evaluate('CONTROL');assert.deepEqual(evaluate('HIDDEN_INTENT'),control);assert.deepEqual(evaluate('HIDDEN_POSE'),control);
 checks.push({memorySeed,personality,hiddenIntentEqual:true,hiddenPoseEqual:true,memoryHash:createHash('sha256').update(control.memory).digest('hex')});
}
writeFileSync(resolve(root,'far-fairness.json'),JSON.stringify({matchSeed:2,initialDistance:17,checks,scope:'32 fixed t0 judgments: unobserved human intent/pose do not affect bot input, memory, action RNG or reservation state. Not a proof that complete future games stay identical when human motion differs.'},null,2)+'\n');console.log('32 distant-pose/intent fairness checks passed');
