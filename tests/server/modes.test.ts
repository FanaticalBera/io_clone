import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {unpackSnapshot} from '../../src/shared/protocol.js';
import {completeClassic} from '../mode-fixture.js';
describe('Classic-only lifecycle over real Socket.IO',()=>{
 it('rejects HOLD in public and friend rooms and puts Classic clients in the same queue',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client(),b=await f.client(),c=await f.client();
   for(const event of ['room:quickJoin','room:create'])for(const mode of ['hold','unknown',{id:'hold',targetPercent:50,holdSeconds:10}])expect(await a.request(event,{nickname:'A',gameMode:mode})).toMatchObject({ok:false,code:'INVALID_INPUT'});
   expect(f.rooms.rooms.size).toBe(0);
   const first=await a.request('room:quickJoin',{nickname:'A',gameMode:'classic'});expect(first.ok).toBe(true);if(!first.ok)throw new Error('join');
   expect(await b.request('room:quickJoin',{nickname:'B'})).toMatchObject({ok:true,roomId:first.roomId});
   expect(await c.request('room:quickJoin',{nickname:'C',gameMode:'classic'})).toMatchObject({ok:true,roomId:first.roomId});
   now=5000;f.loop.pump();await until(()=>a.snapshots.length>0&&b.snapshots.length>0&&c.snapshots.length>0);
   for(const client of [a,b,c])expect(unpackSnapshot(client.snapshots[0]).gameMode).toEqual({id:'classic'});
  }finally{await f.close();}
 });
 it('Classic survives friend join, reconnect, victory, results recovery and the next round',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A',gameMode:'classic'});const room=[...f.rooms.rooms.values()][0];
   expect(await b.request('room:join',{nickname:'B',code:room.code,gameMode:'hold'})).toMatchObject({ok:false,code:'INVALID_INPUT'});
   await b.request('room:join',{nickname:'B',code:room.code});await until(()=>b.views.length>0);expect(b.views.at(-1)!.gameMode).toEqual({id:'classic'});
   expect(await a.request('room:start',{gameMode:'hold'})).toMatchObject({ok:false,code:'INVALID_INPUT'});await a.request('room:start');now=3000;f.loop.pump();await until(()=>a.snapshots.length>0);
   const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>restored.snapshots.length>0);expect(unpackSnapshot(restored.snapshots[0]).gameMode).toEqual({id:'classic'});
   completeClassic(room.match!);const results:unknown[]=[];b.socket.on('match:result',r=>results.push(r));
   now+=34;f.loop.pump();await until(()=>results.length===1);expect(room.match!.outcome?.reason).toBe('FULL_CAPTURE');expect(room.phase).toBe('RESULTS');
   expect(results[0]).toMatchObject({gameMode:{id:'classic'},outcome:room.match!.outcome});
   const old=room.match!.matchId,recovered=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:b.ready.sessionToken});await until(()=>recovered.views.some(v=>v.phase==='RESULTS'));
   expect(recovered.views.at(-1)).toMatchObject({gameMode:{id:'classic'},outcome:room.match!.outcome,mapCellCount:1519});
   for(const client of [restored,recovered]){const p=room.match!.participants.find(p=>p.participantId===f.sessions.sessions.get(client.ready.sessionToken)!.memberId)!;await client.request('run:retry',{matchId:old,runId:p.run!.result!.runId});}now+=3000;f.loop.pump();expect(room.match!.matchId).not.toBe(old);expect(room.match!.gameMode).toEqual({id:'classic'});expect(room.match!.outcome).toBeNull();expect(results).toHaveLength(1);
  }finally{await f.close();}
 });
});
