import {GameLoop} from '../../src/server/loop.js';
import type {GameIO} from '../../src/server/sessions.js';
import {it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {BOT_NICKNAMES} from '../../src/shared/bot-roster.js';
import {BOT_PERSONALITIES} from '../../src/shared/bot-identity.js';
import {markDead} from '../../src/shared/life.js';
import {tryRespawns} from '../../src/shared/spawn.js';
import {buildView} from '../../src/shared/game.js';
import {getBotInput,observeBotForTick} from '../../src/shared/bot.js';
function online(){let now=0;const sessions=new SessionStore(()=>now),rooms=new RoomManager(sessions,{},10,()=>19),member=sessions.create();rooms.createFriend(member,BOT_NICKNAMES[0]);rooms.start(member);now=3000;rooms.advance();const room=rooms.rooms.get(member.roomId!)!;return {rooms,member,room,match:room.match!,advance:(ms:number)=>{now+=ms;}};}
it('online 1+13 assignment uses bounded identities, preserves them on respawn, and keeps identity fields off the wire',()=>{
 const {room,match}=online(),bots=match.participants.filter(p=>p.kind==='BOT');
 expect(match.participants).toHaveLength(14);expect(bots).toHaveLength(13);expect(new Set(match.participants.map(p=>p.nickname)).size).toBe(14);
 expect(BOT_PERSONALITIES.map(role=>bots.filter(p=>p.personality===role).length).sort()).toEqual([3,3,3,4]);
 for(const p of bots)expect(room.bots.get(p.participantId)?.identity?.personality).toBe(p.personality);
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
});

it('loop fallback recreates the same slot identity as initial room assignment',()=>{
 const {rooms,room,match,advance}=online(),p=match.participants.filter(p=>p.kind==='BOT')[4],identity=room.bots.get(p.participantId)!.identity;
 room.bots.delete(p.participantId);advance(50);
 const loop=new GameLoop({sockets:{sockets:new Map()}} as unknown as GameIO,rooms);loop.pump();
 expect(match.tick).toBeGreaterThan(0);expect(room.bots.get(p.participantId)?.identity).toEqual(identity);
});
