import {describe,it,expect} from 'vitest';
import {SessionStore} from '../../src/server/sessions.js';
import {RoomManager} from '../../src/server/rooms.js';
import {validRequest} from '../../src/shared/protocol.js';
function fixture(){const store=new SessionStore(()=>0),manager=new RoomManager(store,{mapRadius:22,maxSlots:8,spawnRadius:2},10,()=>13);return{store,manager};}
describe('friend room member looks',()=>{
 it('shows each member’s equipped marker and colour and drops malformed ids',()=>{
  const {store,manager}=fixture(),a=store.create(),b=store.create();a.connected=b.connected=true;
  expect(manager.createFriend(a,'A','classic','행운아',{marker:'phoenix',color:'coral'}).ok).toBe(true);
  const code=manager.rooms.get(a.roomId!)!.code!;
  expect(manager.joinFriend(b,'B',code,undefined,{marker:'<img>',color:'x'.repeat(30)}).ok).toBe(true);
  const room=manager.rooms.get(a.roomId!)!,me=manager.member(a)!.member,view=manager.view(room,me);
  expect(view.members.map(m=>({nickname:m.nickname,marker:m.marker,color:m.color,title:m.title}))).toEqual([
   {nickname:'A',marker:'phoenix',color:'coral',title:'행운아'},{nickname:'B',marker:undefined,color:undefined,title:undefined}]);
 });
 it('accepts marker and colour in room commands within their length limits only',()=>{
  expect(validRequest({requestId:'r1',nickname:'A',marker:'phoenix',color:'coral'})).toBe(true);
  expect(validRequest({requestId:'r1',marker:'x'.repeat(25)})).toBe(false);expect(validRequest({requestId:'r1',color:7})).toBe(false);
 });
});
