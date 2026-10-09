import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {DEFAULT_CONFIG,PROTOCOL_VERSION} from '../../src/shared/config.js';
import {stepMatch} from '../../src/shared/game.js';
import {markDead} from '../../src/shared/life.js';
import {unpackSnapshot} from '../../src/shared/protocol.js';
import {completeClassic} from '../mode-fixture.js';
describe('online Run results and explicit retry',()=>{
 it.each(['death','clear'])('releases a room and Socket.IO channels after all Run results remain idle: %s',async(kind)=>{
  let now=0;const f=await serverFixture({config:DEFAULT_CONFIG,autoStart:false,now:()=>now});try{
   const a=await f.client();await a.request('room:create',{nickname:'A'});const room=[...f.rooms.rooms.values()][0];await a.request('room:start');now=3000;f.loop.pump();
   const m=room.match!,p=m.participants[0];if(kind==='death')markDead(m,p,'WALL_HIT');else{completeClassic(m);stepMatch(m);}f.rooms.advance();f.loop.publishRoom(room);
   expect(p.run!.result).not.toBeNull();now+=60001;f.rooms.advance();await until(()=>![...f.io.sockets.adapter.rooms.keys()].some(k=>k==='lobby:'+room.roomId||k==='arena:'+room.roomId));
   expect(f.rooms.rooms.size).toBe(0);expect(room.match).toBeNull();expect(room.inputs.size+room.bots.size).toBe(0);expect(f.sessions.sessions.get(a.ready.sessionToken)!.roomId).toBeNull();
  }finally{await f.close();}
 });
 it('keeps other humans playing, restores an ended Run and respawns only on a valid explicit request',async()=>{
  let now=0;const f=await serverFixture({config:DEFAULT_CONFIG,autoStart:false,now:()=>now,seed:()=>4});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A'});
   const room=[...f.rooms.rooms.values()][0];await b.request('room:join',{nickname:'B',code:room.code});await a.request('room:start');now=3000;f.loop.pump();
   await until(()=>a.snapshots.length>0&&b.snapshots.length>0);const m=room.match!;
   const self=m.participants.find(p=>p.kind==='HUMAN'&&p.nickname==='A')!,other=m.participants.find(p=>p.nickname==='B')!,bot=m.participants.find(p=>p.slot===m.config.maxSlots-1)!;
   markDead(m,self,'TRAIL_CUT',other);markDead(m,bot,'WALL_HIT');const result=structuredClone(self.run!.result)!;
   f.loop.publishSnapshot(room,false,true);await until(()=>a.snapshots.some(s=>s.participants.find(p=>p.participantId===self.participantId)?.lifeState==='ELIMINATED'));
   a.socket.emit('input:direction',{matchId:m.matchId,lifeId:1,seq:999,dx:1,dy:0});await new Promise(r=>setTimeout(r,30));expect(room.inputs.has(self.participantId)).toBe(false);
   for(let i=0;i<32;i++){now+=100;f.loop.pump();}expect(m.tick).toBeGreaterThanOrEqual(90);expect(self.lifeState).toBe('ELIMINATED');expect(bot.lifeId).toBeGreaterThan(1);expect(room.phase).toBe('RUNNING');
   const recovered=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>recovered.snapshots.length>0);
   expect(unpackSnapshot(recovered.snapshots.at(-1)).participants.find(p=>p.participantId===self.participantId)?.run?.result).toEqual(result);
   expect(await recovered.request('run:retry',{matchId:m.matchId,runId:'old-run'})).toMatchObject({ok:false,code:'BAD_PHASE'});
   const request={requestId:'retry-once',matchId:m.matchId,runId:result.runId};expect(await recovered.request('run:retry',request)).toMatchObject({ok:true});expect(self.lifeId).toBe(2);expect(room.match).toBe(m);
   expect(await recovered.request('run:retry',request)).toMatchObject({ok:true});expect(self.lifeId).toBe(2);expect(self.run!.result).toBeNull();
   markDead(m,self,'WALL_HIT');expect(await recovered.request('run:retry',{matchId:m.matchId,runId:result.runId})).toMatchObject({ok:false,code:'BAD_PHASE'});expect(self.lifeId).toBe(2);
  }finally{await f.close();}
 });
 it('preserves a death result after global victory and opts into the next world explicitly',async()=>{
  let now=0;const f=await serverFixture({config:DEFAULT_CONFIG,autoStart:false,now:()=>now});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A'});const room=[...f.rooms.rooms.values()][0];await b.request('room:join',{nickname:'B',code:room.code});await a.request('room:start');now=3000;f.loop.pump();
   const m=room.match!,self=m.participants.find(p=>p.nickname==='A')!;markDead(m,self,'WALL_HIT');const result=structuredClone(self.run!.result)!;
   completeClassic(m);now+=100;f.loop.pump();expect(room.phase).toBe('RESULTS');expect(self.run!.result).toEqual(result);
   now+=7000;f.rooms.advance();now+=3000;f.rooms.advance();expect(room.match!.matchId).toBe(m.matchId);expect(self.run!.result).toEqual(result);
   expect(await a.request('run:retry',{matchId:m.matchId,runId:result.runId})).toMatchObject({ok:true});now+=3000;f.loop.pump();expect(room.match!.matchId).not.toBe(m.matchId);
  }finally{await f.close();}
 });
});