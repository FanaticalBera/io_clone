import {it,expect} from 'vitest';
import {serverFixture,until} from './helpers.js';
import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {stepMatch} from '../../src/shared/game.js';
import {worldCell} from '../../src/shared/hex.js';
import {movementCell,wallMargin} from '../../src/shared/wall-margin.js';
import {setOwner,assertOwnershipCounts} from '../../src/shared/territory.js';
import {unpackSnapshot} from '../../src/shared/protocol.js';
import {Presentation} from '../../src/client/presentation.js';

it('shares default padding over real transport/reconnect and rejects old strict-rule clients',async()=>{
 let now=0;const f=await serverFixture({autoStart:false,now:()=>now,config:{mapRadius:5,maxSlots:2,spawnRadius:1}});
 try{
  await expect(f.client({protocolVersion:5})).rejects.toMatchObject({data:{code:'PROTOCOL_MISMATCH'}});
  const a=await f.client();await a.request('room:create',{nickname:'A'});await a.request('room:start');now=3000;f.loop.pump();
  const room=f.rooms.rooms.values().next().value!,m=room.match!,p=m.participants.find(p=>p.kind==='HUMAN')!;
  expect(wallMargin(m.map)).toBeCloseTo(Math.sqrt(3)*m.map.side*.25,12);
  for(let id=0;id<m.owners.length;id++)if(m.owners[id]===p.slot+1)setOwner(m,id,0);
  p.cellId=m.map.byKey.get('5,0')!;setOwner(m,p.cellId,p.slot+1);p.position={...m.map.cells[p.cellId].center};p.position.x+=Math.sqrt(3)*m.map.side/2-.15;p.direction={x:1,y:0};p.targetDirection={x:1,y:0};
  stepMatch(m);expect(p.lifeState).toBe('ALIVE');expect(worldCell(m.map,p.position)).toBe(-1);expect(movementCell(m.map,p.position)).toBe(p.cellId);assertOwnershipCounts(m);
  f.loop.publishSnapshot(room,false,true);await until(()=>a.snapshots.some(s=>s.tick===m.tick));
  a.socket.io.engine.close();await until(()=>room.members.get(p.participantId)!.graceUntil!==null);
  const restored=await f.client({protocolVersion:PROTOCOL_VERSION,sessionToken:a.ready.sessionToken});await until(()=>restored.snapshots.length>0);
  const view=unpackSnapshot(restored.snapshots.at(-1)!);expect(view.participants.find(x=>x.participantId===p.participantId)!.position).toEqual(p.position);
  const presentation=new Presentation();presentation.accept(view,p.participantId,0,true);const predicted=presentation.position(p.participantId,1000/m.config.simulationHz)!;
  stepMatch(m);expect(p.deathReason).toBe('WALL_HIT');expect(predicted.x).toBeCloseTo(p.position.x,7);assertOwnershipCounts(m);
 }finally{await f.close();}
});
