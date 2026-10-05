import {describe,it,expect} from 'vitest';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {assertOwnershipCounts} from '../../src/shared/territory.js';

describe('normal spawns and real movement cut the excursion home connection',()=>{
 it.each(['classic'] as const)('%s: both human roles die when the departure connection is captured despite later incidental adjacency',mode=>{
  for(const reverse of [false,true]){
   const f=new MovementCaptureFixture(reverse,mode),{match:m,victim:v,capturer:c}=f;
   expect(v.territoryCount).toBe(19);expect(c.territoryCount).toBe(19);expect(v.trailCells.size).toBe(0);f.run();
   expect(f.directContacts).toBe(0);expect(f.captureTick).toBeGreaterThan(0);
   const record=f.traces.flatMap(trace=>trace.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
   expect(record).toMatchObject({connectedBefore:true,candidate:false,lostTerritory:true,touchesHomeBefore:true,touchesHomeAfter:false,anyTrailTouchesHomeAfter:true,claimedTrailCells:[],cut:true,markDeadCalled:true,markedDead:true,lifeStateAfter:'ELIMINATED',ownerCellsAfter:0,trailMaskCellsAfter:0});
   expect(record.territoryAfterTransfer).toBeGreaterThan(0);expect(record.ownerCellsAfterTransfer).toBe(record.territoryAfterTransfer);
   expect(v).toMatchObject({lifeState:'ELIMINATED',deathReason:'TRAIL_CUT',deaths:1,territoryCount:0});expect(c.kills).toBe(1);expect(v.trailCells.size).toBe(0);
   expect([...m.trailMasks].every(mask=>(mask&(1<<v.slot))===0)).toBe(true);
   const deaths=m.events.filter(e=>e.type==='DEATH'&&e.participantId===v.participantId);
   expect(deaths).toEqual([expect.objectContaining({reason:'TRAIL_CUT',killerId:c.participantId,tick:f.captureTick})]);
   const position={...v.position},until=v.respawnAtTick;while(m.tick<until-1)f.tick();
   expect(v.position).toEqual(position);expect(v.trailCells.size).toBe(0);expect(v.lifeState).toBe('ELIMINATED');expect(c.kills).toBe(1);assertOwnershipCounts(m);
  }
 });
 it('keeps both human roles alive if the original departure connection survives a real capture',()=>{
  for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse);f.run('retained-origin');expect(f.directContacts).toBe(0);
   expect(f.victim.lifeState).toBe('ALIVE');expect(f.victim.trailCells.size).toBeGreaterThan(0);expect(f.capturer.kills).toBe(0);
   const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===f.victim.participantId&&p.lostTerritory)!;
   expect(record).toMatchObject({connectedBefore:true,lostTerritory:true,touchesHomeAfter:true,cut:false,markDeadCalled:false});assertOwnershipCounts(f.match);
  }
 });
 it('kills both human roles in the capture event when all territory is taken',()=>{
  for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse);f.run('all-territory');expect(f.directContacts).toBe(0);
   const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===f.victim.participantId&&p.lostTerritory)!;
   expect(record.ownerCellsAfterTransfer).toBe(0);expect(f.victim).toMatchObject({lifeState:'ELIMINATED',territoryCount:0,deaths:1});
   expect(f.victim.trailCells.size).toBe(0);expect(f.capturer.kills).toBe(1);expect(f.match.events.filter(e=>e.type==='DEATH'&&e.participantId===f.victim.participantId)).toHaveLength(1);assertOwnershipCounts(f.match);
  }
 });
});
