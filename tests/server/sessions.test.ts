import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {io as connect,type Socket} from 'socket.io-client';
import {SessionStore,attachSessions,type GameIO} from '../../src/server/sessions.js';
import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import type {SessionReady,Ack} from '../../src/shared/protocol.js';
async function fixture(){
 const http=createServer(),server:GameIO=new Server(http,{pingInterval:2000,pingTimeout:5000}),store=new SessionStore();
 let executed=0;
 attachSessions(server,store,{onConnect:(s,socket)=>socket.on('room:create',(raw,ack)=>ack(store.request(s,raw,()=>{executed++;return{ok:true};})))});
 await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const address=http.address() as {port:number};
 const clients:Socket[]=[];
 async function client(auth:Record<string,unknown>={protocolVersion:PROTOCOL_VERSION}):Promise<{socket:Socket;ready:SessionReady}>{
  const socket=connect('http://127.0.0.1:'+address.port,{auth,autoConnect:false,reconnection:false});clients.push(socket);
  const ready=await new Promise<SessionReady>((resolve,reject)=>{socket.once('session:ready',resolve);socket.once('connect_error',reject);socket.connect();});return{socket,ready};
 }
 return {store,client,executed:()=>executed,close:async()=>{for(const c of clients)c.disconnect();await new Promise<void>(r=>server.close(()=>r()));}};
}
describe('T21: real Socket.IO sessions',()=>{
 it('issues independent opaque tokens and replaces a socket without identity duplication',async()=>{
  const f=await fixture();try{
   const a=await f.client(),b=await f.client();expect(a.ready.sessionToken).toMatch(/^[a-f0-9]{64}$/);expect(a.ready.sessionToken).not.toBe(b.ready.sessionToken);
   const original=f.store.lookup(a.ready.sessionToken)!;const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});
   expect(restored.ready.sessionToken).toBe(a.ready.sessionToken);expect(f.store.lookup(a.ready.sessionToken)!.sessionId).toBe(original.sessionId);
   expect(original.socketId).toBe(restored.socket.id);expect(original.connected).toBe(true);expect(original.generation).toBe(2);
  }finally{await f.close();}
 });
 it('rejects a wrong protocol and an explicit expired token',async()=>{
  const f=await fixture();try{
   await expect(f.client({protocolVersion:1})).rejects.toMatchObject({data:{code:'PROTOCOL_MISMATCH'}});
   await expect(f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:'a'.repeat(64)})).rejects.toMatchObject({data:{code:'SESSION_EXPIRED'}});
  }finally{await f.close();}
 });
 it('does not execute a retried logical command twice',async()=>{
  const f=await fixture();try{
   const {socket}=await f.client(),request={requestId:'same',nickname:'브로'};
   const send=()=>new Promise<Ack>(r=>socket.emit('room:create',request,r));
   expect(await send()).toEqual({ok:true});expect(await send()).toEqual({ok:true});expect(f.executed()).toBe(1);
  }finally{await f.close();}
 });
 it('expires request cache after 30 seconds and limits it to 64',()=>{
  let now=0;const store=new SessionStore(()=>now),s=store.create();let count=0;
  const execute=()=>{count++;return{ok:true as const};};store.request(s,{requestId:'same'},execute);now=30000;store.request(s,{requestId:'same'},execute);expect(count).toBe(2);
  for(let i=0;i<80;i++)store.request(s,{requestId:'r'+i},execute);expect(s.cache.size).toBe(64);
 });
});
