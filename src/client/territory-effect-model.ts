import {CombatEvents} from './combat-events.js';
import {hexDistance,worldCell} from '../shared/hex.js';
import type {GameEvent,MapDefinition,MatchView} from '../shared/model.js';
export type TerritoryEffectStyle='NONE'|'WAVE_COLLAPSE'|'POWER_DOWN'|'EDGE_CRUMBLE';
export const MAX_TERRITORY_EFFECTS=4;
export const EFFECT_DURATION={NONE:0,WAVE_COLLAPSE:600,POWER_DOWN:440,EDGE_CRUMBLE:640} as const;
export function experimentalTerritoryEffect(value:string|null,enabled:boolean):TerritoryEffectStyle {
 if(!enabled)return 'WAVE_COLLAPSE';
 return value==='wave'?'WAVE_COLLAPSE':value==='power'?'POWER_DOWN':value==='edge'?'EDGE_CRUMBLE':value==='none'?'NONE':'WAVE_COLLAPSE';
}
export interface CollapseCell {id:number;delay:number;cancelled:boolean}
export interface TerritoryCollapse {
 eventId:string;slot:number;color:number;originCellId:number;startedAt:number;
 kind:'DEATH'|'CAPTURE_LOSS';style:TerritoryEffectStyle;chunks:Map<string,CollapseCell[]>;
}
export function collapseOrigin(map:MapDefinition,event:GameEvent,previous?:MatchView):number {
 const valid=(id:number|undefined)=>Number.isInteger(id)&&id!>=0&&id!<map.cells.length;
 if(valid(event.deathContext?.cellId))return event.deathContext!.cellId;
 if(event.position&&Number.isFinite(event.position.x)&&Number.isFinite(event.position.y)){
  const id=worldCell(map,event.position);if(valid(id))return id;
 }
 const id=previous?.participants.find(p=>p.participantId===event.participantId&&(!event.lifeId||p.lifeId===event.lifeId))?.cellId;
 return valid(id)?id!:-1;
}
export function collapseDelays(map:MapDefinition,ids:number[],origin:number,style:TerritoryEffectStyle):number[] {
 if(style==='POWER_DOWN')return ids.map(id=>((Math.imul(id,1103515245)>>>0)%101));
 if(style==='WAVE_COLLAPSE'){
  const distances=ids.map(id=>hexDistance(map.cells[id],map.cells[origin]));
  const max=Math.max(1,...distances);return distances.map(d=>420*d/max);
 }
 const included=new Set(ids),distance=new Map<number,number>(),queue:number[]=[];
 for(const id of ids)if(map.cells[id].neighbors.some(n=>!included.has(n))){distance.set(id,0);queue.push(id);}
 for(let head=0;head<queue.length;head++)for(const id of map.cells[queue[head]].neighbors)
  if(included.has(id)&&!distance.has(id)){distance.set(id,distance.get(queue[head])!+1);queue.push(id);}
 const max=Math.max(1,...distance.values());return ids.map(id=>460*(distance.get(id)??0)/max);
}
const mix=(a:number,b:number,t:number)=>{
 const channel=(shift:number)=>Math.round(((a>>>shift)&255)*(1-t)+((b>>>shift)&255)*t);
 return (channel(16)<<16)|(channel(8)<<8)|channel(0);
};
export function collapseAppearance(style:TerritoryEffectStyle,elapsed:number,delay:number,color:number):{alpha:number;scale:number;color:number} {
 const fade=style==='POWER_DOWN'?340:180,local=elapsed-delay,t=Math.max(0,Math.min(1,local/fade));
 if(local>=fade)return {alpha:0,scale:.88,color};
 const pulse=style==='POWER_DOWN'?Math.max(0,1-elapsed/100):local<0?0:Math.max(0,1-local/80);
 const base=style==='POWER_DOWN'?mix(color,0xa7aba9,t*.8):color;
 return {alpha:.92*(1-t),scale:1-(style==='POWER_DOWN'?0:.12*t),color:mix(base,0xffffff,pulse*.35)};
}
/** V1 animates last-observed victim -> neutral cells, not an exact pre-death board. */
export class TerritoryEffectModel {
 effects:TerritoryCollapse[]=[];played=0;dropped=0;cancelledCells=0;lastPrepareMs=0;
 private cursor=new CombatEvents();private matchId='';private tick=-1;private captureSeen=new Set<string>();
 constructor(public style:TerritoryEffectStyle='NONE'){}
 setStyle(style:TerritoryEffectStyle):void {this.style=style;this.effects=[];this.matchId='';this.tick=-1;this.cursor=new CombatEvents();this.captureSeen.clear();this.played=0;this.dropped=0;this.cancelledCells=0;}
 reset(view:MatchView):void {this.effects=[];this.cursor.accept(view,true);this.captureSeen=new Set(view.events.map(e=>e.eventId));this.matchId=view.matchId;this.tick=view.tick;this.played=0;this.dropped=0;this.cancelledCells=0;this.lastPrepareMs=0;}
 accept(view:MatchView,previousOwners:Uint8Array,map:MapDefinition,keys:readonly string[],colorForSlot:(slot:number)=>number,now:number,reset=false,previous?:MatchView):void {
  if(this.style==='NONE')return;
  if(reset||this.matchId!==view.matchId){this.reset(view);return;}
  if(view.tick<this.tick)return;this.tick=view.tick;
  for(const effect of this.effects)for(const cells of effect.chunks.values())for(const cell of cells)
   if(!cell.cancelled&&(view.owners[cell.id]!==0||view.trailMasks[cell.id]!==0)){cell.cancelled=true;this.cancelledCells++;}
  const events=this.cursor.accept(view),captures:GameEvent[]=[];
  for(const event of view.events){
   if(this.captureSeen.has(event.eventId))continue;this.captureSeen.add(event.eventId);
   if(event.type==='CAPTURE'&&event.tick>=view.tick-view.config.simulationHz&&event.tick<=view.tick)captures.push(event);
  }
  if(this.captureSeen.size>2048)this.captureSeen=new Set([...this.captureSeen].slice(-1024));
  if(!events.length&&!captures.length)return;
  const at=performance.now(),byOwner=new Map<number,number[]>(),deathOwners=new Set<number>(),captureOwners=new Set<number>();
  for(const event of events){
   const victim=view.participants.find(p=>p.participantId===event.participantId);
   if(victim){byOwner.set(victim.slot+1,[]);deathOwners.add(victim.slot+1);}
  }
  for(const event of captures){
   const p=view.participants.find(v=>v.participantId===event.participantId),prior=previous?.participants.find(v=>v.participantId===event.participantId);
   if(p&&prior&&p.lifeId===prior.lifeId)captureOwners.add(p.slot+1);
  }
  // Surviving victims can lose a disconnected region without a DEATH event.
  if(captureOwners.size)for(const victim of view.participants){
   const prior=previous?.participants.find(p=>p.participantId===victim.participantId);
   if(victim.lifeState==='ALIVE'&&prior?.lifeId===victim.lifeId&&!deathOwners.has(victim.slot+1))byOwner.set(victim.slot+1,[]);
  }
  const transferred=new Map<number,number[]>();
  // One known-board pass per batch. Current gameplay always wins.
  if(byOwner.size)for(let id=0;id<previousOwners.length;id++){
   const old=previousOwners[id],owner=view.owners[id],list=byOwner.get(old);
   if(list&&owner===0&&view.trailMasks[id]===0)list.push(id);
   if(list&&old!==owner&&captureOwners.has(owner)){
    let cells=transferred.get(old);if(!cells){cells=[];transferred.set(old,cells);}cells.push(id);
   }
  }
  for(const victim of view.participants){
   const owner=victim.slot+1,ids=byOwner.get(owner)??[],cuts=transferred.get(owner);
   if(deathOwners.has(owner)||!ids.length||!cuts?.length)continue;
   const lost=new Set(ids),origin=cuts.find(id=>map.cells[id].neighbors.some(n=>lost.has(n)))??cuts[0];
   this.addCollapse('capture-loss:'+captures[0].eventId+':'+victim.participantId,victim.slot,ids,origin,colorForSlot(victim.slot),now,map,keys,'CAPTURE_LOSS');
  }
  // Confirmed deaths keep their established origin and appearance, and take budget priority.
  for(const event of events){
   const victim=view.participants.find(p=>p.participantId===event.participantId);if(!victim)continue;
   const ids=byOwner.get(victim.slot+1)??[],origin=collapseOrigin(map,event,previous);
   this.addCollapse(event.eventId,victim.slot,ids,origin,colorForSlot(victim.slot),now,map,keys,'DEATH');
  }
  this.lastPrepareMs=performance.now()-at;
 }
 private addCollapse(eventId:string,slot:number,ids:number[],origin:number,color:number,now:number,map:MapDefinition,keys:readonly string[],kind:'DEATH'|'CAPTURE_LOSS'):void{
  if(!ids.length||origin<0||!Number.isFinite(color))return;
  const delays=collapseDelays(map,ids,origin,this.style),chunks=new Map<string,CollapseCell[]>();
  for(let i=0;i<ids.length;i++){const key=keys[ids[i]];let cells=chunks.get(key);if(!cells){cells=[];chunks.set(key,cells);}cells.push({id:ids[i],delay:delays[i],cancelled:false});}
  if(this.effects.length>=MAX_TERRITORY_EFFECTS){this.effects.shift();this.dropped++;}
  this.effects.push({eventId,slot,color,originCellId:origin,startedAt:now,style:this.style,chunks,kind});this.played++;
 }
 expire(now:number):void {this.effects=this.effects.filter(e=>now-e.startedAt<EFFECT_DURATION[e.style]);}
 state(){return {style:this.style,active:this.effects.length,played:this.played,dropped:this.dropped,cancelledCells:this.cancelledCells,lastPrepareMs:this.lastPrepareMs,
  cells:this.effects.reduce((n,e)=>n+[...e.chunks.values()].reduce((s,cells)=>s+cells.filter(c=>!c.cancelled).length,0),0),
  origins:this.effects.map(e=>({eventId:e.eventId,slot:e.slot,kind:e.kind,cellId:e.originCellId,color:e.color}))};}
}