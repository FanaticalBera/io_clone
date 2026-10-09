import {createMatch} from '../src/shared/game.js';
import {botSpecs} from '../src/shared/bot.js';
import {setOwner} from '../src/shared/territory.js';
import {markDead} from '../src/shared/life.js';
import {hexDistance,region} from '../src/shared/hex.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
export type TerritoryLayout='clustered'|'distributed';
const islands=[{q:0,r:0},{q:24,r:0},{q:-24,r:0},{q:0,r:24},{q:0,r:-24},{q:24,r:-24},{q:-24,r:24}];
// Geometry fixtures, not AI gameplay: two owned populations, no exposed trails.
// Dead respawn target remains slot 13; other BOTs do not participate in retries.
export function territoryFixture(percent:number,layout:TerritoryLayout){
 const m=createMatch({},41,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},...botSpecs(13,1)],'fixture-'+layout+'-'+percent);
 const p=m.participants[13],human=m.participants[0],other=m.participants[1];markDead(m,p,'TRAIL_CUT');
 for(const participant of m.participants)if(participant!==p&&participant!==human&&participant!==other)participant.lifeState='FINISHED';
 for(const c of m.map.cells)setOwner(m,c.id,0);
 const distance=(id:number)=>layout==='clustered'?hexDistance(m.map.cells[id],{q:0,r:0}):Math.min(...islands.map(point=>hexDistance(m.map.cells[id],point)));
 const cells=[...m.map.cells].sort((a,b)=>distance(a.id)-distance(b.id)||a.id-b.id),ownedCount=Math.round(m.map.cells.length*percent/100);
 for(const [i,c]of cells.slice(0,ownedCount).entries())setOwner(m,c.id,i%2+1);
 for(const participant of [human,other]){const c=m.map.cells.find(c=>m.owners[c.id]===participant.slot+1)!;participant.cellId=c.id;participant.position={...c.center};}
 m.tick=90;setSafeBotRespawn(m,true);return {m,p,human,other,ownedCount};
}
export function independentCenters(m:ReturnType<typeof territoryFixture>['m']):number[]{
 const points=new Set(m.map.controlPoints.map(p=>p.cellId));
 return m.spawnOrder.filter(center=>region(m.map,center,4).every(id=>id>=0&&m.owners[id]===0)&&region(m.map,center,1).every(id=>!points.has(id)));
}

// Keep total ownership at 95%, but leave one complete playable neutral pocket.
export function safePocket95Fixture(){
 const fixture=territoryFixture(95,'clustered'),{m,p,human}=fixture,center=m.map.byKey.get('0,0')!;
 const hole=new Set(region(m.map,center,4));for(const id of hole)setOwner(m,id,0);
 const target=fixture.ownedCount;let current=m.owners.reduce((s,o)=>s+Number(o!==0),0);
 for(const c of m.map.cells)if(current<target&&m.owners[c.id]===0&&!hole.has(c.id)){setOwner(m,c.id,human.slot+1);current++;}
 for(const other of m.participants)if(other!==p&&other.lifeState==='ALIVE'){const c=m.map.cells.find(c=>m.owners[c.id]===other.slot+1)!;other.cellId=c.id;other.position={...c.center};}
 return {...fixture,center};
}
