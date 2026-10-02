import {describe,it,expect} from 'vitest';
import {runContactMovement} from '../contact-movement-fixture.js';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {watchDeaths,type DeathTrace} from '../../src/shared/life.js';
import {createMatch,stepMatch} from '../../src/shared/game.js';
describe('unchanged contact rules, classified from frozen event-time masks',()=>{
 it('complete movement enclosure of an inside player emits TERRITORY_LOST in the capture resolution',()=>{
  for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse),deaths:DeathTrace[]=[];watchDeaths(f.match,t=>deaths.push(t));f.runInsideTerritoryLoss();
   const d=deaths.find(t=>t.victimId===f.victim.participantId)!;expect(d.context?.cause).toBe('TERRITORY_LOST');expect(d.reason).toBe('TERRITORY_LOST');expect(d.ownerCells).toBe(0);expect(d.tick).toBe(f.captureTick);expect(f.directContacts).toBe(0);expect(f.expectedOriginCellId).toBeNull();
   expect(f.victim.lifeState).toBe('DEAD_WAIT');expect(f.victim.trailCells.size).toBe(0);expect(f.match.events.filter(e=>e.type==='DEATH'&&e.participantId===f.victim.participantId)).toHaveLength(1);
  }
 });
 it('unchanged straight-ahead movement into the perimeter reports WALL_HIT',()=>{
  const m=createMatch({},81,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'}]),deaths:DeathTrace[]=[];watchDeaths(m,t=>deaths.push(t));
  for(let i=0;i<500&&m.participants[0].lifeState==='ALIVE';i++)stepMatch(m);
  expect(deaths[0]).toMatchObject({reason:'WALL_HIT',context:{cause:'WALL_HIT'},diagnostic:{wallIntersection:true,existingTrailContact:false,pendingTrailContact:false}});
 });
 it('normal spawns enter the same neutral cell with no existing trails and cause two pending cuts',()=>{
  for(const reverse of [false,true]){const f=runContactMovement('simultaneous-neutral',reverse);
   expect(f.deaths).toHaveLength(2);expect(f.deaths.every(d=>d.context?.cause==='PENDING_TRAIL_CONTACT')).toBe(true);
   for(const d of f.deaths){expect(d.trailCells).toEqual([]);expect(d.diagnostic?.victimTrailBefore).toEqual([]);expect(d.diagnostic?.trailMasksBefore[f.goal]).toBe(0);expect(d.diagnostic?.pendingTrails).toHaveLength(2);expect(d.diagnostic?.existingTrailContact).toBe(false);expect(d.diagnostic?.pendingTrailContact).toBe(true);}
   expect(f.deaths[0].context?.eventTick).toBe(f.deaths[1].context?.eventTick);expect(f.nearest).toBeGreaterThan(42);
  }
 });
 it('a delayed head crosses a real earlier trail and cuts its owner at a different body cell',()=>{
  for(const reverse of [false,true]){const f=runContactMovement('existing-line',reverse);
   expect(f.deaths).toHaveLength(1);const d=f.deaths[0];expect(d.context?.cause).toBe('EXISTING_TRAIL_CONTACT');expect(d.diagnostic?.existingTrailContact).toBe(true);expect(d.diagnostic?.pendingTrailContact).toBe(false);expect(d.victimCell).not.toBe(d.killerCell);
  }
 });
 it('normal movement first captures the meeting cell; an entrant can die over enemy territory',()=>{
  for(const reverse of [false,true]){const f=runContactMovement('enemy-territory',reverse);
   expect(f.deaths.length).toBeGreaterThan(0);const d=f.deaths.find(d=>d.victimId===f.a.participantId)!;
   expect(d).toBeTruthy();expect(d.diagnostic!.ownersBefore[d.context!.cellId]).toBe(f.b.slot+1);expect(['PENDING_TRAIL_CONTACT','EXISTING_TRAIL_CONTACT']).toContain(d.context?.cause);
  }
 });
 it('nearby bodies in separate cells have no existing or pending trail contact',()=>{
  for(const reverse of [false,true]){const f=runContactMovement('near-miss',reverse);expect(f.deaths).toEqual([]);expect(f.nearest).toBeLessThan(80);expect(f.a.cellId).not.toBe(f.b.cellId);}
 });
});
