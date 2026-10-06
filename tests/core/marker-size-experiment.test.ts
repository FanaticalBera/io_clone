import {it,expect} from 'vitest';
import {experimentalMarkerDiameter} from '../../src/client/marker-size-experiment.js';
it('allows only the 42/48 image-size comparison in development/test',()=>{
 expect(experimentalMarkerDiameter('48',true)).toBe(48);
 for(const value of [null,'42','0','60','48.0','NaN'])expect(experimentalMarkerDiameter(value,true)).toBe(42);
});
it('keeps production image markers at the existing size regardless of query',()=>{
 expect(experimentalMarkerDiameter('48',false)).toBe(42);
});
