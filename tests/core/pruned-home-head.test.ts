import {describe,it,expect} from 'vitest';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {assertOwnershipCounts} from '../../src/shared/territory.js';

describe('capture must not prune away an untouched home under a head',()=>{
 it.each([['classic',false],['classic',true],['hold',false],['hold',true]] as const)('%s / reversed roles %s: the home component remains attached without an orphan trail', (mode,reverse)=>{
  const f=new MovementCaptureFixture(reverse,mode),{match:m,victim:v,capturer:c}=f;f.runPrunedHomeHead();
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
  expect(record).toMatchObject({trailCells:[],connectedBefore:false,candidate:false,lostTerritory:true,territoryBefore:40,headOwnerBefore:v.slot+1,headOwnerBeforePrune:v.slot+1,headOwnerAfterTransfer:v.slot+1,homeAnchorBeforePrune:record.headCellId,strandedHomeHead:false,cut:false,markDeadCalled:false,markedDead:false});
  expect(record.ownerCellsAfterTransfer).toBeGreaterThan(0);expect(record.claimedTrailCells).toEqual([]);expect(f.directContacts).toBe(0);
  expect(v.lifeState).toBe('ALIVE');expect(v.deathReason).toBeNull();expect(record.headHomeNeighborsAfterTransfer.length).toBeGreaterThan(0);
  expect(v.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&(1<<v.slot))===0)).toBe(true);
  expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId===v.participantId)).toHaveLength(0);expect(c.kills).toBe(0);assertOwnershipCounts(m);
 });
});
