import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {markDead} from '../../src/shared/life.js';
describe('T28: real transport loss, grace and replacement',()=>{
 it('restores the same participant and transfers host without old socket disconnect races',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now,seed:()=>13});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A'});const room=f.rooms.rooms.values().next().value!;
   await b.request('room:join',{nickname:'B',code:room.code});await a.request('room:start');now=3000;f.loop.pump();
   const p=room.match!.participants.find(p=>p.participantId===a.views.at(-1)!.selfMemberId)!,id=p.participantId;p.controlScore=7;
   a.socket.io.engine.close();await until(()=>f.rooms.member(f.sessions.sessions.get(a.ready.sessionToken)!)!.member.graceUntil!==null);
   const member=room.members.get(id)!;expect(member.graceUntil).toBe(13000);expect(room.hostId).toBe(b.views.at(-1)!.selfMemberId);
   now=3200;f.loop.pump();expect(room.match!.tick).toBe(5);expect(p.lastAppliedInputSeq).toBeGreaterThan(0);
   const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>restored.snapshots.length>0);
   expect(restored.snapshots.at(-1)!.selfParticipantId).toBe(id);expect(p.lifeId).toBe(1);expect(p.controlScore).toBe(7);expect(room.members.size).toBe(2);
   const replacementSocket=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>replacementSocket.snapshots.length>0);
   expect(member.graceUntil).toBeNull();expect(member.session.connected).toBe(true);expect(room.hostId).toBe(b.views.at(-1)!.selfMemberId);
  }finally{await f.close();}
 });
 it('does not grant immunity, a new life or points when reconnecting after a real death',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('room:start');now=3000;f.loop.pump();
   const room=f.rooms.rooms.values().next().value!,p=room.match!.participants.find(p=>p.kind==='HUMAN')!;p.controlScore=9;
   a.socket.io.engine.close();await until(()=>room.members.get(p.participantId)!.graceUntil!==null);
   markDead(room.match!,p,'TRAIL_CUT');const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>restored.snapshots.length>0);
   expect(restored.snapshots.at(-1)!.participants.find(x=>x.participantId===p.participantId)).toMatchObject({lifeState:'DEAD_WAIT',lifeId:1,controlScore:9,deaths:1,territoryCount:0});
  }finally{await f.close();}
 });
 it('expires at detection +10 seconds, replaces with a fresh bot and closes the empty room within 60 seconds',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('room:start');now=3000;f.loop.pump();
   const room=f.rooms.rooms.values().next().value!,p=room.match!.participants.find(p=>p.kind==='HUMAN')!,oldId=p.participantId;p.controlScore=99;
   a.socket.io.engine.close();await until(()=>room.members.get(oldId)!.graceUntil!==null);
   now=12999;f.rooms.advance();expect(room.members.size).toBe(1);now=13000;f.rooms.advance();
   expect(room.members.size).toBe(0);const bot=room.match!.participants.find(x=>x.slot===p.slot)!;
   expect(bot.participantId).not.toBe(oldId);expect(bot).toMatchObject({kind:'BOT',controlScore:0,kills:0,deaths:0});expect(room.match!.departed[0]).toMatchObject({participantId:oldId,controlScore:99});
   await expect(f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken})).rejects.toMatchObject({data:{code:'SESSION_EXPIRED'}});
   now=72999;f.rooms.advance();expect(f.rooms.rooms.size).toBe(1);now=73000;f.rooms.advance();expect(f.rooms.rooms.size).toBe(0);expect(room.match).toBeNull();expect(room.bots.size).toBe(0);
  }finally{await f.close();}
 });
 it('explicit leave has no grace and immediately starts a replacement bot',async()=>{
  const f=await serverFixture({config:{countdownSeconds:0.03}});try{
   const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('room:start');await until(()=>a.snapshots.length>0);
   const room=f.rooms.rooms.values().next().value!,id=a.snapshots[0].selfParticipantId!;await a.request('room:leave');
   expect(room.members.size).toBe(0);expect(room.match!.participants.every(p=>p.participantId!==id)).toBe(true);expect(room.match!.participants.filter(p=>p.kind==='BOT')).toHaveLength(8);
  }finally{await f.close();}
 });
});
