import {createMatch,stepMatch} from '../src/shared/game.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {watchDeaths,type DeathTrace} from '../src/shared/life.js';
import type {Vec,Participant} from '../src/shared/model.js';

export function runContactMovement(scenario:'simultaneous-neutral'|'existing-line'|'near-miss'|'enemy-territory',reverse=false){
 const m=createMatch({},reverse?17:115,[{participantId:'A',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'B',slot:1,nickname:'B',kind:'HUMAN'}]);
 const a=m.participants[reverse?1:0],b=m.participants[reverse?0:1],goal=m.map.byKey.get('-15,-3')!,target=m.map.cells[goal].center,deaths:DeathTrace[]=[],journal:unknown[]=[];
 watchDeaths(m,trace=>deaths.push(trace));let seq=0;
 const tick=(da:Vec,db:Vec)=>{const before={tick:m.tick,cells:[a.cellId,b.cellId],owners:[m.owners[a.cellId],m.owners[b.cellId]],goalOwner:m.owners[goal],goalMask:m.trailMasks[goal],trails:[[...a.trailCells],[...b.trailCells]],positions:[{...a.position},{...b.position}]};
  stepMatch(m,new Map([[a.participantId,{matchId:m.matchId,lifeId:a.lifeId,seq:++seq,dx:da.x,dy:da.y}],[b.participantId,{matchId:m.matchId,lifeId:b.lifeId,seq:++seq,dx:db.x,dy:db.y}]]));journal.push(before);
 };
 if(scenario==='enemy-territory'){
  const homes=[{...a.position},{...b.position}],orbit=(p:Participant,center:Vec)=>{const angle=Math.atan2(p.position.y-center.y,p.position.x-center.x)+.5;return normalizeDirection(center.x+45*Math.cos(angle)-p.position.x,center.y+45*Math.sin(angle)-p.position.y)!;};
  for(const waypoint of [target,homes[1]]){let guard=0;while(Math.hypot(waypoint.x-b.position.x,waypoint.y-b.position.y)>18){if(guard++>200)throw new Error('Claim route timeout');tick(orbit(a,homes[0]),normalizeDirection(waypoint.x-b.position.x,waypoint.y-b.position.y)!);if(deaths.length)throw new Error('Claim setup contact');}}
  if(m.owners[goal]!==b.slot+1||b.trailCells.size)throw new Error('Normal movement did not claim the meeting cell');
 }
 let nearest=Infinity;
 for(let i=0;i<90&&a.lifeState==='ALIVE'&&b.lifeState==='ALIVE';i++){
  const theta=scenario==='existing-line'?Math.PI:-.45341169390551095;
  const bTarget=scenario==='near-miss'?m.map.cells[m.map.byKey.get('-15,-2')!].center:target;
  const da=normalizeDirection(target.x-a.position.x,target.y-a.position.y)!,db=scenario==='enemy-territory'||scenario==='near-miss'||i>=6?normalizeDirection(bTarget.x-b.position.x,bTarget.y-b.position.y)!:{x:Math.cos(theta),y:Math.sin(theta)};
  tick(da,db);nearest=Math.min(nearest,Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y));
  if(scenario==='near-miss'&&i===19)break;
 }
 return {m,a,b,goal,deaths,journal,nearest};
}
