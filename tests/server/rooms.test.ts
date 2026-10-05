import {completeClassic} from '../mode-fixture.js';
import {describe,it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {stepMatch} from '../../src/shared/game.js';
function fixture(){let now=0;const store=new SessionStore(()=>now),manager=new RoomManager(store,{mapRadius:22,maxSlots:8,spawnRadius:2},10,()=>13);return{store,manager,at:(value:number)=>now=value};}
describe('T22: public room lifecycle with controlled time',()=>{
 it('includes the countdown in the first five seconds and fills exactly seven bots',()=>{
  const {store,manager,at}=fixture(),s=store.create();s.connected=true;
  expect(manager.quickJoin(s,'브로').ok).toBe(true);const room=manager.rooms.get(s.roomId!)!;
  expect(room.phase).toBe('WAITING');at(2000);manager.advance();expect(room.phase).toBe('COUNTDOWN');expect(room.match).toBeNull();
  at(5000);manager.advance();expect(room.phase).toBe('RUNNING');expect(room.match!.participants.filter(p=>p.kind==='BOT')).toHaveLength(7);
  expect(room.match!.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(1);
 });
 it('puts initial-countdown arrivals into this round but running arrivals into another room',()=>{
  const {store,manager,at}=fixture();const a=store.create(),b=store.create(),c=store.create();
  manager.quickJoin(a,'A');at(4999);manager.quickJoin(b,'B');expect(a.roomId).toBe(b.roomId);
  at(5000);manager.quickJoin(c,'C');expect(c.roomId).not.toBe(a.roomId);expect(manager.rooms.get(a.roomId!)!.match!.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(2);
 });
 it('resets all match data after seven seconds of results and a three second countdown',()=>{
  const {store,manager,at}=fixture(),s=store.create();manager.quickJoin(s,'P');at(5000);manager.advance();
  const room=manager.rooms.get(s.roomId!)!,previous=room.match!;previous.participants[0].controlScore=77;
  completeClassic(previous);stepMatch(previous);manager.advance();expect(room.phase).toBe('RESULTS');
  manager.retryRun(s,previous.matchId,previous.participants[0].run!.result!.runId);expect(room.phase).toBe('COUNTDOWN');at(8000);manager.advance();
  expect(room.match!.matchId).not.toBe(previous.matchId);expect(room.match!.tick).toBe(0);expect(room.match!.participants.every(p=>p.controlScore===0&&p.deaths===0)).toBe(true);
 });
 it('enforces eight humans, max rooms and no duplicate session membership',()=>{
  const {store,manager}=fixture();const sessions=Array.from({length:9},()=>store.create());
  for(const s of sessions)manager.quickJoin(s,'same');
  expect(manager.rooms.size).toBe(2);expect(manager.rooms.get(sessions[0].roomId!)!.members.size).toBe(8);
  expect(manager.quickJoin(sessions[0],'P')).toMatchObject({ok:false,code:'ALREADY_IN_ROOM'});
  manager.accepting=false;const next=store.create();for(const r of manager.rooms.values()){r.phase='RUNNING';}
  expect(manager.quickJoin(next,'P')).toMatchObject({ok:false,code:'SERVER_BUSY'});
 });
});
