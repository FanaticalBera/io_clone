import {it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {markDead} from '../../src/shared/life.js';
it('T32 background keeps time and vulnerability; foreground sends full state before ack and resets sequence',async()=>{
 let now=0;const f=await serverFixture({now:()=>now,autoStart:false});try{
 const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('control:background');await a.request('room:start');now=3000;f.loop.pump();
 const room=f.rooms.rooms.values().next().value!,s=f.sessions.sessions.get(a.ready.sessionToken)!,p=room.match!.participants.find(p=>p.kind==='HUMAN')!;
 expect(s.background).toBe(true);
 const tick=room.match!.tick;now+=100;f.loop.pump();expect(room.match!.tick).toBeGreaterThan(tick);expect(p.lastAppliedInputSeq).toBeGreaterThan(0);
 a.socket.emit('input:direction',{matchId:room.match!.matchId,lifeId:p.lifeId,seq:999,dx:0,dy:1});await new Promise(r=>setTimeout(r,30));expect(room.inputs.size).toBe(0);
 markDead(room.match!,p,'TRAIL_CUT');const before=a.snapshots.length;
 expect(await a.request('control:foreground')).toMatchObject({ok:true});await until(()=>a.snapshots.length>before);
 expect(s.background).toBe(false);expect(s.highestReceivedSeq).toBe(p.lastAppliedInputSeq);
 expect(a.snapshots.at(-1)!.participants.find(x=>x.participantId===p.participantId)).toMatchObject({lifeState:'ELIMINATED',deaths:1,territoryCount:0});
 }finally{await f.close();}
});
