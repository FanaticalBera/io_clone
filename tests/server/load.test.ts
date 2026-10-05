import {completeClassic} from '../mode-fixture.js';
import {it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {writeFile} from 'node:fs/promises';
it('T35 ten real connections in an 8-human and mixed room run three rounds and release memberships/channels/state',async()=>{
 let now=0;const heapBefore=process.memoryUsage().heapUsed;
 const f=await serverFixture({now:()=>now,autoStart:false,maxRooms:2,config:{roundSeconds:3,countdownSeconds:0.03,resultsSecondsIncludingCountdown:0.1,reconnectGraceSeconds:0.1,emptyRoomTtlSeconds:0.1}});
 try{
 const clients:Awaited<ReturnType<typeof f.client>>[]=[];for(let i=0;i<10;i++)clients.push(await f.client());
 expect(await clients[0].request('room:create',{nickname:'P0'})).toMatchObject({ok:true});const first=[...f.rooms.rooms.values()][0];
 for(let i=1;i<8;i++)expect(await clients[i].request('room:join',{nickname:'P'+i,code:first.code})).toMatchObject({ok:true});
 expect(await clients[8].request('room:create',{nickname:'Mixed0'})).toMatchObject({ok:true});const second=[...f.rooms.rooms.values()][1];
 await clients[9].request('room:join',{nickname:'Mixed1',code:second.code});
 await clients[0].request('room:start');await clients[8].request('room:start');
 const overflow=await f.client();expect(await overflow.request('room:create',{nickname:'overflow'})).toMatchObject({ok:false,code:'SERVER_BUSY'});
 now=30;f.loop.pump();expect(first.match!.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(8);expect(second.match!.participants.filter(p=>p.kind==='BOT')).toHaveLength(6);
 const ids=new Set(first.match!.participants.map(p=>p.participantId));expect(second.match!.participants.every(p=>!ids.has(p.participantId))).toBe(true);
 const roomTick=()=>first.match?.tick??0;const rounds:string[][]=[[],[]],seen=new Set<string>(),oldMatches=[];
 while(rounds[0].length<3||first.phase!=='RESULTS'||second.phase!=='RESULTS'){
  for(const [i,room]of [first,second].entries())if(room.match&&!seen.has(room.match.matchId)){
   seen.add(room.match.matchId);rounds[i].push(room.match.matchId);expect(room.inputs.size).toBe(0);expect(room.match.participants.every(p=>p.controlScore===0&&p.kills===0&&p.deaths===0)).toBe(true);oldMatches.push(room.match);
  }
  for(const room of [first,second])if(room.match?.phase==='RUNNING'&&room.match.tick>=30)completeClassic(room.match);
  for(const [i,c] of clients.entries()){const room=i<8?first:second;if(room.phase==='RESULTS'&&rounds[i<8?0:1].length<3){const member=f.sessions.sessions.get(c.ready.sessionToken)!.memberId,p=room.match!.participants.find(p=>p.participantId===member)!;await c.request('run:retry',{matchId:room.match!.matchId,runId:p.run!.result!.runId});}}
  now+=1000/30;f.loop.pump();if(roomTick()%3===0)await new Promise(r=>setTimeout(r,3));if(now>15000)throw new Error('round boundary failed');
 }
 f.loop.publishSnapshot(first,false,true);f.loop.publishSnapshot(second,false,true);
 await until(()=>clients.every(c=>c.snapshots.at(-1)?.phase==='FINISHED'));
 for(const [i,c]of clients.entries()){const group=i<8?first:second;expect(c.snapshots.at(-1)!.matchId).toBe(group.match!.matchId);expect(c.snapshots.at(-1)!.results).toEqual(group.match!.results);}
 for(let i=1;i<8;i++){const peer=new Map(clients[i].snapshots.map(s=>[s.matchId+'/'+s.snapshotSeq,s]));const common=clients[0].snapshots.filter(s=>peer.has(s.matchId+'/'+s.snapshotSeq)&&peer.get(s.matchId+'/'+s.snapshotSeq)!.matchId===s.matchId);expect(common.length).toBeGreaterThan(10);for(const s of common){expect(s.owners).toBe(peer.get(s.matchId+'/'+s.snapshotSeq)!.owners);expect(s.participants).toEqual(peer.get(s.matchId+'/'+s.snapshotSeq)!.participants);}}
 for(const c of clients)await c.request('room:leave');
 now+=101;f.loop.pump();expect(f.rooms.rooms.size).toBe(0);
 for(const room of [first,second]){expect(room.match).toBeNull();expect(room.bots.size).toBe(0);expect(room.inputs.size).toBe(0);}
 expect([...f.io.sockets.adapter.rooms.keys()].some(k=>k.startsWith('arena:')||k.startsWith('lobby:'))).toBe(false);
 now+=60001;f.loop.pump();await until(()=>f.io.engine.clientsCount===0);expect(f.sessions.sessions.size).toBe(0);expect(f.io.sockets.adapter.rooms.size).toBe(0);
 const sorted=[...f.loop.metrics.stepMs].sort((a,b)=>a-b);
 await writeFile('evidence/T35-resources.json',JSON.stringify({rounds,connections:10,steps:f.loop.metrics.steps,stepP95Ms:sorted[Math.floor(sorted.length*.95)],snapshotBytes:f.loop.metrics.snapshotBytes,snapshots:f.loop.metrics.snapshots,heapBefore,heapAfter:process.memoryUsage().heapUsed,cleanup:{rooms:f.rooms.rooms.size,sessions:f.sessions.sessions.size,channels:f.io.sockets.adapter.rooms.size}},null,2));
 }finally{await f.close();}
},20000);



