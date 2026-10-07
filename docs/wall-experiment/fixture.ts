import {createState} from '../../src/shared/state.js';
import {createMap,region,axialToWorld} from '../../src/shared/hex.js';
import {setOwner} from '../../src/shared/territory.js';
import {setWallGrace} from '../../src/shared/wall-grace.js';
import {startRun} from '../../src/shared/run.js';
import type {MatchState} from '../../src/shared/model.js';
export function wallFixture(enabled:boolean,scenario='reverse',match?:MatchState):MatchState {
 const m=match??createState({mapRadius:5,maxSlots:16,spawnRadius:1},4,[{participantId:'human',slot:0,nickname:'벽 테스트',kind:'HUMAN'}],createMap(5),'wall-fixture');
 const p=m.participants[0],r=m.map.radius,anchor=m.map.byKey.get((r-1)+',0')!,edge=m.map.byKey.get(r+',0')!;
 for(let i=0;i<m.owners.length;i++)if(m.owners[i]===1)setOwner(m,i,0);p.trailCells.clear();p.trailOriginCellId=null;
 for(const id of region(m.map,anchor,1))setOwner(m,id,1);
 p.cellId=edge;p.position=axialToWorld(r,0,m.map.side);p.position.x+=Math.sqrt(3)*m.map.side/2-1;
 if(scenario==='corner')p.position.y=-m.map.side*.4;
 p.direction={x:1,y:0};p.targetDirection=scenario==='push'||scenario==='late'?null:{x:-1,y:0};p.lifeState='ALIVE';p.lifeId=1;p.protectedUntilTick=0;
 startRun(m,p);setWallGrace(m,enabled);return m;
}
