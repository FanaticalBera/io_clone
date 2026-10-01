import {createMatch,stepMatch} from '../dist/server/shared/game.js';
import {writeFile} from 'node:fs/promises';
const results=[];
for(const turnRadiansPerSecond of [6,9]){
 const m=createMatch({turnRadiansPerSecond},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),a=m.participants[0];
 a.position={x:0,y:0};a.cellId=m.map.byKey.get('0,0');a.direction={x:1,y:0};m.owners.fill(1);m.owners[0]=0;a.territoryCount=m.map.cells.length-1;
 const ticks=Math.ceil(Math.PI*m.config.simulationHz/turnRadiansPerSecond),path=[{tick:0,position:{...a.position},direction:{...a.direction}}];
 for(let tick=0;tick<ticks;tick++){
  stepMatch(m,tick===0?new Map([['a',{matchId:m.matchId,lifeId:1,seq:1,dx:-1,dy:0}]]):undefined);
  path.push({tick:m.tick,position:{...a.position},direction:{...a.direction}});
 }
 const width=Math.max(...path.map(p=>p.position.y));
 results.push({turnRadiansPerSecond,moveCellsPerSecond:m.config.moveCellsPerSecond,ticks,milliseconds:ticks*1000/m.config.simulationHz,widthWorldUnits:width,widthCells:width/(Math.sqrt(3)*32),path});
}
await writeFile('evidence/u-turn-radius-comparison.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({path,...summary})=>summary)));
