import {describe,it,expect} from 'vitest';
import {PracticeSession} from '../../src/client/practice.js';
import type {MatchView} from '../../src/shared/model.js';
import {markDead} from '../../src/shared/life.js';
import {homeReturnMargin} from '../../src/shared/home-return-margin.js';
import {createMatch,stepMatch,buildView} from '../../src/shared/game.js';
import {createBotMemory,type BotMemory} from '../../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../../src/shared/bot-identity.js';
import {getBotInputs} from '../../src/shared/bot-director.js';
import {setBotEncounterExperiment,explorerEncounterCommit,hunterEncounterCommit} from '../../src/shared/bot-encounter-experiment.js';
import {setSafeBotRespawn} from '../../src/shared/safe-bot-respawn.js';
describe('T18: practice lifecycle shares the authoritative core',()=>{
 it.each([[56,14],[24,4]])('R%s/%s default practice matches the explicitly approved explorer and hunter policies',(mapRadius,maxSlots)=>{
  const seed=4,session=new PracticeSession('P',()=>{},{mapRadius,maxSlots},{seed,matchId:'adopted-duel-'+mapRadius,autoStart:false});
  const reference=createMatch(session.match.config,seed,session.match.participants,session.match.matchId);setSafeBotRespawn(reference,true);
  const actual=(session as unknown as {memories:Map<string,BotMemory>}).memories;
  const memories=new Map(reference.participants.filter(p=>p.kind==='BOT').map(p=>{
   const memory=createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!));setBotEncounterExperiment(memory,'hunter-commit');
   expect(explorerEncounterCommit(actual.get(p.participantId)!,p.personality)).toBe(p.personality==='EXPAND');
   expect(hunterEncounterCommit(actual.get(p.participantId)!,p.personality)).toBe(p.personality==='ATTACK');return [p.participantId,memory];
  }));
  session.advance(0);
  for(let i=1;i<=90;i++){stepMatch(reference,getBotInputs(reference,memories));session.advance(i*1000/30+.001);}
  expect(buildView(session.match)).toEqual(buildView(reference));
  for(const [id,memory]of memories)expect(actual.get(id)!.random()).toBe(memory.random());session.dispose();
 });
 it('uses the accepted 10-unit home return in normal single-player without test hooks',()=>{
  const session=new PracticeSession('P',()=>{},{},{seed:4,autoStart:false});
  expect(homeReturnMargin(session.match)).toBe(10);expect(session.match.participants).toHaveLength(14);session.dispose();
 });
 it('drops the previous life target on respawn and maintains the new spawn heading',()=>{
  const session=new PracticeSession('P',()=>{}, {},{seed:1,autoStart:false}),human=session.match.participants[0];
  session.advance(0);session.setDirection({x:1,y:0});session.advance(34);markDead(session.match,human,'WALL_HIT');
  expect(session.retryRun()).toBe(true);
  expect(human.lifeId).toBe(2);expect(human.targetDirection).toBeNull();
  const heading={...human.direction};session.advance(100);session.advance(134);expect(human.targetDirection).toBeNull();expect(human.direction).toEqual(heading);session.dispose();
 });
 it('Classic continues past four minutes with 1 human + 7 bots (explicit legacy-size clock fixture) without a server',()=>{
  let view:MatchView|null=null;const session=new PracticeSession('브로',v=>view=v,{mapRadius:22,maxSlots:8,spawnRadius:2}, {seed:81,autoStart:false});
  session.advance(0);for(let i=1;i<=7200;i++){const h=session.match.participants[0];h.position={...session.match.map.cells[h.cellId].center};h.direction={x:0,y:0};session.advance(i*1000/30);if(h.lifeState==='ELIMINATED')session.retryRun();}
  expect(session.match.tick).toBeGreaterThan(7000);expect(session.match.phase).toBe('RUNNING');expect(view!.results).toBeNull();expect(view!.remainingTicks).toBeNull();expect(view!.gameMode.id).toBe('classic');expect(session.match.participants.every(p=>p.controlScore===0)).toBe(true);
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
