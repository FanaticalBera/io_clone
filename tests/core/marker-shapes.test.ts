import {describe,it,expect} from 'vitest';
import {MARKERS} from '../../src/client/catalog.js';
import {MARKER_SHAPES,markerShape,markerSvg,shadeColor,hexColor} from '../../src/client/marker-shapes.js';
describe('vector marker shapes',()=>{
 it('paints every catalog marker with the body colour and its shaded side, inside the 64-unit box',()=>{
  for(const m of MARKERS){
   const svg=markerSvg(m.id,0xa180f4,160);
   expect(svg).toContain('viewBox="-32 -32 64 64"');expect(svg).toContain('width="160"');expect(svg).toContain(hexColor(0xa180f4));
   expect(svg).not.toMatch(/<script|foreignObject|<image|href=/);
  }
  expect(markerSvg('default',0xa180f4)).toContain(hexColor(shadeColor(0xa180f4)));
 });
 it('animates exactly the Special category and falls back to the default piece',()=>{
  for(const m of MARKERS)expect(!!MARKER_SHAPES[m.id].motion).toBe(m.category==='SPECIAL');
  expect(markerShape('missing')).toBe(MARKER_SHAPES.default);
 });
 it('adds sparkles and the orbit satellite only for still previews',()=>{
  expect(markerSvg('crown',0x16cdb1,64,true).length).toBeGreaterThan(markerSvg('crown',0x16cdb1).length);
  expect(markerSvg('orbit',0x16cdb1,64,true)).toContain('#ffc93c');expect(markerSvg('orbit',0x16cdb1)).not.toContain('#ffc93c');
 });
});
