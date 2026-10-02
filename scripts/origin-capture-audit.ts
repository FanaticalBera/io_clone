import {MovementCaptureFixture} from '../tests/movement-capture-fixture.js';
const reports=[];
for(const scenario of ['origin-only','neighbor-only'] as const)for(const reverse of [false,true]){
 const f=new MovementCaptureFixture(reverse);let error:string|undefined;try{f.run(scenario);}catch(e){error=String(e);}
 const m=f.match,coord=(id:number|null)=>id===null?null:[m.map.cells[id].q,m.map.cells[id].r];
 reports.push({scenario,reverse,error,seed:m.seed,captureTick:f.captureTick,directContacts:f.directContacts,contacts:f.contacts.map(c=>({...c,coordinates:c.cells.map(id=>coord(id))})),origin:f.expectedOriginCellId,originCoordinate:coord(f.expectedOriginCellId),originOwner:f.expectedOriginCellId===null?null:m.owners[f.expectedOriginCellId],first:f.firstTrailCellId,firstCoordinate:coord(f.firstTrailCellId),neighbors:f.departureHomeNeighbors.map(id=>({id,coordinate:coord(id),owner:m.owners[id]})),victim:{lifeState:f.victim.lifeState,deathReason:f.victim.deathReason,trailCells:[...f.victim.trailCells],territoryCount:f.victim.territoryCount},capturerKills:f.capturer.kills,traces:f.traces,journal:f.journal});
}
console.log(JSON.stringify(reports,null,2));
