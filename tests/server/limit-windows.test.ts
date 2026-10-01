import {it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
it('T33 separate monotonic limit clock enforces code-failure window and input refill boundaries',async()=>{
 let rateNow=0;const f=await serverFixture({autoStart:false,rateNow:()=>rateNow});try{
 const a=await f.client();for(let i=0;i<10;i++){if(i===5)rateNow=10001;expect(await a.request('room:join',{nickname:'A',code:'ABCDEFGH'})).toMatchObject({ok:false,code:'ROOM_NOT_FOUND'});}
 rateNow=20002;expect(await a.request('room:join',{nickname:'A',code:'ABCDEFGH'})).toMatchObject({ok:false,code:'RATE_LIMITED'});
 rateNow=60001;expect(await a.request('room:join',{nickname:'A',code:'ABCDEFGH'})).toMatchObject({ok:false,code:'ROOM_NOT_FOUND'});
 const b=await f.client();await b.request('room:create',{nickname:'B'});await b.request('room:start');const room=[...f.rooms.rooms.values()][0];room.phaseDeadline=f.sessions.now();f.loop.pump();
 const p=room.match!.participants.find(p=>p.kind==='HUMAN')!,s=f.sessions.sessions.get(b.ready.sessionToken)!;
 const send=(seq:number)=>b.socket.emit('input:direction',{matchId:room.match!.matchId,lifeId:p.lifeId,seq,dx:1,dy:0});
 for(let i=1;i<=61;i++)send(i);await until(()=>s.highestReceivedSeq===60);expect(s.inputViolations).toBe(1);
 rateNow+=1000;for(let i=62;i<=92;i++)send(i);await until(()=>s.highestReceivedSeq===91);expect(s.inputViolations).toBe(2);
 }finally{await f.close();}
});
