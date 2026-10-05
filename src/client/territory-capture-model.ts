import type {MapDefinition,MatchView} from '../shared/model.js';
export const CAPTURE_DURATION=240,MAX_CAPTURE_EFFECTS=4;
export function experimentalCaptureEffect(value:string|null,enabled:boolean):boolean{return !(enabled&&value==='none');}
export interface BloomCell {id:number;edges:number;cancelled:boolean}
export interface CaptureBloom {
 participantId:string;lifeId:number;slot:number;color:number;startedAt:number;
 chunks:Map<string,BloomCell[]>;neutralCount:number;stolenCount:number;
}
export function captureAppearance(elapsed:number,color:number){
 const t=Math.max(0,Math.min(1,(elapsed-50)/(CAPTURE_DURATION-50)));
 const mix=(bright:number)=>{const ch=(shift:number)=>Math.round(((color>>>shift)&255)*(1-bright)+255*bright);return (ch(16)<<16)|(ch(8)<<8)|ch(0);};
 const shade=(shift:number)=>Math.round(((color>>>shift)&255)*.65);
 return {fillAlpha:elapsed<0||elapsed>=100?0:.5*(1-elapsed/100),fillColor:mix(.22),
  lineAlpha:elapsed<0||elapsed>=CAPTURE_DURATION?0:.95*Math.pow(1-t,.65),lineColor:(shade(16)<<16)|(shade(8)<<8)|shade(0),coreColor:mix(.85),lineWidth:7};
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
  const byOwner=new Map<number,{participantId:string;lifeId:number;slot:number;color:number;ids:number[];neutralCount:number;stolenCount:number}>();
  for(const participantId of capturers){
   const p=view.participants.find(v=>v.participantId===participantId),prior=previous?.participants.find(v=>v.participantId===participantId);
   // A new life establishes a baseline, including its spawn territory.
   if(!p||!prior||prior.lifeId!==p.lifeId)continue;
   const color=colorForSlot(p.slot);if(!Number.isFinite(color))continue;
   byOwner.set(p.slot+1,{participantId,lifeId:p.lifeId,slot:p.slot,color,ids:[],neutralCount:0,stolenCount:0});
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
   const edges=captureEdges(map,target.ids),chunks=new Map<string,BloomCell[]>();
   for(let i=0;i<target.ids.length;i++){
    const key=keys[target.ids[i]];let cells=chunks.get(key);if(!cells){cells=[];chunks.set(key,cells);}
    cells.push({id:target.ids[i],edges:edges[i],cancelled:false});
   }
   this.effects=this.effects.filter(e=>e.participantId!==target.participantId);
   if(this.effects.length>=MAX_CAPTURE_EFFECTS){this.effects.shift();this.dropped++;}
   const {ids,...metadata}=target;
   this.effects.push({...metadata,chunks,startedAt:now});this.played++;
  }
 }
 expire(now:number):void{this.effects=this.effects.filter(e=>now-e.startedAt<CAPTURE_DURATION);}
 state(){return {style:this.enabled?'CAPTURE_PULSE':'NONE',active:this.effects.length,played:this.played,dropped:this.dropped,cancelledCells:this.cancelledCells,
  cells:this.effects.reduce((total,e)=>total+[...e.chunks.values()].reduce((n,cells)=>n+cells.filter(c=>!c.cancelled).length,0),0),
  captures:this.effects.map(e=>({participantId:e.participantId,slot:e.slot,lifeId:e.lifeId,neutralCount:e.neutralCount,stolenCount:e.stolenCount}))};}
}
