import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {unpackSnapshot} from '../../src/shared/protocol.js';
import {completeClassic} from '../mode-fixture.js';
import {setOwner} from '../../src/shared/territory.js';
describe('mode lifecycle over real Socket.IO',()=>{
 it('isolates public queues and rejects unsupported or client-authored mode settings',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
   const a=await f.client(),b=await f.client(),c=await f.client(),d=await f.client();
   const first=await a.request('room:quickJoin',{nickname:'A',gameMode:'classic'}),second=await b.request('room:quickJoin',{nickname:'B',gameMode:'hold'});
   expect(first).toMatchObject({ok:true});expect(second).toMatchObject({ok:true});if(!first.ok||!second.ok)throw new Error('join');expect(first.roomId).not.toBe(second.roomId);
   expect(await c.request('room:quickJoin',{nickname:'C',gameMode:'hold'})).toMatchObject({roomId:second.roomId});
   expect(await d.request('room:create',{nickname:'D',gameMode:'unknown'})).toMatchObject({ok:false,code:'INVALID_INPUT'});
   expect(await d.request('room:create',{nickname:'D',gameMode:{id:'hold',targetPercent:1,holdSeconds:0}})).toMatchObject({ok:false,code:'INVALID_INPUT'});
   expect(f.rooms.rooms.get(first.roomId!)!.gameMode).toEqual({id:'classic'});expect(f.rooms.rooms.get(second.roomId!)!.gameMode).toEqual({id:'hold',targetPercent:50,holdSeconds:10});
   now=5000;f.loop.pump();await until(()=>a.snapshots.length>0&&b.snapshots.length>0&&c.snapshots.length>0);
   expect(a.snapshots[0].gameMode.id).toBe('classic');expect(b.snapshots[0].gameMode.id).toBe('hold');expect(c.snapshots[0].gameMode).toEqual(b.snapshots[0].gameMode);
  }finally{await f.close();}
 });
 it.each(['classic','hold'] as const)('%s survives friend join, full reconnect, results recovery and next round',async(mode)=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now,modeSettings:{hold:{targetPercent:50,holdSeconds:.1}}});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A',gameMode:mode});const room=[...f.rooms.rooms.values()][0],settings={...room.gameMode};
   expect(await b.request('room:join',{nickname:'B',code:room.code,gameMode:'classic'})).toMatchObject({ok:false,code:'INVALID_INPUT'});
   await b.request('room:join',{nickname:'B',code:room.code});await until(()=>b.views.length>0);expect(b.views.at(-1)!.gameMode).toEqual(settings);
   expect(await a.request('room:start',{gameMode:'hold'})).toMatchObject({ok:false,code:'INVALID_INPUT'});await a.request('room:start');now=3000;f.loop.pump();await until(()=>a.snapshots.length>0);
   expect(a.snapshots[0].gameMode).toEqual(settings);expect(room.match!.gameMode).toEqual(settings);
   completeClassic(room.match!);
   // For Hold, leave exactly the threshold territory and verify cancellation on the server.
   if(mode==='hold'){
    const winner=room.match!.participants.find(p=>p.lifeState==='ALIVE')!,min=Math.ceil(room.match!.map.cells.length*.5),cells=room.match!.map.cells.filter(c=>c.id!==winner.cellId);
    for(const c of cells.slice(0,room.match!.map.cells.length-min))setOwner(room.match!,c.id,0);
    now+=34;f.loop.pump();expect(room.match!.modeState.holds).toHaveLength(1);
    setOwner(room.match!,cells.at(-1)!.id,0);now+=34;f.loop.pump();expect(room.match!.modeState.holds).toEqual([]);
    setOwner(room.match!,cells.at(-1)!.id,winner.slot+1);now+=34;f.loop.pump();expect(room.match!.modeState.holds[0].startedAtTick).toBeGreaterThan(0);
    const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>restored.snapshots.length>0);expect(unpackSnapshot(restored.snapshots[0]).modeState).toEqual(room.match!.modeState);
   }
   const results:unknown[]=[];b.socket.on('match:result',r=>results.push(r));
   for(let i=0;i<10&&room.phase!=='RESULTS';i++){now+=34;f.loop.pump();}await until(()=>results.length===1);
   expect(room.match!.outcome?.reason).toBe(mode==='classic'?'FULL_CAPTURE':'HELD_TERRITORY');expect(room.phase).toBe('RESULTS');expect(results[0]).toMatchObject({gameMode:settings,outcome:room.match!.outcome});
   const old=room.match!.matchId;const recovered=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:b.ready.sessionToken});await until(()=>recovered.views.some(v=>v.phase==='RESULTS'));
   expect(recovered.views.at(-1)).toMatchObject({gameMode:settings,outcome:room.match!.outcome,mapCellCount:1519});
   now+=7000;f.loop.pump();now+=3000;f.loop.pump();expect(room.match!.matchId).not.toBe(old);expect(room.match!.gameMode).toEqual(settings);expect(room.match!.modeState.holds).toEqual([]);expect(room.match!.outcome).toBeNull();expect(results).toHaveLength(1);
  }finally{await f.close();}
 });
});
