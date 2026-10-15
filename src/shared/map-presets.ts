import type {GameConfig} from './config.js';
import {MAP_SHAPE} from './hex.js';
/** Board choices for single play. Config overrides only; the hexagon keeps the default config untouched. */
export interface MapPreset {id:'hex'|'rect'|'mini';name:string;note:string;config:Partial<GameConfig>}
export const MAP_PRESETS:readonly Readonly<MapPreset>[]=Object.freeze([
 {id:'hex',name:'육각',note:'기본 · 14명',config:{}},
 {id:'rect',name:'직사각',note:'가로로 넓게 · 14명',config:{mapShape:MAP_SHAPE.RECT}},
 {id:'mini',name:'꼬마 육각',note:'빠른 한 판 · 4명',config:{mapRadius:24,maxSlots:4}}
].map(p=>Object.freeze(p as MapPreset)));
export const mapPreset=(id:string|null|undefined)=>MAP_PRESETS.find(p=>p.id===id)??MAP_PRESETS[0];
