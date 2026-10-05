import {describe,it,expect} from 'vitest';
import {createMap,region,hexDistance,START_ANCHORS,scaledStartAnchors} from '../../src/shared/hex.js';
import {createMatch} from '../baseline.js';
import {botSpecs} from '../../src/shared/bot.js';
import {DEFAULT_CONFIG} from '../../src/shared/config.js';
import {createMode} from '../../src/shared/modes.js';

describe('radius-scaled initial placement, with unchanged R22 and respawn settings',()=>{
 it('keeps every original R22 coordinate and participant assignment',()=>{
  const map=createMap();expect(map.anchors.map(id=>({q:map.cells[id].q,r:map.cells[id].r}))).toEqual(START_ANCHORS);
  expect(scaledStartAnchors(22)).toEqual(START_ANCHORS);expect(DEFAULT_CONFIG.mapRadius).toBe(56);
 });
 it('all R22–R64 maps fit eight disjoint complete spawn zones without control points',()=>{
  for(let radius=22;radius<=64;radius++){
   const map=createMap(radius),owned=new Set<number>();expect(map.anchors).toHaveLength(8);expect(new Set(map.anchors).size).toBe(8);
   for(const id of map.anchors){expect(hexDistance(map.cells[id],{q:0,r:0})+2).toBeLessThanOrEqual(radius);const zone=region(map,id,2);expect(zone).toHaveLength(19);
    for(const cell of zone){expect(cell).toBeGreaterThanOrEqual(0);expect(owned.has(cell)).toBe(false);expect(map.controlPoints.some(p=>p.cellId===cell)).toBe(false);owned.add(cell);}
   }
   expect(owned.size).toBe(152);
  }
 });
 it.each([32,36,40])('R%s: normal eight-participant initialization is deterministic across seed and spec order in Classic',radius=>{
  for(const mode of ['classic'] as const)for(const seed of [4,19,73,115]){
   const specs=botSpecs(8),a=createMatch({mapRadius:radius},seed,specs,'same',createMode(mode)),b=createMatch({mapRadius:radius},seed,[...specs].reverse(),'same',createMode(mode));
   expect(a.owners).toEqual(b.owners);const assignment=(m:typeof a)=>[...m.participants].sort((x,y)=>x.slot-y.slot).map(p=>[p.participantId,p.cellId,p.spawnCells]);expect(assignment(a)).toEqual(assignment(b));
   expect(a.participants.every(p=>p.lifeState==='ALIVE'&&p.spawnCells.size===19&&p.territoryCount===19)).toBe(true);
   expect({...a.config,mapRadius:22}).toEqual({...DEFAULT_CONFIG,mapRadius:22,maxSlots:8,spawnRadius:2});
  }
 });
 it('initial spacing increases with radius and cube rounding preserves opposite anchors',()=>{
  let previousMin=0,previousMean=0;
  for(const radius of [22,32,36,40]){const anchors=scaledStartAnchors(radius),distances:number[]=[];
   for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)distances.push(hexDistance(anchors[i],anchors[j]));
   const min=Math.min(...distances),mean=distances.reduce((a,b)=>a+b,0)/distances.length;expect(min).toBeGreaterThan(previousMin);expect(mean).toBeGreaterThan(previousMean);previousMin=min;previousMean=mean;
   for(let i=0;i<4;i++)expect(anchors[i+4]).toEqual({q:-anchors[i].q||0,r:-anchors[i].r||0});
  }
 });
 it('does not silently start an unsafe small map with overlapping/out-of-bounds zones',()=>{
  expect(()=>createMatch({mapRadius:3},4,botSpecs(8))).toThrow('Invalid spawn anchor');
 });
});
