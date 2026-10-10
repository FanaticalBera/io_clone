import {describe,it,expect,vi,afterEach} from 'vitest';
import {LanHost} from '../../src/shared/lan-host.js';
import {createChannelPair,decodeFrame,type FrameChannel,type MemoryChannelOptions} from '../../src/shared/lan-protocol.js';
import {FrameTransport,type CommandEvent} from '../../src/client/transport.js';
import {unpackSnapshot,type Ack,type AppError,type RoomView,type WireSnapshot,type CommandRequest} from '../../src/shared/protocol.js';
import {markDead} from '../../src/shared/life.js';
import {seededRandom} from '../../src/shared/random.js';
import {completeClassic} from '../mode-fixture.js';
import {PROTOCOL_VERSION} from '../../src/shared/config.js';

const CODE='NPQYMBM6';
const flush=async(times=4)=>{for(let i=0;i<times;i++)await new Promise(r=>setTimeout(r,0));};
let hosts:LanHost[]=[];
afterEach(()=>{for(const h of hosts)h.shutdown();hosts=[];vi.useRealTimers();});

/** A host driven by a manual clock: pump() steps the room exactly like the online scheduler. */
function makeHost(){
 let clock=0;const errors:AppError[]=[];
 const host=new LanHost({code:CODE,now:()=>clock,seed:()=>7,autoStart:false,onClosed:e=>errors.push(e)});hosts.push(host);
 // Frames arrive asynchronously, so deliver pending ones before stepping, as a live host would between ticks.
 const advance=async(ms:number)=>{await flush();for(let t=0;t<ms;t+=1000/30){clock+=1000/30;host.pump();}await flush();};
 return{host,advance,closedWith:errors};
}
/** A FrameTransport client recording what it hears, as NetworkSession would. */
async function client(host:LanHost,{local=false,channel={},sentFrames,reconnect=false}:{local?:boolean;channel?:MemoryChannelOptions;sentFrames?:{e:string;replaceKey?:string}[];reconnect?:boolean}={}){
 const [hostEnd,clientEnd]=createChannelPair(channel);const ends={host:hostEnd};
 if(sentFrames){const send=hostEnd.send.bind(hostEnd);hostEnd.send=(data,opts)=>{const f=decodeFrame(data);if(f?.k==='evt')sentFrames.push({e:f.e,replaceKey:opts?.replaceKey});send(data,opts);};}
 host.attach(hostEnd,{local});
 const t=new FrameTransport(clientEnd,reconnect?{reconnect:async()=>{const [h,c]=createChannelPair();host.attach(h);ends.host=h;return c;}}:{});
 const rec={t,views:[] as RoomView[],snapshots:[] as WireSnapshot[],inits:[] as WireSnapshot[],results:0,errors:[] as AppError[],disconnected:false,ready:false};
 t.on('room:view',v=>rec.views.push(v));t.on('match:snapshot',s=>rec.snapshots.push(s));t.on('match:init',s=>rec.inits.push(s));
 const paused:number[]=[];let resumed=0;t.on('room:paused',d=>paused.push(d.graceMs));t.on('room:resumed',()=>resumed++);
 t.on('match:result',()=>rec.results++);t.on('app:error',e=>rec.errors.push(e));t.on('disconnect',()=>rec.disconnected=true);
 t.on('session:ready',()=>rec.ready=true);t.on('connect_error',e=>{if(e)rec.errors.push(e);});
 t.connect();await flush();
 let n=0;const cmd=(event:CommandEvent,payload:Omit<CommandRequest,'requestId'>={})=>t.command(event,{requestId:'r'+(++n)+Math.random().toString(36).slice(2,8),...payload},3000);
 return{...rec,get view(){return rec.views.at(-1);},cmd,rec,ends,paused,get resumed(){return resumed;}};
}
async function lobby(guests=1){
 const h=makeHost();const host=await client(h.host,{local:true});
 expect(await host.cmd('room:create',{nickname:'방장'})).toMatchObject({ok:true});
 const others=[];for(let i=0;i<guests;i++){const g=await client(h.host);expect(await g.cmd('room:join',{nickname:'친구'+i,code:CODE})).toMatchObject({ok:true});others.push(g);}
 await h.advance(50);return{...h,hostClient:host,guests:others};
}
async function running(guests=1){
 const f=await lobby(guests);expect(await f.hostClient.cmd('room:start')).toMatchObject({ok:true});
 await f.advance(3100);return{...f,room:[...f.host.rooms.rooms.values()][0]!};
}

describe('L08–L10: LAN host over frame channels',()=>{
 it('handshakes, lets only the host create, and runs a 2-human match with 12 bots',async()=>{
  const f=await running(1);const match=f.room.match!;
  expect(f.hostClient.rec.ready&&f.guests[0]!.rec.ready).toBe(true);
  expect(match.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(2);
  expect(match.participants.filter(p=>p.kind==='BOT')).toHaveLength(12);
  for(const c of [f.hostClient,f.guests[0]!]){
   expect(c.inits).toHaveLength(1);const self=c.inits[0]!.selfParticipantId;
   expect(match.participants.find(p=>p.participantId===self)?.kind).toBe('HUMAN');
   expect(c.view).toMatchObject({mode:'FRIEND',code:CODE,phase:'RUNNING'});
  }
  expect(f.hostClient.inits[0]!.selfParticipantId).not.toBe(f.guests[0]!.inits[0]!.selfParticipantId);
  await f.advance(1000);expect(f.guests[0]!.snapshots.length).toBeGreaterThanOrEqual(9);
  expect(unpackSnapshot(f.guests[0]!.snapshots.at(-1)).tick).toBe(match.tick);
 });
 it('rejects guest room creation, quick join, a fifth human and a protocol mismatch',async()=>{
  const f=await lobby(3);
  expect(await f.guests[0]!.cmd('room:create',{nickname:'x'})).toMatchObject({ok:false,code:'NOT_HOST'});
  expect(await f.guests[0]!.cmd('room:quickJoin',{nickname:'x'})).toMatchObject({ok:false,code:'INVALID_INPUT'});
  expect(await f.guests[0]!.cmd('room:start')).toMatchObject({ok:false,code:'NOT_HOST'});
  const fifth=await client(f.host);expect(await fifth.cmd('room:join',{nickname:'다섯',code:CODE})).toMatchObject({ok:false,code:'ROOM_FULL'});
  const [hostEnd,clientEnd]=createChannelPair();f.host.attach(hostEnd);const replies:unknown[]=[];
  clientEnd.onMessage(d=>replies.push(decodeFrame(d)));clientEnd.send(JSON.stringify({k:'req',id:1,e:'lan:hello',d:{protocolVersion:PROTOCOL_VERSION-1}}));await flush();
  expect(replies[0]).toMatchObject({k:'ack',id:1,d:{ok:false,code:'PROTOCOL_MISMATCH'}});
 });
 it('lets a guest who arrives mid-match wait for the next round',async()=>{
  const f=await running(1);const late=await client(f.host);
  expect(await late.cmd('room:join',{nickname:'늦은친구',code:CODE})).toMatchObject({ok:true});await f.advance(100);
  expect(late.view).toMatchObject({waitingForNextRound:true,phase:'RUNNING'});expect(late.inits).toHaveLength(0);
 });
 it('applies only valid, newer guest inputs for the current life',async()=>{
  const f=await running(1);const g=f.guests[0]!,self=g.inits[0]!.selfParticipantId!,p=f.room.match!.participants.find(p=>p.participantId===self)!;
  const send=(seq:number,lifeId=p.lifeId,dx=1)=>g.t.direction({matchId:f.room.match!.matchId,lifeId,seq,dx,dy:0});
  send(5);await f.advance(100);expect(p.lastAppliedInputSeq).toBe(5);
  send(4,p.lifeId,-1);send(9,p.lifeId+1,-1);await f.advance(100);expect(p.lastAppliedInputSeq).toBe(5);
  g.t.direction({matchId:'other',lifeId:p.lifeId,seq:10,dx:1,dy:0});await f.advance(100);expect(p.lastAppliedInputSeq).toBe(5);
 });
 it('holds a dropped guest seat for the away grace with a bot steering, then hands it to a bot',async()=>{
  const f=await running(1);const g=f.guests[0]!,self=g.inits[0]!.selfParticipantId!,slot=f.room.match!.participants.find(p=>p.participantId===self)!.slot;
  g.t.dispose();await f.advance(100);
  const member=f.room.members.get(self)!;
  expect(member.session.background).toBe(true);expect(f.room.match!.participants.find(p=>p.participantId===self)?.kind).toBe('HUMAN');
  expect(f.hostClient.view!.members.find(m=>m.memberId===self)).toMatchObject({away:true,connected:false});
  await f.advance(31000);
  const match=f.room.match!;expect(match.participants.some(p=>p.participantId===self)).toBe(false);
  expect(match.participants.find(p=>p.slot===slot)?.kind).toBe('BOT');expect(match.phase).toBe('RUNNING');
  expect(f.hostClient.view!.members).toHaveLength(1);expect(f.closedWith).toHaveLength(0);
 },60000);
 it('lets a dropped guest reconnect with its token and take the same seat back',async()=>{
  const f=await running(0);const g=await client(f.host,{reconnect:true});
  expect(await g.cmd('room:join',{nickname:'복귀',code:CODE})).toMatchObject({ok:true});await f.advance(100);
  const retry=[...f.host.rooms.rooms.values()][0]!;expect(retry.members.size).toBe(2);
  const memberId=g.view!.selfMemberId;
  g.ends.host.close('NETWORK_ERROR');await f.advance(100);
  expect(retry.members.get(memberId)?.session.connected).toBe(true);
  expect(g.rec.errors).toEqual([]);expect(g.view!.members.find(m=>m.memberId===memberId)?.away).toBe(false);
  expect(retry.members.size).toBe(2);
 });
 it('hands the seat of a guest who stays in the background past the away grace to a bot',async()=>{
  const f=await running(1);const g=f.guests[0]!,self=g.inits[0]!.selfParticipantId!;
  expect(await g.cmd('control:background')).toMatchObject({ok:true});
  await f.advance(20000);expect(f.room.match!.participants.find(p=>p.participantId===self)?.kind).toBe('HUMAN');
  // The heartbeat runs on real timers in the host; drive it directly through the shared clock.
  (f.host as unknown as {heartbeat():void}).heartbeat();await f.advance(100);
  expect(f.room.match!.participants.some(p=>p.participantId===self)).toBe(true);
  await f.advance(11000);(f.host as unknown as {heartbeat():void}).heartbeat();await f.advance(100);
  expect(f.room.match!.participants.some(p=>p.participantId===self)).toBe(false);
 },60000);
 it('freezes the room while the host app is away and shifts deadlines on return',async()=>{
  const f=await running(1);const g=f.guests[0]!,tick=f.room.match!.tick;
  f.host.pause();await f.advance(20000);
  // The host's own client keeps hearing pings while paused, so its loopback stays open.
  (f.host as unknown as {heartbeat():void}).heartbeat();await flush();expect(f.hostClient.rec.disconnected).toBe(false);
  expect(f.room.match!.tick).toBe(tick);expect(g.paused).toEqual([60000]);
  expect(f.host.resume()).toBe(true);await f.advance(1000);
  expect(g.resumed).toBe(1);expect(f.room.match!.tick).toBeGreaterThanOrEqual(tick+29);expect(f.room.phase).toBe('RUNNING');
  expect(g.inits.length).toBeGreaterThanOrEqual(2);
 },60000);
 it('ends the room when the host stays away longer than the pause grace',async()=>{
  const f=await running(1);const g=f.guests[0]!;
  f.host.pause();await f.advance(61000);
  expect(f.host.resume()).toBe(false);await flush(8);
  expect(g.rec.errors.map(e=>e.code)).toEqual(['HOST_LEFT']);expect(g.rec.errors[0]!.message).toContain('오래');
 },60000);
 it('ends the room for every guest when the host leaves or its loopback closes',async()=>{
  for(const how of ['leave','close'] as const){
   const f=await running(2);
   if(how==='leave')await f.hostClient.cmd('room:leave');else f.hostClient.t.dispose();
   await flush(8);
   for(const g of f.guests){expect(g.rec.errors.map(e=>e.code)).toEqual(['HOST_LEFT']);expect(g.rec.disconnected).toBe(true);}
   expect(f.closedWith.map(e=>e.code)).toEqual(['HOST_LEFT']);expect(f.host.rooms.rooms.size).toBe(0);
  }
 },60000);
 it('delivers run results and retry state despite losing most replaceable snapshots (PRD 10.3)',async()=>{
  const sent:{e:string;replaceKey?:string}[]=[];
  const f=await lobby(0);const lossy=await client(f.host,{channel:{dropReplaceable:0.8,random:seededRandom(3)},sentFrames:sent});
  expect(await lossy.cmd('room:join',{nickname:'손실',code:CODE})).toMatchObject({ok:true});
  await f.hostClient.cmd('room:start');await f.advance(3100);
  const room=[...f.host.rooms.rooms.values()][0]!,match=room.match!,self=lossy.inits[0]!.selfParticipantId!,p=match.participants.find(p=>p.participantId===self)!;
  markDead(match,p,'TRAIL_CUT');await f.advance(2000);
  const seen=lossy.snapshots.map(s=>unpackSnapshot(s)).at(-1)!.participants.find(q=>q.participantId===self)!;
  expect(seen.run?.result?.runId).toBe(p.run!.result!.runId);
  expect(await lossy.cmd('run:retry',{matchId:match.matchId,runId:p.run!.result!.runId})).toMatchObject({ok:true});await f.advance(3500);
  expect(unpackSnapshot(lossy.snapshots.at(-1)).participants.find(q=>q.participantId===self)?.lifeState).toBe('ALIVE');
  // Let the host's own step finish the match, so the loop sends the FINISHED snapshot as it would live.
  completeClassic(match);await f.advance(200);
  expect(lossy.rec.results).toBe(1);expect(unpackSnapshot(lossy.snapshots.at(-1)).phase).toBe('FINISHED');
  // Only ordinary snapshots may be coalesced; init, results, views and errors are never marked replaceable.
  expect(new Set(sent.filter(s=>s.replaceKey).map(s=>s.e))).toEqual(new Set(['match:snapshot']));
  expect(sent.filter(s=>s.e==='match:init').every(s=>!s.replaceKey)).toBe(true);
  expect(sent.filter(s=>s.replaceKey).every(s=>s.replaceKey==='snap:'+match.matchId)).toBe(true);
 });
 it('de-duplicates a retried command by requestId',async()=>{
  const f=await lobby(1);const g=f.guests[0]!;const request={requestId:'same-request'};
  const first=await g.t.command('room:leave',request,3000),second=await g.t.command('room:leave',request,3000);
  expect(first).toEqual({ok:true});expect(second).toEqual(first);
 });
});

describe('L08: LAN host exposure limits',()=>{
 it('caps connections, drops peers that never say hello, and rate-limits room commands',async()=>{
  vi.useFakeTimers();
  const host=new LanHost({code:CODE,now:()=>Date.now()});hosts.push(host);
  const ends:{closed:string}[]=[];
  for(let i=0;i<9;i++){const [hostEnd,remote]=createChannelPair();const rec={closed:''};remote.onClose(r=>rec.closed=r);host.attach(hostEnd);ends.push(rec);}
  await vi.advanceTimersByTimeAsync(10);
  expect(ends.filter(e=>e.closed)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(6500);
  expect(ends.every(e=>e.closed==='REMOTE_CLOSED')).toBe(true);
  vi.useRealTimers();

  const f=await lobby(1);const g=f.guests[0]!;
  const results=[];for(let i=0;i<5;i++)results.push(await g.cmd('room:start'));
  expect(results.map(r=>r.ok?'ok':r.code)).toEqual(['NOT_HOST','NOT_HOST','NOT_HOST','NOT_HOST','RATE_LIMITED']);
  expect(await g.cmd('room:leave')).toEqual({ok:true});
 });
});

describe('L08: LAN heartbeat',()=>{
 it('drops a silent peer after the timeout and a guest notices a silent host',async()=>{
  vi.useFakeTimers();
  const host=new LanHost({code:CODE,now:()=>Date.now()});hosts.push(host);
  const [hostEnd,silent]=createChannelPair();let closed='';silent.onClose(r=>closed=r);host.attach(hostEnd);
  await vi.advanceTimersByTimeAsync(6500);expect(closed).toBe('REMOTE_CLOSED');

  const [deadHost,guestEnd]=createChannelPair();const t=new FrameTransport(guestEnd);const errors:AppError[]=[];
  t.on('app:error',e=>errors.push(e));let acked=false;deadHost.onMessage(d=>{const f=decodeFrame(d);if(f?.k==='req'&&!acked){acked=true;deadHost.send(JSON.stringify({k:'ack',id:f.id,d:{ok:true} satisfies Ack}));}});
  t.connect();await vi.advanceTimersByTimeAsync(6500);
  expect(errors.map(e=>e.code)).toEqual(['HOST_LEFT']);
 });
});
export type {FrameChannel};
