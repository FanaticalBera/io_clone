import {describe,it,expect} from 'vitest';
import {createMap,hexDistance,mapCellCount,mapIdFor,MAP_SHAPE} from '../../src/shared/hex.js';
import {createMatch} from '../../src/shared/game.js';
import {stepMatch} from '../../src/shared/engine.js';
import {buildView} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {botSpecs,getBotInput,observeBot,createBotMemory} from '../../src/shared/bot.js';
import {MAP_PRESETS,mapPreset} from '../../src/shared/map-presets.js';
import {validateConfig} from '../../src/shared/config.js';
describe('map shapes',()=>{
 it('keeps the hexagon identical: inset is radius minus distance and the default config has no shape key',()=>{
  const map=createMap(56,32);
  expect(map.mapId).toBe('hex-r56-a32-v1');expect(map.cells).toHaveLength(9577);expect(map.radius).toBe(56);
  expect(map.cells.every(c=>map.inset[c.id]===56-hexDistance(c,{q:0,r:0}))).toBe(true);
  expect('mapShape' in validateConfig({})).toBe(false);
 });
 it('builds a 2:1 rectangle with about the hexagon cell count and correct edge rings',()=>{
  const map=createMap(56,32,MAP_SHAPE.RECT);
  expect(map.mapId).toBe(mapIdFor(56,32,MAP_SHAPE.RECT));expect(map.cells).toHaveLength(mapCellCount(56,MAP_SHAPE.RECT));expect(map.cells).toHaveLength(133*73);
  const xs=map.cells.map(c=>c.center.x),ys=map.cells.map(c=>c.center.y);
  expect((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))).toBeGreaterThan(1.9);
  expect(map.cells.filter(c=>c.neighbors.some(n=>n<0)).every(c=>map.inset[c.id]===0)).toBe(true);
  expect(Math.max(...map.inset)).toBeGreaterThan(30);expect(map.anchors).toEqual([]);
 });
 it.each(MAP_PRESETS.map(p=>[p.id,p.config] as const))('%s preset runs a full bot match and survives the wire format',(id,config)=>{
  const count=validateConfig(config).maxSlots,m=createMatch(config,7,botSpecs(count),'map-'+id),memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(p.slot+1)]));
  expect(m.participants).toHaveLength(count);
  for(const p of m.participants)expect(m.owners[p.cellId]).toBe(p.slot+1);
  for(let tick=0;tick<600;tick++){
   const inputs=new Map();for(const p of m.participants){if(p.lifeState!=='ALIVE')continue;const input=getBotInput(observeBot(m,p.participantId),memories.get(p.participantId)!);if(input)inputs.set(p.participantId,input);}
   stepMatch(m,inputs);
  }
  expect(m.participants.reduce((n,p)=>n+p.territoryCount,0)).toBeGreaterThan(count*7);
  const view=unpackSnapshot(packSnapshot(buildView(m),1,0,null));
  expect(view.mapId).toBe(m.map.mapId);expect(view.owners).toEqual(m.owners);
 });
 it('falls back to the hexagon for unknown saved choices',()=>{expect(mapPreset('nope').id).toBe('hex');expect(mapPreset('rect').config).toEqual({mapShape:MAP_SHAPE.RECT});});
});
