import {it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,observeBot,plannedCapture,type BotObservation} from '../../src/shared/bot.js';
import {seededRandom} from '../../src/shared/random.js';
// Original full flood semantics, retained as an independent oracle for storage reuse.
function reference(obs:BotObservation,path:number[]):number[]{
 const owner=obs.self.slot+1,blocked=new Set(path),visited=new Uint8Array(obs.map.cells.length),queue:number[]=[];
 for(const c of obs.map.cells)if(obs.owners[c.id]!==owner&&!blocked.has(c.id)&&c.neighbors.includes(-1)){visited[c.id]=1;queue.push(c.id);}
 for(let head=0;head<queue.length;head++)for(const id of obs.map.cells[queue[head]].neighbors){if(id<0||visited[id]||obs.owners[id]===owner||blocked.has(id))continue;visited[id]=1;queue.push(id);}
 return obs.map.cells.filter(c=>obs.owners[c.id]!==owner&&!visited[c.id]).map(c=>c.id);
}
it('reused candidate flood buffers preserve the original global enclosure and cell order across maps/slots',()=>{
 for(const [radius,count]of [[22,8],[56,16]]){
  const m=createMatch({mapRadius:radius,maxSlots:count},4,botSpecs(count)),random=seededRandom(19);
  for(let repeat=0;repeat<12;repeat++)for(const slot of [0,count-1]){
   const owner=slot+1;for(let id=0;id<m.owners.length;id++)m.owners[id]=random()<.3?owner:random()<.3?1:0;
   const obs=observeBot(m,m.participants[slot].participantId),path=Array.from({length:24},()=>Math.floor(random()*m.owners.length));
   expect(plannedCapture(obs,path)).toEqual(reference(obs,path));expect(plannedCapture(obs,[])).toEqual(reference(obs,[]));
  }
 }
});
