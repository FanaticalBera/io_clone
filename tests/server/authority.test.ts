import {describe,it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {rotateDirectionTowards} from '../../src/shared/movement.js';
describe('T25: input authority through real sockets',()=>{
 it('applies the latest increasing sequence at the next tick and rejects foreign/stale claims',async()=>{
  let now=0;const f=await serverFixture({autoStart:false,now:()=>now,seed:()=>13});try{
   const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'A'});
   const room=f.rooms.rooms.values().next().value!;await b.request('room:join',{nickname:'B',code:room.code});await a.request('room:start');
   now=3000;f.loop.pump();await until(()=>a.snapshots.length>0&&b.snapshots.length>0);
   const match=room.match!,pa=match.participants.find(p=>p.participantId===a.views.at(-1)!.selfMemberId)!,pb=match.participants.find(p=>p.participantId===b.views.at(-1)!.selfMemberId)!;
   const start={...pa.position},heading={...pa.direction},send=(seq:number,extra:Record<string,unknown>={})=>a.socket.emit('input:direction',{matchId:match.matchId,lifeId:pa.lifeId,seq,dx:1,dy:0,...extra});
   send(1);send(9,{dx:0,dy:1});send(8,{dx:-1});send(9,{dx:-1});await until(()=>room.inputs.get(pa.participantId)?.seq===9);
   expect(pa.position).toEqual(start);now=3034;f.loop.pump();expect(pa.lastAppliedInputSeq).toBe(9);
   expect(pa.targetDirection).toEqual({x:0,y:1});expect(pa.direction).toEqual(rotateDirectionTowards(heading,{x:0,y:1},match.config.turnRadiansPerSecond/match.config.simulationHz));
   expect(pa.direction).not.toEqual(pa.targetDirection);
   const old=pa.lastAppliedInputSeq;
   for(const invalid of [{seq:10,dx:NaN},{seq:11,dy:Infinity},{seq:12,lifeId:0},{seq:13,matchId:'old'},{seq:14,participantId:pb.participantId},{seq:15,score:999},{seq:16,roomId:'other'}])send(Number(invalid.seq),invalid);
   await new Promise(r=>setTimeout(r,30));now=3068;f.loop.pump();expect(pa.lastAppliedInputSeq).toBe(old);expect(pa.controlScore).toBe(0);expect(pb.controlScore).toBe(0);
   f.loop.publishSnapshot(room,false,true);await until(()=>a.snapshots.at(-1)!.tick===2&&b.snapshots.at(-1)!.tick===2);
   expect(a.snapshots.at(-1)!.owners).toBe(b.snapshots.at(-1)!.owners);expect(a.snapshots.at(-1)!.trailMasks).toBe(b.snapshots.at(-1)!.trailMasks);
   expect(a.snapshots.at(-1)!.lastAppliedInputSeq).toBe(9);
  }finally{await f.close();}
 });
});
