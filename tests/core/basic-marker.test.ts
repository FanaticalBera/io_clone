import {describe,it,expect} from 'vitest';
import {markerArt} from '../../src/client/marker-art.js';
import {MARKERS,MARKER_COLORS} from '../../src/client/catalog.js';
const art=(id:string,color='violet')=>markerArt({markerId:id,markerColorId:color},0xa180f4,true);
describe('approved Basic Ring / Target geometry',()=>{
 it('uses the approved geometry by default without experiment flags',()=>{
  expect(art('ring').primitives).toHaveLength(4);expect(art('target').primitives).toHaveLength(19);
  expect(markerArt({markerId:'ring',markerColorId:'slot'},0x16cdb1,false,true).primitives).toHaveLength(4);
 });
 it('keeps Default, Hex and IMAGE geometry unchanged',()=>{
  expect(art('default').primitives[0]).toMatchObject({kind:'circle',radius:21,fill:0xa180f4,stroke:0xffffff,width:5});
  expect(art('hex').primitives[0]).toMatchObject({kind:'polygon',fill:0xa180f4,stroke:0xffffff,width:3});
  for(const m of MARKERS.filter(m=>m.renderType==='IMAGE')){const a=art(m.id);expect(a.primitives[0]).toMatchObject({kind:'circle',radius:19,fill:0xa180f4,stroke:0xffffff,width:3});expect(a.definition.assetKey).toBe(m.assetKey);expect(a.definition.detailAssetKey).toBe(m.detailAssetKey);}
 });
 it('preserves the open Ring and two contrast boundaries within diameter 48',()=>{
  const p=art('ring').primitives.slice(0,-1);expect(p).toHaveLength(3);
  expect(p.every(q=>q.kind==='circle'&&q.fill===undefined&&q.radius+q.width!/2<=24)).toBe(true);
  expect(p.map(q=>q.stroke)).toEqual([0xfffcf3,0x142330,0xa180f4]);
 });
 it('uses an outlined outer ring, four crosshair arms and a center for Target',()=>{
  const a=art('target');expect(a.primitives.filter(p=>p.kind==='line')).toHaveLength(12);
  expect(a.primitives.some(p=>p.kind==='circle'&&p.radius===8)).toBe(false);
  expect(a.primitives.at(-1)).toMatchObject({kind:'circle',radius:25.5,stroke:0xa180f4,width:2,tag:'IDENTIFICATION'});
 });
 it('retains every purchased body color and the participant identification ring',()=>{
  for(const c of MARKER_COLORS)for(const id of ['ring','target']){
   const a=art(id,c.id);expect(a.bodyColor).toBe(c.value??0xa180f4);
   expect(a.primitives.at(-1)).toMatchObject({radius:25.5,stroke:0xa180f4,width:2,tag:'IDENTIFICATION'});
   expect(a.primitives.some(p=>p.stroke===a.bodyColor||('fill'in p&&p.fill===a.bodyColor))).toBe(true);
  }
 });
});
