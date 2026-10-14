import {it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {HEX_DIRECTIONS,axialToWorld} from '../../src/shared/hex.js';
import {setOwner,addTrail} from '../../src/shared/territory.js';

it.each(HEX_DIRECTIONS)('cuts an existing trail on entry through side ($q, $r) at current production speed',direction=>{
 const m=createMatch({},4,[{participantId:'attacker',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'victim',slot:1,nickname:'V',kind:'HUMAN'}]);
 const [a,v]=m.participants,cell=(q:number,r:number)=>m.map.byKey.get(q+','+r)!;
 for(let i=0;i<m.owners.length;i++)setOwner(m,i,0);
 const neighbor=axialToWorld(direction.q,direction.r,m.map.side),length=Math.hypot(neighbor.x,neighbor.y),normal={x:neighbor.x/length,y:neighbor.y/length};
 a.cellId=cell(direction.q,direction.r);a.position={x:normal.x*(length/2+1),y:normal.y*(length/2+1)};
 a.direction={x:-normal.x,y:-normal.y};a.protectedUntilTick=0;setOwner(m,a.cellId,1);
 v.cellId=cell(4,4);v.position={...m.map.cells[v.cellId].center};v.direction={x:1,y:0};v.protectedUntilTick=0;
 setOwner(m,cell(4,3),2);v.trailOriginCellId=cell(4,3);addTrail(m,v,cell(0,0));
 const before={...a.position};stepMatch(m);
 expect(m.config.moveCellsPerSecond).toBe(4.41);expect(a.cellId).toBe(cell(0,0));
 expect(v.lifeState).toBe('ELIMINATED');expect(v.deathContext).toMatchObject({cause:'EXISTING_TRAIL_CONTACT',cellId:cell(0,0)});
 expect(a.kills).toBe(1);
 // The centre is still near the entered edge, well before crossing the middle of the trail tile.
 expect(Math.hypot(a.position.x,a.position.y)).toBeGreaterThan(m.map.side/2);
 expect(Math.hypot(a.position.x-before.x,a.position.y-before.y)).toBeLessThan(length/2);
});
