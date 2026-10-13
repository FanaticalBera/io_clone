import type {BotObservation} from './bot.js';
import {HEX_DIRECTIONS,hexDistance} from './hex.js';

// A ranking of extra launch options, never an expansion score or a safety override.
export const BOT_OPEN_SPACE={depth:4,prefixLimit:10,slots:1,headWeight:0.5,trailWeight:0.25,walkWeight:0.5,clearanceCap:6} as const;
export interface OpenBoundary {
 id:number;direction:number;prefix:number;neutral:number;
 headClearance:number;trailClearance:number;score:number;
}
export function openSpaceExpansionAnchor(obs:BotObservation,existing:readonly number[]):OpenBoundary|null {
 const origin=obs.map.cells[obs.self.cellId],owner=obs.self.slot+1,limit=obs.config.botObservationRange;
 const distances=new Map([[origin.id,0]]),queue=[origin.id],excluded=new Set(existing);
 const visible=(id:number)=>hexDistance(origin,obs.map.cells[id])<=limit;
 for(let i=0;i<queue.length;i++){
  const id=queue[i],depth=distances.get(id)!;if(depth>=BOT_OPEN_SPACE.prefixLimit)continue;
  for(const next of obs.map.cells[id].neighbors)if(next>=0&&obs.owners[next]===owner&&!distances.has(next)&&visible(next)){
   distances.set(next,depth+1);queue.push(next);
  }
 }
 let best:OpenBoundary|null=null;
 for(const [id,prefix] of distances){
  if(excluded.has(id))continue;
  const anchor=obs.map.cells[id];
  for(let direction=0;direction<6;direction++){
   const next=anchor.neighbors[direction];if(next<0||!visible(next)||obs.owners[next]===owner)continue;
   const forward=HEX_DIRECTIONS[direction],left=HEX_DIRECTIONS[(direction+2)%6],right=HEX_DIRECTIONS[(direction+4)%6];
   const cone:number[]=[];let neutral=0;
   for(let depth=1;depth<=BOT_OPEN_SPACE.depth;depth++)for(let side=-Math.floor(depth/2);side<=Math.floor(depth/2);side++){
    const lateral=side<0?left:right;
    const q=anchor.q+forward.q*depth+lateral.q*Math.abs(side),r=anchor.r+forward.r*depth+lateral.r*Math.abs(side);
    const cell=obs.map.byKey.get(q+','+r);if(cell===undefined||!visible(cell))continue;
    cone.push(cell);if(obs.owners[cell]===0)neutral++;
   }
   if(!neutral)continue;
   let headClearance:number=BOT_OPEN_SPACE.clearanceCap,trailClearance:number=BOT_OPEN_SPACE.clearanceCap;
   for(const cell of cone){
    for(const head of obs.others)headClearance=Math.min(headClearance,hexDistance(obs.map.cells[head.cellId],obs.map.cells[cell]));
    for(const trail of obs.trails)trailClearance=Math.min(trailClearance,hexDistance(obs.map.cells[trail.cellId],obs.map.cells[cell]));
   }
   const score=neutral+BOT_OPEN_SPACE.headWeight*headClearance+BOT_OPEN_SPACE.trailWeight*trailClearance-BOT_OPEN_SPACE.walkWeight*prefix;
   if(!best||score>best.score||score===best.score&&(prefix<best.prefix||prefix===best.prefix&&id<best.id)){
    best={id,direction,prefix,neutral,headClearance,trailClearance,score};
   }
  }
 }
 return best;
}
