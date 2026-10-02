import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../../src/shared/bot.js';
import {inspectSpawnSpace,trySpawn,watchSpawnAttempts,type SpawnAttemptTrace} from '../../src/shared/spawn.js';
import {markDead} from '../../src/shared/life.js';
import {region} from '../../src/shared/hex.js';
import {setOwner,addTrail,clearTrail} from '../../src/shared/territory.js';
import {experimentalMapConfig,experimentalSeed} from '../../src/shared/map-experiment.js';

describe('the same spawn zone scan for measurement and actual respawn',()=>{
 it('counts exactly one complete neutral zone and applies reserved/trail safety to that same zone',()=>{
  const m=createMatch({},111,botSpecs(2)),[p,other]=m.participants;markDead(m,p,'TRAIL_CUT',other);m.tick=90;
  for(const cell of m.map.cells)setOwner(m,cell.id,other.slot+1);const center=m.map.byKey.get('0,0')!,zone=region(m.map,center,2);for(const id of zone)setOwner(m,id,0);
  expect(inspectSpawnSpace(m,p)).toMatchObject({validCenterCount:1,bestCenter:center});expect(inspectSpawnSpace(m)).toEqual(inspectSpawnSpace(m,p));
  expect(inspectSpawnSpace(m,p,new Set([zone[0]])).validCenterCount).toBe(0);addTrail(m,other,zone[0]);expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);clearTrail(m,other);
  const trace:SpawnAttemptTrace[]=[];watchSpawnAttempts(m,t=>trace.push(t));expect(trySpawn(m,p)).toBe(true);expect(p.cellId).toBe(center);expect(p.spawnCells.size).toBe(19);expect(trace[0]).toMatchObject({validCenterCount:1,success:true,center});
 });
 it('nineteen scattered neutral cells do not form a spawn center and retry is observed as blocked',()=>{
  const m=createMatch({},111,botSpecs(2)),[p,other]=m.participants;markDead(m,p,'TRAIL_CUT',other);m.tick=90;
  for(const c of m.map.cells)setOwner(m,c.id,other.slot+1);for(const c of m.map.cells.filter(c=>c.q%4===0&&c.r%4===0).slice(0,19))setOwner(m,c.id,0);
  const trace:SpawnAttemptTrace[]=[];watchSpawnAttempts(m,t=>trace.push(t));expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);expect(trySpawn(m,p)).toBe(false);m.tick=p.respawnAtTick;expect(trySpawn(m,p)).toBe(false);
  expect(trace.map(t=>[t.stateBefore,t.validCenterCount,t.success])).toEqual([['DEAD_WAIT',0,false],['SPAWN_BLOCKED',0,false]]);expect(trace[0].neutralCells).toBe(19);
 });
 it('measurement is read only and HUMAN/BOT have identical search and spawn outcomes',()=>{
  const m=createMatch({},19,botSpecs(8)),p=m.participants[0];markDead(m,p,'TRAIL_CUT');m.tick=90;const before=JSON.stringify(m,(_k,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:v);
  const space=inspectSpawnSpace(m,p);expect(JSON.stringify(m,(_k,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:v)).toBe(before);
  const human=structuredClone(m);human.participants[0].kind='HUMAN';expect(inspectSpawnSpace(human,human.participants[0])).toEqual(space);expect(trySpawn(m,p)).toBe(trySpawn(human,human.participants[0]));expect(p.cellId).toBe(human.participants[0].cellId);
 });
 it.each([[22,'bb37292c48f4722a8677229a8f15fe3715a4566c3d8c3ed5127ed81a4342b771'],[36,'245736e3787dae8fa07bdaf3ac6dd9a560fbc24b77362c01dc23ac578e66ca0b']] as const)('R%s: actual movement/capture/respawn matches the pre-refactor trajectory', (radius,expected)=>{
  const seed=4,m=createMatch({mapRadius:radius},seed,botSpecs(8),'spawn-equivalence'),memories=m.participants.map(p=>createBotMemory(seed+p.slot)),hash=createHash('sha256');watchSpawnAttempts(m,()=>{});
  for(let tick=0;tick<1200;tick++){
   const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);
   const {map,...state}=m;hash.update(JSON.stringify({state,memories},(_k,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v));
  }
  expect(hash.digest('hex')).toBe(expected);
 },20000);
 it('map experiment overrides are enabled only for explicit development/test calls',()=>{
  for(const radius of [22,28,32,36])expect(experimentalMapConfig(String(radius),true)).toEqual({mapRadius:radius});expect(experimentalMapConfig('36',false)).toEqual({});expect(experimentalMapConfig(undefined,true)).toEqual({});expect(()=>experimentalMapConfig('30',true)).toThrow();
  expect(createMatch({},4,botSpecs(8)).config.mapRadius).toBe(22);
  expect(experimentalSeed('4',true)).toBe(4);expect(experimentalSeed('4',false)).toBeUndefined();expect(()=>experimentalSeed('-1',true)).toThrow();
 });
});
