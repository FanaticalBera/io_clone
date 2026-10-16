import type {Cell,MapDefinition} from '../shared/model.js';
import type {CaptureBloom,BloomCell} from './territory-capture-model.js';
import {tileSpot,themedDelay,themedWave,themedEdgeColors,type CaptureTheme,type TileSpot} from './capture-themes.js';

export interface PreparedCaptureTile {
 spot:TileSpot;delay:number;
 edges:({angle:number;colors:{line:number;core:number}}|undefined)[];
}
/** Only geometry and colours are static. Animation still runs at the current elapsed time. */
export function prepareCaptureTile(c:Cell,effect:CaptureBloom,cell:BloomCell,theme:CaptureTheme,span:number,radius:number):PreparedCaptureTile {
 const spot=tileSpot(c.center.x,c.center.y,effect.origin,span?cell.delay/span:0,radius);
 const edges=Array.from({length:6},(_,k)=>{
  if(!(cell.edges&(1<<k)))return undefined;
  const v=c.vertices[(6-k)%6],w=c.vertices[(7-k)%6];
  const angle=Math.atan2((v.y+w.y)/2-effect.origin.y,(v.x+w.x)/2-effect.origin.x);
  return {angle,colors:themedEdgeColors(theme,angle,effect.color)};
 });
 return {spot,delay:themedDelay(theme,spot,themedWave(radius)),edges};
}
interface PreparedEffect {map:MapDefinition;theme:CaptureTheme;color:number;span:number;radius:number;tiles:Map<number,PreparedCaptureTile>}
export class CaptureThemeCache {
 private effects=new WeakMap<CaptureBloom,PreparedEffect>();
 forEffect(map:MapDefinition,effect:CaptureBloom,theme:CaptureTheme,span:number,radius:number):Map<number,PreparedCaptureTile> {
  let entry=this.effects.get(effect);
  if(!entry||entry.map!==map||entry.theme!==theme||entry.color!==effect.color||entry.span!==span||entry.radius!==radius){
   entry={map,theme,color:effect.color,span,radius,tiles:new Map()};this.effects.set(effect,entry);
  }
  return entry.tiles;
 }
}
