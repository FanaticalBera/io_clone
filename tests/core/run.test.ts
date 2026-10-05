import {describe,it,expect} from 'vitest';
import {createMatch,stepMatch,buildView} from '../../src/shared/game.js';
import {botSpecs} from '../../src/shared/bot.js';
import {markDead} from '../../src/shared/life.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {resolveAtTime} from '../../src/shared/engine.js';
import {retryHumanRun} from '../../src/shared/retry.js';
import {tryRespawns,trySpawn} from '../../src/shared/spawn.js';
import {finishMatch} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {PracticeSession} from '../../src/client/practice.js';
import {captureFixture} from './helpers.js';
const human={participantId:'h',slot:0,nickname:'H',kind:'HUMAN' as const};
describe('Run lifecycle in the actual simulation',()=>{
 it('defaults to R56/16 and gives all participants seven protected cells',()=>{
  const session=new PracticeSession('H',()=>{},{},{seed:4,autoStart:false}),m=session.match;
  expect(m.config).toMatchObject({mapRadius:56,maxSlots:16,spawnRadius:1,protectSeconds:2,spawnBufferHexes:3});
  expect(m.map.cells).toHaveLength(9577);expect(m.participants).toHaveLength(16);
  expect(m.participants.filter(p=>p.kind==='BOT')).toHaveLength(15);
  expect(m.participants.every(p=>p.lifeState==='ALIVE'&&p.territoryCount===7&&p.spawnCells.size===7)).toBe(true);
  expect(m.participants[0].run?.startedAtTick).toBe(0);expect(unpackSnapshot(packSnapshot(buildView(m),1,0,session.selfId)).config.mapRadius).toBe(56);session.dispose();
 });
 it('keeps a human eliminated beyond the BOT deadline while slot 15 respawns',()=>{
  const m=createMatch({},4,[human,...botSpecs(15,1)]),a=m.participants[0],b=m.participants[15];
  markDead(m,a,'WALL_HIT');markDead(m,b,'WALL_HIT');expect(a.lifeState).toBe('ELIMINATED');expect(b.lifeState).toBe('DEAD_WAIT');
  const result=a.run!.result!;m.tick=90;tryRespawns(m);expect(a.lifeState).toBe('ELIMINATED');expect(a.lifeId).toBe(1);expect(trySpawn(m,a)).toBe(false);
  expect(b.lifeState).toBe('ALIVE');expect(b.lifeId).toBe(2);expect(b.territoryCount).toBe(7);expect(a.run!.result).toBe(result);
  expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId==='h')).toHaveLength(0);
  // Events age out after one second; the result is durable in a later snapshot.
  expect(unpackSnapshot(packSnapshot(buildView(m),2,0,'h')).participants[0].run!.result).toEqual(result);
 });
 it('explicit retry preserves the board and bots, changes life/run identity and resets Run stats',()=>{
  const m=createMatch({},4,[human,...botSpecs(15,1)]),a=m.participants[0],oldCell=a.cellId;a.kills=3;m.tick=30;markDead(m,a,'WALL_HIT');
  const old=structuredClone(a.run!.result),owners=m.owners.slice(),bots=m.participants.slice(1).map(p=>[p.lifeId,p.cellId,p.territoryCount]);
  expect(retryHumanRun(m,a)).toBe(true);expect(a.lifeState).toBe('ALIVE');expect(a.cellId).not.toBe(oldCell);expect(a.lifeId).toBe(2);expect(a.run!.result).toBeNull();expect(a.run!.runId).not.toBe(old!.runId);
  expect(a.kills-a.run!.initialKills).toBe(0);expect(a.run!.bestTerritoryCells).toBe(7);
  expect(m.participants.slice(1).map(p=>[p.lifeId,p.cellId,p.territoryCount])).toEqual(bots);
  for(const c of m.map.cells)if(!a.spawnCells.has(c.id))expect(m.owners[c.id]).toBe(owners[c.id]);
  expect(old!.kills).toBe(3);expect(retryHumanRun(m,a)).toBe(false);
 });
 it('keeps the highest authoritative territory even without intermediate snapshots',()=>{
  const m=createMatch({},4,[human]),a=m.participants[0],extra=m.map.cells.filter(c=>m.owners[c.id]===0).slice(0,20);
  for(const c of extra)setOwner(m,c.id,1);resolveAtTime(m);expect(a.run!.bestTerritoryCells).toBe(27);
  for(const c of extra)setOwner(m,c.id,0);resolveAtTime(m);m.tick=30;markDead(m,a,'WALL_HIT');
  expect(a.run!.result).toMatchObject({bestTerritoryCells:27,bestTerritoryPercent:.2,durationTicks:30});
 });
 it('settles mutual cuts before locking either human result',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(-2,0),1);setOwner(m,id(2,0),2);
  a.cellId=id(0,0);b.cellId=id(0,0);for(const p of [a,b]){p.position={...m.map.cells[p.cellId].center};p.protectedUntilTick=0;addTrail(m,p,id(0,0));}
  resolveAtTime(m);expect(a.run!.result).toMatchObject({endReason:'DEATH',kills:1});expect(b.run!.result).toMatchObject({endReason:'DEATH',kills:1});
  const first=structuredClone(a.run!.result);finishMatch(m,{winnerId:'b',reason:'FULL_CAPTURE',atTick:m.tick});expect(a.run!.result).toEqual(first);
 });
 it('distinguishes clear/loss for surviving humans and never overwrites an earlier death',()=>{
  for(const winner of ['h','other']){
   const m=createMatch({},4,[human,{...human,participantId:'other',slot:1}]);
   finishMatch(m,{winnerId:winner,reason:'FULL_CAPTURE',atTick:0});
   expect(m.participants[0].run!.result!.endReason).toBe(winner==='h'?'FULL_CAPTURE_WIN':'FULL_CAPTURE_LOSS');
  }
 });
 it('freezes single-player simulation while rendering may continue; retry resumes the same match',()=>{
  let publications=0;const session=new PracticeSession('H',()=>publications++,{},{seed:4,autoStart:false}),m=session.match,a=m.participants[0];
  markDead(m,a,'WALL_HIT');const tick=m.tick;session.advance(0);session.advance(1000);expect(m.tick).toBe(tick);
  expect(session.retryRun()).toBe(true);session.advance(1000);session.advance(1100);expect(m.tick).toBeGreaterThan(tick);expect(session.match).toBe(m);expect(publications).toBeGreaterThan(1);session.dispose();
 });
 it('waits for a neutral seven-cell region after explicit retry instead of stealing spawn space',()=>{
  const m=createMatch({},4,[human,...botSpecs(1,1)]),a=m.participants[0];markDead(m,a,'WALL_HIT');
  for(const c of m.map.cells)setOwner(m,c.id,2);expect(retryHumanRun(m,a)).toBe(true);expect(a.lifeState).toBe('SPAWN_BLOCKED');
  m.tick=30;tryRespawns(m);expect(a.lifeState).toBe('SPAWN_BLOCKED');expect(m.owners.every(o=>o===2)).toBe(true);
 });
});
describe('home entry uses the head centre, not the visible circle edge',()=>{
 it('does not capture on circle overlap and captures exactly when the centre crosses home',()=>{
  const {m,a,b,id}=captureFixture();b.lifeState='FINISHED';setOwner(m,id(0,0),1);
  const half=Math.sqrt(3)*m.map.side/2;a.cellId=id(1,0);a.position={x:half+9,y:0};a.direction={x:-1,y:0};a.protectedUntilTick=0;addTrail(m,a,id(1,0));
  stepMatch(m);expect(a.position.x).toBeGreaterThan(half);expect(a.position.x-21).toBeLessThan(half);expect(a.trailCells.size).toBe(1);expect(m.owners[id(1,0)]).toBe(0);
  stepMatch(m);expect(a.position.x).toBeLessThan(half);expect(a.trailCells.size).toBe(0);expect(m.owners[id(1,0)]).toBe(1);expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId==='a')).toHaveLength(1);
 });
});