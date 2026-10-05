import {describe,it,expect} from 'vitest';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {buildView} from '../../src/shared/game.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
describe('the actual last owned departure cell',()=>{
 it.each(['classic'] as const)('%s: loses only the actual origin, with another first-trail home neighbor still owned',mode=>{
  for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse,mode);f.run('origin-only');
   expect(f.departureHomeNeighbors).toHaveLength(2);expect(f.directContacts).toBe(0);
   const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===f.victim.participantId&&p.lostTerritory)!;
   expect(record.originCellId).toBe(f.expectedOriginCellId);expect(record.originOwnerBefore).toBe(f.victim.slot+1);expect(record.originOwnerAfterTransfer).toBe(f.capturer.slot+1);
   expect(record.firstHomeNeighborsAfterTransfer).toEqual(f.departureHomeNeighbors.filter(id=>id!==f.expectedOriginCellId));
   expect(record.claimedTrailCells).toEqual([]);expect(f.match.owners[f.expectedOriginCellId!]).toBe(f.capturer.slot+1);
   expect(f.victim).toMatchObject({lifeState:'ELIMINATED',deathReason:'TRAIL_CUT',deaths:1});expect(f.capturer.kills).toBe(1);
   expect(f.victim.trailCells.size).toBe(0);expect(f.match.trailMasks.some(mask=>(mask&(1<<f.victim.slot))!==0)).toBe(false);
   expect(f.match.events.filter(e=>e.type==='DEATH'&&e.participantId===f.victim.participantId)).toHaveLength(1);
   expect(f.victim.trailOriginCellId).toBeNull();const position={...f.victim.position};for(let i=0;i<10;i++)f.tick();expect(f.victim.position).toEqual(position);expect(f.victim.trailCells.size).toBe(0);
  }
 });
 it.each(['classic'] as const)('%s: survives when the actual origin stays owned and only its incidental neighbor is captured',mode=>{
  for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse,mode);f.run('neighbor-only');
   expect(f.departureHomeNeighbors).toHaveLength(2);expect(f.directContacts).toBe(0);
   expect(f.match.owners[f.expectedOriginCellId!]).toBe(f.victim.slot+1);
   expect(f.departureHomeNeighbors.filter(id=>id!==f.expectedOriginCellId).every(id=>f.match.owners[id]===f.capturer.slot+1)).toBe(true);
   expect(f.victim.lifeState).toBe('ALIVE');expect(f.victim.trailCells.size).toBeGreaterThan(0);expect(f.capturer.kills).toBe(0);
   expect(f.victim.trailOriginCellId).toBe(f.expectedOriginCellId);
   const view=unpackSnapshot(packSnapshot(buildView(f.match),1,0,f.victim.participantId));expect(view.participants.every(p=>!Object.hasOwn(p,'trailOriginCellId'))).toBe(true);
   f.returnVictimHome();expect(f.victim.trailOriginCellId).toBeNull();expect(f.victim.trailCells.size).toBe(0);
  }
 });
});
