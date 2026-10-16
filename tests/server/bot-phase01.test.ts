import {GameLoop} from '../../src/server/loop.js';
import type {GameIO} from '../../src/server/sessions.js';
import {it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {BOT_NICKNAMES} from '../../src/shared/bot-roster.js';
import {BOT_PERSONALITIES} from '../../src/shared/bot-identity.js';
import {markDead} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
import {buildView,createMatch,stepMatch} from '../../src/shared/game.js';
import {getBotInput,observeBotForTick,createBotMemory,createGameplayBotMemory} from '../../src/shared/bot.js';
import {explorerEncounterFootprint,explorerEncounterCommit,hunterEncounterFootprint,hunterEncounterCommit} from '../../src/shared/bot-encounter-experiment.js';
import {getBotInputs} from '../../src/shared/bot-director.js';
import {botSeed} from '../../src/shared/bot-identity.js';
import {setSafeBotRespawn} from '../../src/shared/safe-bot-respawn.js';
function online(){let now=0;const sessions=new SessionStore(()=>now),rooms=new RoomManager(sessions,{},10,()=>19),member=sessions.create();rooms.createFriend(member,BOT_NICKNAMES[0]);rooms.start(member);now=3000;rooms.advance();const room=rooms.rooms.get(member.roomId!)!;return {rooms,member,room,match:room.match!,advance:(ms:number)=>{now+=ms;}};}
it('online 1+13 assignment uses bounded identities, preserves them on respawn, and keeps identity fields off the wire',()=>{
 const {room,match}=online(),bots=match.participants.filter(p=>p.kind==='BOT');
 expect(match.participants).toHaveLength(14);expect(bots).toHaveLength(13);expect(new Set(match.participants.map(p=>p.nickname)).size).toBe(14);
 expect(BOT_PERSONALITIES.map(role=>bots.filter(p=>p.personality===role).length).sort()).toEqual([3,3,3,4]);
 for(const p of bots){const memory=room.bots.get(p.participantId)!;expect(memory.identity?.personality).toBe(p.personality);expect(explorerEncounterFootprint(memory,p.personality)).toBe(p.personality==='EXPAND');expect(explorerEncounterCommit(memory,p.personality)).toBe(p.personality==='EXPAND');expect(hunterEncounterFootprint(memory,p.personality)).toBe(p.personality==='ATTACK');expect(hunterEncounterCommit(memory,p.personality)).toBe(p.personality==='ATTACK');}
 const p=bots[0],memory=room.bots.get(p.participantId)!,identity=memory.identity,traits=memory.traits;markDead(match,p,'WALL_HIT');match.tick=p.respawnAtTick;tryRespawns(match);
 expect(p.lifeState).toBe('ALIVE');getBotInput(observeBotForTick(match,p.participantId,memory),memory);
 expect(memory.identity).toBe(identity);expect(memory.traits).toBe(traits);expect(room.bots.get(p.participantId)).toBe(memory);
 expect(buildView(match).participants.every(p=>!('identity' in p)&&!('secondaryTrait' in p))).toBe(true);
});
it('a departing HUMAN replacement gets a new identity, unique name and currently deficient archetype',()=>{
 const {rooms,member,room,match}=online(),oldId=member.memberId,counts=new Map(BOT_PERSONALITIES.map(role=>[role,match.participants.filter(p=>p.kind==='BOT'&&p.personality===role).length]));
 rooms.leave(member);const replacement=match.participants.find(p=>p.slot===0)!;
 expect(replacement.participantId).not.toBe(oldId);expect(replacement.kind).toBe('BOT');expect(counts.get(replacement.personality!)).toBe(Math.min(...counts.values()));
 expect(new Set(match.participants.map(p=>p.nickname)).size).toBe(14);expect(room.bots.get(replacement.participantId)?.identity?.personality).toBe(replacement.personality);
 expect(explorerEncounterCommit(room.bots.get(replacement.participantId)!,replacement.personality)).toBe(replacement.personality==='EXPAND');
 expect(hunterEncounterCommit(room.bots.get(replacement.participantId)!,replacement.personality)).toBe(replacement.personality==='ATTACK');
});

it.each(['EXPAND','ATTACK'] as const)('loop fallback recreates the same %s slot identity and adopted encounter policy',role=>{
 const {rooms,room,match,advance}=online(),p=match.participants.find(p=>p.kind==='BOT'&&p.personality===role)!,identity=room.bots.get(p.participantId)!.identity;
 room.bots.delete(p.participantId);advance(50);
 const loop=new GameLoop({sockets:{sockets:new Map()}} as unknown as GameIO,rooms);loop.pump();
 expect(match.tick).toBeGreaterThan(0);expect(room.bots.get(p.participantId)?.identity).toEqual(identity);
 expect(explorerEncounterCommit(room.bots.get(p.participantId)!,p.personality)).toBe(p.personality==='EXPAND');
 expect(hunterEncounterCommit(room.bots.get(p.participantId)!,p.personality)).toBe(p.personality==='ATTACK');
});

it('shared online/LAN room loop preserves director behavior with and without a background human',()=>{
 for(const background of [false,true]){
  const {rooms,member,room,match,advance}=online();member.connected=true;member.background=background;
  const reference=createMatch(match.config,match.seed,match.participants,match.matchId,match.gameMode);setSafeBotRespawn(reference,true);
  const memories=new Map([...room.bots].map(([id,memory])=>[id,createGameplayBotMemory(botSeed(match.seed,match.participants.find(p=>p.participantId===id)!.slot),'combined',memory.identity)]));
  const loop=new GameLoop({sockets:{sockets:new Map()}} as unknown as GameIO,rooms);
  for(let tick=0;tick<90;tick++){
   const selected=new Set<string>(),returnOnly=new Set<string>();
   for(const p of reference.participants)if(p.lifeState==='ALIVE'&&(p.kind==='BOT'||background)){
    if(!memories.has(p.participantId))memories.set(p.participantId,createBotMemory(botSeed(reference.seed,p.slot),'combined'));
    const memory=memories.get(p.participantId)!;memory.seq=Math.max(memory.seq,p.lastAppliedInputSeq);selected.add(p.participantId);if(p.kind==='HUMAN')returnOnly.add(p.participantId);
   }
   stepMatch(reference,getBotInputs(reference,memories,selected,returnOnly));advance(1000/reference.config.simulationHz);loop.pump();
   expect(buildView(match)).toEqual(buildView(reference));
  }
  for(const [id,memory]of memories){const actual=room.bots.get(id)!;expect({...actual,random:undefined}).toEqual({...memory,random:undefined});expect(actual.random()).toBe(memory.random());}
 }
});
