import {it,expect} from 'vitest';
import {wallLoop} from '../wall-loop-fixture.js';
import {MAP_SHAPE} from '../../src/shared/hex.js';

it.each([MAP_SHAPE.RECT,MAP_SHAPE.CROSS].flatMap(shape=>[false,true].map(reverse=>({shape,reverse}))))('shape $shape, reverse $reverse: a real wall loop captures its inside',({shape,reverse})=>{
 const {match,self,insideId,initialInside,waypoint}=wallLoop(shape,reverse);
 expect(waypoint).toBe(4);expect(self.lifeState).toBe('ALIVE');expect(self.trailCells.size).toBe(0);
 expect(initialInside).toBe(0);expect(match.owners[insideId]).toBe(self.slot+1);
 expect(match.events.some(e=>e.type==='CAPTURE')).toBe(true);
});

it.each([false,true])('islands: a compact real wall loop captures its inside (reverse %s)',reverse=>{
 const {match,self,insideId,initialInside,waypoint}=wallLoop(MAP_SHAPE.ISLANDS,reverse,true);
 expect(waypoint).toBe(4);expect(self.lifeState).toBe('ALIVE');expect(self.trailCells.size).toBe(0);
 expect(initialInside).toBe(0);expect(match.owners[insideId]).toBe(self.slot+1);
});
