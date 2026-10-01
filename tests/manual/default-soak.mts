import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {createServer as netServer,connect as netConnect,type Socket as NetSocket} from 'node:net';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {io,type Socket} from 'socket.io-client';
import {createGameServer} from '../../src/server/app.js';
import {unpackSnapshot,type WireSnapshot,type Ack} from '../../src/shared/protocol.js';
import {createMap,hexDistance} from '../../src/shared/hex.js';
import {getBotInput,createBotMemory} from '../../src/shared/bot.js';
const game=createGameServer({seed:()=>81,maxRooms:2,log:(event,fields)=>{if(event==='match_error')console.error(JSON.stringify({event,...fields}));}});await new Promise<void>(r=>game.http.listen(0,'127.0.0.1',r));const upstreamPort=(game.http.address() as {port:number}).port;
const pipes=new Set<NetSocket>(),delays=new Set<ReturnType<typeof setTimeout>>();
const proxy=netServer(down=>{
 const up=netConnect(upstreamPort,'127.0.0.1');for(const s of [up,down]){pipes.add(s);s.on('error',()=>{});s.on('close',()=>pipes.delete(s));}
 const forward=(source:NetSocket,destination:NetSocket)=>source.on('data',chunk=>{const timer=setTimeout(()=>{delays.delete(timer);if(!destination.destroyed)destination.write(chunk);},50);delays.add(timer);});
 forward(down,up);forward(up,down);down.on('close',()=>up.destroy());up.on('close',()=>down.destroy());
});await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(proxy.address() as {port:number}).port;
const clients:{socket:Socket;latest:WireSnapshot|null;seq:number;life:number;round:string|null;memory:ReturnType<typeof createBotMemory>;results:Set<string>}[]=[];
const rtts:number[]=[],samples:unknown[]=[],errors:unknown[]=[],seen=new Map<string,Set<string>>();
const map=createMap();const start=performance.now();let controller:ReturnType<typeof setInterval>|undefined,monitor:ReturnType<typeof setInterval>|undefined;
const request=(socket:Socket,event:string,payload:Record<string,unknown>={})=>new Promise<Ack>((resolve,reject)=>socket.timeout(4000).emit(event,{requestId:crypto.randomUUID(),...payload},(e:Error|null,r:Ack)=>e?reject(e):resolve(r)));
const sorted=(values:number[])=>[...values].sort((a,b)=>a-b),percentile=(v:number[],q:number)=>sorted(v)[Math.min(v.length-1,Math.floor(v.length*q))];
try{
 for(let i=0;i<10;i++){
  const socket=io(url,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{protocolVersion:PROTOCOL_VERSION}});
  const state={socket,latest:null as WireSnapshot|null,seq:0,life:0,round:null as string|null,memory:createBotMemory(100+i),results:new Set<string>()};clients.push(state);
  const accept=(s:WireSnapshot)=>{if(state.round!==s.matchId||state.life!==s.participants.find(p=>p.participantId===s.selfParticipantId)?.lifeId){state.seq=s.lastAppliedInputSeq;state.life=s.participants.find(p=>p.participantId===s.selfParticipantId)!.lifeId;state.round=s.matchId;state.memory=createBotMemory(100+clients.indexOf(state));}
   state.latest=s;state.seq=Math.max(state.seq,s.lastAppliedInputSeq);
   if(s.phase==='FINISHED')state.results.add(s.matchId);
   const roomId=s.matchId.split(':round:')[0];if(!seen.has(roomId))seen.set(roomId,new Set());seen.get(roomId)!.add(s.matchId);
  };socket.on('match:init',accept);socket.on('match:snapshot',accept);socket.on('app:error',e=>errors.push(e));
  await new Promise<void>((resolve,reject)=>{socket.once('session:ready',()=>resolve());socket.once('connect_error',reject);socket.connect();});
 }
 assert.equal((await request(clients[0].socket,'room:create',{nickname:'Load0'})).ok,true);const first=[...game.rooms.rooms.values()][0];
 for(let i=1;i<8;i++)assert.equal((await request(clients[i].socket,'room:join',{nickname:'Load'+i,code:first.code})).ok,true);
 assert.equal((await request(clients[8].socket,'room:create',{nickname:'Mixed0'})).ok,true);const second=[...game.rooms.rooms.values()][1];
 assert.equal((await request(clients[9].socket,'room:join',{nickname:'Mixed1',code:second.code})).ok,true);
 await request(clients[0].socket,'room:start');await request(clients[8].socket,'room:start');
 controller=setInterval(()=>{
  for(const state of clients){if(!state.latest||state.latest.phase!=='RUNNING')continue;
   const view=unpackSnapshot(state.latest),self=view.participants.find(p=>p.participantId===state.latest!.selfParticipantId)!;if(self.lifeState!=='ALIVE')continue;
   const near=(id:number)=>hexDistance(map.cells[self.cellId],map.cells[id])<=view.config.botObservationRange;
   const others=view.participants.filter(p=>p!==self&&p.lifeState==='ALIVE'&&near(p.cellId));
   const ownTrail:number[]=[],trails:{cellId:number;slot:number}[]=[];for(let id=0;id<view.trailMasks.length;id++){if(view.trailMasks[id]&(1<<self.slot))ownTrail.push(id);if(near(id))for(let slot=0;slot<8;slot++)if(slot!==self.slot&&(view.trailMasks[id]&(1<<slot)))trails.push({cellId:id,slot});}
   const input=getBotInput({matchId:view.matchId,tick:view.tick,gameMode:view.gameMode,config:view.config,map,owners:view.owners,self:{...self,personality:['EXPAND','ATTACK','DEFEND','SEEK_POINT'][clients.indexOf(state)%4] as any},ownTrail,others,trails},state.memory);
   if(input)state.socket.volatile.emit('input:direction',{...input,seq:++state.seq});
  }
 },100);
 const snapshot=async(status:string)=>{
  const value={status,elapsedSeconds:(performance.now()-start)/1000,rooms:[...game.rooms.rooms.values()].map(r=>({round:r.roundNumber,tick:r.match?.tick,phase:r.phase,humans:r.members.size})),connections:game.io.engine.clientsCount,heap:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss,metrics:{steps:game.loop.metrics.steps,stepP95Ms:percentile(game.loop.metrics.stepMs,.95),maxBacklogMs:game.loop.metrics.maxBacklogMs,snapshotBytes:game.loop.metrics.snapshotBytes,snapshots:game.loop.metrics.snapshots},rtt:{samples:rtts.length,medianMs:percentile(rtts,.5),p95Ms:percentile(rtts,.95)},errors};
  await writeFile('evidence/T38-default-soak-progress.json',JSON.stringify(value,null,2));return value;
 };
 monitor=setInterval(()=>{void snapshot('RUNNING').then(v=>{samples.push(v);console.log(JSON.stringify(v));});const began=performance.now();clients[0].socket.timeout(3000).emit('clock:ping',{nonce:crypto.randomUUID()},(e:Error|null)=>{if(!e)rtts.push(performance.now()-began);});},30000);
 // Unlimited Classic has no guaranteed round boundary. Measure ten minutes of real play.
 while(performance.now()-start<600000){await new Promise(r=>setTimeout(r,500));if(errors.length)throw new Error(JSON.stringify(errors));}
 clearInterval(controller);clearInterval(monitor);
 for(const c of clients){const expected=c===clients[8]||c===clients[9]?second:first;assert.equal(c.latest!.matchId,expected.match!.matchId);assert.equal(c.latest!.gameMode.id,'classic');}
 for(const c of clients)await request(c.socket,'room:leave');
 for(const c of clients)c.socket.disconnect();
 await game.close();const final=await snapshot('PASSED');assert.equal(game.rooms.rooms.size,0);assert.equal(game.sessions.sessions.size,0);
 await writeFile('evidence/T38-default-soak.json',JSON.stringify({condition:'Windows Node, actual Socket.IO over TCP proxy 50ms each direction; scripted public-state clients, no phone FPS claim',rounds:[...seen.values()].map(s=>[...s]),final,samples,cleanup:{rooms:game.rooms.rooms.size,connections:game.io.engine.clientsCount,channels:game.io.sockets.adapter.rooms.size,sessions:game.sessions.sessions.size}},null,2));
 console.log('DEFAULT_SOAK_PASSED');
}finally{if(controller)clearInterval(controller);if(monitor)clearInterval(monitor);for(const c of clients)c.socket.disconnect();for(const timer of delays)clearTimeout(timer);for(const pipe of pipes)pipe.destroy();await new Promise<void>(r=>proxy.close(()=>r()));await game.close();}



