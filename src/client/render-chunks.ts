import type {MapDefinition} from '../shared/model.js';
export interface RenderChunk {key:string;cells:number[];minX:number;minY:number;maxX:number;maxY:number}
export function indexRenderChunks(map:MapDefinition,size=16):{chunks:Map<string,RenderChunk>;keys:string[]} {
 const chunks=new Map<string,RenderChunk>(),keys:string[]=[];
 for(const c of map.cells){
  const key=Math.floor((c.q+map.radius)/size)+':'+Math.floor((c.r+map.radius)/size);keys[c.id]=key;
  let chunk=chunks.get(key);if(!chunk){chunk={key,cells:[],minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};chunks.set(key,chunk);}
  chunk.cells.push(c.id);for(const v of c.vertices){chunk.minX=Math.min(chunk.minX,v.x);chunk.minY=Math.min(chunk.minY,v.y);chunk.maxX=Math.max(chunk.maxX,v.x);chunk.maxY=Math.max(chunk.maxY,v.y);}
 }
 return {chunks,keys};
}
// Culling margin beyond the last rendered camera view (performance PRD G2). Visibility is recomputed
// every frame and players move ~4 cells/s, so three cells cover a frame's movement with room to spare;
// the former one-chunk (16-cell) margin drew far more chunks than are ever seen.
export const CULL_MARGIN_CELLS=3;
export function cullMargin(map:MapDefinition):number {return CULL_MARGIN_CELLS*Math.sqrt(3)*map.side;}
