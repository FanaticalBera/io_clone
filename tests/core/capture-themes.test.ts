import {describe,it,expect} from 'vitest';
import {CAPTURE_THEMES,contrast,themedDelay,themedTile,tileSpot,themedEdge,THEME_HOLD,THEME_END} from '../../src/client/capture-themes.js';
import {MARKERS} from '../../src/client/catalog.js';
const FIRE=['ember','phoenix','golddragon'];
describe('premium capture themes',()=>{
 it('gives every premium marker a land theme; only fire keeps particle flames on top',()=>{
  // Premium = the special category plus every gold (legendary or reward) marker.
  const premium=MARKERS.filter(m=>m.category==='SPECIAL'||m.legendary).map(m=>m.id);
  expect(premium.filter(id=>!CAPTURE_THEMES[id])).toEqual([]);
  expect(Object.keys(CAPTURE_THEMES).every(id=>premium.includes(id))).toBe(true);
  expect(Object.keys(CAPTURE_THEMES).filter(id=>CAPTURE_THEMES[id].particles).sort()).toEqual([...FIRE].sort());
 });
 it('keeps every wave inside the wave time and every tile and border finite',()=>{
  for(const [id,theme] of Object.entries(CAPTURE_THEMES))for(let i=0;i<40;i++){
   const spot=tileSpot(Math.cos(i)*90+i,Math.sin(i)*70-i,{x:0,y:0},i/39,120),delay=themedDelay(theme,spot,250);
   expect(delay,id).toBeGreaterThanOrEqual(0);expect(delay,id).toBeLessThanOrEqual(250);
   for(const local of [0,THEME_HOLD*.3,THEME_HOLD*.7]){const look=themedTile(theme,spot,local,0x4ea8ff);if(look){expect(look.alpha,id).toBeGreaterThan(0);expect(look.alpha,id).toBeLessThanOrEqual(1);expect(Number.isInteger(look.color),id).toBe(true);}}
   expect(themedTile(theme,spot,THEME_HOLD,0x4ea8ff)).toBeNull();
   expect(themedEdge(theme,i,THEME_END)).toBe(0);
  }
 });
 it('moves a theme colour away from land of the same colour and leaves distinct ones alone',()=>{
  expect(contrast(0xffc93c,0x4ea8ff)).toBe(0xffc93c);
  expect(contrast(0xffc93c,0xffc93c)).not.toBe(0xffc93c);
  expect(contrast(0x9b6bff,0x9b6bff)).not.toBe(0x9b6bff);
 });
});
