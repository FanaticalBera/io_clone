import {describe,it,expect} from 'vitest';
import {createMode,evaluateMode,territoryPercent,validateMode} from '../../src/shared/modes.js';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail,clearTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {resolveAtTime,stepMatch} from '../../src/shared/engine.js';
import {markDead,leaveParticipant} from '../../src/shared/life.js';
import {buildView,computeResults,finishMatch} from '../../src/shared/scoring.js';
import {packSnapshot,unpackSnapshot,validDirection} from '../../src/shared/protocol.js';
import {completeClassic} from '../mode-fixture.js';
import {PracticeSession} from '../../src/client/practice.js';
function fixture(targetPercent=50,holdSeconds=10){
 const f=captureFixture();f.m.gameMode=createMode('hold',{hold:{targetPercent,holdSeconds}});
 f.a.cellId=f.id(0,0);f.b.cellId=f.id(4,0);
 for(const p of [f.a,f.b])p.position={...f.m.map.cells[p.cellId].center};
 setOwner(f.m,f.a.cellId,1);setOwner(f.m,f.b.cellId,2);return f;
}
function own(f:ReturnType<typeof fixture>,count:number){
 clearTrail(f.m,f.a);for(const cell of f.m.map.cells)if(cell.id!==f.b.cellId)setOwner(f.m,cell.id,0);
 const cells=[f.a.cellId,...f.m.map.cells.map(c=>c.id).filter(id=>id!==f.a.cellId&&id!==f.b.cellId)];
 for(const id of cells.slice(0,count))setOwner(f.m,id,1);assertOwnershipCounts(f.m);
}
describe('Classic and Hold authoritative mode rules',()=>{
 it('validates centralized settings and never rounds a partial board to 100%',()=>{
  expect(createMode()).toEqual({id:'classic'});expect(createMode('hold')).toEqual({id:'hold',targetPercent:50,holdSeconds:10});
  for(const mode of [{id:'other'},{id:'classic',holdSeconds:1},{id:'hold',targetPercent:0,holdSeconds:10},{id:'hold',targetPercent:101,holdSeconds:10},{id:'hold',targetPercent:50,holdSeconds:Infinity}])expect(()=>validateMode(mode)).toThrow();
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
   resolveAtTime(m,0,wall?new Set(['a']):new Set());expect(m.phase).toBe('RUNNING');expect(m.outcome).toBeNull();expect(a.lifeState).toBe('DEAD_WAIT');
  }
 });
 it('starts only at threshold, cancels immediately, and restarts a full continuous interval',()=>{
  const f=fixture(),required=Math.ceil(f.m.map.cells.length*.5);own(f,required-1);resolveAtTime(f.m);expect(f.m.modeState.holds).toEqual([]);
  own(f,required);resolveAtTime(f.m);expect(f.m.modeState.holds).toEqual([{participantId:'a',startedAtTick:0,endsAtTick:300}]);
  f.m.tick=299;own(f,required-1);resolveAtTime(f.m);expect(f.m.modeState.holds).toEqual([]);expect(f.m.phase).toBe('RUNNING');
  own(f,required);resolveAtTime(f.m);expect(f.m.modeState.holds[0].endsAtTick).toBe(599);
  f.m.tick=598;resolveAtTime(f.m);expect(f.m.phase).toBe('RUNNING');f.m.tick=599;resolveAtTime(f.m);expect(f.m.outcome).toMatchObject({winnerId:'a',reason:'HELD_TERRITORY',atTick:599});
 });
 it('death cancels Hold at the exact expiry before a winner can be committed',()=>{
  const f=fixture();own(f,46);resolveAtTime(f.m);f.m.tick=300;resolveAtTime(f.m,300,new Set(['a']));expect(f.m.phase).toBe('RUNNING');expect(f.m.modeState.holds).toEqual([]);
 });
 it('clears a dead or departed holder immediately before any reconnect snapshot',()=>{
  for(const departed of [false,true]){const f=fixture();own(f,46);resolveAtTime(f.m);if(departed)leaveParticipant(f.m,f.a);else markDead(f.m,f.a,'WALL_HIT');expect(f.m.modeState.holds).toEqual([]);
   if(departed)f.m.participants=f.m.participants.filter(p=>p!==f.a);expect(()=>unpackSnapshot(packSnapshot(buildView(f.m),1,0,'b'))).not.toThrow();
  }
 });
 it('detects a below-threshold dip and recovery inside one tick',()=>{
  const f=fixture();own(f,46);resolveAtTime(f.m);f.m.tick=299;own(f,45);resolveAtTime(f.m,299.1);own(f,46);resolveAtTime(f.m,299.2);
  expect(f.m.modeState.holds[0].startedAtTick).toBe(299.2);expect(evaluateMode(f.m,300)).toBeNull();
 });
 it('resolves multiple eligible players deterministically independent of roster ordering',()=>{
  const winners=[];for(const reversed of [false,true]){const f=fixture(20,1);own(f,30);for(const c of f.m.map.cells.filter(c=>f.m.owners[c.id]===0).slice(0,29))setOwner(f.m,c.id,2);
   if(reversed)f.m.participants.reverse();resolveAtTime(f.m);expect(f.m.modeState.holds).toHaveLength(2);f.m.tick=30;resolveAtTime(f.m);winners.push(f.m.outcome!.winnerId);expect(f.m.results![0].participantId).toBe(f.m.outcome!.winnerId);
  }expect(winners[0]).toBe(winners[1]);
 });
 it('processes a fractional Hold deadline before later wall collisions in the same tick',()=>{
  const f=fixture(50,1);own(f,46);resolveAtTime(f.m,.25);f.m.tick=30;
  f.a.cellId=f.id(5,0);setOwner(f.m,f.a.cellId,1);f.a.position={...f.m.map.cells[f.a.cellId].center};f.a.position.x+=Math.sqrt(3)*16-4;f.a.direction={x:1,y:0};
  stepMatch(f.m);expect(f.m.outcome?.atTick).toBe(30.25);expect(f.a.deaths).toBe(0);expect(f.m.events.filter(e=>e.type==='FINISH')).toHaveLength(1);
 });
 it('restores mode, Hold progress and outcome from detached full wire snapshots',()=>{
  const f=fixture();own(f,46);resolveAtTime(f.m);const wire=packSnapshot(buildView(f.m),1,0,'a');const restored=unpackSnapshot(wire);
  expect(restored.gameMode).toEqual(f.m.gameMode);expect(restored.modeState).toEqual(f.m.modeState);restored.modeState.holds[0].endsAtTick++;
  expect(f.m.modeState.holds[0].endsAtTick).toBe(300);
  expect(()=>unpackSnapshot({...wire,remainingTicks:0})).toThrow();expect(()=>unpackSnapshot({...wire,gameMode:{id:'classic'}})).toThrow();expect(()=>unpackSnapshot({...wire,gameMode:undefined})).toThrow();expect(()=>unpackSnapshot({...wire,phase:'FINISHED',outcome:null})).toThrow();
  f.m.tick=300;resolveAtTime(f.m);expect(unpackSnapshot(packSnapshot(buildView(f.m),2,1,'a')).outcome).toEqual(f.m.outcome);
  expect(validDirection({matchId:'m',lifeId:1,seq:1,dx:1,dy:0,winnerId:'a'})).toBe(false);
 });
 it('ranks by territory then kills, ignoring accumulated legacy points',()=>{
  const {m,a,b}=captureFixture();a.territoryCount=b.territoryCount=10;a.controlScore=999;b.kills=1;expect(computeResults(m).map(r=>r.participantId)).toEqual(['b','a']);
 });
 it.each(['classic','hold'] as const)('practice uses the same %s engine and preserves settings for restart',id=>{
  const mode=createMode(id,{hold:{targetPercent:50,holdSeconds:.1}}),session=new PracticeSession('P',()=>{}, {},{seed:19,autoStart:false,gameMode:mode});
  completeClassic(session.match);session.advance(0);for(let i=1;i<=4;i++)session.advance(i*1000/30);
  expect(session.match.phase).toBe('FINISHED');expect(session.match.outcome?.reason).toBe(id==='classic'?'FULL_CAPTURE':'HELD_TERRITORY');
  const next=new PracticeSession('P',()=>{}, {},{seed:20,autoStart:false,gameMode:session.match.gameMode});expect(next.match.gameMode).toEqual(mode);expect(next.match.modeState.holds).toEqual([]);session.dispose();next.dispose();
 });
});
