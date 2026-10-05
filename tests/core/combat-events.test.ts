import {describe,it,expect} from 'vitest';
import {CombatEvents} from '../../src/client/combat-events.js';
import {buildView} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {markDead} from '../../src/shared/life.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';

const match=()=>createMatch({},4,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]);
describe('confirmed combat event playback',()=>{
 it('plays a confirmed kill once through repeated views and keeps the actual death location',()=>{
  const m=match(),cursor=new CombatEvents();cursor.accept(buildView(m));
  const [a,b]=m.participants,position={...b.position};markDead(m,b,'TRAIL_CUT',a);
  const view=buildView(m),events=cursor.accept(unpackSnapshot(packSnapshot(view,1,0,'a')));
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({participantId:'b',killerId:'a',lifeId:1,position,reason:'TRAIL_CUT'});
  expect(cursor.accept(view)).toHaveLength(0);m.tick++;expect(cursor.accept(buildView(m))).toHaveLength(0);
  view.events.find(e=>e.type==='DEATH')!.position!.x+=500;expect(m.events.find(e=>e.type==='DEATH')!.position).toEqual(position);
 });
 it('does not replay historical deaths on initial state, recovery or another match',()=>{
  const m=match(),cursor=new CombatEvents();markDead(m,m.participants[1],'WALL_HIT');
  expect(cursor.accept(buildView(m))).toHaveLength(0);expect(cursor.accept(buildView(m),true)).toHaveLength(0);
  const next=buildView(m);next.matchId='next';expect(cursor.accept(next)).toHaveLength(0);
 });
 it('ignores old snapshots, expired events and predicted death without a confirmed event',()=>{
  const m=match(),cursor=new CombatEvents();cursor.accept(buildView(m));m.tick=50;cursor.accept(buildView(m));
  const view=buildView(m);view.participants[0].lifeState='DEAD_WAIT';expect(cursor.accept(view)).toHaveLength(0);
  view.events=[{eventId:'old',tick:0,type:'DEATH',participantId:'a'}];expect(cursor.accept(view)).toHaveLength(0);
  view.tick=49;view.events=[{eventId:'stale',tick:49,type:'DEATH',participantId:'a'}];expect(cursor.accept(view)).toHaveLength(0);
 });
 it('rejects corrupt combat metadata instead of passing it to the renderer',()=>{
  const m=match();markDead(m,m.participants[0],'WALL_HIT');const raw=packSnapshot(buildView(m),1,0,'a');
  const death=raw.events.find(e=>e.type==='DEATH')!;
  for(const extra of [{position:{x:Infinity,y:0}},{killerId:42},{lifeId:0}]){
   expect(()=>unpackSnapshot({...raw,events:[{...death,...extra}]})).toThrow('Invalid combat event');
  }
 });
});
