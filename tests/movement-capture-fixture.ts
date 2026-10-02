import {createMatch,stepMatch} from '../src/shared/game.js';
import {axialToWorld} from '../src/shared/hex.js';
import {normalizeDirection,stepSteering} from '../src/shared/movement.js';
import {watchCaptureResolution,type CaptureResolutionTrace} from '../src/shared/engine.js';
import type {Participant,Vec,DirectionInput,MatchState} from '../src/shared/model.js';
import type {GameModeId} from '../src/shared/modes.js';
import {createMode} from '../src/shared/modes.js';

export type MovementCaptureScenario='detached-origin'|'retained-origin'|'all-territory';
// Seeds 115 and 17 normally spawn the two human roles at (-12,-5) and
// (-17,0), in opposite slot order, each with the standard nineteen cells. Never edit
// positions, owners, trail sets, protection, or final capture state.
export class MovementCaptureFixture {
 readonly match:MatchState;readonly victim:Participant;readonly capturer:Participant;
 readonly traces:CaptureResolutionTrace[]=[];readonly journal:{tick:number;victimCell:number;capturerCell:number;trail:number[];territory:number;lifeState:string}[]=[];
 directContacts=0;captureTick=-1;private seq=0;private origin:{q:number;r:number};
 private victimTarget:Vec|null=null;private capturerTarget:Vec|null=null;private victimOrbit:Vec|null=null;private capturerOrbit:Vec|null;
 constructor(reverse=false,mode:GameModeId='classic',match?:MatchState,private advance?:(inputs:ReadonlyMap<string,DirectionInput>)=>void){
  this.match=match??createMatch({},reverse?17:115,[{participantId:'A',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'B',slot:1,nickname:'B',kind:'HUMAN'}],'movement-capture-'+mode+'-'+Number(reverse),createMode(mode));
  this.victim=this.match.participants.find(p=>p.slot===(reverse?1:0))!;this.capturer=this.match.participants.find(p=>p.slot===(reverse?0:1))!;
  this.origin=this.match.map.cells[this.victim.cellId];this.capturerOrbit={...this.capturer.position};
  watchCaptureResolution(this.match,trace=>this.traces.push(trace));
 }
 private target(q:number,r:number):Vec{return axialToWorld(this.origin.q+q,this.origin.r+r,this.match.map.side);}
 tick():void{
  const m=this.match,inputs=new Map<string,DirectionInput>();
  for(const [p,target,orbit]of [[this.victim,this.victimTarget,this.victimOrbit],[this.capturer,this.capturerTarget,this.capturerOrbit]]as const){
   if(p.lifeState!=='ALIVE')continue;
   const goal=orbit?{x:orbit.x+45*Math.cos(m.tick/m.config.simulationHz*4),y:orbit.y+45*Math.sin(m.tick/m.config.simulationHz*4)}:target;
   if(!goal)continue;const direction=normalizeDirection(goal.x-p.position.x,goal.y-p.position.y)!;
   inputs.set(p.participantId,{matchId:m.matchId,lifeId:p.lifeId,seq:++this.seq,dx:direction.x,dy:direction.y});
   if(p===this.capturer){const move=stepSteering(m.map,p.position,p.cellId,p.direction,direction,m.config);
    if([p.cellId,...move.entries.map(e=>e.cellId)].some(id=>this.victim.trailCells.has(id)))this.directContacts++;
   }
  }
  const counter=m.eventCounter;if(this.advance)this.advance(inputs);else stepMatch(m,inputs);
  if(m.events.some(e=>e.type==='CAPTURE'&&e.participantId===this.capturer.participantId&&Number(e.eventId.split(':').at(-1))>counter))this.captureTick=m.tick-1;
  this.journal.push({tick:m.tick,victimCell:this.victim.cellId,capturerCell:this.capturer.cellId,trail:[...this.victim.trailCells],territory:this.victim.territoryCount,lifeState:this.victim.lifeState});
 }
 private drive(p:Participant,q:number,r:number):void{
  const target=this.target(q,r);if(p===this.victim){this.victimTarget=target;this.victimOrbit=null;}else{this.capturerTarget=target;this.capturerOrbit=null;}
  let count=0;while(Math.hypot(target.x-p.position.x,target.y-p.position.y)>18){
   if(count++>=500)throw new Error('Movement waypoint did not finish');this.tick();if(p.lifeState!=='ALIVE')throw new Error('Driver died before returning: '+p.participantId);
  }
 }
 run(scenario:MovementCaptureScenario='detached-origin'):void{
  this.drive(this.victim,-2,2);this.drive(this.victim,-3,2);
  if(!this.victim.trailCells.size)throw new Error('Movement did not create a trail');
  if(scenario==='detached-origin'){
   for(const [q,r]of [[-3,0],[-1,-2],[2,-4]])this.drive(this.victim,q,r);this.victimOrbit=this.target(2,-4);
  }else{this.drive(this.victim,-4,1);this.victimOrbit=this.target(-4,1);}
  const route=scenario==='detached-origin'?[[-3,3],[-2,3],[-2,0],[0,0],[0,3],[-3,3]]:
   scenario==='all-territory'?[[-3,3],[-2,3],[-2,-3],[3,-3],[3,3],[-3,3]]:
   [[-3,3],[0,3],[0,-3],[3,-3],[3,3],[-3,3]];
  for(const [q,r]of route)this.drive(this.capturer,q,r);
  if(this.captureTick<0)throw new Error('Movement did not complete a capture');
 }
}
