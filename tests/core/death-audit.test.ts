import {retryHumanRun} from '../../src/shared/retry.js';
import {describe,it,expect} from 'vitest';
import {auditDeaths} from '../death-audit.js';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {buildView} from '../../src/shared/game.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {deathMessage} from '../../src/client/death-message.js';

describe('death causes in normal movement',()=>{
 it.each([[4,false],[17,false],[81,true],[73,true]] as const)('seed %s mixed=%s: every death has contact, capture, missing territory or a boundary impact', (seed,mixed)=>{
  const report=auditDeaths(seed,mixed);expect(report.failures).toEqual([]);expect(report.deaths).toBeGreaterThan(0);
 },15000);
 it('distinguishes a lost departure home from direct contact through snapshots and respawn',()=>{
  for(const reverse of [false,true]){
   const f=new MovementCaptureFixture(reverse);f.run();const p=f.victim,m=f.match;
   const view=unpackSnapshot(packSnapshot(buildView(m),1,0,p.participantId)),victim=view.participants.find(v=>v.participantId===p.participantId)!;
   expect(victim.deathContext).toMatchObject({cause:'HOME_CAPTURE'});expect(deathMessage(victim.deathReason,victim.deathContext)).toBe('선의 출발 영토를 잃었어요');
   expect(view.events.find(e=>e.type==='DEATH'&&e.participantId===p.participantId)?.deathContext).toEqual(victim.deathContext);
   // The event expires, while the reason persists for the full waiting period.
   for(let i=0;i<35;i++)f.tick();expect(buildView(m).events.some(e=>e.type==='DEATH'&&e.participantId===p.participantId)).toBe(false);expect(p.deathContext?.cause).toBe('HOME_CAPTURE');
   expect(retryHumanRun(m,p)).toBe(true);expect(p.lifeId).toBe(2);expect(p.deathContext).toBeUndefined();
  }
 });
 it('rejects corrupt cause/cell metadata in both participant and event snapshots',()=>{
  const f=new MovementCaptureFixture();f.run();const wire=packSnapshot(buildView(f.match),1,0,f.victim.participantId),event=wire.events.find(e=>e.type==='DEATH')!;
  for(const deathContext of [{cause:'GHOST',cellId:0},{cause:'TRAIL_CONTACT',cellId:-1},{cause:'HOME_CAPTURE',cellId:1519}]){
   expect(()=>unpackSnapshot({...wire,events:[{...event,deathContext}]})).toThrow();
   expect(()=>unpackSnapshot({...wire,participants:wire.participants.map(p=>({...p,deathContext}))})).toThrow();
  }
 });
});
