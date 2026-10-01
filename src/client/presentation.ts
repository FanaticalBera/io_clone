import type {MatchView,Vec,PublicParticipant,MapDefinition} from '../shared/model.js';
import {createMap,worldCell} from '../shared/hex.js';
import {stepSteering,normalizeDirection} from '../shared/movement.js';
import {moveSpeed} from '../shared/config.js';
type Frame={view:MatchView;at:number};
type PendingTarget={direction:Vec;seq:number;at:number};
export class Presentation {
 private map:MapDefinition|null=null;private frames:Frame[]=[];private pending:PendingTarget[]=[];
 private clockOffset=Infinity;private local=false;
 private correction:Vec={x:0,y:0};private correctedAt=0;private frozen=false;selfId:string|null=null;
 accept(view:MatchView,selfId:string|null,at:number,reset=false,local=false):void{
  if(this.map?.mapId!==view.mapId)this.map=createMap(view.config.mapRadius,view.config.hexSideWorldUnits);
  const previous=this.frames.at(-1),oldSelf=previous?.view.participants.find(p=>p.participantId===selfId),self=view.participants.find(p=>p.participantId===selfId);
  if(previous?.view.matchId===view.matchId&&view.tick<previous.view.tick)return;
  const oldPosition=self&&this.position(self.participantId,at);
  if(reset||this.selfId!==selfId||previous?.view.matchId!==view.matchId||self?.lifeId!==oldSelf?.lifeId||self?.lifeState!==oldSelf?.lifeState){
   this.frames=[];this.pending=[];this.clockOffset=Infinity;this.correction={x:0,y:0};
  }
  // Place snapshots on the simulation timeline; varying packet arrival gaps are not movement time.
  this.local=local;const tickAt=view.tick*1000/view.config.simulationHz;
  this.clockOffset=Math.min(this.clockOffset,at-tickAt);
  const frameAt=tickAt+this.clockOffset;
  this.selfId=selfId;this.frames.push({view,at:frameAt});if(this.frames.length>20)this.frames.shift();this.frozen=false;
  if(self){
   this.pending=this.pending.filter(input=>input.seq>self.lastAppliedInputSeq);
   if(oldPosition&&oldSelf?.lifeId===self.lifeId&&oldSelf.lifeState===self.lifeState&&!reset){
    // Compare two positions at the same display time, including the age of this snapshot.
    const baseline=this.predict(self,frameAt,at,true);
    const error={x:oldPosition.x-baseline.x,y:oldPosition.y-baseline.y};
    this.correction=Math.hypot(error.x,error.y)<Math.sqrt(3)*view.config.hexSideWorldUnits/2?error:{x:0,y:0};
    this.correctedAt=at;
   }
  }
 }
 input(direction:Vec,seq:number,at?:number):void{
  const normalized=normalizeDirection(direction.x,direction.y);if(!normalized)return;
  const frame=this.frames.at(-1),self=frame?.view.participants.find(p=>p.participantId===this.selfId);
  if(!frame||!self||self.lifeState!=='ALIVE'||seq<=self.lastAppliedInputSeq||seq<=(this.pending.at(-1)?.seq??0))return;
  this.pending.push({direction:normalized,seq,at:at??frame.at});
  // Prediction is capped at three seconds; retain a bounded recent history.
  if(this.pending.length>256)this.pending.shift();
 }
 private predict(p:PublicParticipant,frameAt:number,now:number,replay=false,cap=3000):Vec{
  const view=this.frames.at(-1)!.view,map=this.map!,stepMs=1000/view.config.simulationHz;
  let remaining=Math.max(0,Math.min(cap,now-frameAt)),position={...p.position},direction={...p.direction};
  let cellId=worldCell(map,position),target=p.targetDirection,elapsed=0,index=0;
  if(cellId<0)return position;
  const inputs=replay?this.pending:[];
  while(remaining>1e-7){
   // Apply intent at the next fixed-step start. A mid-tick input must never
   // rotate displacement already displayed earlier in that same tick.
   while(index<inputs.length&&inputs[index].at<=frameAt+elapsed+1e-7)target=inputs[index++].direction;
   const next=stepSteering(map,position,cellId,direction,target,view.config);
   const fraction=Math.min(1,remaining/stepMs);
   if(next.blocked&&fraction>=(next.boundaryT??1))return next.position;
   if(fraction<1){const distance=moveSpeed(view.config)/view.config.simulationHz*fraction;
    return{x:position.x+next.direction.x*distance,y:position.y+next.direction.y*distance};
   }
   position=next.position;cellId=next.cellId;direction=next.direction;remaining-=stepMs;elapsed+=stepMs;
  }
  return position;
 }
 freeze():void{this.frozen=true;}
 position(id:string,now:number):Vec|null{
  const last=this.frames.at(-1);if(!last)return null;const p=last.view.participants.find(p=>p.participantId===id);if(!p)return null;
  if(p.lifeState!=='ALIVE'||last.view.phase!=='RUNNING'||this.frozen)return {...p.position};
  if(id===this.selfId&&!this.local){
   const position=this.predict(p,last.at,now,true);
   const blend=Math.max(0,1-(now-this.correctedAt)/80);return{x:position.x+this.correction.x*blend,y:position.y+this.correction.y*blend};
  }
  const delay=this.local?1000/last.view.config.simulationHz:100;const target=now-delay;let a:Frame|undefined,b:Frame|undefined;
  for(const frame of this.frames){if(frame.at<=target)a=frame;else{b=frame;break;}}
  if(!a)return {...p.position};
  const pa=a.view.participants.find(p=>p.participantId===id),pb=b?.view.participants.find(p=>p.participantId===id);
  if(!pa||pa.lifeId!==p.lifeId||pa.lifeState!==p.lifeState)return {...p.position};
  if(b&&pb&&pb.lifeId===pa.lifeId&&pb.lifeState==='ALIVE'){
   const t=Math.max(0,Math.min(1,(target-a.at)/(b.at-a.at)));return{x:pa.position.x+(pb.position.x-pa.position.x)*t,y:pa.position.y+(pb.position.y-pa.position.y)*t};
  }
  return this.predict(pa,a.at,target,false,delay);
 }
}

