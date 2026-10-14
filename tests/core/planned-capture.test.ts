import {describe,it,expect} from 'vitest';
import {plannedCapture,plannedCaptureFull} from '../../src/shared/bot-strategy.js';
import {createMap} from '../../src/shared/hex.js';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory} from '../../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../../src/shared/bot-identity.js';
import {getBotInputs} from '../../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../../src/shared/safe-bot-respawn.js';
import {seededRandom} from '../../src/shared/random.js';
import type {BotObservation} from '../../src/shared/bot.js';
import type {MapDefinition} from '../../src/shared/model.js';

// Performance PRD stage 3 (C2): the incremental enclosure must equal the frozen full-map flood exactly.
const obsFor=(map:MapDefinition,owners:Uint8Array,slot:number)=>({map,owners,self:{slot}}) as unknown as BotObservation;
function randomWalk(map:MapDefinition,start:number,length:number,random:()=>number):number[]{
 const path=[start];let cur=start;
 for(let i=1;i<length;i++){const next=map.cells[cur].neighbors.filter(n=>n>=0);cur=next[Math.floor(random()*next.length)];path.push(cur);}
 return path;
}
function paths(map:MapDefinition,owners:Uint8Array,owner:number,random:()=>number,count:number):number[][]{
 const own=map.cells.filter(c=>owners[c.id]===owner).map(c=>c.id),result:number[][]=[[]];
 for(let i=0;i<count;i++){
  const start=own.length&&random()<.8?own[Math.floor(random()*own.length)]:Math.floor(random()*map.cells.length);
  result.push(randomWalk(map,start,1+Math.floor(random()*40),random));
  // Scattered cells and duplicates exercise the same path twice and non-contiguous blocks.
  if(i%5===0)result.push(Array.from({length:12},()=>Math.floor(random()*map.cells.length)).flatMap(id=>[id,id]));
 }
 return result;
}
describe('Performance PRD C2: plannedCapture equals the full flood',()=>{
 it('matches on real bot match states across owners and many candidate paths',()=>{
  for(const seed of [4,137]){
   const m=createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
   const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
   const random=seededRandom(seed);let checked=0;
   for(let t=1;t<=1500;t++){stepMatch(m,getBotInputs(m,memories));
    if(t%300)continue;
    for(const p of m.participants){const obs=obsFor(m.map,m.owners,p.slot);
     for(const path of [[...p.trailCells],...paths(m.map,m.owners,p.slot+1,random,25)]){expect(plannedCapture(obs,path)).toEqual(plannedCaptureFull(obs,path));checked++;}}
   }
   expect(checked).toBeGreaterThan(1000);
  }
 });
 it('matches on random ownership patterns with holes, islands and edge seeds, and refreshes its cache when owners change',()=>{
  const map=createMap(8,32),random=seededRandom(99);
  for(let round=0;round<200;round++){
   const owners=new Uint8Array(map.cells.length);
   // Blobs of a few owners, so enclosures, holes inside territory and edge-touching land all occur.
   for(let blob=0;blob<6;blob++){const owner=1+Math.floor(random()*3);for(const id of randomWalk(map,Math.floor(random()*map.cells.length),5+Math.floor(random()*60),random))owners[id]=owner;}
   for(const owner of [1,2,3]){const obs=obsFor(map,owners,owner-1);
    for(const path of paths(map,owners,owner,random,15))expect(plannedCapture(obs,path),'round '+round+' owner '+owner).toEqual(plannedCaptureFull(obs,path));}
   // Mutating the same array must not reuse a stale cached flood.
   owners[Math.floor(random()*owners.length)]^=1;const obs=obsFor(map,owners,0),path=paths(map,owners,1,random,1)[1]!;
   expect(plannedCapture(obs,path)).toEqual(plannedCaptureFull(obs,path));
  }
 });
});
