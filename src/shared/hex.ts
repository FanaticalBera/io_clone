import type { Axial, Vec, MapDefinition } from './model.js';
export const HEX_DIRECTIONS: readonly Axial[] = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
export const START_ANCHORS: readonly Axial[] = [{q:17,r:0},{q:17,r:-17},{q:0,r:-17},{q:-12,r:-5},{q:-17,r:0},{q:-17,r:17},{q:0,r:17},{q:12,r:5}];
export function axialKey(q:number,r:number):string { return q+','+r; }
export function hexDistance(a:Axial,b:Axial):number { return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r)); }
export function axialToWorld(q:number,r:number,side=32):Vec { return {x:Math.sqrt(3)*side*(q+r/2), y:1.5*side*r}; }
export function worldToAxial(x:number,y:number,side=32):Axial {
 return roundAxial(x/(Math.sqrt(3)*side)-y/(3*side),2*y/(3*side));
}
function roundAxial(q:number,r:number):Axial {
 const s=-q-r;
 let rq=Math.round(q), rr=Math.round(r), rs=Math.round(s);
 const dq=Math.abs(rq-q), dr=Math.abs(rr-r), ds=Math.abs(rs-s);
 if(dq>dr && dq>ds) rq=-rr-rs; else if(dr>ds) rr=-rq-rs; else rs=-rq-rr;
 return {q:rq===0?0:rq,r:rr===0?0:rr};
}
export function scaledStartAnchors(radius:number):Axial[] {
 // Preserve the original R22 shape and shuffle order. Cube rounding keeps
 // fractional axial coordinates on the hex lattice instead of rounding q/r
 // independently; respawn placement does not use these initial anchors.
 const scale=radius/22;
 return START_ANCHORS.map(p=>roundAxial(p.q*scale,p.r*scale));
}
export function worldCell(map:MapDefinition,position:Vec):number {
 const a=worldToAxial(position.x,position.y,map.side);
 return map.byKey.get(axialKey(a.q,a.r)) ?? -1;
}
export function disk(center:Axial,radius:number):Axial[] {
 const cells:Axial[]=[];
 for(let r=-radius;r<=radius;r++) for(let q=Math.max(-radius,-r-radius);q<=Math.min(radius,-r+radius);q++)
  cells.push({q:center.q+q,r:center.r+r});
 return cells;
}
export function region(map:MapDefinition,center:number,radius:number):number[] {
 return disk(map.cells[center],radius).map(a=>map.byKey.get(axialKey(a.q,a.r))??-1);
}
export function createMap(radius=22,side=32):MapDefinition {
 if(!Number.isInteger(radius)||radius<1||radius>64||!Number.isFinite(side)||side<=0) throw new Error('Invalid map');
 const coords=disk({q:0,r:0},radius), byKey=new Map(coords.map((a,i)=>[axialKey(a.q,a.r),i]));
 const cells=coords.map((a,id)=>{
  const center=axialToWorld(a.q,a.r,side);
  const vertices=Array.from({length:6},(_,i)=>{const angle=(60*i-30)*Math.PI/180;return {x:center.x+side*Math.cos(angle),y:center.y+side*Math.sin(angle)};});
  return {...a,id,center,vertices,neighbors:HEX_DIRECTIONS.map(d=>byKey.get(axialKey(a.q+d.q,a.r+d.r))??-1)};
 });
 // Edge k lies between vertices k and k+1 and points toward direction k.
 const boundaryEdges=cells.flatMap(c=>c.neighbors.flatMap((n,k)=>n<0?[{a:c.vertices[(6-k)%6],b:c.vertices[(7-k)%6]}]:[]));
 const points=[{q:-8,r:0},{q:0,r:8},{q:8,r:-8}];
 return {mapId:'hex-r'+radius+'-a'+side+'-v1',radius,side,cells,byKey,boundaryEdges,
  controlPoints:points.flatMap((p,i)=>{const id=byKey.get(axialKey(p.q,p.r));return id===undefined?[]:[{pointId:i,cellId:id}];}),
  anchors:scaledStartAnchors(radius).flatMap(p=>{const id=byKey.get(axialKey(p.q,p.r));return id===undefined?[]:[id];})};
}

