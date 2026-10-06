import type {MarkerPrimitive} from './marker-art.js';
// Approved Ring / Target geometry. The outer body stays within a 48-world-unit envelope.
export function contrastBasicPrimitives(shape:'RING'|'TARGET',color:number):MarkerPrimitive[]{
 const p:MarkerPrimitive[]=[],light=0xfffcf3,dark=0x142330;
 const ring=(radius:number,width:number)=>{
  for(const [stroke,thickness] of [[light,width+6],[dark,width+4],[color,width]])p.push({kind:'circle',x:0,y:0,radius,stroke,width:thickness});
 };
 if(shape==='RING')ring(18,6);
 else{
  ring(16,3);
  for(const [x1,y1,x2,y2] of [[-24,0,-12,0],[12,0,24,0],[0,-24,0,-12],[0,12,0,24]]){
   for(const [stroke,width] of [[light,8],[dark,6],[color,3]])p.push({kind:'line',x1,y1,x2,y2,stroke,width});
  }
  for(const [radius,fill] of [[6,dark],[5,light],[3.5,color]])p.push({kind:'circle',x:0,y:0,radius,fill});
 }
 return p;
}
