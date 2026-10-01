import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
describe('T24: actual server commands and scheduled transmission',()=>{
 it('starts a real friend game, increments snapshots and isolates waiting members and another room',async()=>{
  const f=await serverFixture({config:{countdownSeconds:0.03},seed:()=>13});try{
   const a=await f.client(),b=await f.client(),other=await f.client(),late=await f.client();
   expect((await a.request('room:create',{nickname:'A'})).ok).toBe(true);const room=f.rooms.rooms.values().next().value!;
   await b.request('room:join',{nickname:'B',code:room.code});await other.request('room:create',{nickname:'other'});
   await a.request('room:start');await until(()=>a.snapshots.length>2&&b.snapshots.length>2);
   expect(a.snapshots.at(-1)!.matchId).toBe(b.snapshots.at(-1)!.matchId);expect(a.snapshots.at(-1)!.tick).toBeGreaterThan(0);
   expect(a.snapshots.at(-1)!.snapshotSeq).toBeGreaterThan(1);expect(other.snapshots).toHaveLength(0);
   await late.request('room:join',{nickname:'late',code:room.code});await new Promise(r=>setTimeout(r,150));
   expect(late.snapshots).toHaveLength(0);expect(late.views.at(-1)!.waitingForNextRound).toBe(true);
   expect(f.io.sockets.adapter.rooms.get('arena:'+room.roomId)?.has(late.socket.id!)).toBe(false);
  }finally{await f.close();}
 });
 it('supports WebSocket upgrade and polling fallback',async()=>{
  const f=await serverFixture();try{
   const a=await f.client();await until(()=>a.socket.io.engine.transport.name==='websocket');
   const b=await f.client({protocolVersion:PROTOCOL_VERSION},['polling']);expect(b.socket.io.engine.transport.name).toBe('polling');
  }finally{await f.close();}
 });
 it('keeps backlog, caps catchup at five ticks and aborts a three-second overload',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('room:start');
   now=3000;f.loop.pump();const room=f.rooms.rooms.values().next().value!;now=3400;f.loop.pump();
   expect(room.match!.tick).toBe(5);expect(room.accumulator).toBeGreaterThan(0.2);expect(f.rooms.accepting).toBe(false);
   now=6500;f.loop.pump();expect(f.rooms.rooms.size).toBe(0);expect(a.ready.sessionToken).not.toBe(a.views.at(-1)?.roomId);
  }finally{await f.close();}
 });
});
