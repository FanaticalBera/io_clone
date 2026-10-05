import {mkdirSync,writeFileSync} from 'node:fs';
import {MovementCaptureFixture} from '../tests/movement-capture-fixture.js';
const runs=[];
for(const mode of ['classic'] as const)for(const exposed of [false,true])for(const reverse of [false,true]){
 const f=new MovementCaptureFixture(reverse,mode);f.runDistantBridgeLoss(exposed);const v=f.victim;
 const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===v.participantId&&p.lostTerritory)!;
 runs.push({mode,exposed,reverse,captureTick:f.captureTick,directContacts:f.directContacts,record,lifeState:v.lifeState,kills:f.capturer.kills,trail:[...v.trailCells],origin:v.trailOriginCellId});
}
mkdirSync('.local/evidence',{recursive:true});writeFileSync('.local/evidence/distant-bridge-after.json',JSON.stringify({runs},null,2));console.log(JSON.stringify(runs.map(({mode,exposed,reverse,lifeState,kills,record})=>({mode,exposed,reverse,lifeState,kills,claimedTrail:record.claimedTrailCells,homeAnchor:record.homeAnchorBeforePrune,headOwnerBeforePrune:record.headOwnerBeforePrune,headOwnerAfter:record.headOwnerAfterTransfer,originOwnerBeforePrune:record.originOwnerBeforePrune,originOwnerAfter:record.originOwnerAfterTransfer})),null,2));
