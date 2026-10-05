import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,assertOwnershipCounts,pruneDisconnectedTerritory} from '../../src/shared/territory.js';
import {applySimultaneousCaptures,stepMatch} from '../../src/shared/engine.js';
import {axialToWorld,worldCell} from '../../src/shared/hex.js';
import {moveSpeed} from '../../src/shared/config.js';
import {legacyScoreTick as scoreTick} from '../../src/shared/legacy-scoring.js';

describe('user reports: disconnected territory and lethal outer walls',()=>{
 it('neutralizes the smaller territory below a captured bridge, independent of participant order',()=>{
  for(const reverse of [false,true]){
   const {m,a,b,id}=captureFixture();
   for(const q of [-3,-2,-1,0,1])setOwner(m,id(q,0),2);
   setOwner(m,id(0,-1),1);a.cellId=id(0,-1);b.cellId=id(-2,0);
   addTrail(m,a,id(0,0));if(reverse)m.participants.reverse();
   applySimultaneousCaptures(m,[a]);
   expect(m.owners[id(1,0)]).toBe(0);expect(m.owners[id(0,0)]).toBe(1);
   expect(b.territoryCount).toBe(3);expect(a.territoryCount).toBe(2);assertOwnershipCounts(m);
  }
 });
 it('breaks equal sized component ties by the lowest cell ID',()=>{
  const {m,a,b,id}=captureFixture();
  for(const q of [-2,-1,0,1,2])setOwner(m,id(q,0),2);
  setOwner(m,id(0,-1),1);a.cellId=id(0,-1);addTrail(m,a,id(0,0));
  applySimultaneousCaptures(m,[a]);
  const left=[id(-2,0),id(-1,0)],right=[id(1,0),id(2,0)];
  const kept=Math.min(...left)<Math.min(...right)?left:right,dropped=kept===left?right:left;
  expect(kept.map(c=>m.owners[c])).toEqual([2,2]);expect(dropped.map(c=>m.owners[c])).toEqual([0,0]);
  expect(b.territoryCount).toBe(2);assertOwnershipCounts(m);
 });
 it('a control point in a detached component becomes neutral without erasing earned points',()=>{
  const {m,a}=captureFixture(22);const cp=m.map.controlPoints[0].cellId;
  setOwner(m,cp,1);
  const far=m.map.cells.find(c=>Math.hypot(c.center.x-m.map.cells[cp].center.x,c.center.y-m.map.cells[cp].center.y)>180&&c.neighbors.filter(n=>n>=0).length===6)!;
  setOwner(m,far.id,1);setOwner(m,far.neighbors[0],1);a.cellId=far.id;a.controlScore=7;
  pruneDisconnectedTerritory(m,a);m.tick=30;scoreTick(m);
  expect(m.owners[cp]).toBe(0);expect(a.territoryCount).toBe(2);expect(a.controlScore).toBe(7);assertOwnershipCounts(m);
 });
 it('kills at the wall during the tick, clears territory/trail and never credits a kill',()=>{
  const {m,a,b,id}=captureFixture();b.lifeState='FINISHED';
  a.cellId=id(5,0);setOwner(m,a.cellId,1);a.position=axialToWorld(5,0);
  a.position.x+=Math.sqrt(3)*16-1;a.direction={x:1,y:0};addTrail(m,a,id(4,0));
  a.controlScore=7;a.kills=2;a.spawnCells.add(a.cellId);a.protectedUntilTick=60;
  const start={...a.position};stepMatch(m);
  expect(a).toMatchObject({lifeState:'ELIMINATED',deathReason:'WALL_HIT',deaths:1,territoryCount:0,controlScore:7,kills:2,respawnAtTick:0});
  expect(a.position.x-start.x).toBeCloseTo(1,5);expect(worldCell(m.map,a.position)).toBe(id(5,0));
  expect(a.trailCells.size).toBe(0);expect(m.trailMasks.every(v=>v===0)).toBe(true);expect(b.kills).toBe(0);
  stepMatch(m);expect(a.deaths).toBe(1);expect(m.events.filter(e=>e.type==='DEATH')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it('does not die merely for being in an edge hex while heading inward',()=>{
  const {m,a,b,id}=captureFixture();b.lifeState='FINISHED';a.cellId=id(5,0);setOwner(m,a.cellId,1);
  a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16-1;a.direction={x:-1,y:0};
  stepMatch(m,new Map([['a',{matchId:m.matchId,lifeId:a.lifeId,seq:1,dx:-1,dy:0}]]));
  expect(a.lifeState).toBe('ALIVE');expect(a.deaths).toBe(0);
 });
 it('cannot escape an imminent wall impact through an instantaneous reverse input',()=>{
  const {m,a,b,id}=captureFixture();b.lifeState='FINISHED';a.cellId=id(5,0);setOwner(m,a.cellId,1);
  a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16-1;a.direction={x:1,y:0};
  stepMatch(m,new Map([['a',{matchId:m.matchId,lifeId:a.lifeId,seq:1,dx:-1,dy:0}]]));
  expect(a.deathReason).toBe('WALL_HIT');expect(a.direction.x).toBeGreaterThan(0);
 });
 it('a wall death clears its trail before a later cutter, but an earlier cutter still earns a kill',()=>{
  for(const wallFirst of [true,false]){
   const {m,a,b,id}=captureFixture();setOwner(m,id(4,0),1);setOwner(m,id(1,0),2);
   a.cellId=id(5,0);a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16-(wallFirst?1:4);a.direction={x:1,y:0};
   addTrail(m,a,id(0,0));b.cellId=id(1,0);b.position={x:Math.sqrt(3)*16+(wallFirst?4:1),y:0};b.direction={x:-1,y:0};
   stepMatch(m);expect(a.deaths).toBe(1);expect(a.deathReason).toBe(wallFirst?'WALL_HIT':'TRAIL_CUT');expect(b.kills).toBe(wallFirst?0:1);
   expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId==='a')).toHaveLength(1);assertOwnershipCounts(m);
  }
 });
 it('Classic still kills at a wall at the former timed endpoint',()=>{
  const {m,a,b,id}=captureFixture();b.lifeState='FINISHED';a.cellId=id(5,0);setOwner(m,a.cellId,1);
  a.position=axialToWorld(5,0);a.position.x+=Math.sqrt(3)*16-moveSpeed(m.config)/m.config.simulationHz;
  a.direction={x:1,y:0};m.tick=m.config.roundSeconds*m.config.simulationHz-1;stepMatch(m);
  expect(m.phase).toBe('RUNNING');expect(a.deaths).toBe(1);expect(a.territoryCount).toBe(0);
 });
});
