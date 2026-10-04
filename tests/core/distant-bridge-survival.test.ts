import {describe,it,expect} from 'vitest';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {assertOwnershipCounts} from '../../src/shared/territory.js';

describe('a distant bridge capture must not manufacture a home cut',()=>{
 for(const mode of ['classic','hold'] as const)for(const exposed of [false,true])for(const reverse of [false,true])
 it(`${mode} / exposed ${exposed} / reversed ${reverse}: an untouched home stays alive`,()=>{
  const f=new MovementCaptureFixture(reverse,mode),{match:m,victim:v,capturer:c}=f;f.runDistantBridgeLoss(exposed);
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
  expect(record).toMatchObject({lostTerritory:true,territoryBefore:77,claimedTrailCells:[],strandedHomeHead:false,cut:false,markDeadCalled:false});
  expect(record.homeAnchorBeforePrune).not.toBeNull();expect(record.ownerCellsAfterTransfer).toBeGreaterThan(0);
  if(exposed){expect(record.trailCells.length).toBeGreaterThan(0);expect(record.originOwnerBeforePrune).toBe(v.slot+1);expect(record.originOwnerAfterTransfer).toBe(v.slot+1);expect(v.trailOriginCellId).toBe(record.originCellId);expect([...v.trailCells]).toEqual(record.trailCells);}
  else{expect(record.trailCells).toEqual([]);expect(record.headOwnerBeforePrune).toBe(v.slot+1);expect(record.headOwnerAfterTransfer).toBe(v.slot+1);expect(v.trailCells.size).toBe(0);}
  expect(f.directContacts).toBe(0);expect(v.lifeState).toBe('ALIVE');expect(v.deathReason).toBeNull();expect(c.kills).toBe(0);expect(m.events.some(e=>e.type==='DEATH'&&e.participantId===v.participantId)).toBe(false);assertOwnershipCounts(m);
 });
});
