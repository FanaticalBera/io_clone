import type {MatchState} from '../src/shared/model.js';
import {clearTrail,neutralizeTerritory,setOwner,addTrail} from '../src/shared/territory.js';
import {hexDistance} from '../src/shared/hex.js';
/** Test/development only: bridge theft, surviving home, disconnected island. */
export function prepareTerritorySteal(m:MatchState){
 if(m.phase!=='RUNNING')throw Error('Feedback fixture requires a running match');
 m.events=[];m.tick++;
 for(const p of m.participants){clearTrail(m,p);neutralizeTerritory(m,p);p.lifeState='FINISHED';p.spawnCells.clear();p.protectedUntilTick=0;}
 const capturer=m.participants.find(p=>p.slot===0)!,victim=m.participants.find(p=>p.slot===15)!;
 const id=(q:number,r:number)=>m.map.byKey.get(q+','+r)!;
 capturer.lifeState='ALIVE';capturer.cellId=id(0,-4);capturer.position={...m.map.cells[capturer.cellId].center};
 victim.lifeState='ALIVE';victim.cellId=id(-9,0);victim.position={...m.map.cells[victim.cellId].center};
 for(const c of m.map.cells){
  if(hexDistance(c,{q:-9,r:0})<=3||hexDistance(c,{q:9,r:0})<=4||(c.r===0&&c.q>=-6&&c.q<=5))setOwner(m,c.id,16);
  if(hexDistance(c,{q:0,r:-4})<=1)setOwner(m,c.id,1);
 }
 const targets=m.map.cells.filter(c=>hexDistance(c,{q:0,r:0})<=2).map(c=>c.id);
 for(const cell of targets)addTrail(m,capturer,cell);
 return {capturer,victim,targets};
}
