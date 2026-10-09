import {describe,it,expect,vi} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs} from '../../src/shared/bot.js';
import {setOwner,addTrail,clearTrail} from '../../src/shared/territory.js';
import {markDead} from '../../src/shared/life.js';
import {region,hexDistance} from '../../src/shared/hex.js';
import {inspectSpawnSpace,trySpawn,tryRespawns,watchSpawnAttempts,type SpawnAttemptTrace} from '../../src/shared/spawn.js';
import {retryHumanRun} from '../../src/shared/retry.js';
import {setSafeBotRespawn,ownedDistances,coreDistance,experimentalSafeRespawn} from '../../src/shared/safe-bot-respawn.js';
import {PracticeSession} from '../../src/client/practice.js';
import {territoryFixture,safePocket95Fixture,independentCenters,type TerritoryLayout} from '../safe-bot-respawn-fixture.js';
function small(){
 const m=createMatch({mapRadius:12},9,[{participantId:'h',slot:0,nickname:'H',kind:'HUMAN'},...botSpecs(1,1)]),[other,p]=m.participants;
 markDead(m,p,'TRAIL_CUT');m.tick=90;for(const c of m.map.cells)setOwner(m,c.id,0);
 other.lifeState='FINISHED';setSafeBotRespawn(m,true);return {m,p,other,center:m.map.byKey.get('0,0')!};
}
describe('three-neutral-layer BOT death respawn',()=>{
 it('blocks a three-radius hole, retries only at one second, then grants exactly seven cells in a four-radius hole',()=>{
  const {m,p,other,center}=small();for(const c of m.map.cells)setOwner(m,c.id,other.slot+1);
  for(const id of region(m.map,center,3))setOwner(m,id,0);
  const trace:SpawnAttemptTrace[]=[];watchSpawnAttempts(m,t=>trace.push(t));
  m.tick=89;tryRespawns(m);expect(trace).toHaveLength(0);expect(p.respawnAtTick).toBe(90);
  m.tick=90;tryRespawns(m);expect(p.lifeState).toBe('SPAWN_BLOCKED');expect(p.respawnAtTick).toBe(120);
  expect(trace[0]).toMatchObject({success:false,validCenterCount:0});const before=m.owners.slice();
  m.tick=119;tryRespawns(m);expect(trace).toHaveLength(1);expect(m.owners).toEqual(before);
  for(const id of region(m.map,center,4))setOwner(m,id,0);
  const distances=ownedDistances(m);expect(inspectSpawnSpace(m,p)).toMatchObject({validCenterCount:1,bestCenter:center,nearestOwnedTerritoryDistance:4});
  m.tick=120;tryRespawns(m);expect(p.lifeState).toBe('ALIVE');expect(p.lifeId).toBe(2);expect(p.spawnCells.size).toBe(7);expect(p.territoryCount).toBe(7);expect(coreDistance(p.spawnCells,distances)).toBe(4);
  for(const id of region(m.map,center,4))if(!p.spawnCells.has(id))expect(m.owners[id]).toBe(0);
 });
 it('protects every owner equally, including territory owned by a HUMAN or BOT',()=>{
  const {m,p,other,center}=small();m.spawnOrder=[center];const owned=m.map.byKey.get('4,0')!;setOwner(m,owned,other.slot+1);
  const human=inspectSpawnSpace(m,p);expect(human.validCenterCount).toBe(0);other.kind='BOT';expect(inspectSpawnSpace(m,p)).toEqual(human);
  setOwner(m,owned,0);setOwner(m,m.map.byKey.get('5,0')!,other.slot+1);expect(inspectSpawnSpace(m,p).validCenterCount).toBe(1);
 });
 it('keeps head, trail, reservation, neutral-core and control-point safety',()=>{
  const {m,p,other,center}=small();m.spawnOrder=[center];const id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
  other.lifeState='ALIVE';other.cellId=id(3);expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);
  other.cellId=id(-10);addTrail(m,other,id(3));expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);
  clearTrail(m,other);addTrail(m,other,id(4));expect(inspectSpawnSpace(m,p).validCenterCount).toBe(1);clearTrail(m,other);
  expect(inspectSpawnSpace(m,p,new Set([id(3)])).validCenterCount).toBe(0);expect(inspectSpawnSpace(m,p,new Set([center])).validCenterCount).toBe(0);
  setOwner(m,center,other.slot+1);expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);setOwner(m,center,0);
  m.spawnOrder=[m.map.controlPoints[0].cellId];expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);
 });
 it('requires all three neutral layers to be playable; never counts outside cells as neutral',()=>{
  const {m,p}=small();m.spawnOrder=[m.map.byKey.get('11,0')!];expect(region(m.map,m.spawnOrder[0],1).every(id=>id>=0)).toBe(true);
  expect(inspectSpawnSpace(m,p)).toMatchObject({validCenterCount:0,edgeRejectedCount:1});
 });
 it('prioritizes old safety over greater territory distance, then territory distance and candidate order',()=>{
  const {m,p,other}=small(),id=(q:number)=>m.map.byKey.get(q+',0')!;const near=id(4),far=id(-6);m.spawnOrder=[near,far];
  setOwner(m,id(10),other.slot+1);other.lifeState='ALIVE';other.cellId=id(-12);addTrail(m,other,id(-10));
  expect(inspectSpawnSpace(m,p)).toMatchObject({bestCenter:near,bestSafety:13,nearestOwnedTerritoryDistance:5});
  clearTrail(m,other);other.lifeState='FINISHED';expect(inspectSpawnSpace(m,p).bestCenter).toBe(far);
  setOwner(m,id(10),0);setOwner(m,id(0),other.slot+1);m.spawnOrder=[id(6),id(-6)];expect(inspectSpawnSpace(m,p).bestCenter).toBe(id(6));
  m.spawnOrder.reverse();expect(inspectSpawnSpace(m,p).bestCenter).toBe(id(-6));
 });
 it('has no ownership source requirement or occupancy-based cap',()=>{
  const {m,p}=small();expect(inspectSpawnSpace(m,p).nearestOwnedTerritoryDistance).toBeNull();expect(trySpawn(m,p)).toBe(true);
  const {m:full,p:waiting,ownedCount}=safePocket95Fixture();expect(full.owners.reduce((sum,owner)=>sum+Number(owner!==0),0)).toBe(ownedCount);const distances=ownedDistances(full);expect(inspectSpawnSpace(full,waiting).validCenterCount).toBeGreaterThan(0);
  expect(trySpawn(full,waiting)).toBe(true);expect(coreDistance(waiting.spawnCells,distances)).toBeGreaterThanOrEqual(4);
 });
 it('protects earlier same-tick respawn territory during the next BOT attempt',()=>{
  const m=createMatch({mapRadius:12},9,botSpecs(2)),[a,b]=m.participants;
  for(const p of m.participants)markDead(m,p,'TRAIL_CUT');for(const c of m.map.cells)setOwner(m,c.id,0);m.tick=90;setSafeBotRespawn(m,true);
  tryRespawns(m);expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('ALIVE');expect(a.spawnCells.size).toBe(7);expect(b.spawnCells.size).toBe(7);
  const distance=Math.min(...[...a.spawnCells].flatMap(x=>[...b.spawnCells].map(y=>hexDistance(m.map.cells[x],m.map.cells[y]))));expect(distance).toBeGreaterThanOrEqual(4);
 });
 it('keeps HUMAN Retry and initial/replacement BOT spawn exactly on the baseline path',()=>{
  const {m,p,other,center}=small();for(const c of m.map.cells)setOwner(m,c.id,other.slot+1);for(const id of region(m.map,center,1))setOwner(m,id,0);m.spawnOrder=[center];
  expect(inspectSpawnSpace(m,p).validCenterCount).toBe(0);p.deaths=0;p.lifeId=0;expect(inspectSpawnSpace(m,p).validCenterCount).toBe(1);
  const a=createMatch({},41,[{participantId:'h',slot:0,nickname:'H',kind:'HUMAN'},...botSpecs(13,1)],'identical');
  const b=structuredClone(a);setSafeBotRespawn(a,true);expect(a).toEqual(b);
  for(const world of [a,b])markDead(world,world.participants[0],'WALL_HIT');
  expect(inspectSpawnSpace(a,a.participants[0])).toEqual(inspectSpawnSpace(b,b.participants[0]));
  expect(retryHumanRun(a,a.participants[0])).toBe(true);expect(retryHumanRun(b,b.participants[0])).toBe(true);expect(a).toEqual(b);
 });
 it('enables Practice by default and allows baseline only in development',()=>{
  expect(experimentalSafeRespawn('territory-safe',true)).toBe(true);expect(experimentalSafeRespawn('baseline',true)).toBe(false);
  expect(experimentalSafeRespawn(null,true)).toBe(true);expect(experimentalSafeRespawn('baseline',false)).toBe(true);
  for(const value of ['territory-safe','invalid',null])expect(experimentalSafeRespawn(value,false)).toBe(true);expect(()=>experimentalSafeRespawn('invalid',true)).toThrow();
  const practice=new PracticeSession('H',()=>{},{},{seed:41,autoStart:false});expect(practice.match.participants).toHaveLength(14);
  const p=practice.match.participants[13];markDead(practice.match,p,'TRAIL_CUT');expect(inspectSpawnSpace(practice.match,p).edgeRejectedCount).toBe(1308);practice.dispose();
  const {m,p:bot}=small(),baseline=structuredClone(m);setSafeBotRespawn(m,false);expect(inspectSpawnSpace(m,bot)).toEqual(inspectSpawnSpace(baseline,baseline.participants[1]));
  expect(trySpawn(m,bot)).toBe(trySpawn(baseline,baseline.participants[1]));expect(m).toEqual(baseline);
 });
 it('Production Practice applies the rule even if a caller requests the development baseline',()=>{
  vi.stubEnv('DEV',false);vi.stubEnv('MODE','production');
  try{
   const session=new PracticeSession('H',()=>{},{},{safeBotRespawn:false,seed:41,autoStart:false});
   const bot=session.match.participants[13];markDead(session.match,bot,'TRAIL_CUT');expect(inspectSpawnSpace(session.match,bot).edgeRejectedCount).toBe(1308);session.dispose();
  }finally{vi.unstubAllEnvs();}
 });
 it('explicit development baseline Practice retains its original candidate scan',()=>{
  const session=new PracticeSession('H',()=>{},{},{safeBotRespawn:false,seed:41,autoStart:false});
  const bot=session.match.participants[13];markDead(session.match,bot,'TRAIL_CUT');expect(inspectSpawnSpace(session.match,bot).edgeRejectedCount).toBeUndefined();session.dispose();
 });
 for(const layout of ['clustered','distributed'] as TerritoryLayout[])it.each([20,40,60,80,95])('%s percent '+layout+' fixture matches independent full neutral-region enumeration',percent=>{
  const {m,p}=territoryFixture(percent,layout),expected=independentCenters(m),space=inspectSpawnSpace(m,p),before=m.owners.slice();
  expect(m.map.cells).toHaveLength(9577);expect(space.validCenterCount).toBe(expected.length);
  const owned=ownedDistances(m),success=trySpawn(m,p);expect(success).toBe(expected.length>0);
  if(success){expect(expected).toContain(p.cellId);expect([...p.spawnCells].every(id=>before[id]===0)).toBe(true);expect(coreDistance(p.spawnCells,owned)).toBeGreaterThanOrEqual(4);expect(p.spawnCells.size).toBe(7);}
  else{expect(p.lifeState).toBe('SPAWN_BLOCKED');expect(m.owners).toEqual(before);}
 });
});
