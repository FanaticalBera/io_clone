import {it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {assertOwnershipCounts} from '../../src/shared/territory.js';

it('keeps human rooms at eight while a R56/16 match fills eight bots and replaces a departed human',()=>{
 let now=0;const sessions=new SessionStore(()=>now),rooms=new RoomManager(sessions,{mapRadius:56,maxSlots:16},10,()=>4),members=Array.from({length:9},()=>sessions.create());
 rooms.createFriend(members[0],'host');const room=rooms.rooms.get(members[0].roomId!)!;
 for(const member of members.slice(1,8))expect(rooms.joinFriend(member,'human',room.code).ok).toBe(true);
 expect(rooms.joinFriend(members[8],'extra',room.code)).toMatchObject({ok:false,code:'ROOM_FULL'});
 rooms.start(members[0]);now=3000;rooms.advance();expect(room.match!.participants).toHaveLength(16);expect(room.bots.size).toBe(8);
 const original=room.match!.participants.find(p=>p.participantId===members[7].memberId)!;rooms.leave(members[7]);
 const replacement=room.match!.participants.find(p=>p.slot===original.slot)!;expect(replacement.kind).toBe('BOT');expect(replacement.participantId).not.toBe(original.participantId);assertOwnershipCounts(room.match!);
});
it('fills two human participants plus fourteen bots and preserves public human capacity',()=>{
 let now=0;const sessions=new SessionStore(()=>now),rooms=new RoomManager(sessions,{mapRadius:56,maxSlots:16},10,()=>19),members=Array.from({length:9},()=>sessions.create());
 for(const member of members)rooms.quickJoin(member,'human');expect(rooms.rooms.size).toBe(2);expect(rooms.rooms.get(members[0].roomId!)!.members.size).toBe(8);
 const isolated=new RoomManager(sessions,{mapRadius:56,maxSlots:16},10,()=>4),a=sessions.create(),b=sessions.create();isolated.quickJoin(a,'A');isolated.quickJoin(b,'B');now=5000;isolated.advance();
 const match=isolated.rooms.get(a.roomId!)!.match!;expect(match.participants.filter(p=>p.kind==='HUMAN')).toHaveLength(2);expect(match.participants.filter(p=>p.kind==='BOT')).toHaveLength(14);
});
