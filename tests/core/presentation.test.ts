import {it,expect} from 'vitest';
import {Presentation} from '../../src/client/presentation.js';
import {buildView} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {moveSpeed} from '../../src/shared/config.js';
import {stepMatch} from '../../src/shared/engine.js';
it('T34 predicts only display movement, interpolates at 100ms and caps extrapolation',()=>{
 const view=buildView(createMatch({},13,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]));
 const a=view.participants[0],b=view.participants[1];a.position={x:0,y:0};b.position={x:200,y:0};a.direction=b.direction={x:1,y:0};
 const original=structuredClone(view),p=new Presentation();p.accept(view,'a',0,true);p.input({x:0,y:1},1);
 expect(p.position('a',50)!.y).toBeGreaterThan(0);expect(view).toEqual(original);
 const next=structuredClone(view);next.tick=3;next.participants[1].position.x=230;p.accept(next,'a',100);
 expect(p.position('b',150)!.x).toBeCloseTo(215);
 expect(p.position('b',400)).toEqual(p.position('b',1000));
 expect(p.position('a',4000)).toEqual(p.position('a',9000));
 p.freeze();expect(p.position('a',9100)).toEqual(a.position);
});
it('T34 corrects small error over 80ms and snaps life/death/large differences; old tick cannot revive',()=>{
 const view=buildView(createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]));view.participants[0].position={x:0,y:0};view.participants[0].direction={x:1,y:0};
 const p=new Presentation();p.accept(view,'a',0,true);const next=structuredClone(view);next.tick=3;next.participants[0].position.x=35;next.participants[0].lastAppliedInputSeq=2;p.accept(next,'a',100);
 expect(p.position('a',100)!.x).toBeCloseTo(moveSpeed(view.config)*.1);expect(p.position('a',180)!.x).toBeCloseTo(35+moveSpeed(view.config)*.08);
 const dead=structuredClone(next);dead.tick=4;dead.participants[0].lifeState='DEAD_WAIT';p.accept(dead,'a',140);expect(p.position('a',200)).toEqual(dead.participants[0].position);
 const spawned=structuredClone(dead);spawned.tick=5;spawned.participants[0].lifeId++;spawned.participants[0].lifeState='ALIVE';spawned.participants[0].position={x:400,y:0};p.accept(spawned,'a',200);
 expect(p.position('a',200)).toEqual({x:400,y:0});p.accept(dead,'a',210);expect(p.position('a',210)!.x).toBeGreaterThanOrEqual(400);
});

it('constant server movement stays continuous when packets arrive late and in a burst',()=>{
 const view=buildView(createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]));view.participants[0].position={x:0,y:0};view.participants[0].direction={x:1,y:0};
 const p=new Presentation();p.accept(view,'a',0,true);const speed=moveSpeed(view.config);
 for(const [tick,at]of [[3,100],[6,245],[9,301],[12,430],[15,509]]){
  const before=p.position('a',at)!;const next=structuredClone(view);next.tick=tick;next.participants[0].position.x=speed*tick/30;p.accept(next,'a',at);
  expect(p.position('a',at)!.x).toBeCloseTo(before.x,8);
  expect(p.position('a',at+40)!.x).toBeCloseTo(speed*(at+40)/1000,8);
 }
});
it('local practice interpolates within a tick instead of displaying 30Hz position jumps',()=>{
 const view=buildView(createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]));view.participants[0].position={x:0,y:0};view.participants[0].direction={x:1,y:0};
 const p=new Presentation();p.accept(view,'a',0,true,true);const next=structuredClone(view);next.tick=1;next.participants[0].position.x=moveSpeed(view.config)/view.config.simulationHz;p.accept(next,'a',1000/30,false,true);
 expect(p.position('a',50)!.x).toBeCloseTo(next.participants[0].position.x/2);
 expect(p.position('a',60)!.x).toBeGreaterThan(p.position('a',50)!.x);
 expect(p.position('a',60)!.x).toBeLessThan(next.participants[0].position.x);
});
it('mid-tick intent does not rotate past displacement and then produces a limited turn',()=>{
 const view=buildView(createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]));view.participants[0].position={x:0,y:0};view.participants[0].direction={x:1,y:0};
 const p=new Presentation();p.accept(view,'a',0,true);const speed=moveSpeed(view.config),before=p.position('a',50)!;
 p.input({x:0,y:1},1,50);expect(p.position('a',50)).toEqual(before);
 expect(p.position('a',60)!.x).toBeCloseTo(speed*.06);expect(p.position('a',60)!.y).toBe(0);
 const turn=view.config.turnRadiansPerSecond/view.config.simulationHz;
 expect(p.position('a',100)!.x).toBeCloseTo(speed/30*(2+Math.cos(turn)));
 expect(p.position('a',100)!.y).toBeCloseTo(speed/30*Math.sin(turn));
});
it('replays unacknowledged targets with the same fixed steps as authority through delayed snapshots',()=>{
 const m=createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),a=m.participants[0];
 a.position={x:0,y:0};a.cellId=m.map.byKey.get('0,0')!;a.direction={x:1,y:0};
 // Own the test area so this test measures steering, not self-trail collisions.
 m.owners.fill(1);m.owners[0]=0;a.territoryCount=m.map.cells.length-1;
 const p=new Presentation();p.accept(buildView(m),'a',0,true);
 const targets=[{at:0,seq:1,dx:0,dy:1},{at:50,seq:2,dx:-1,dy:0},{at:140,seq:3,dx:0,dy:-1}];
 for(const input of targets)p.input({x:input.dx,y:input.dy},input.seq,input.at);
 for(let tick=0;tick<20;tick++){
  const intent=targets.filter(i=>i.at<=tick*1000/30+1e-7).at(-1)!;
  stepMatch(m,new Map([['a',{matchId:m.matchId,lifeId:1,...intent}]]));
  expect(p.position('a',m.tick*1000/30)!.x).toBeCloseTo(a.position.x,8);
  expect(p.position('a',m.tick*1000/30)!.y).toBeCloseTo(a.position.y,8);
  if(m.tick===3||m.tick===9){
   const at=m.tick*1000/30+25,before=p.position('a',at)!;p.accept(buildView(m),'a',at);
   expect(p.position('a',at)!.x).toBeCloseTo(before.x,8);expect(p.position('a',at)!.y).toBeCloseTo(before.y,8);
  }
 }
});
it('acknowledged targets cannot override a new life or a reset match',()=>{
 const m=createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),a=m.participants[0];a.position={x:0,y:0};a.direction={x:1,y:0};
 const p=new Presentation();p.accept(buildView(m),'a',0,true);p.input({x:0,y:1},1,0);
 a.lifeId++;a.targetDirection=null;m.tick=3;p.accept(buildView(m),'a',100);
 expect(p.position('a',200)!.y).toBe(0);
 p.input({x:0,y:-1},1,100);p.accept(buildView(m),'a',110,true);
 expect(p.position('a',210)!.y).toBe(0);
});
