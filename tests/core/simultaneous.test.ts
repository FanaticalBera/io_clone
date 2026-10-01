import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';
import {resolveAtTime,stepMatch} from '../../src/shared/engine.js';
import {makeParticipant} from '../../src/shared/state.js';
function mutual(reverse=false){
 const {m,a,b,id}=captureFixture();setOwner(m,id(-2,0),1);setOwner(m,id(3,0),2);
 a.cellId=id(1,0);b.cellId=id(0,0);addTrail(m,a,id(0,0));addTrail(m,b,id(1,0));
 if(reverse)m.participants.reverse();resolveAtTime(m);return{m,a,b};
}
describe('T10: simultaneous contact batches',()=>{
 it('allows mutual cuts independently of participant array order',()=>{
  for(const reversed of [false,true]){const {a,b}=mutual(reversed);expect(a.lifeState).toBe('DEAD_WAIT');expect(b.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(1);expect(b.kills).toBe(1);}
 });
 it('includes simultaneous provisional trails in the contact set',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(-2,0),1);setOwner(m,id(3,0),2);
  a.cellId=b.cellId=id(1,0);resolveAtTime(m);
  expect(a.lifeState).toBe('DEAD_WAIT');expect(b.lifeState).toBe('DEAD_WAIT');expect(m.trailMasks.every(v=>v===0)).toBe(true);
 });
 it('cuts first when a return and contact have the same microsecond',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,0),1);setOwner(m,id(3,0),2);
  a.cellId=id(1,0);a.position={x:Math.sqrt(3)*16+2,y:0};a.direction={x:-1,y:0};
  b.cellId=id(3,0);b.position={x:Math.sqrt(3)*32*2.5+2,y:0};b.direction={x:-1,y:0};
  addTrail(m,a,id(1,0));addTrail(m,a,id(2,0));stepMatch(m);
  expect(a.lifeState).toBe('DEAD_WAIT');expect(b.kills).toBe(1);expect(m.owners[id(1,0)]).toBe(0);
 });
 it('credits exactly one attacker per victim, including attackers killed in the batch',()=>{
  const {m,a,b,id}=captureFixture();const c=makeParticipant({participantId:'c',slot:2,nickname:'C',kind:'HUMAN'});
  c.lifeState='ALIVE';c.lifeId=1;m.participants.push(c);m.priority=[2,0,1];
  setOwner(m,id(-2,0),1);setOwner(m,id(3,0),2);setOwner(m,id(-3,1),3);
  a.cellId=id(-1,0);b.cellId=c.cellId=id(1,0);addTrail(m,a,id(1,0));resolveAtTime(m);
  expect(a.deaths+b.deaths+c.deaths).toBe(3);expect(b.kills).toBe(1);expect(c.kills).toBe(2);
 });
});
