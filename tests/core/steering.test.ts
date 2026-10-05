import {describe,it,expect} from 'vitest';
import {rotateDirectionTowards} from '../../src/shared/movement.js';
import {stepMatch} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {moveSpeed} from '../../src/shared/config.js';
describe('limited steering shared by authority and prediction',()=>{
 it('normalizes, takes shortest turns, avoids overshoot and handles invalid vectors safely',()=>{
  const turned=rotateDirectionTowards({x:2,y:0},{x:0,y:-3},.2);
  expect(turned.x).toBeCloseTo(Math.cos(.2),14);expect(turned.y).toBeCloseTo(-Math.sin(.2),14);
  expect(rotateDirectionTowards({x:1,y:0},{x:1,y:.01},.2)).toEqual({x:1/Math.hypot(1,.01),y:.01/Math.hypot(1,.01)});
  expect(rotateDirectionTowards({x:1,y:0},{x:0,y:0},.2)).toEqual({x:1,y:0});
  expect(rotateDirectionTowards({x:0,y:0},{x:0,y:-2},.2)).toEqual({x:0,y:-1});
  expect(rotateDirectionTowards({x:NaN,y:0},{x:0,y:0},.2)).toEqual({x:1,y:0});
  expect(rotateDirectionTowards({x:1,y:0},{x:0,y:1},NaN)).toEqual({x:1,y:0});
  const nearPi=3.1,from={x:Math.cos(nearPi),y:Math.sin(nearPi)},to={x:Math.cos(-nearPi),y:Math.sin(-nearPi)};
  expect(rotateDirectionTowards(from,to,.1)).toEqual(to);
 });
 it('reaches 90 degrees at the same elapsed time regardless of step frequency',()=>{
  for(const hz of [30,60,120]){
   let direction={x:1,y:0};for(let i=0;i<hz/5;i++)direction=rotateDirectionTowards(direction,{x:0,y:1},6/hz);
   expect(Math.atan2(direction.y,direction.x)).toBeCloseTo(1.2,10);
   for(let i=0;i<Math.ceil(hz/15);i++)direction=rotateDirectionTowards(direction,{x:0,y:1},6/hz);
   expect(direction).toEqual({x:0,y:1});
  }
 });
 it('accepts a target once, turns over six ticks, keeps speed and continues after release',()=>{
  const m=createMatch({},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),a=m.participants[0];
  a.position={x:0,y:0};a.cellId=m.map.byKey.get('0,0')!;a.direction={x:1,y:0};m.owners.fill(1);m.owners[0]=0;a.territoryCount=m.map.cells.length-1;
  const turn=m.config.turnRadiansPerSecond/m.config.simulationHz,ticks=Math.ceil(Math.PI/2/turn);
  expect(ticks).toBe(6);
  for(let i=0;i<ticks;i++){
   const start={...a.position};stepMatch(m,i===0?new Map([['a',{matchId:m.matchId,lifeId:1,seq:1,dx:0,dy:1}]]):undefined);
   expect(Math.hypot(a.position.x-start.x,a.position.y-start.y)).toBeCloseTo(moveSpeed(m.config)/30,10);
   expect(Math.atan2(a.direction.y,a.direction.x)).toBeCloseTo(Math.min((i+1)*turn,Math.PI/2),10);
  }
  expect(a.targetDirection).toEqual({x:0,y:1});expect(a.lastAppliedInputSeq).toBe(1);
  stepMatch(m);expect(a.direction).toEqual({x:0,y:1});expect(a.position.x).toBeGreaterThan(0);
 });
 it('a 180 degree input rotates consistently instead of reversing instantly',()=>{
  for(const y of [0,-0]){
   let direction={x:1,y:0};for(let i=0;i<16;i++){
    direction=rotateDirectionTowards(direction,{x:-1,y},.2);
    if(i===0){expect(direction.x).toBeGreaterThan(0);expect(direction.y).toBeGreaterThan(0);}
   }
   expect(direction.x).toBe(-1);expect(direction.y).toBe(y);
  }
 });
 it('the default U-turn is about one third narrower without changing travel speed',()=>{
  const run=(turnRadiansPerSecond:number)=>{
   const m=createMatch({turnRadiansPerSecond},1,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'}]),a=m.participants[0];
   a.position={x:0,y:0};a.cellId=m.map.byKey.get('0,0')!;a.direction={x:1,y:0};m.owners.fill(1);m.owners[0]=0;a.territoryCount=m.map.cells.length-1;
   let width=0;const ticks=Math.ceil(Math.PI*m.config.simulationHz/turnRadiansPerSecond);
   for(let i=0;i<ticks;i++){
    const start={...a.position};stepMatch(m,i===0?new Map([['a',{matchId:m.matchId,lifeId:1,seq:1,dx:-1,dy:0}]]):undefined);
    expect(Math.hypot(a.position.x-start.x,a.position.y-start.y)).toBeCloseTo(moveSpeed(m.config)/30,10);width=Math.max(width,a.position.y);
   }
   expect(a.direction).toEqual({x:-1,y:0});return{width,ticks};
  };
  const old=run(6),current=run(9);
  expect(current.ticks).toBe(11);expect(current.width/old.width).toBeGreaterThan(.64);expect(current.width/old.width).toBeLessThan(.7);
  expect(current.width/(Math.sqrt(3)*32)).toBeLessThan(1);
 });
});
