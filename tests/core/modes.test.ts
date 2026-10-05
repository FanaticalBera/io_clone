import {describe,it,expect} from 'vitest';
import {createMode,GAME_MODE_IDS,isGameModeId,territoryPercent,validateMode,type GameModeId} from '../../src/shared/modes.js';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {resolveAtTime,stepMatch} from '../../src/shared/engine.js';
import {buildView,computeResults,finishMatch} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot,validDirection} from '../../src/shared/protocol.js';
import {completeClassic} from '../mode-fixture.js';
import {PracticeSession} from '../../src/client/practice.js';
describe('Classic-only authoritative mode rules',()=>{
 it('accepts only Classic and rejects former HOLD settings',()=>{
  expect(GAME_MODE_IDS).toEqual(['classic']);expect(createMode()).toEqual({id:'classic'});expect(isGameModeId('hold')).toBe(false);
  expect(()=>createMode('hold' as GameModeId)).toThrow();
  for(const mode of [{id:'other'},{id:'classic',holdSeconds:1},{id:'hold',targetPercent:50,holdSeconds:10}])expect(()=>validateMode(mode)).toThrow();
  expect(territoryPercent(1518,1519)).toBe(99.9);
 });
 it('Classic never ends under 100%, ignores legacy points/time, and wins exactly at 100%',()=>{
  const {m,a,b}=captureFixture();b.lifeState='DEAD_WAIT';b.respawnAtTick=999999;a.cellId=m.map.byKey.get('0,0')!;a.position={...m.map.cells[a.cellId].center};
  for(const cell of m.map.cells)setOwner(m,cell.id,1);setOwner(m,m.map.cells.length-1,0);a.controlScore=99999;m.tick=7201;
  resolveAtTime(m);expect(m.phase).toBe('RUNNING');expect(buildView(m).remainingTicks).toBeNull();
  setOwner(m,m.map.cells.length-1,1);resolveAtTime(m);expect(m.outcome).toEqual({winnerId:'a',reason:'FULL_CAPTURE',atTick:7201});expect(m.phase).toBe('FINISHED');
  const frozen=JSON.stringify(buildView(m));stepMatch(m);finishMatch(m,{winnerId:'b',reason:'FULL_CAPTURE',atTick:7201});expect(JSON.stringify(buildView(m))).toBe(frozen);expect(m.events.filter(e=>e.type==='FINISH')).toHaveLength(1);
 });
 it('settles same-instant cut/death and territory loss before Classic victory',()=>{
  for(const wall of [false,true]){const {m,a,b,id}=captureFixture();completeClassic(m);a.protectedUntilTick=0;
   if(!wall){b.lifeState='ALIVE';b.cellId=id(1,0);addTrail(m,a,b.cellId);}
   resolveAtTime(m,0,wall?new Set(['a']):new Set());expect(m.phase).toBe('RUNNING');expect(m.outcome).toBeNull();expect(a.lifeState).toBe('ELIMINATED');
  }
 });

 it('ranks by territory then kills, ignoring accumulated legacy points',()=>{
  const {m,a,b}=captureFixture();a.territoryCount=b.territoryCount=10;a.controlScore=999;b.kills=1;expect(computeResults(m).map(r=>r.participantId)).toEqual(['b','a']);
 });

 it('keeps Classic snapshots compatible and rejects HOLD snapshots, progress and outcomes',()=>{
  const {m}=captureFixture(),wire=packSnapshot(buildView(m),1,0,'a');expect(unpackSnapshot(wire)).toEqual(buildView(m));
  for(const bad of [{...wire,gameMode:{id:'hold',targetPercent:50,holdSeconds:10}},{...wire,modeState:{holds:[{participantId:'a',startedAtTick:0,endsAtTick:300}]}},{...wire,remainingTicks:0},{...wire,gameMode:undefined},{...wire,phase:'FINISHED',outcome:null}])expect(()=>unpackSnapshot(bad)).toThrow();
  completeClassic(m);resolveAtTime(m);const result=packSnapshot(buildView(m),2,1,'a');expect(unpackSnapshot(result).outcome).toEqual(m.outcome);
  expect(()=>unpackSnapshot({...result,outcome:{...m.outcome,reason:'HELD_TERRITORY'}})).toThrow();
  expect(validDirection({matchId:'m',lifeId:1,seq:1,dx:1,dy:0,winnerId:'a'})).toBe(false);
 });
 it('practice and restart use the Classic engine',()=>{
  const session=new PracticeSession('P',()=>{}, {},{seed:19,autoStart:false,gameMode:createMode()});
  completeClassic(session.match);session.advance(0);session.advance(1000/30);expect(session.match.phase).toBe('FINISHED');expect(session.match.outcome?.reason).toBe('FULL_CAPTURE');
  const next=new PracticeSession('P',()=>{}, {},{seed:20,autoStart:false,gameMode:session.match.gameMode});expect(next.match.gameMode).toEqual({id:'classic'});expect(next.match.modeState.holds).toEqual([]);session.dispose();next.dispose();
 });
});
