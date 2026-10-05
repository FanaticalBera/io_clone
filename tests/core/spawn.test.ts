import {describe,it,expect} from 'vitest';
import {createMatch} from '../baseline.js';
import {trySpawn,tryRespawns} from '../../src/shared/spawn.js';
import {markDead} from '../../src/shared/life.js';
import {setOwner,assertOwnershipCounts} from '../../src/shared/territory.js';
import {hexDistance,region} from '../../src/shared/hex.js';
import {isProtected,stepMatch} from '../../src/shared/engine.js';
function match(){
 return createMatch({},111,Array.from({length:2},(_,slot)=>({participantId:'p'+slot,slot,nickname:'P',kind:'BOT' as const})));
}
describe('T12: safe respawn and limited protection',()=>{
 it('reserves 19 neutral cells, keeps stats and increments the life identity',()=>{
  const m=match(),a=m.participants[0],b=m.participants[1];a.controlScore=9;markDead(m,a,'TRAIL_CUT',b);m.tick=90;
  const previous=m.owners.slice();expect(trySpawn(m,a)).toBe(true);
  expect(a).toMatchObject({lifeId:2,territoryCount:19,controlScore:9,deaths:1,lastAppliedInputSeq:0});
  for(const id of a.spawnCells){expect(previous[id]).toBe(0);expect(hexDistance(m.map.cells[id],m.map.cells[b.cellId])).toBeGreaterThanOrEqual(3);expect(m.map.controlPoints.some(cp=>cp.cellId===id)).toBe(false);}
  expect(isProtected(m,a)).toBe(true);assertOwnershipCounts(m);
 });
 it('waits rather than overwrite occupied space, then retries after space is freed',()=>{
  const m=match(),a=m.participants[0],b=m.participants[1];markDead(m,a,'TRAIL_CUT',b);m.tick=90;
  for(const cell of m.map.cells)setOwner(m,cell.id,2);
  expect(trySpawn(m,a)).toBe(false);expect(a.lifeState).toBe('SPAWN_BLOCKED');expect(a.respawnAtTick).toBe(120);
  const center=m.map.byKey.get('0,0')!;for(const id of region(m.map,center,2))setOwner(m,id,0);
  m.tick=120;expect(trySpawn(m,a)).toBe(true);expect(a.cellId).toBe(center);assertOwnershipCounts(m);
 });
 it('keeps simultaneous spawn zones separated and excludes points and trails',()=>{
  const m=match();for(const p of m.participants)markDead(m,p,'TERRITORY_LOST');m.tick=90;tryRespawns(m);
  const [a,b]=m.participants;expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('ALIVE');
  for(const ca of a.spawnCells)for(const cb of b.spawnCells)expect(hexDistance(m.map.cells[ca],m.map.cells[cb])).toBeGreaterThanOrEqual(3);
 });
 it('ends protection on time, loss of ownership or leaving the initial zone',()=>{
  const m=match(),a=m.participants[0];expect(isProtected(m,a)).toBe(true);
  m.tick=a.protectedUntilTick;expect(isProtected(m,a)).toBe(false);
  m.tick=0;setOwner(m,a.cellId,0);expect(isProtected(m,a)).toBe(false);
  a.protectedUntilTick=60;for(let i=0;i<30;i++)stepMatch(m);expect(a.protectedUntilTick).toBe(0);
 });
 it('respawns past the former time limit and rejects previous-life input',()=>{
  const m=match(),a=m.participants[0];markDead(m,a,'TRAIL_CUT');m.tick=7210;expect(trySpawn(m,a)).toBe(true);
  const old=a.lastAppliedInputSeq;
  stepMatch(m,new Map([[a.participantId,{matchId:m.matchId,lifeId:1,seq:99,dx:1,dy:0}]]));expect(a.lastAppliedInputSeq).toBe(old);
 });
});
