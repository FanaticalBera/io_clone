import type {MatchState,MapDefinition,PublicParticipant,DirectionInput,Personality} from './model.js';
import {hexDistance} from './hex.js';
import {seededRandom} from './random.js';
import {normalizeDirection} from './movement.js';
import {moveSpeed} from './config.js';
import {GAME_MODES,type GameModeConfig} from './modes.js';
export interface BotObservation {
 matchId:string; tick:number; config:MatchState['config']; map:MapDefinition; owners:Uint8Array;gameMode:GameModeConfig;
 self:PublicParticipant; ownTrail:number[]; others:PublicParticipant[]; trails:{cellId:number;slot:number}[];
}
export interface BotMemory { path:number[]; nextDecisionTick:number; seq:number; random:()=>number; goal:string; lastCell:number; lastProgressTick:number; plannedLifeId:number }
export function createBotMemory(seed:number):BotMemory {
 return {path:[],nextDecisionTick:0,seq:0,random:seededRandom(seed),goal:'EXPAND',lastCell:-1,lastProgressTick:0,plannedLifeId:0};
}
function publicParticipant(p:MatchState['participants'][number]):PublicParticipant {
 const {trailCells:_,spawnCells:__,...rest}=p;return {...rest,position:{...p.position},direction:{...p.direction},targetDirection:p.targetDirection?{...p.targetDirection}:null,protected:false};
}
export function observeBot(match:MatchState,participantId:string):BotObservation {
 const self=match.participants.find(p=>p.participantId===participantId);if(!self)throw new Error('Unknown bot');
 const origin=match.map.cells[self.cellId]??{q:0,r:0},range=match.config.botObservationRange;
 return {matchId:match.matchId,tick:match.tick,config:match.config,map:match.map,owners:match.owners,gameMode:match.gameMode,
  self:publicParticipant(self),ownTrail:[...self.trailCells],
  others:match.participants.filter(p=>p!==self&&p.lifeState==='ALIVE'&&hexDistance(origin,match.map.cells[p.cellId])<=range).map(publicParticipant),
  trails:match.participants.filter(p=>p!==self).flatMap(p=>[...p.trailCells].filter(id=>hexDistance(origin,match.map.cells[id])<=range).map(cellId=>({cellId,slot:p.slot})))};
}
export function shortestPath(map:MapDefinition,start:number,goal:(id:number)=>boolean,allowed:(id:number)=>boolean=()=>true,maxLength=24):number[]|null {
 if(start<0)return null;if(goal(start))return [];
 const parents=new Int32Array(map.cells.length);parents.fill(-2);parents[start]=-1;
 const queue=[start];let found=-1;
 for(let head=0;head<queue.length&&found<0;head++)for(const n of map.cells[queue[head]].neighbors){
  if(n<0||parents[n]!==-2||!allowed(n))continue;
  parents[n]=queue[head];queue.push(n);if(goal(n)){found=n;break;}
 }
 if(found<0)return null;
 const path:number[]=[];for(let id=found;id!==start;id=parents[id])path.push(id);path.reverse();
 return path.length<=maxLength?path:null;
}
export function returnPath(obs:BotObservation):number[]|null {
 const forbidden=new Set(obs.trails.map(t=>t.cellId));
 return shortestPath(obs.map,obs.self.cellId,id=>obs.owners[id]===obs.self.slot+1,id=>!forbidden.has(id),24);
}
const behavior:Record<Personality,{length:number;width:number;attack:number;pointWeight:number}>={
 EXPAND:{length:4,width:3,attack:0.08,pointWeight:4},
 ATTACK:{length:3,width:2,attack:0.85,pointWeight:3},
 DEFEND:{length:1,width:1,attack:0.02,pointWeight:1},
 SEEK_POINT:{length:3,width:2,attack:0.2,pointWeight:30}
};
function planExpansion(obs:BotObservation,memory:BotMemory):number[] {
 const settings=behavior[obs.self.personality??'EXPAND'],forbidden=new Set(obs.trails.map(t=>t.cellId));
 const owner=obs.self.slot+1,own=obs.map.cells.filter(c=>obs.owners[c.id]===owner);
 const boundary=own.filter(c=>c.neighbors.some(n=>n>=0&&obs.owners[n]!==owner)).sort((a,b)=>hexDistance(a,obs.map.cells[obs.self.cellId])-hexDistance(b,obs.map.cells[obs.self.cellId]));
 const candidates:{path:number[];score:number;goal:string}[]=[];
 if(obs.trails.length&&memory.random()<settings.attack){
  const targets=[...obs.trails].sort((a,b)=>hexDistance(obs.map.cells[a.cellId],obs.map.cells[obs.self.cellId])-hexDistance(obs.map.cells[b.cellId],obs.map.cells[obs.self.cellId]));
  for(const target of targets.slice(0,2)){
   const outward=shortestPath(obs.map,obs.self.cellId,id=>id===target.cellId,()=>true,12);
   const back=outward&&shortestPath(obs.map,target.cellId,id=>obs.owners[id]===owner,()=>true,12);
   if(outward&&back&&outward.length+back.length<=24)candidates.push({path:[...outward,...back],score:50*settings.attack,goal:'ATTACK'});
  }
 }
 for(const cp of GAME_MODES[obs.gameMode.id].usesControlPoints?obs.map.controlPoints:[])if(obs.owners[cp.cellId]!==owner){
  const outward=shortestPath(obs.map,obs.self.cellId,id=>id===cp.cellId,id=>!forbidden.has(id),12);
  const back=outward&&shortestPath(obs.map,cp.cellId,id=>obs.owners[id]===owner,id=>!forbidden.has(id),12);
  if(outward&&back&&outward.length+back.length<=24)candidates.push({path:[...outward,...back],score:settings.pointWeight-outward.length*0.3,goal:'SEEK_POINT'});
 }
 for(const anchor of boundary.slice(0,3))for(let d=0;d<6&&candidates.length<12;d++){
  const prefix=shortestPath(obs.map,obs.self.cellId,id=>id===anchor.id,id=>obs.owners[id]===owner,10);if(!prefix)continue;
  let current=anchor.id;const path=[...prefix];let valid=true;
  const sides=[[d,settings.length],[(d+1)%6,settings.width],[(d+3)%6,settings.length],[(d+4)%6,settings.width]];
  for(const [direction,length]of sides)for(let step=0;step<length;step++){
   const next=obs.map.cells[current].neighbors[direction];if(next<0||forbidden.has(next)){valid=false;break;}path.push(next);current=next;
  }
  if(!valid||path.length>24)continue;
  const external=path.filter(id=>obs.owners[id]!==owner).length;
  if(!external)continue;
  candidates.push({path,score:external+(settings.length*settings.width)*0.8+memory.random(),goal:'EXPAND'});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=candidates[0];memory.goal=selected?.goal??'RETURN';
 return selected?.path??returnPath(obs)??[];
}
export function getBotInput(obs:BotObservation,memory:BotMemory,returnOnly=false):DirectionInput|null {
 if(obs.self.lifeState!=='ALIVE')return null;
 if(memory.plannedLifeId!==obs.self.lifeId){memory.path=[];memory.seq=0;memory.nextDecisionTick=0;memory.plannedLifeId=obs.self.lifeId;}
 if(memory.lastCell!==obs.self.cellId){memory.lastCell=obs.self.cellId;memory.lastProgressTick=obs.tick;}
 const due=obs.tick>=memory.nextDecisionTick;
 if(due){
  memory.nextDecisionTick=obs.tick+Math.max(1,Math.round(obs.config.botDecisionMs*obs.config.simulationHz/1000));
  const danger=obs.ownTrail.length&&obs.others.some(p=>obs.ownTrail.some(id=>hexDistance(obs.map.cells[id],obs.map.cells[p.cellId])<=3));
  const stuck=obs.tick-memory.lastProgressTick>=2*obs.config.simulationHz;
  if(returnOnly||danger||stuck){memory.path=returnPath(obs)??[];memory.goal='RETURN';if(stuck)memory.lastProgressTick=obs.tick;}
  if(!memory.path.length&&returnOnly){const safe=obs.map.cells[obs.self.cellId].neighbors.filter(id=>obs.owners[id]===obs.self.slot+1);if(safe.length)memory.path=[safe[Math.floor(memory.random()*safe.length)]];}
  if(!memory.path.length&&!returnOnly)memory.path=planExpansion(obs,memory);
 }
 // Begin the next leg within a turn radius, before overshooting a waypoint.
 // A point-seeking bot otherwise orbits centers it cannot reach while turning.
 const reach=Math.max(Math.sqrt(3)*obs.map.side*0.18,moveSpeed(obs.config)/obs.config.turnRadiansPerSecond+moveSpeed(obs.config)/obs.config.simulationHz);
 while(memory.path.length&&Math.hypot(obs.map.cells[memory.path[0]].center.x-obs.self.position.x,obs.map.cells[memory.path[0]].center.y-obs.self.position.y)<reach)memory.path.shift();
 const target=memory.path.length?obs.map.cells[memory.path[0]].center:{x:0,y:0};
 const direction=normalizeDirection(target.x-obs.self.position.x,target.y-obs.self.position.y);
 if(!direction)return null;
 return {matchId:obs.matchId,lifeId:obs.self.lifeId,seq:++memory.seq,dx:direction.x,dy:direction.y};
}
export function botSpecs(count:number,startSlot=0,prefix='bot'){
 const personalities:Personality[]=['EXPAND','ATTACK','DEFEND','SEEK_POINT'];
 return Array.from({length:count},(_,i)=>({participantId:prefix+'-'+i,slot:startSlot+i,nickname:['영역탐험가','선사냥꾼','안전지킴이','거점수집가'][i%4],kind:'BOT' as const,personality:personalities[i%4]}));
}


