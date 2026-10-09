import type {MapDefinition,MatchView,Vec} from '../shared/model.js';
import {hexDistance} from '../shared/hex.js';
/** Tiles flip outward from the entry over WAVE ms, each popping for POP ms; the rest is edge glow and loss cues. */
export const CAPTURE_DURATION=1000,CAPTURE_WAVE=250,CAPTURE_POP=200,MAX_CAPTURE_EFFECTS=4;
export function experimentalCaptureEffect(value:string|null,enabled:boolean):boolean{return !(enabled&&value==='none');}
/** prior is the old owner (slot+1, 0 neutral); victimEdges marks sides that still border that owner. */
export interface BloomCell {id:number;edges:number;cancelled:boolean;delay:number;prior:number;priorColor:number;victimEdges:number}
export interface CaptureBloom {
 participantId:string;lifeId:number;slot:number;color:number;startedAt:number;
 chunks:Map<string,BloomCell[]>;neutralCount:number;stolenCount:number;
 origin:Vec;cellCount:number;losses:Map<number,Vec>;
}
const mixWhite=(color:number,bright:number)=>{const ch=(shift:number)=>Math.round(((color>>>shift)&255)*(1-bright)+255*bright);return (ch(16)<<16)|(ch(8)<<8)|ch(0);};
/** Per-tile flip: light and waiting, then a pop up and back into the owner colour. */
export function captureAppearance(elapsed:number,delay:number,color:number){
 const local=elapsed-delay,pop=local<0?0:local<CAPTURE_POP?Math.sin(local/CAPTURE_POP*Math.PI):0;
 return {pending:local<0,alpha:local<CAPTURE_POP?1:0,scale:1+.16*pop,lift:pop?-10*pop:0,fillColor:mixWhite(color,local<0?.5:.5*Math.max(0,1-local/CAPTURE_POP)),
  lineAlpha:elapsed<0?0:elapsed<CAPTURE_WAVE?.95:.95*Math.max(0,1-(elapsed-CAPTURE_WAVE)/350),coreColor:mixWhite(color,.85),lineColor:(Math.round((color>>>16&255)*.65)<<16)|(Math.round((color>>>8&255)*.65)<<8)|Math.round((color&255)*.65),lineWidth:7,
  lossAlpha:elapsed<CAPTURE_WAVE||elapsed>CAPTURE_WAVE+400?0:.95*Math.abs(Math.sin((elapsed-CAPTURE_WAVE)/200*Math.PI))};
}
/** Bit k is the exposed edge toward HEX_DIRECTIONS[k], only around the new area. */
export function captureEdges(map:MapDefinition,ids:readonly number[]):number[]{
 const included=new Set(ids);return ids.map(id=>map.cells[id].neighbors.reduce((mask,n,k)=>included.has(n)?mask:mask|(1<<k),0));
}
/** Confirmed CAPTURE + last-observed owner diff only; never reconstruct missing cells. */
export class TerritoryCaptureModel {
 effects:CaptureBloom[]=[];played=0;dropped=0;cancelledCells=0;
 private matchId='';private tick=-1;private seen=new Set<string>();
 constructor(public enabled=false){}
 setEnabled(enabled:boolean):void{this.enabled=enabled;this.effects=[];this.matchId='';this.tick=-1;this.seen.clear();this.played=0;this.dropped=0;this.cancelledCells=0;}
 private reset(view:MatchView):void{this.effects=[];this.matchId=view.matchId;this.tick=view.tick;this.seen=new Set(view.events.map(e=>e.eventId));this.played=0;this.dropped=0;this.cancelledCells=0;}
 accept(view:MatchView,oldOwners:Uint8Array,map:MapDefinition,keys:readonly string[],colorForSlot:(slot:number)=>number,now:number,reset=false,previous?:MatchView):void{
  if(!this.enabled)return;
  if(reset||this.matchId!==view.matchId){this.reset(view);return;}
  if(view.tick<this.tick)return;this.tick=view.tick;this.expire(now);
  for(const effect of this.effects){
   const current=view.participants.find(p=>p.participantId===effect.participantId);
   for(const cells of effect.chunks.values())for(const cell of cells)
    if(!cell.cancelled&&(current?.lifeId!==effect.lifeId||view.owners[cell.id]!==effect.slot+1||view.trailMasks[cell.id]!==0)){cell.cancelled=true;this.cancelledCells++;}
  }
  const capturers=new Set<string>();
  for(const event of view.events){
   if(this.seen.has(event.eventId))continue;this.seen.add(event.eventId);
   if(event.type==='CAPTURE'&&event.tick>=view.tick-view.config.simulationHz&&event.tick<=view.tick)capturers.add(event.participantId);
  }
  if(this.seen.size>2048)this.seen=new Set([...this.seen].slice(-1024));
  const byOwner=new Map<number,{participantId:string;lifeId:number;slot:number;color:number;ids:number[];neutralCount:number;stolenCount:number;head:number;origin:Vec}>();
  for(const participantId of capturers){
   const p=view.participants.find(v=>v.participantId===participantId),prior=previous?.participants.find(v=>v.participantId===participantId);
   // A new life establishes a baseline, including its spawn territory.
   if(!p||!prior||prior.lifeId!==p.lifeId)continue;
   const color=colorForSlot(p.slot);if(!Number.isFinite(color))continue;
   byOwner.set(p.slot+1,{participantId,lifeId:p.lifeId,slot:p.slot,color,ids:[],neutralCount:0,stolenCount:0,head:p.cellId,origin:{...p.position}});
  }
  if(!byOwner.size)return;
  // One board scan per confirmed capture batch, never per render tick.
  for(let id=0;id<view.owners.length;id++){
   const target=byOwner.get(view.owners[id]);
   if(target&&oldOwners[id]!==view.owners[id]&&oldOwners[id]!==255&&view.trailMasks[id]===0){
    target.ids.push(id);if(oldOwners[id]===0)target.neutralCount++;else target.stolenCount++;
   }
  }
  for(const target of byOwner.values()){
   if(!target.ids.length)continue;
   const edges=captureEdges(map,target.ids),chunks=new Map<string,BloomCell[]>(),head=map.cells[target.head]??map.cells[target.ids[0]];
   const distances=target.ids.map(id=>hexDistance(map.cells[id],head)),far=Math.max(1,...distances),sums=new Map<number,{x:number;y:number;n:number}>();
   for(let i=0;i<target.ids.length;i++){
    const id=target.ids[i],prior=oldOwners[id],key=keys[id];let cells=chunks.get(key);if(!cells){cells=[];chunks.set(key,cells);}
    const victimEdges=prior?map.cells[id].neighbors.reduce((mask,n,k)=>n>=0&&view.owners[n]===prior?mask|(1<<k):mask,0):0;
    cells.push({id,edges:edges[i],cancelled:false,delay:CAPTURE_WAVE*distances[i]/far,prior,priorColor:prior?colorForSlot(prior-1):0,victimEdges});
    if(prior){const c=map.cells[id].center,sum=sums.get(prior)??{x:0,y:0,n:0};sum.x+=c.x;sum.y+=c.y;sum.n++;sums.set(prior,sum);}
   }
   const losses=new Map([...sums].map(([owner,sum])=>[owner,{x:sum.x/sum.n,y:sum.y/sum.n}]));
   this.effects=this.effects.filter(e=>e.participantId!==target.participantId);
   if(this.effects.length>=MAX_CAPTURE_EFFECTS){this.effects.shift();this.dropped++;}
   const {ids,head:_head,...metadata}=target;
   this.effects.push({...metadata,chunks,startedAt:now,cellCount:ids.length,losses});this.played++;
  }
 }
 expire(now:number):void{this.effects=this.effects.filter(e=>now-e.startedAt<CAPTURE_DURATION);}
 state(){return {style:this.enabled?'CAPTURE_PULSE':'NONE',active:this.effects.length,played:this.played,dropped:this.dropped,cancelledCells:this.cancelledCells,
  cells:this.effects.reduce((total,e)=>total+[...e.chunks.values()].reduce((n,cells)=>n+cells.filter(c=>!c.cancelled).length,0),0),
  captures:this.effects.map(e=>({participantId:e.participantId,slot:e.slot,lifeId:e.lifeId,neutralCount:e.neutralCount,stolenCount:e.stolenCount}))};}
}
