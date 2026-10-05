import {describe,it,expect} from 'vitest';
import {createMatch,buildView} from '../../src/shared/game.js';
import {packSnapshot,unpackSnapshot,decodeBytes,validDirection,SnapshotGate} from '../../src/shared/protocol.js';
import {botSpecs} from '../../src/shared/bot.js';
describe('T20: strict complete snapshot and input contract',()=>{
 const view=()=>buildView(createMatch({},13,botSpecs(8)));
 it('round trips all 1519 board bytes and contains no private state',()=>{
  const v=view(),wire=packSnapshot(v,1,100,'bot-0'),decoded=unpackSnapshot(wire);
  expect(decoded.owners).toEqual(v.owners);expect(decoded.trailMasks).toEqual(v.trailMasks);
  expect(wire.owners.length+wire.trailMasks.length).toBe(4*Math.ceil(1519/3)+4*Math.ceil(3038/3));
  expect(JSON.stringify(wire)).not.toMatch(/sessionToken|trailCells|spawnCells|botMemory|socket/);
  expect(JSON.stringify(wire).length).toBeLessThan(14000);
 });
 it('rejects invalid encoding, protocol, lengths, ownership and nonfinite positions',()=>{
  const raw=packSnapshot(view(),1,100,null);
  expect(()=>unpackSnapshot({...raw,protocolVersion:1})).toThrow();expect(()=>unpackSnapshot({...raw,owners:'!'})).toThrow();
  expect(()=>decodeBytes('AB==',1)).toThrow();
  expect(()=>unpackSnapshot({...raw,participants:[{...raw.participants[0],position:{x:Infinity,y:0}}]})).toThrow();
  for(const targetDirection of [undefined,{x:NaN,y:0},{x:0,y:0},{x:2,y:0}])
   expect(()=>unpackSnapshot({...raw,participants:[{...raw.participants[0],targetDirection}]})).toThrow();
  expect(()=>unpackSnapshot({...raw,config:{...raw.config,turnRadiansPerSecond:0}})).toThrow();
 });
 it('drops old match/sequence and duplicate presentation events',()=>{
  const v=view();v.events=[{eventId:'e',tick:0,type:'CAPTURE',participantId:'bot-0',amount:3}];const gate=new SnapshotGate();
  expect(gate.accept(packSnapshot(v,1,0,null),true)!.events).toHaveLength(1);expect(gate.accept(packSnapshot(v,1,0,null))).toBeNull();
  expect(gate.accept(packSnapshot(v,2,0,null))!.events).toHaveLength(0);
  expect(gate.accept({...packSnapshot(v,3,0,null),matchId:'old'})).toBeNull();
 });
 it('accepts only a direction command with safe identity and sequence fields',()=>{
  const input={matchId:'m',lifeId:1,seq:5,dx:1,dy:0};expect(validDirection(input)).toBe(true);
  for(const raw of [{...input,dx:NaN},{...input,dy:Infinity},{...input,seq:0},{...input,seq:1.1},{...input,participantId:'other'},{...input,score:999}])expect(validDirection(raw)).toBe(false);
 });
});
