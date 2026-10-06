import {it,expect} from 'vitest';
import {DEFAULT_IMAGE_MARKER_DIAMETER,experimentalMarkerDiameter} from '../../src/client/marker-size-experiment.js';
it('uses the approved 48 image diameter by default and ignores legacy comparison queries',()=>{
 expect(DEFAULT_IMAGE_MARKER_DIAMETER).toBe(48);
 for(const value of [null,'42','48','0','60','48.0','NaN'])expect(experimentalMarkerDiameter(value,true)).toBe(48);
});
it('uses the same fixed image diameter in production',()=>{
 for(const value of [null,'42','48','60'])expect(experimentalMarkerDiameter(value,false)).toBe(48);
});
