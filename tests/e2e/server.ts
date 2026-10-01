import {setOwner,neutralizeTerritory} from '../../src/shared/territory.js';
import {leaveParticipant} from '../../src/shared/life.js';
import {region} from '../../src/shared/hex.js';
import type {MatchState} from '../../src/shared/model.js';
export function initializeVerticalMatch(match:MatchState):void { const humans=match.participants.filter(p=>p.kind==='HUMAN');if(humans.length!==2)return;
 for(const p of match.participants)if(p.kind==='BOT')leaveParticipant(match,p);
 const [a,b]=humans;for(const p of humans){neutralizeTerritory(match,p);p.protectedUntilTick=0;p.spawnCells.clear();}
 const aBase=match.map.byKey.get('-16,0')!;for(const id of region(match.map,aBase,2))setOwner(match,id,a.slot+1);
 a.cellId=match.map.byKey.get('0,0')!;setOwner(match,a.cellId,a.slot+1);a.position={...match.map.cells[a.cellId].center};a.direction={x:1,y:0};
 b.cellId=match.map.byKey.get('7,2')!;for(const id of region(match.map,b.cellId,2))setOwner(match,id,b.slot+1);
 b.position={...match.map.cells[b.cellId].center};b.direction={x:1,y:0};
}
