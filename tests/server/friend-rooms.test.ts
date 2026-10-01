import {completeClassic} from '../mode-fixture.js';
import {describe,it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {stepMatch} from '../../src/shared/game.js';
function fixture(code?:()=>string){
 let now=0;const store=new SessionStore(()=>now),manager=new RoomManager(store,{},10,()=>13,code);
 const session=()=>{const s=store.create();s.connected=true;return s;};return{store,manager,session,at:(v:number)=>now=v};
}
describe('T23: friend room authority and waiting membership',()=>{
 it('regenerates a collided code and gives room-not-found for invalid codes',()=>{
  let count=0;const f=fixture(()=>++count<=2?'ABCDEFGH':'JKLMNPQR'),a=f.session(),b=f.session(),c=f.session();
  f.manager.createFriend(a,'A');f.manager.createFriend(b,'B');
  expect(f.manager.rooms.get(a.roomId!)!.code).toBe('ABCDEFGH');expect(f.manager.rooms.get(b.roomId!)!.code).toBe('JKLMNPQR');
  expect(f.manager.joinFriend(c,'C','00000000')).toMatchObject({ok:false,code:'ROOM_NOT_FOUND'});
 });
 it('only the host starts; countdown and running arrivals wait for the next round',()=>{
  const f=fixture(),a=f.session(),b=f.session(),c=f.session();f.manager.createFriend(a,'A');
  const room=f.manager.rooms.get(a.roomId!)!;f.manager.joinFriend(b,'B',room.code);
  expect(f.manager.start(b)).toMatchObject({ok:false,code:'NOT_HOST'});expect(f.manager.start(a).ok).toBe(true);
  f.manager.joinFriend(c,'C',room.code);expect(f.manager.member(c)!.member.waitingForNextRound).toBe(true);
  f.at(3000);f.manager.advance();expect(room.match!.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(2);
  expect(room.match!.participants.some(p=>p.participantId===c.memberId)).toBe(false);
  completeClassic(room.match!);stepMatch(room.match!);f.manager.advance();f.at(10000);f.manager.advance();f.at(13000);f.manager.advance();
  expect(room.match!.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(3);expect(f.manager.member(c)!.member.waitingForNextRound).toBe(false);
 });
 it('counts waiting and grace members toward eight and transfers host without stopping the game',()=>{
  const f=fixture(),people=Array.from({length:9},f.session);f.manager.createFriend(people[0],'P0');
  const room=f.manager.rooms.get(people[0].roomId!)!;f.manager.joinFriend(people[1],'P1',room.code);f.manager.start(people[0]);
  for(let i=2;i<8;i++)f.manager.joinFriend(people[i],'P'+i,room.code);
  expect(f.manager.joinFriend(people[8],'P8',room.code)).toMatchObject({ok:false,code:'ROOM_FULL'});
  f.at(3000);f.manager.advance();const matchId=room.match!.matchId;f.manager.leave(people[0]);
  expect(room.hostId).toBe(people[1].memberId);expect(room.phase).toBe('RUNNING');expect(room.match!.matchId).toBe(matchId);expect(room.match!.departed).toHaveLength(1);
 });
});
