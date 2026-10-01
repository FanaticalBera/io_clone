import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {it,expect} from 'vitest';
import {io} from 'socket.io-client';
import {serverFixture,until} from './helpers.js';
it('T33 rejects command floods, caches retry, limits IP creation and keeps a separate match running',async()=>{
 let now=0;const logs:unknown[]=[];const f=await serverFixture({now:()=>now,autoStart:false,log:(e,v)=>logs.push({e,v})});try{
 const a=await f.client(),b=await f.client();await a.request('room:create',{nickname:'<script>A'});await a.request('room:start');
 const room=f.rooms.rooms.values().next().value!;now=3000;f.loop.pump();const p=room.match!.participants.find(p=>p.kind==='HUMAN')!;
 for(let i=0;i<3;i++)await a.request('room:start');expect(await a.request('room:start')).toMatchObject({ok:false,code:'RATE_LIMITED'});
 const req={requestId:'stable-retry',nickname:'B'},emit=()=>new Promise<any>(r=>b.socket.emit('room:create',req,r));
 expect(await emit()).toMatchObject({ok:true});expect(await emit()).toMatchObject({ok:true});expect(f.rooms.rooms.size).toBe(2);
 const c=await f.client();expect(await c.request('room:create',{nickname:'C'})).toMatchObject({ok:true});const d=await f.client();expect(await d.request('room:create',{nickname:'D'})).toMatchObject({ok:false,code:'RATE_LIMITED'});
 for(let seq=1;seq<=140;seq++)a.socket.emit('input:direction',{matchId:room.match!.matchId,lifeId:p.lifeId,seq,dx:0,dy:1});
 await until(()=>!a.socket.connected);expect(f.sessions.sessions.get(a.ready.sessionToken)!.highestReceivedSeq).toBeLessThanOrEqual(60);
 now+=100;f.loop.pump();expect(room.match!.tick).toBeGreaterThan(0);expect(logs.some(x=>JSON.stringify(x).includes('input_limited'))).toBe(true);
 expect(JSON.stringify(logs)).not.toContain(a.ready.sessionToken);
 for(const path of ['/src/server/app.ts','/package.json','/.env','/../src/server/app.ts'])expect((await fetch(f.url+path)).status).toBe(404);
 }finally{await f.close();}
});
it('T33 rejects forbidden Origin and oversized packets while polling/WebSocket remain usable',async()=>{
 const f=await serverFixture();try{
 const foreign=io(f.url,{autoConnect:false,reconnection:false,transports:['websocket'],extraHeaders:{Origin:'https://forbidden.example'},auth:{protocolVersion:PROTOCOL_VERSION}});
 const error=new Promise<void>(r=>foreign.once('connect_error',()=>r()));foreign.connect();await error;expect(f.sessions.sessions.size).toBe(0);foreign.disconnect();
 const poll=await f.client({protocolVersion:PROTOCOL_VERSION},['polling']);expect(poll.socket.connected).toBe(true);
 const large=await f.client({protocolVersion:PROTOCOL_VERSION},['websocket']);large.socket.emit('room:create',{requestId:'large',nickname:'x'.repeat(6000)},()=>{});await until(()=>!large.socket.connected);
 expect(poll.socket.connected).toBe(true);
 }finally{await f.close();}
});

