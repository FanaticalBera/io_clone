import type {MapDefinition} from './model.js';
import {hexDistance,region} from './hex.js';
import {seededRandom,shuffled} from './random.js';
import {MAX_MATCH_SLOTS} from './slots.js';

// Seeded farthest-point placement with a fixed candidate order for ties.
// Each candidate is a complete spawn region; distance >2r prevents overlap.
export function generateStartingAnchors(map:MapDefinition,count:number,spawnRadius:number,seed:number):number[] {
 if(!Number.isInteger(count)||count<1||count>MAX_MATCH_SLOTS||!Number.isInteger(spawnRadius)||spawnRadius<1)throw new Error('Invalid anchor request');
 const points=new Set(map.controlPoints.map(cp=>cp.cellId)),zoneSize=1+3*spawnRadius*(spawnRadius+1);
 const candidates=shuffled(map.cells.filter(c=>{
  if(hexDistance(c,{q:0,r:0})>map.radius-spawnRadius)return false;
  const zone=region(map,c.id,spawnRadius);return zone.length===zoneSize&&zone.every(id=>id>=0&&!points.has(id));
 }).map(c=>c.id),seededRandom(seed^0x51a7));
 const distances=new Float64Array(candidates.length).fill(Infinity),anchors:number[]=[];
 for(let n=0;n<count;n++){
  let best=-1;
  for(let i=0;i<candidates.length;i++)if(distances[i]>2*spawnRadius&&(best<0||distances[i]>distances[best]))best=i;
  if(best<0)throw new Error('Map cannot fit requested starting regions');
  const id=candidates[best];anchors.push(id);
  for(let i=0;i<candidates.length;i++)distances[i]=Math.min(distances[i],hexDistance(map.cells[id],map.cells[candidates[i]]));
 }
 return anchors;
}
