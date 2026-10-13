import type {BotObservation} from '../src/shared/bot.js';
import {HEX_DIRECTIONS,hexDistance} from '../src/shared/hex.js';
export const OPEN_SPACE_ANALYSIS={depth:4,prefixLimit:10,slots:2,headWeight:.5,trailWeight:.25,walkWeight:.5,clearanceCap:6,stagnationSeconds:12} as const;
// Audit proposal only. Every owner/head/trail query stays in current self visibility.
export function rankOpenBoundaries(obs:BotObservation,existing:readonly number[]){
 const origin=obs.map.cells[obs.self.cellId],owner=obs.self.slot+1,limit=obs.config.botObservationRange,dist=new Map([[origin.id,0]]),queue=[origin.id],old=new Set(existing),trailIds=obs.trails.map(t=>t.cellId);
 for(let i=0;i<queue.length;i++){const id=queue[i],depth=dist.get(id)!;if(depth>=OPEN_SPACE_ANALYSIS.prefixLimit)continue;for(const next of obs.map.cells[id].neighbors)if(next>=0&&obs.owners[next]===owner&&!dist.has(next)&&hexDistance(origin,obs.map.cells[next])<=limit){dist.set(next,depth+1);queue.push(next);}}
 const ranked:any[]=[];
 for(const [id,prefix]of dist){const anchor=obs.map.cells[id];if(!anchor.neighbors.some(n=>n>=0&&hexDistance(origin,obs.map.cells[n])<=limit&&obs.owners[n]!==owner))continue;
  let best:any;
  for(let direction=0;direction<6;direction++){if(anchor.neighbors[direction]<0||obs.owners[anchor.neighbors[direction]]===owner)continue;const forward=HEX_DIRECTIONS[direction],left=HEX_DIRECTIONS[(direction+2)%6],right=HEX_DIRECTIONS[(direction+4)%6],cone:number[]=[];let unknown=0,offMap=0;
   for(let depth=1;depth<=OPEN_SPACE_ANALYSIS.depth;depth++)for(let side=-Math.floor(depth/2);side<=Math.floor(depth/2);side++){const lateral=side<0?left:right,q=anchor.q+forward.q*depth+lateral.q*Math.abs(side),r=anchor.r+forward.r*depth+lateral.r*Math.abs(side),cell=obs.map.byKey.get(q+','+r);if(cell===undefined){offMap++;continue;}if(hexDistance(origin,obs.map.cells[cell])>limit){unknown++;continue;}cone.push(cell);}
   const neutral=cone.filter(c=>obs.owners[c]===0).length;if(!neutral)continue;
   const heads=Math.min(OPEN_SPACE_ANALYSIS.clearanceCap,...obs.others.flatMap(p=>cone.map(c=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[c])))),trails=Math.min(OPEN_SPACE_ANALYSIS.clearanceCap,...trailIds.flatMap(t=>cone.map(c=>hexDistance(obs.map.cells[t],obs.map.cells[c]))));
   const score=neutral+OPEN_SPACE_ANALYSIS.headWeight*heads+OPEN_SPACE_ANALYSIS.trailWeight*trails-OPEN_SPACE_ANALYSIS.walkWeight*prefix;
   const row={id,direction,prefix,neutral,headClearance:heads,trailClearance:trails,score,known:cone.length,unknown,offMap,existing:old.has(id)};if(!best||score>best.score)best=row;
  }if(best)ranked.push(best);
 }
 ranked.sort((a,b)=>b.score-a.score||a.prefix-b.prefix||a.id-b.id);const extra:any[]=[];
 for(const row of ranked){if(row.existing)continue;if(extra.length&&Math.min((row.direction-extra[0].direction+6)%6,(extra[0].direction-row.direction+6)%6)<2)continue;extra.push(row);if(extra.length===OPEN_SPACE_ANALYSIS.slots)break;}
 return {ranked,extra};
}
export function firstExitDirection(obs:BotObservation,path:readonly number[]){let previous=obs.self.cellId;for(const id of path){if(obs.owners[id]!==obs.self.slot+1)return {anchor:previous,direction:obs.map.cells[previous].neighbors.indexOf(id)};previous=id;}return null;}
