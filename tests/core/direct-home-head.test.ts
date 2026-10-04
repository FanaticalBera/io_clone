import {describe,it,expect} from 'vitest';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {assertOwnershipCounts} from '../../src/shared/territory.js';

const cases=[['classic',false],['classic',true],['hold',false],['hold',true]] as const;
describe('capture paints the home under a head with no exposed trail',()=>{
 it.each(cases)('%s / reversed roles %s: a directly captured head cannot start an orphan trail',(mode,reverse)=>{
  const f=new MovementCaptureFixture(reverse,mode),{match:m,victim:v,capturer:c}=f;f.runPrunedHomeHead(true);
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
  expect(record).toMatchObject({trailCells:[],candidate:false,connectedBefore:false,lostTerritory:true,territoryBefore:40,headOwnerBefore:v.slot+1,headOwnerAfterTransfer:c.slot+1,headHomeNeighborsAfterTransfer:[],ownerCellsAfterTransfer:15,strandedHomeHead:true,cut:true,markDeadCalled:true,markedDead:true});
  expect(record.claimedTrailCells).toEqual([]);expect(f.directContacts).toBe(0);
  expect(v.lifeState).toBe('DEAD_WAIT');expect(v.deathReason).toBe('TRAIL_CUT');expect(v.deathContext).toMatchObject({cause:'HOME_CAPTURE',cellId:record.headCellId});
  expect(v.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&(1<<v.slot))===0)).toBe(true);
  expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId===v.participantId)).toHaveLength(1);expect(c.kills).toBe(1);
  const position={...v.position};while(m.tick<v.respawnAtTick)f.tick();expect(v.position).toEqual(position);expect(v.trailCells.size).toBe(0);expect(c.kills).toBe(1);assertOwnershipCounts(m);
 });
 it.each(cases)('%s / reversed roles %s: losing the extension while standing on retained home stays alive',(mode,reverse)=>{
  const f=new MovementCaptureFixture(reverse,mode),{match:m,victim:v,capturer:c}=f;f.runPrunedHomeHead(true,true);
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
  expect(record).toMatchObject({trailCells:[],lostTerritory:true,headOwnerBefore:v.slot+1,headOwnerAfterTransfer:v.slot+1,strandedHomeHead:false,cut:false,markDeadCalled:false});
  expect(record.headHomeNeighborsAfterTransfer.length).toBeGreaterThan(0);expect(record.ownerCellsAfterTransfer).toBeLessThan(record.territoryBefore);
  expect(f.directContacts).toBe(0);expect(v.lifeState).toBe('ALIVE');expect(v.deathContext).toBeUndefined();expect(v.trailCells.size).toBe(0);expect(c.kills).toBe(0);
  expect(m.events.some(e=>e.type==='DEATH'&&e.participantId===v.participantId)).toBe(false);assertOwnershipCounts(m);
 });
});
