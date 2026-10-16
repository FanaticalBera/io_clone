import {it,expect} from 'vitest';
import {createMap} from '../../src/shared/hex.js';
import {CaptureThemeCache,prepareCaptureTile} from '../../src/client/capture-theme-cache.js';
import {CAPTURE_THEMES,tileSpot,themedDelay,themedWave,themedEdgeColors,themedTile,themedEdge} from '../../src/client/capture-themes.js';
import type {CaptureBloom,BloomCell} from '../../src/client/territory-capture-model.js';

const map=createMap(3),span=250,radius=300;
const effect=():CaptureBloom=>({participantId:'a',lifeId:1,slot:0,color:0x46c46a,startedAt:0,chunks:new Map(),neutralCount:1,stolenCount:0,origin:{x:17,y:-29},cellCount:1,losses:new Map()});
it.each(Object.entries(CAPTURE_THEMES))('%s: cached inputs preserve tile timing, colour, pop and every border animation',(_name,theme)=>{
 const e=effect();
 for(const c of map.cells){
  const cell:BloomCell={id:c.id,edges:c.id%64,cancelled:false,delay:c.id*7,prior:0,priorColor:0,victimEdges:0};
  for(const color of [0x46c46a,0xffe066,0x34408f]){
   e.color=color;
   const prepared=prepareCaptureTile(c,e,cell,theme,span,radius);
   const spot=tileSpot(c.center.x,c.center.y,e.origin,cell.delay/span,radius),delay=themedDelay(theme,spot,themedWave(radius));
   expect(prepared.spot).toEqual(spot);expect(prepared.delay).toBe(delay);
   for(const elapsed of [-1,0,100,250,500,999]){
    expect(themedTile(theme,prepared.spot,elapsed-prepared.delay,color)).toEqual(themedTile(theme,spot,elapsed-delay,color));
    for(let k=0;k<6;k++)if(cell.edges&(1<<k)){
     const v=c.vertices[(6-k)%6],w=c.vertices[(7-k)%6],angle=Math.atan2((v.y+w.y)/2-e.origin.y,(v.x+w.x)/2-e.origin.x);
     expect(prepared.edges[k]!.angle).toBe(angle);
     expect(prepared.edges[k]!.colors).toEqual(themedEdgeColors(theme,angle,color));
     expect(themedEdge(theme,prepared.edges[k]!.angle,elapsed)).toBe(themedEdge(theme,angle,elapsed));
    }
   }
  }
 }
});
it('reuses only the same effect, map, theme, owner colour and wave dimensions',()=>{
 const cache=new CaptureThemeCache(),e=effect(),theme=CAPTURE_THEMES.ember;
 const first=cache.forEffect(map,e,theme,span,radius);
 expect(cache.forEffect(map,e,theme,span,radius)).toBe(first);
 e.color=0xffe066;const recolored=cache.forEffect(map,e,theme,span,radius);expect(recolored).not.toBe(first);
 expect(cache.forEffect(map,e,CAPTURE_THEMES.portal,span,radius)).not.toBe(recolored);
 const original=cache.forEffect(map,e,theme,span,radius);
 const resized=cache.forEffect(map,e,theme,span,radius+1);expect(resized).not.toBe(original);
 const respanned=cache.forEffect(map,e,theme,span+1,radius+1);expect(respanned).not.toBe(resized);
 expect(cache.forEffect(createMap(2),e,theme,span+1,radius+1)).not.toBe(respanned);
 expect(cache.forEffect(map,effect(),theme,span,radius)).not.toBe(first);
});
