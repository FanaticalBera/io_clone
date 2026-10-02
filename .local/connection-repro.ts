import {createMatch,stepMatch} from '../src/shared/game.js';
import {axialToWorld} from '../src/shared/hex.js';
import type {Participant,Vec} from '../src/shared/model.js';
import {stepSteering,normalizeDirection} from '../src/shared/movement.js';
const m=createMatch({},115,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]);
const [a,b]=m.participants,origin=m.map.cells[a.cellId],bOrigin={...b.position};
console.log(m.participants.map(p=>({id:p.participantId,q:m.map.cells[p.cellId].q,r:m.map.cells[p.cellId].r})));
const target=(q:number,r:number)=>axialToWorld(origin.q+q,origin.r+r);
let seq=0;let aTarget:Vec|null=null,bTarget:Vec|null=null,aOrbit:Vec|null=null,bOrbit:Vec|null=bOrigin,contacts=0;
function tick(){
 const inputs=new Map();
 for(const [p,t,orbit]of [[a,aTarget,aOrbit],[b,bTarget,bOrbit]]as const)if(p.lifeState==='ALIVE'){
  const goal=orbit?{x:orbit.x+45*Math.cos(m.tick/30*4),y:orbit.y+45*Math.sin(m.tick/30*4)}:t;
  if(!goal)continue;
  const direction=normalizeDirection(goal.x-p.position.x,goal.y-p.position.y)!;
  inputs.set(p.participantId,{matchId:m.matchId,lifeId:p.lifeId,seq:++seq,dx:direction.x,dy:direction.y});
  if(p===b){const move=stepSteering(m.map,p.position,p.cellId,p.direction,direction,m.config);if([p.cellId,...move.entries.map(e=>e.cellId)].some(id=>a.trailCells.has(id)))contacts++;}
 }
 const before={trail:[...a.trailCells],territory:a.territoryCount,owners:m.owners.slice()},old=m.eventCounter;stepMatch(m,inputs);
 for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>old)console.log('event',JSON.stringify(e),'A',a.lifeState,'trail',a.trailCells.size,'territory',a.territoryCount,'contacts',contacts,'firstHomeNeighbors',m.map.cells[before.trail[0]??a.cellId].neighbors.filter(id=>id>=0&&m.owners[id]===a.slot+1).length,'anyHomeNeighbors',before.trail.some(id=>m.map.cells[id].neighbors.some(n=>n>=0&&m.owners[n]===a.slot+1)));
}
function drive(p:Participant,t:Vec,limit=500){if(p===a){aTarget=t;aOrbit=null;}else{bTarget=t;bOrbit=null;}let count=0;while(Math.hypot(t.x-p.position.x,t.y-p.position.y)>18&&count++<limit){tick();if(p.lifeState!=='ALIVE')throw new Error('dead '+p.participantId);}if(count>=limit)throw new Error('stuck');}
drive(a,target(-2,2));drive(a,target(-3,2));drive(a,target(-3,0));drive(a,target(-1,-2));drive(a,target(2,-4));aOrbit=target(2,-4);
console.log('A trail', [...a.trailCells].map(id=>[m.map.cells[id].q-origin.q,m.map.cells[id].r-origin.r]));
for(const [q,r]of [[-3,3],[-2,3],[-2,0],[0,0],[0,3],[-3,3]])drive(b,target(q,r));
console.log('FINAL',a.lifeState,a.deathReason,a.territoryCount,contacts);
