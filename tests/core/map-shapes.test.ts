import {describe,it,expect} from 'vitest';
import {createMap,hexDistance,mapCellCount,mapIdFor,MAP_SHAPE} from '../../src/shared/hex.js';
import {createMatch} from '../../src/shared/game.js';
import {stepMatch} from '../../src/shared/engine.js';
import {buildView} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {botSpecs,getBotInput,observeBot,createBotMemory} from '../../src/shared/bot.js';
import {MAP_PRESETS,mapPreset} from '../../src/shared/map-presets.js';
import {validateConfig} from '../../src/shared/config.js';
import {boundaryGeometry,movementCell} from '../../src/shared/wall-margin.js';
import {traceMovement} from '../../src/shared/movement.js';
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
 it.each(MAP_PRESETS.map(p=>[p.id,p.config] as const))('%s board is one connected piece with an edge ring of 0',(_id,config)=>{
  const c=validateConfig(config),map=createMap(c.mapRadius,c.hexSideWorldUnits,c.mapShape??0),seen=new Uint8Array(map.cells.length),queue=[0];seen[0]=1;
  for(let i=0;i<queue.length;i++)for(const n of map.cells[queue[i]].neighbors)if(n>=0&&!seen[n]){seen[n]=1;queue.push(n);}
  expect(queue.length).toBe(map.cells.length);expect(map.cells.length).toBe(mapCellCount(c.mapRadius,c.mapShape??0));
  expect(map.cells.every(cell=>map.inset[cell.id]>=0)).toBe(true);
 });
 it.each(MAP_PRESETS.map(p=>[p.id,p.config] as const))('%s: nobody drives into the edge in the first two seconds without input',(id,config)=>{
  const count=validateConfig(config).maxSlots,specs=botSpecs(count).map(s=>({...s,kind:'HUMAN' as const})),m=createMatch(config,5,specs,'straight-'+id);
  for(let tick=0;tick<2*m.config.simulationHz;tick++)stepMatch(m,new Map());
  expect(m.participants.filter(p=>p.deathReason==='WALL_HIT').map(p=>p.slot)).toEqual([]);
 });
 it('straightens the sawtooth side walls so a player can slide down the rectangle edge',()=>{
  const map=createMap(56,32,MAP_SHAPE.RECT),edges=boundaryGeometry(map).edges,left=Math.min(...edges.map(e=>Math.min(e.a.x,e.b.x)));
  const side=edges.filter(e=>Math.max(e.a.x,e.b.x)<left+1);
  expect(side.every(e=>Math.abs(e.a.x-left)<1e-6&&Math.abs(e.b.x-left)<1e-6)).toBe(true);
  const ys=map.cells.map(c=>c.center.y),top=Math.min(...ys),bottom=Math.max(...ys),x=left+2;
  for(let y=top;y<=bottom;y+=3)expect(movementCell(map,{x,y})).toBeGreaterThanOrEqual(0);
  const start={x,y:top},move=traceMovement(map,start,movementCell(map,start),{x:0,y:1},bottom-top);
  expect(move.blocked).toBe(false);
 });
 it('falls back to the hexagon for unknown saved choices',()=>{expect(mapPreset('nope').id).toBe('hex');expect(mapPreset('rect').config).toEqual({mapShape:MAP_SHAPE.RECT});});
});
