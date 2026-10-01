import {it,expect} from 'vitest';import {serverFixture,until} from './helpers.js';
it('T28 expires an idle connected session after 60 seconds without disturbing a room',async()=>{
 let now=0;const f=await serverFixture({autoStart:false,now:()=>now});try{
  const active=await f.client(),idle=await f.client();await active.request('room:create',{nickname:'P'});
  now=60000;f.loop.pump();await until(()=>!idle.socket.connected);
  expect(f.sessions.lookup(idle.ready.sessionToken)).toBeNull();expect(active.socket.connected).toBe(true);expect(f.rooms.rooms.size).toBe(1);
 }finally{await f.close();}
});
