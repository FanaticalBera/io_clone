import {it,expect} from 'vitest';
import {validateConfig,moveSpeed} from '../../src/shared/config.js';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {setOwner} from '../../src/shared/territory.js';

it.each(['HUMAN','BOT'] as const)('%s moves 5% further per second with the original turn radius and simulation cadence',kind=>{
 const travel=(legacy:boolean)=>{
  const m=createMatch(legacy?{moveCellsPerSecond:4.2,turnRadiansPerSecond:9}:{},71,[{participantId:'p',slot:0,nickname:'P',kind}]);
  const p=m.participants[0],start=m.map.byKey.get('0,0')!;p.cellId=start;p.position={...m.map.cells[start].center};p.direction={x:1,y:0};p.targetDirection=null;
  for(let id=0;id<m.owners.length;id++)setOwner(m,id,1);setOwner(m,0,0);
  for(let tick=0;tick<m.config.simulationHz;tick++)stepMatch(m);
  expect(p.lifeState).toBe('ALIVE');return p.position.x;
 };
 expect(travel(false)/travel(true)).toBeCloseTo(1.05,10);
 const config=validateConfig(),legacy=validateConfig({moveCellsPerSecond:4.2,turnRadiansPerSecond:9});
 expect(moveSpeed(config)/config.turnRadiansPerSecond).toBeCloseTo(moveSpeed(legacy)/legacy.turnRadiansPerSecond,10);
 expect(config.simulationHz).toBe(30);expect(config.snapshotHz).toBe(10);
});
