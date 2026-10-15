import {createMatch,stepMatch} from '../src/shared/game.js';
import {boundaryGeometry,movementCell} from '../src/shared/wall-margin.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {setOwner,assertOwnershipCounts} from '../src/shared/territory.js';
import type {Vec} from '../src/shared/model.js';

// Real steering after a single initial layout; no trail injection, immunity or
// teleporting while the loop is drawn. Keep the enclosed sample initially neutral.
export function wallLoop(shape:number,reverse=false,compact=false){
 const match=createMatch({mapRadius:56,mapShape:shape,maxSlots:4},4,[{participantId:'h',slot:0,nickname:'H',kind:'HUMAN'}],'wall-loop-'+shape),self=match.participants[0];
 const groups=new Map<string,{x:number;lo:number;hi:number}[]>();
 for(const e of boundaryGeometry(match.map).edges)if(Math.abs(e.a.x-e.b.x)<1e-6){const key=e.a.x.toFixed(4),g=groups.get(key)??[];g.push({x:e.a.x,lo:Math.min(e.a.y,e.b.y),hi:Math.max(e.a.y,e.b.y)});groups.set(key,g);}
 const segments:{x:number;lo:number;hi:number}[]=[];
 for(const group of groups.values())for(const e of group.sort((a,b)=>a.lo-b.lo)){
  const last=segments.at(-1);if(last&&Math.abs(last.x-e.x)<1e-5&&e.lo<=last.hi+1e-5)last.hi=Math.max(last.hi,e.hi);else segments.push({...e});
 }
 segments.sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo));
 const height=compact?110:200,width=compact?180:240,homeWidth=compact?100:180,homeTop=compact?5:40;
 let setup:{wallX:number;inward:number;start:Vec;route:Vec[];inside:Vec}|undefined;
 for(const e of segments){if(e.hi-e.lo<(compact?240:500))continue;const y=(e.hi+e.lo)/2,sign=reverse?-1:1;
  for(const inward of [1,-1]){
   const x=e.x+inward*5,route=[{x,y:y+sign*height},{x:e.x+inward*width,y:y+sign*height},{x:e.x+inward*width,y:y-sign*30},{x:e.x+inward*(compact?50:75),y:y-sign*30}];
   const start={x,y},inside={x:e.x+inward*(compact?70:130),y:y+sign*(compact?75:120)};
   if([start,inside,...route].some(p=>movementCell(match.map,p)<0))continue;
   setup={wallX:e.x,inward,start,route,inside};break;
  }if(setup)break;
 }
 if(!setup)throw Error('No valid wall-loop layout for shape '+shape+'; longest segment '+(segments[0]?.hi-segments[0]?.lo));
 const {wallX,inward,start,route,inside}=setup,sign=reverse?-1:1;
 match.owners.fill(0);self.territoryCount=0;self.trailCells.clear();self.spawnCells.clear();self.trailOriginCellId=null;self.protectedUntilTick=0;
 for(const c of match.map.cells){const x=(c.center.x-wallX)*inward,y=(c.center.y-start.y)*sign;if(x>=0&&x<=homeWidth&&y>=-110&&y<=homeTop)setOwner(match,c.id,1);}
 self.position={...start};self.cellId=movementCell(match.map,start);setOwner(match,self.cellId,1);self.spawnCells.add(self.cellId);self.direction={x:0,y:sign};self.targetDirection=null;
 const insideId=movementCell(match.map,inside),initialInside=match.owners[insideId];let waypoint=0,seq=0;
 while(waypoint<route.length&&match.tick<600&&self.lifeState==='ALIVE'){
  const target=route[waypoint];if(Math.hypot(target.x-self.position.x,target.y-self.position.y)<18){waypoint++;continue;}
  const d=normalizeDirection(target.x-self.position.x,target.y-self.position.y)!;
  stepMatch(match,new Map([['h',{matchId:match.matchId,lifeId:self.lifeId,seq:++seq,dx:d.x,dy:d.y}]]));
 }
 assertOwnershipCounts(match);
 return {match,self,insideId,initialInside,waypoint};
}
