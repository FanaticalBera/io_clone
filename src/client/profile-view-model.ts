import {MARKERS,MARKER_COLORS,DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,markerDefinition,markerColorDefinition} from './catalog.js';
import type {PlayerProfileV1} from './profile.js';
import {MAP_PRESETS} from '../shared/map-presets.js';
export function profileViewModel(profile:PlayerProfileV1){
 const inventory=profile.inventory,markerIds=new Set(inventory.ownedMarkerIds),colorIds=new Set(inventory.ownedMarkerColorIds);
 const marker=markerDefinition(inventory.equippedMarkerId)??markerDefinition(DEFAULT_MARKER_ID)!;
 const color=markerColorDefinition(inventory.equippedMarkerColorId)??markerColorDefinition(DEFAULT_MARKER_COLOR_ID)!;
 const record=(key:string)=>({best:0,clears:0,runs:0,kills:0,longest:0,topKills:0,...(profile.stats.maps?.[key]??{})});
 // Per board: classic, the growth challenge and the 3-minute round.
 const maps=MAP_PRESETS.map(p=>({id:p.id,name:p.name,...record(p.id),growth:record('growth:'+p.id),timed:record('timed:'+p.id)}));
 const lastMap=Math.max(0,maps.findIndex(m=>m.id===(profile.stats.lastMap??'hex')));
 return {coins:profile.coins,stats:{...profile.stats},maps,lastMap,collection:{markersOwned:MARKERS.filter(m=>markerIds.has(m.id)).length,markersTotal:MARKERS.length,colorsOwned:MARKER_COLORS.filter(c=>colorIds.has(c.id)).length,colorsTotal:MARKER_COLORS.length},
  equipped:{markerId:marker.id,markerName:marker.name,colorId:color.id,colorName:color.name,colorValue:color.value}};
}
export type ProfileViewModel=ReturnType<typeof profileViewModel>;
