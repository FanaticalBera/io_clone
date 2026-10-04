import {describe,it,expect} from 'vitest';
import {captureFixture} from './helpers.js';
import {addTrail,setOwner,assertOwnershipCounts} from '../../src/shared/territory.js';
import {resolveAtTime,applySimultaneousCaptures} from '../../src/shared/engine.js';
import {makeParticipant} from '../../src/shared/state.js';
import {createMode} from '../../src/shared/modes.js';
const ring:[number,number][]=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
function enclosedTrail(){const f=captureFixture(),{m,a,b,id}=f;setOwner(m,id(0,-1),1);setOwner(m,id(3,0),2);a.cellId=id(0,-1);b.cellId=id(2,0);for(const p of [a,b])p.position={...m.map.cells[p.cellId].center};for(const [q,r] of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));addTrail(m,b,id(0,0));addTrail(m,b,id(2,0));return f;}
describe('capturing an exposed enemy trail cuts it',()=>{
 it.each(['classic','hold'] as const)('%s preserves the untouched home supporting an exposed trail when a remote bridge is captured',mode=>{
  for(const reverse of [false,true]){const {m,a,b,id}=captureFixture();m.gameMode=createMode(mode);for(const q of [-3,-2,-1,0,1])setOwner(m,id(q,0),2);setOwner(m,id(0,-1),1);setOwner(m,id(3,0),1);a.cellId=id(0,-1);b.cellId=id(3,0);b.position={...m.map.cells[b.cellId].center};addTrail(m,a,id(0,0));addTrail(m,b,id(2,0));addTrail(m,b,id(3,0));if(reverse)m.participants.reverse();if(mode==='hold')m.modeState.holds=[{participantId:'b',startedAtTick:0,endsAtTick:300}];
   // The claimed bridge contains no enemy trail; the untouched right lobe
   // still supports its first trail cell, regardless of the larger left lobe.
   expect(m.trailMasks[id(0,0)]&2).toBe(0);applySimultaneousCaptures(m,[a]);expect(b.lifeState).toBe('ALIVE');expect(b.trailCells.size).toBe(2);expect(b.territoryCount).toBe(1);expect(a.kills).toBe(0);expect(m.owners[id(1,0)]).toBe(2);expect(m.owners[id(-3,0)]).toBe(0);expect(m.owners[id(0,0)]).toBe(1);if(mode==='hold')expect(m.modeState.holds).toHaveLength(1);assertOwnershipCounts(m);
  }
 });
 it('kills when the connected home cell is captured but the enemy trail itself lies entirely outside the claim',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(0,0),2);setOwner(m,id(4,0),2);a.cellId=id(0,-1);b.cellId=id(2,0);addTrail(m,a,id(0,0));addTrail(m,b,id(1,0));addTrail(m,b,id(2,0));expect(m.trailMasks[id(0,0)]&2).toBe(0);applySimultaneousCaptures(m,[a]);expect(b.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(1);expect(m.events.filter(e=>e.type==='DEATH')).toHaveLength(1);assertOwnershipCounts(m);
 });
 it('keeps an exposed player alive if its trail still attaches to the retained main territory',()=>{
  const {m,a,b,id}=captureFixture();for(const q of [-3,-2,-1,0,1])setOwner(m,id(q,0),2);setOwner(m,id(0,-1),1);a.cellId=id(0,-1);b.cellId=id(-4,0);addTrail(m,a,id(0,0));addTrail(m,b,id(-4,0));applySimultaneousCaptures(m,[a]);expect(b.lifeState).toBe('ALIVE');expect(b.territoryCount).toBe(3);expect(b.trailCells.size).toBe(1);expect(a.kills).toBe(0);assertOwnershipCounts(m);
 });
 it.each(['classic','hold'] as const)('%s kills and credits an enclosed trail even while the enemy body and territory are outside',mode=>{
  for(const reverse of [false,true]){const {m,a,b,id}=enclosedTrail();m.gameMode=createMode(mode);if(reverse)m.participants.reverse();resolveAtTime(m);
   expect(b).toMatchObject({lifeState:'DEAD_WAIT',deathReason:'TRAIL_CUT',deaths:1,territoryCount:0,respawnAtTick:90});expect(a.kills).toBe(1);expect(m.owners[id(0,0)]).toBe(1);expect(b.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&2)===0)).toBe(true);
   expect(m.events.filter(e=>e.type==='DEATH')).toEqual([expect.objectContaining({participantId:'b',killerId:'a',lifeId:1,position:b.position,reason:'TRAIL_CUT'})]);resolveAtTime(m);expect(a.kills).toBe(1);expect(b.deaths).toBe(1);assertOwnershipCounts(m);
  }
 });
 it('a captured boundary trail cell is also a cut, without enclosing the body',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(3,0),2);a.cellId=id(0,-1);b.cellId=id(2,0);addTrail(m,a,id(0,0));addTrail(m,b,id(0,0));addTrail(m,b,id(2,0));applySimultaneousCaptures(m,[a]);expect(b.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(1);assertOwnershipCounts(m);
 });
 it('does not cut a trail outside the actual captured region',()=>{
  const {m,a,b,id}=captureFixture();setOwner(m,id(0,-1),1);setOwner(m,id(3,0),2);a.cellId=id(0,-1);b.cellId=id(2,0);for(const [q,r] of ring)if(q!==0||r!==-1)addTrail(m,a,id(q,r));addTrail(m,b,id(2,0));resolveAtTime(m);expect(b.lifeState).toBe('ALIVE');expect(a.kills).toBe(0);expect(m.owners[id(0,0)]).toBe(1);
 });
 it('uses seeded capture priority and cuts all vulnerable participants sharing a captured cell',()=>{
  for(const reverse of [false,true]){const {m,a,b,id}=enclosedTrail(),c=makeParticipant({participantId:'c',slot:2,nickname:'C',kind:'HUMAN'});c.lifeState='ALIVE';c.lifeId=1;c.cellId=id(-3,0);m.participants.push(c);m.priority=[0,2,1];setOwner(m,id(-4,0),3);addTrail(m,c,id(0,0));if(reverse)m.participants.reverse();applySimultaneousCaptures(m,[a]);expect(b.lifeState).toBe('DEAD_WAIT');expect(c.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(2);assertOwnershipCounts(m);}
 });
 it('retains the simultaneous capture winner even if a lower priority claimant listed first',()=>{
  const {m,a,b,id}=captureFixture(),c=makeParticipant({participantId:'c',slot:2,nickname:'C',kind:'HUMAN'});c.lifeState='ALIVE';c.lifeId=1;c.cellId=id(3,0);m.participants.push(c);m.priority=[0,1,2];setOwner(m,id(0,-1),1);setOwner(m,id(0,1),2);setOwner(m,id(4,0),3);a.cellId=id(0,-1);b.cellId=id(0,1);addTrail(m,a,id(0,0));addTrail(m,b,id(0,0));addTrail(m,c,id(0,0));applySimultaneousCaptures(m,[b,a]);expect(a.lifeState).toBe('ALIVE');expect(b.lifeState).toBe('DEAD_WAIT');expect(c.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(2);expect(m.owners[id(0,0)]).toBe(1);assertOwnershipCounts(m);
 });
 it('credits a simultaneous capturer killed in the same batch and cancels its Hold state',()=>{
  const {m,a,b,id}=captureFixture(),c=makeParticipant({participantId:'c',slot:2,nickname:'C',kind:'HUMAN'});c.lifeState='ALIVE';c.lifeId=1;c.cellId=id(4,0);m.participants.push(c);m.priority=[0,1,2];setOwner(m,id(0,-1),1);setOwner(m,id(2,-1),2);setOwner(m,id(4,0),3);a.cellId=id(0,-1);b.cellId=id(2,-1);addTrail(m,a,id(0,0));addTrail(m,b,id(0,0));addTrail(m,b,id(2,0));addTrail(m,c,id(2,0));m.gameMode=createMode('hold');m.modeState.holds=[{participantId:'b',startedAtTick:0,endsAtTick:0}];
  applySimultaneousCaptures(m,[b,a]);expect(b.lifeState).toBe('DEAD_WAIT');expect(c.lifeState).toBe('DEAD_WAIT');expect(a.kills).toBe(1);expect(b.kills).toBe(1);expect(m.modeState.holds).toEqual([]);expect(m.owners[id(2,0)]).toBe(0);resolveAtTime(m);expect(m.phase).toBe('RUNNING');expect(m.events.filter(e=>e.type==='DEATH')).toHaveLength(2);assertOwnershipCounts(m);
 });
});
