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
// Same cells and order as disk() + byKey, without building a string key per cell (performance PRD:
// respawn zone tables were rebuilt from ~600k keys on the first safe bot respawn of every match).
const cellLookups=new WeakMap<MapDefinition,Int32Array>();
function cellLookup(map:MapDefinition):Int32Array {
 let lookup=cellLookups.get(map);if(lookup)return lookup;
 // radius bounds |q| and |r| for every shape, so one square table covers any map.
 const size=2*map.radius+1;lookup=new Int32Array(size*size).fill(-1);
 for(const c of map.cells)lookup[(c.q+map.radius)*size+c.r+map.radius]=c.id;
 cellLookups.set(map,lookup);return lookup;
}
export function region(map:MapDefinition,center:number,radius:number):number[] {
 const lookup=cellLookup(map),R=map.radius,size=2*R+1,{q:cq,r:cr}=map.cells[center],cells:number[]=[];
 for(let r=-radius;r<=radius;r++)for(let q=Math.max(-radius,-r-radius);q<=Math.min(radius,-r+radius);q++){
  const aq=cq+q,ar=cr+r;cells.push(aq<-R||aq>R||ar<-R||ar>R?-1:lookup[(aq+R)*size+ar+R]);
 }
 return cells;
}
export const MAP_SHAPE={HEX:0,RECT:1} as const;
/** Rectangle sized from the hex radius: about the same cell count, 2:1 for landscape screens. */
export function rectHalfSize(radius:number):{cols:number;rows:number}{return {cols:Math.round(radius*1.18),rows:Math.round(radius*.64)};}
function shapeCoords(radius:number,shape:number):Axial[]{
 if(shape!==MAP_SHAPE.RECT)return disk({q:0,r:0},radius);
 const {cols,rows}=rectHalfSize(radius),cells:Axial[]=[];
 // Odd-r offset rows: every row spans the same x range, so the board is a true rectangle.
 for(let r=-rows;r<=rows;r++){const shift=Math.floor(r/2);for(let col=-cols;col<=cols;col++)cells.push({q:col-shift,r});}
 return cells;
}
export function mapIdFor(radius:number,side:number,shape=0):string{return shape===MAP_SHAPE.RECT?'rect-r'+radius+'-a'+side+'-v1':'hex-r'+radius+'-a'+side+'-v1';}
const cellCounts=new Map<string,number>();
export function mapCellCount(radius:number,shape=0):number{
 if(shape!==MAP_SHAPE.RECT)return 1+3*radius*(radius+1);
 const key=radius+':'+shape;let n=cellCounts.get(key);if(n===undefined){n=shapeCoords(radius,shape).length;cellCounts.set(key,n);}return n;
}
export function createMap(radius=22,side=32,shape=0):MapDefinition {
 if(!Number.isInteger(radius)||radius<1||radius>64||!Number.isFinite(side)||side<=0||(shape!==0&&shape!==1)) throw new Error('Invalid map');
 const coords=shapeCoords(radius,shape), byKey=new Map(coords.map((a,i)=>[axialKey(a.q,a.r),i]));
 const cells=coords.map((a,id)=>{
  const center=axialToWorld(a.q,a.r,side);
  const vertices=Array.from({length:6},(_,i)=>{const angle=(60*i-30)*Math.PI/180;return {x:center.x+side*Math.cos(angle),y:center.y+side*Math.sin(angle)};});
  return {...a,id,center,vertices,neighbors:HEX_DIRECTIONS.map(d=>byKey.get(axialKey(a.q+d.q,a.r+d.r))??-1)};
 });
 // Edge k lies between vertices k and k+1 and points toward direction k.
 const boundaryEdges=cells.flatMap(c=>c.neighbors.flatMap((n,k)=>n<0?[{a:c.vertices[(6-k)%6],b:c.vertices[(7-k)%6]}]:[]));
 const points=[{q:-8,r:0},{q:0,r:8},{q:8,r:-8}];
 // Rings to the edge: boundary cells are 0. On the hexagon this equals radius - distance to centre.
 const inset=new Int16Array(cells.length).fill(-1),queue:number[]=[];
 for(const c of cells)if(c.neighbors.some(n=>n<0)){inset[c.id]=0;queue.push(c.id);}
 for(let head=0;head<queue.length;head++){const id=queue[head];for(const n of cells[id].neighbors)if(n>=0&&inset[n]<0){inset[n]=inset[id]+1;queue.push(n);}}
 const bound=coords.reduce((m,a)=>Math.max(m,Math.abs(a.q),Math.abs(a.r)),0);
 return {mapId:mapIdFor(radius,side,shape),radius:bound,side,shape,inset,cells,byKey,boundaryEdges,
  controlPoints:points.flatMap((p,i)=>{const id=byKey.get(axialKey(p.q,p.r));return id===undefined?[]:[{pointId:i,cellId:id}];}),
  // Hand-tuned hex anchors only fit the hexagon; other shapes use generated starts.
  anchors:shape!==MAP_SHAPE.HEX?[]:scaledStartAnchors(radius).flatMap(p=>{const id=byKey.get(axialKey(p.q,p.r));return id===undefined?[]:[id];})};
}

