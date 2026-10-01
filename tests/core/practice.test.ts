import {describe,it,expect} from 'vitest';
import {PracticeSession} from '../../src/client/practice.js';
import type {MatchView} from '../../src/shared/model.js';
import {markDead} from '../../src/shared/life.js';
describe('T18: practice lifecycle shares the authoritative core',()=>{
 it('drops the previous life target on respawn and maintains the new spawn heading',()=>{
  const session=new PracticeSession('P',()=>{}, {},{seed:1,autoStart:false}),human=session.match.participants[0];
  session.advance(0);session.setDirection({x:1,y:0});session.advance(34);markDead(session.match,human,'WALL_HIT');
  for(let i=2;i<100&&human.lifeId===1;i++)session.advance(i*1000/30);
  expect(human.lifeId).toBe(2);expect(human.targetDirection).toBeNull();
  const heading={...human.direction};session.advance(3400);expect(human.targetDirection).toEqual(heading);expect(human.direction).toEqual(heading);session.dispose();
 });
 it('Classic continues past four minutes with 1 human + 7 bots without a server',()=>{
  let view:MatchView|null=null;const session=new PracticeSession('브로',v=>view=v,{}, {seed:81,autoStart:false});
  session.advance(0);for(let i=1;i<=7200;i++)session.advance(i*1000/30);
  expect(session.match.tick).toBe(7200);expect(session.match.phase).toBe('RUNNING');expect(view!.results).toBeNull();expect(view!.remainingTicks).toBeNull();expect(view!.gameMode.id).toBe('classic');expect(session.match.participants.every(p=>p.controlScore===0)).toBe(true);
  expect(session.match.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(1);expect(session.match.participants.filter(p=>p.kind==='BOT')).toHaveLength(7);
  session.dispose();session.advance(241000);expect(session.match.tick).toBe(7200);
 });
 it('pauses hidden practice and does not catch up the hidden time; restart starts a new match',()=>{
  const session=new PracticeSession('P',()=>{}, {},{seed:1,autoStart:false});session.advance(0);session.advance(100);
  const tick=session.match.tick;session.setPaused(true);session.advance(20000);expect(session.match.tick).toBe(tick);
  session.setPaused(false);session.advance(30000);expect(session.match.tick).toBe(tick);session.advance(30034);expect(session.match.tick).toBe(tick+1);session.dispose();
  const next=new PracticeSession('P',()=>{}, {},{seed:2,autoStart:false});expect(next.match.matchId).not.toBe(session.match.matchId);expect(next.match.tick).toBe(0);expect(next.match.participants.every(p=>p.controlScore===0&&p.deaths===0)).toBe(true);next.dispose();
 });
});
