import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {HEX_DIRECTIONS,axialToWorld,worldCell} from '../../src/shared/hex.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import type {Vec} from '../../src/shared/model.js';
import {setHomeReturnMargin} from '../../src/shared/home-return-margin.js';

const distance=Math.sqrt(3)*32*4.41/30;
type Path={name:string;start:Vec;direction:Vec;enters:boolean};
const paths:Path[]=[];
for(const [side,axial] of HEX_DIRECTIONS.entries()){
 const n=axialToWorld(axial.q,axial.r,1),length=Math.hypot(n.x,n.y),normal={x:n.x/length,y:n.y/length};
 const edge={x:normal.x*Math.sqrt(3)*16,y:normal.y*Math.sqrt(3)*16};
 for(const degrees of [-80,-45,0,45,80]){
  const a=degrees*Math.PI/180,direction={x:-normal.x*Math.cos(a)+normal.y*Math.sin(a),y:-normal.y*Math.cos(a)-normal.x*Math.sin(a)};
  paths.push({name:`side ${side}, ${degrees} degrees`,start:{x:edge.x-direction.x*distance*.2,y:edge.y-direction.y*distance*.2},direction,enters:true});
 }
}
for(let vertex=0;vertex<6;vertex++)for(const gap of [.01,.1,1])for(const sign of [-1,1])for(const enters of [false,true]){
 const a=(60*vertex-30)*Math.PI/180,radial={x:Math.cos(a),y:Math.sin(a)},direction={x:-radial.y*sign,y:radial.x*sign};
 const mid={x:radial.x*(32+(enters?-gap:gap)),y:radial.y*(32+(enters?-gap:gap))};
 paths.push({name:`vertex ${vertex}, gap ${gap}, sign ${sign}, ${enters?'grazing entry':'near miss'}`,start:{x:mid.x-direction.x*distance/2,y:mid.y-direction.y*distance/2},direction,enters});
}

// Independent polygon clipping oracle: do not ask traceMovement which cells
// should be visited. In particular, a short corner chord ends outside again.
function entryFraction(vertices:Vec[],start:Vec,direction:Vec):number|null {
 let lo=0,hi=1;
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],edge={x:b.x-a.x,y:b.y-a.y};
  const gap=edge.x*(start.y-a.y)-edge.y*(start.x-a.x),rate=distance*(edge.x*direction.y-edge.y*direction.x);
  if(Math.abs(rate)<1e-12){if(gap<0)return null;continue;}
  const t=-gap/rate;if(rate>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  if(lo>hi)return null;
 }
 return lo;
}
function fixture(path:Path,kind:'return'|'cut'){
 const m=createMatch({},4,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]);
 // Retain the centre-entry baseline for comparison with the adopted margin.
 setHomeReturnMargin(m,0);
 const [a,b]=m.participants,cell=(q:number,r:number)=>m.map.byKey.get(`${q},${r}`)!,target=cell(0,0);
 for(let i=0;i<m.owners.length;i++)setOwner(m,i,0);
 for(const p of m.participants){p.trailCells.clear();p.trailOriginCellId=null;p.protectedUntilTick=0;p.targetDirection=null;}
 a.position={...path.start};a.cellId=worldCell(m.map,a.position);a.direction={...path.direction};
 b.cellId=cell(8,8);b.position={...m.map.cells[b.cellId].center};b.direction={x:1,y:0};setOwner(m,cell(8,7),2);
 if(kind==='return'){
  setOwner(m,target,1);a.trailOriginCellId=target;addTrail(m,a,a.cellId);
 }else{
  setOwner(m,a.cellId,1);addTrail(m,b,target);
  const home=m.map.cells[target].neighbors.find(id=>id!==a.cellId&&id!==worldCell(m.map,{x:a.position.x+distance*a.direction.x,y:a.position.y+distance*a.direction.y}))!;
  setOwner(m,home,2);b.trailOriginCellId=home;
 }
 return {m,a,b,target};
}

describe('current-speed centre-entry baseline for home return and enemy trail contact',()=>{
 it.each([.1,.2,.3])('resolves a cut at tick fraction %s against a return at .2 in event order',cutAt=>{
  const path=paths.find(p=>p.name==='side 0, 0 degrees')!,{m,a,b,target}=fixture(path,'return'),trail=a.cellId;
  // The rival crosses the far edge of the exposed trail tile. The returner
  // crosses its near edge into home during this very same simulation tick.
  b.position={x:Math.sqrt(3)*32*1.5+distance*cutAt,y:0};b.cellId=worldCell(m.map,b.position);b.direction={x:-1,y:0};
  setOwner(m,b.cellId,2);
  stepMatch(m);
  if(cutAt<=.2){
   expect(a.lifeState).toBe('ELIMINATED');expect(b.kills).toBe(1);
   expect(a.deathContext).toMatchObject({cause:'EXISTING_TRAIL_CONTACT',cellId:trail});
   expect(a.deathContext!.eventTick).toBeCloseTo(cutAt,4);
   expect(m.events.some(e=>e.type==='CAPTURE'&&e.participantId===a.participantId)).toBe(false);
  }else{
   expect(a.lifeState).toBe('ALIVE');expect(b.kills).toBe(0);expect(a.cellId).toBe(target);
   expect(m.owners[trail]).toBe(1);expect(m.trailMasks[trail]).toBe(2); // Rival starts its own excursion here.
   expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId===a.participantId)).toHaveLength(1);
  }
  assertOwnershipCounts(m);
 });
 it.each(paths)('$name: closes on the first home entry, including a sub-tick corner crossing',path=>{
  const {m,a,target}=fixture(path,'return'),startCell=a.cellId,entry=entryFraction(m.map.cells[target].vertices,path.start,path.direction);
  expect(entry!==null).toBe(path.enters);expect(startCell).not.toBe(target);expect(m.config.moveCellsPerSecond).toBe(4.41);
  stepMatch(m);
  const captures=m.events.filter(e=>e.type==='CAPTURE'&&e.participantId===a.participantId);
  expect(a.lifeState).toBe('ALIVE');expect(captures).toHaveLength(path.enters?1:0);
  if(path.enters){
   expect(m.owners[startCell]).toBe(1);expect(a.trailCells.has(startCell)).toBe(false);
   // A corner crossing may immediately begin another excursion. Checking just
   // the final cell/trail would incorrectly classify this valid capture as lost.
   if(path.name.startsWith('vertex')){expect(a.cellId).not.toBe(target);expect(a.trailCells.size).toBe(1);}
  }else expect(a.trailCells.has(startCell)).toBe(true);
  assertOwnershipCounts(m);
 });
 it.each(paths)('$name: cuts an enemy trail on the same entry and leaves a near miss alive',path=>{
  const {m,a,b,target}=fixture(path,'cut'),entry=entryFraction(m.map.cells[target].vertices,path.start,path.direction);
  expect(entry!==null).toBe(path.enters);stepMatch(m);
  expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe(path.enters?'ELIMINATED':'ALIVE');
  expect(a.kills).toBe(path.enters?1:0);
  if(entry!==null){
   expect(b.deathContext).toMatchObject({cause:'EXISTING_TRAIL_CONTACT',cellId:target});
   expect(b.deathContext!.eventTick).toBeCloseTo(entry,4);
   expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId===b.participantId)).toHaveLength(1);
  }
  assertOwnershipCounts(m);
 });
});
