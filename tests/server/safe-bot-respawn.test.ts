import {it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {markDead} from '../../src/shared/life.js';
import {region} from '../../src/shared/hex.js';
import {setOwner,addTrail,clearTrail} from '../../src/shared/territory.js';
import {inspectSpawnSpace,tryRespawns} from '../../src/shared/spawn.js';
import {safeBotRespawn,ownedDistances,coreDistance} from '../../src/shared/safe-bot-respawn.js';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs} from '../../src/shared/bot.js';
function online(publicRoom=false){
 let now=0;const sessions=new SessionStore(()=>now),rooms=new RoomManager(sessions,{},10,()=>41),member=sessions.create();
 if(publicRoom)rooms.quickJoin(member,'H');else{rooms.createFriend(member,'H');rooms.start(member);}
 now=publicRoom?5000:3000;rooms.advance();const room=rooms.rooms.get(member.roomId!)!,m=room.match!;
 return {rooms,member,m};
}
for(const publicRoom of [false,true])it(`default ${publicRoom?'public':'friend'} online room keeps initial placement, HUMAN Retry and replacement spawn, and enables BOT death respawn`,()=>{
 const {rooms,member,m}=online(publicRoom),human=m.participants[0],bot=m.participants[13];
 expect(m.participants).toHaveLength(14);expect(m.participants.filter(p=>p.kind==='BOT')).toHaveLength(13);
 const initial=createMatch(m.config,m.seed,[{participantId:human.participantId,slot:0,nickname:'H',kind:'HUMAN'},...botSpecs(13,1,m.matchId)],m.matchId,m.gameMode);
 expect(m).toEqual(initial);expect(safeBotRespawn(m,bot)).toBe(false);
 markDead(m,human,'WALL_HIT');const retryResult=human.run!.result!;expect(rooms.retryRun(member,m.matchId,retryResult.runId).ok).toBe(true);expect(human.lifeState).toBe('ALIVE');expect(safeBotRespawn(m,human)).toBe(false);
 markDead(m,bot,'TRAIL_CUT');expect(safeBotRespawn(m,bot)).toBe(true);expect(inspectSpawnSpace(m,bot).edgeRejectedCount).toBe(1308);
 rooms.leave(member);const replacement=m.participants.find(p=>p.slot===0)!;expect(replacement.kind).toBe('BOT');expect(replacement.lifeState).toBe('ALIVE');expect(replacement.spawnCells.size).toBe(7);expect(safeBotRespawn(m,replacement)).toBe(false);
});
it('online BOT death waits three seconds, preserves Trail safety, blocks, and recovers at the next one-second retry',()=>{
 const {m}=online(),human=m.participants[0],bot=m.participants[13];markDead(m,bot,'TRAIL_CUT');
 for(const p of m.participants)if(p!==human&&p!==bot)p.lifeState='FINISHED';
 for(const c of m.map.cells)setOwner(m,c.id,1);const center=m.map.byKey.get('0,0')!;for(const id of region(m.map,center,3))setOwner(m,id,0);
 human.cellId=m.map.byKey.get('20,0')!;human.position={...m.map.cells[human.cellId].center};
 m.tick=89;tryRespawns(m);expect(bot.lifeState).toBe('DEAD_WAIT');m.tick=90;tryRespawns(m);expect(bot.lifeState).toBe('SPAWN_BLOCKED');expect(bot.respawnAtTick).toBe(120);
 for(const id of region(m.map,center,4))setOwner(m,id,0);addTrail(m,human,m.map.byKey.get('3,0')!);m.tick=120;tryRespawns(m);expect(bot.lifeState).toBe('SPAWN_BLOCKED');expect(bot.respawnAtTick).toBe(150);
 clearTrail(m,human);const owned=ownedDistances(m);m.tick=149;tryRespawns(m);expect(bot.lifeState).toBe('SPAWN_BLOCKED');m.tick=150;tryRespawns(m);
 expect(bot.lifeState).toBe('ALIVE');expect(bot.spawnCells.size).toBe(7);expect(coreDistance(bot.spawnCells,owned)).toBe(4);
});
