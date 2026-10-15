import {it,expect} from 'vitest';
import {createMatch,stepMatch,buildView} from '../../src/shared/game.js';
import {MAP_PRESETS} from '../../src/shared/map-presets.js';
import {homeReturnMargin} from '../../src/shared/home-return-margin.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';

it.each(MAP_PRESETS.map(p=>[p.id,p.config] as const))('%s keeps the accepted early return at a real map edge and round-trips its shape',(_id,config)=>{
 const m=createMatch(config,4,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'}]),p=m.participants[0];
 const home=m.map.cells.find(c=>m.map.inset[c.id]===0&&c.neighbors.some(id=>id>=0))!,trail=home.neighbors.find(id=>id>=0)!;
 const from=home.center,to=m.map.cells[trail].center,l=Math.hypot(to.x-from.x,to.y-from.y),n={x:(to.x-from.x)/l,y:(to.y-from.y)/l},half=Math.sqrt(3)*m.map.side/2;
 for(let id=0;id<m.owners.length;id++)setOwner(m,id,0);
 setOwner(m,home.id,1);p.trailCells.clear();m.trailMasks.fill(0);p.cellId=trail;
 p.position={x:from.x+n.x*(half+14.5),y:from.y+n.y*(half+14.5)};p.direction={x:-n.x,y:-n.y};p.targetDirection=null;p.protectedUntilTick=0;p.trailOriginCellId=home.id;addTrail(m,p,trail);
 expect(homeReturnMargin(m)).toBe(10);stepMatch(m);
 expect(p.lifeState).toBe('ALIVE');expect(p.cellId).toBe(trail);expect(p.trailCells.size).toBe(0);expect(m.owners[trail]).toBe(1);
 expect(Math.hypot(p.position.x-from.x,p.position.y-from.y)).toBeGreaterThan(half);
 expect(m.events.filter(e=>e.type==='CAPTURE'&&e.participantId===p.participantId)).toHaveLength(1);assertOwnershipCounts(m);
 const view=unpackSnapshot(packSnapshot(buildView(m),1,0,p.participantId));expect(view.mapId).toBe(m.map.mapId);expect(view.config.mapShape).toBe(config.mapShape);expect(view.owners[trail]).toBe(1);
});
