import {describe,it,expect} from 'vitest';
import {createMap,disk,region,axialKey,hexDistance} from '../../src/shared/hex.js';

// Performance PRD (spawn): the numeric region lookup and the arithmetic edge test must match the
// original string-key region and its "some cell is off the board" check exactly.
const reference=(map:ReturnType<typeof createMap>,center:number,radius:number)=>disk(map.cells[center],radius).map(a=>map.byKey.get(axialKey(a.q,a.r))??-1);
describe('Performance PRD: spawn geometry',()=>{
 it('region returns the same cells in the same order as disk + byKey',()=>{
  for(const mapRadius of [1,8,22,56])for(const radius of [0,1,2,4,6]){const map=createMap(mapRadius,32);
   for(const c of map.cells)expect(region(map,c.id,radius)).toEqual(reference(map,c.id,radius));}
 });
 it('a clearance disk leaves the board exactly when origin distance plus its radius exceeds the map radius',()=>{
  for(const mapRadius of [8,56])for(const radius of [1,4]){const map=createMap(mapRadius,32);
   for(const c of map.cells)expect(hexDistance(c,{q:0,r:0})+radius>map.radius).toBe(reference(map,c.id,radius).some(id=>id<0));}
 });
});
