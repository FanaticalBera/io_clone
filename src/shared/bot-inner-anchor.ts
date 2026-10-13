import type {BotObservation} from './bot.js';
import {hexDistance} from './hex.js';

// A head working the outer rim only sees rim-side borders, and an inward loop
// from them must turn back toward the wall to close, where the perimeter guard
// cuts it. Offer one owned border on the inner side as an extra launch option.
// It is ranked here only; every expansion filter and score still applies.
export const BOT_INNER_ANCHOR={wallBand:4,minRingGain:3,prefixLimit:10} as const;
export function innerExpansionAnchor(obs:BotObservation,existing:readonly number[]):number|null {
 const center={q:0,r:0},ring=(id:number)=>obs.map.radius-hexDistance(obs.map.cells[id],center);
 const headRing=ring(obs.self.cellId);if(headRing>BOT_INNER_ANCHOR.wallBand)return null;
 const owner=obs.self.slot+1,excluded=new Set(existing),distances=new Map([[obs.self.cellId,0]]),queue=[obs.self.cellId];
 for(let i=0;i<queue.length;i++){
  const id=queue[i],depth=distances.get(id)!;if(depth>=BOT_INNER_ANCHOR.prefixLimit)continue;
  for(const next of obs.map.cells[id].neighbors)if(next>=0&&obs.owners[next]===owner&&!distances.has(next)){distances.set(next,depth+1);queue.push(next);}
 }
 let best:number|null=null,bestRing=-1,bestPrefix=Infinity;
 for(const [id,prefix] of distances){
  if(excluded.has(id)||!obs.map.cells[id].neighbors.some(n=>n>=0&&obs.owners[n]!==owner))continue;
  const r=ring(id);if(r<headRing+BOT_INNER_ANCHOR.minRingGain)continue;
  if(r>bestRing||r===bestRing&&(prefix<bestPrefix||prefix===bestPrefix&&id<best!)){best=id;bestRing=r;bestPrefix=prefix;}
 }
 return best;
}
