import {describe,it,expect} from 'vitest';
import {createMatch} from '../baseline.js';
import {stepMatch} from '../../src/shared/engine.js';
import {buildView} from '../../src/shared/scoring.js';
import {legacyScoreTick as scoreTick,computeLegacyResults as computeResults} from '../../src/shared/legacy-scoring.js';
import {makeParticipant} from '../../src/shared/state.js';
import {setOwner,addTrail,neutralizeTerritory} from '../../src/shared/territory.js';
import {leaveParticipant,markDead} from '../../src/shared/life.js';
import {captureFixture} from './helpers.js';
import {moveSpeed} from '../../src/shared/config.js';
describe('T13: scoring, ranking, end boundary',()=>{
 it('pays a held point only at seconds 1..239 and freezes results',()=>{
  // This legacy scoring fixture intentionally alternates direction each tick.
  // Give it an instantaneous turn budget; default steering is tested separately.
  const m=createMatch({turnRadiansPerSecond:Math.PI*30},5,[{participantId:'p',slot:0,nickname:'P',kind:'HUMAN'}]),p=m.participants[0];
  neutralizeTerritory(m,p);p.cellId=m.map.controlPoints[0].cellId;p.position={...m.map.cells[p.cellId].center};p.protectedUntilTick=0;
  setOwner(m,p.cellId,1);setOwner(m,m.map.cells[p.cellId].neighbors.find(n=>n>=0)!,1);
  // Keep moving inside the held point instead of relying on the former nonlethal wall clamp.
  for(let i=0;i<7200;i++){stepMatch(m,new Map([['p',{matchId:m.matchId,lifeId:1,seq:i+1,dx:i%2?-1:1,dy:0}]]));scoreTick(m);}
  expect(p.controlScore).toBe(239);expect(m.tick).toBe(7200);expect(m.phase).toBe('FINISHED');expect(m.results![0].score).toBe(241);
  const result=JSON.stringify(m.results);stepMatch(m,new Map([['p',{matchId:m.matchId,lifeId:1,seq:100,dx:-1,dy:0}]]));expect(JSON.stringify(m.results)).toBe(result);expect(m.tick).toBe(7200);
 });
 it('does not pay for passing over a point, changes recipient after transfer and preserves accumulated points on death',()=>{
  const m=createMatch({},5,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]);
  const [a,b]=m.participants,cp=m.map.controlPoints[0].cellId;addTrail(m,a,cp);m.tick=30;scoreTick(m);expect(a.controlScore).toBe(0);
  setOwner(m,cp,1);m.tick=60;scoreTick(m);expect(a.controlScore).toBe(1);
  setOwner(m,cp,2);m.tick=90;scoreTick(m);expect(b.controlScore).toBe(1);
  markDead(m,b,'TRAIL_CUT',a);m.tick=120;scoreTick(m);expect(b.controlScore).toBe(1);expect(m.owners[cp]).toBe(0);
 });
 it('uses 1,1,3 ties and excludes LEFT rows from ranking',()=>{
  const {m,a,b}=captureFixture();a.territoryCount=b.territoryCount=10;
  const c=makeParticipant({participantId:'c',slot:2,nickname:'C',kind:'BOT'});c.territoryCount=8;m.participants.push(c);
  expect(computeResults(m).map(p=>p.rank)).toEqual([1,1,3]);b.controlScore=20;leaveParticipant(m,b);
  const rows=computeResults(m);expect(rows.at(-1)).toMatchObject({participantId:'b',status:'LEFT',rank:null,territory:0,score:20});
 });
 it('Classic applies a return at the former timed endpoint and keeps running',()=>{
  const {m,a,b,id}=captureFixture();m.config.roundSeconds=1;b.lifeState='FINISHED';m.tick=29;
  setOwner(m,id(0,0),1);a.cellId=id(1,0);a.position={x:Math.sqrt(3)*16+moveSpeed(m.config)/m.config.simulationHz,y:0};a.direction={x:-1,y:0};addTrail(m,a,id(1,0));
  stepMatch(m);stepMatch(m);expect(m.phase).toBe('RUNNING');expect(m.owners[id(1,0)]).toBe(1);expect(a.trailCells.size).toBe(0);
 });
 it('returns a detached public view without Sets or private control state',()=>{
  const m=createMatch({},5,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),v=buildView(m);
  v.owners.fill(0);expect(m.owners.some(owner=>owner===1)).toBe(true);expect(v.participants[0]).not.toHaveProperty('trailCells');
 });
});
