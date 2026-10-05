import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {MovementCaptureFixture} from '../tests/movement-capture-fixture.js';
const direct=process.argv.includes('--direct'),index=process.argv.indexOf('--output'),output=index<0?`.local/evidence/${direct?'direct':'pruned'}-home-head.json`:process.argv[index+1],runs=[];
for(const mode of ['classic'] as const)for(const reverse of [false,true]){
 const f=new MovementCaptureFixture(reverse,mode);f.runPrunedHomeHead(direct);const {match:m,victim:v,capturer:c}=f;
 const resolution=f.traces.find(t=>t.participants.some(p=>p.participantId===v.participantId&&p.lostTerritory))!,record=resolution.participants.find(p=>p.participantId===v.participantId)!;
 runs.push({mode,reverse,normalSpawnAndMovement:true,captureTick:f.captureTick,directContacts:f.directContacts,record,headCell:v.cellId,headOwner:m.owners[v.cellId],headHomeNeighbors:m.map.cells[v.cellId].neighbors.filter(id=>id>=0&&m.owners[id]===v.slot+1),victim:{lifeState:v.lifeState,deathReason:v.deathReason,deathContext:v.deathContext,territoryCount:v.territoryCount,trail:[...v.trailCells],origin:v.trailOriginCellId},killerKills:c.kills,deathEvents:m.events.filter(e=>e.type==='DEATH'&&e.participantId===v.participantId)});
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({runs},null,2));console.log(JSON.stringify(runs.map(r=>({mode:r.mode,reverse:r.reverse,lifeState:r.victim.lifeState,trail:r.victim.trail,headOwner:r.headOwner,homeNeighbors:r.headHomeNeighbors,kill:r.killerKills})),null,2));
