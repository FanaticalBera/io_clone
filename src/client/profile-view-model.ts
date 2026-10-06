import {MARKERS,MARKER_COLORS,DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,markerDefinition,markerColorDefinition} from './catalog.js';
import type {PlayerProfileV1} from './profile.js';
export function profileViewModel(profile:PlayerProfileV1){
 const inventory=profile.inventory,markerIds=new Set(inventory.ownedMarkerIds),colorIds=new Set(inventory.ownedMarkerColorIds);
 const marker=markerDefinition(inventory.equippedMarkerId)??markerDefinition(DEFAULT_MARKER_ID)!;
 const color=markerColorDefinition(inventory.equippedMarkerColorId)??markerColorDefinition(DEFAULT_MARKER_COLOR_ID)!;
 return {coins:profile.coins,stats:{...profile.stats},collection:{markersOwned:MARKERS.filter(m=>markerIds.has(m.id)).length,markersTotal:MARKERS.length,colorsOwned:MARKER_COLORS.filter(c=>colorIds.has(c.id)).length,colorsTotal:MARKER_COLORS.length},
  equipped:{markerId:marker.id,markerName:marker.name,colorId:color.id,colorName:color.name,colorValue:color.value}};
}
export type ProfileViewModel=ReturnType<typeof profileViewModel>;
