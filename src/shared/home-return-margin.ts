import type {Cell,MatchState,Participant,Vec} from './model.js';
import type {Movement} from './movement.js';
import {segmentDistanceSquared} from './wall-margin.js';

// Accepted after the 6/10-unit device comparison. Scale with hex art; at the
// production side of 32 this is 10 world units for humans and bots alike.
export const HOME_RETURN_MARGIN_FRACTION=10/32;
const margins=new WeakMap<MatchState,number>();
// Explicit overrides retain centre-only historical fixtures and comparisons.
export function setHomeReturnMargin(match:MatchState,radius:number):void {
 if(!Number.isFinite(radius)||radius<0||radius>match.map.side/3)throw new Error('Invalid home return margin');
 margins.set(match,radius);
}
export function homeReturnMargin(match:MatchState):number{return margins.get(match)??match.map.side*HOME_RETURN_MARGIN_FRACTION;}
export function distanceToCellSquared(cell:Cell,p:Vec):number {
 let inside=true,nearest=Infinity;
 for(let i=0;i<6;i++){
  const a=cell.vertices[i],b=cell.vertices[(i+1)%6];
  if((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)<-1e-9)inside=false;
  nearest=Math.min(nearest,segmentDistanceSquared(p,a,b));
 }
 return inside?0:nearest;
}
// Exact swept point against the rounded expansion of a hex: offset faces
// plus vertex circles, rather than an enlarged hex with over-wide corners.
export function marginEntryTime(cell:Cell,start:Vec,delta:Vec,radius:number):number|null {
 if(distanceToCellSquared(cell,start)<=radius*radius+1e-9)return null;
 const length2=delta.x*delta.x+delta.y*delta.y;if(length2<1e-16)return null;
 let first=Infinity;
 for(let i=0;i<6;i++){
  const a=cell.vertices[i],b=cell.vertices[(i+1)%6],ex=b.x-a.x,ey=b.y-a.y,length=Math.hypot(ex,ey),nx=ey/length,ny=-ex/length;
  const rate=delta.x*nx+delta.y*ny;
  if(rate<-1e-12){
   const t=(radius-(start.x-a.x)*nx-(start.y-a.y)*ny)/rate;
   const along=((start.x+delta.x*t-a.x)*ex+(start.y+delta.y*t-a.y)*ey)/(length*length);
   if(t>=0&&t<=1&&along>=0&&along<=1)first=Math.min(first,t);
  }
  const x=start.x-a.x,y=start.y-a.y,dot=x*delta.x+y*delta.y,disc=dot*dot-length2*(x*x+y*y-radius*radius);
  if(disc>1e-12){const t=(-dot-Math.sqrt(disc))/length2;if(t>=0&&t<=1)first=Math.min(first,t);}
 }
 return Number.isFinite(first)?first:null;
}
export interface HomeMarginEntry {homeCellId:number;t:number}
export function homeMarginEntries(match:MatchState,p:Participant,movement:Movement,delta:Vec,stopT:number,radius:number):HomeMarginEntry[] {
 if(!p.trailCells.size||match.owners[p.cellId]===p.slot+1)return [];
 const nearby=new Set<number>();
 for(const id of [p.cellId,...movement.entries.map(e=>e.cellId)]){
  nearby.add(id);for(const n of match.map.cells[id].neighbors)if(n>=0)nearby.add(n);
 }
 const homes=[...nearby].filter(id=>match.owners[id]===p.slot+1);
 // Leaving home, following its edge, or moving through a band already touching
 // home must not repeatedly close a fresh excursion. Only a new inward crossing
 // after clearing every nearby home margin can trigger the early return.
 if(homes.some(id=>distanceToCellSquared(match.map.cells[id],p.position)<=radius*radius+1e-9))return [];
 return homes.flatMap(homeCellId=>{
  const t=marginEntryTime(match.map.cells[homeCellId],p.position,delta,radius);
  return t!==null&&t<=stopT?[{homeCellId,t}]:[];
 });
}
