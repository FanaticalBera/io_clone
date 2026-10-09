import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {territoryFixture,safePocket95Fixture,independentCenters,type TerritoryLayout} from '../tests/safe-bot-respawn-fixture.js';
import {inspectSpawnSpace,trySpawn} from '../src/shared/spawn.js';
import {setSafeBotRespawn,ownedDistances,coreDistance,cellDistances} from '../src/shared/safe-bot-respawn.js';
import {region} from '../src/shared/hex.js';
const rows=[];
for(const layout of ['clustered','distributed'] as TerritoryLayout[])for(const percent of [20,40,60,80,95]){
 const {m,p,ownedCount}=territoryFixture(percent,layout),before=m.owners.slice();
 setSafeBotRespawn(m,false);const baseline=inspectSpawnSpace(m,p);setSafeBotRespawn(m,true);
 const space=inspectSpawnSpace(m,p),expected=independentCenters(m);assert.equal(space.validCenterCount,expected.length);
 const owned=ownedDistances(m),heads=cellDistances(m,m.participants.filter(q=>q!==p&&q.lifeState==='ALIVE').map(q=>q.cellId));
 const success=trySpawn(m,p);assert.equal(success,expected.length>0);
 const distance=success?coreDistance(p.spawnCells,owned):null,headDistance=success?coreDistance(p.spawnCells,heads):null;
 if(success){assert.equal(p.spawnCells.size,7);assert.ok([...p.spawnCells].every(id=>before[id]===0));assert.ok(distance!==null&&distance>=4);assert.ok(headDistance===null||headDistance>=m.config.spawnBufferHexes);assert.ok(region(m.map,p.cellId,4).every(id=>id>=0&&before[id]===0));}
 else{assert.equal(p.lifeState,'SPAWN_BLOCKED');assert.deepEqual(m.owners,before);}
 rows.push({layout,requestedPercent:percent,ownedCells:ownedCount,actualPercent:100*ownedCount/m.map.cells.length,baselineValidCenters:baseline.validCenterCount,validCenters:space.validCenterCount,edgeRejected:space.edgeRejectedCount,success,state:p.lifeState,spawnCenter:success?p.cellId:null,coreOwnedDistance:distance,coreHeadDistance:headDistance,coreTrailDistance:null,grantedCells:success?p.spawnCells.size:0});
}
const pocket=safePocket95Fixture(),pocketSpace=inspectSpawnSpace(pocket.m,pocket.p),pocketOwned=ownedDistances(pocket.m);
assert.equal(pocket.m.owners.reduce((sum,owner)=>sum+Number(owner!==0),0),pocket.ownedCount);
assert.equal(pocketSpace.validCenterCount,independentCenters(pocket.m).length);assert.ok(pocketSpace.validCenterCount>0);
assert.equal(trySpawn(pocket.m,pocket.p),true);assert.equal(pocket.p.spawnCells.size,7);
const pocketDistance=coreDistance(pocket.p.spawnCells,pocketOwned);assert.ok(pocketDistance!==null&&pocketDistance>=4);
const safePocket95={ownedCells:pocket.ownedCount,actualPercent:100*pocket.ownedCount/pocket.m.map.cells.length,validCenters:pocketSpace.validCenterCount,state:pocket.p.lifeState,grantedCells:pocket.p.spawnCells.size,coreOwnedDistance:pocketDistance};
const result={kind:'ARTIFICIAL_GEOMETRY_FIXTURES_NOT_GAMEPLAY',base:'master 795faf9',mapRadius:56,cells:9577,participantSlots:14,coreCells:7,minOwnedDistance:4,fullPlayableClearanceRadius:4,layouts:{clustered:'owned cells nearest (0,0), cell ID tie-break',distributed:'owned cells nearest seven island centers (0,0),(±24,0),(0,±24),(24,-24),(-24,24), cell ID tie-break'},population:'Two alive owner heads, other BOTs excluded from retry; one dead BOT target; no trails. Head/trail/reserved safety covered separately by regressions.',rows,safePocket95};
mkdirSync('evidence',{recursive:true});writeFileSync('evidence/safe-bot-respawn-fixtures.json',JSON.stringify(result,null,2)+'\n');
console.table(rows.map(({layout,requestedPercent,baselineValidCenters,validCenters,state,coreOwnedDistance})=>({layout,percent:requestedPercent,baseline:baselineValidCenters,valid:validCenters,state,distance:coreOwnedDistance})));

console.log({safePocket95});
