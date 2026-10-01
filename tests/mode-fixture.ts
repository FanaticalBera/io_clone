import type {MatchState} from '../src/shared/model.js';
import {markDead} from '../src/shared/life.js';
import {setOwner,clearTrail} from '../src/shared/territory.js';
// Controlled ownership setup; victory still goes through the real engine on its next step.
export function completeClassic(match:MatchState):void{
 const winner=match.participants.find(p=>p.lifeState==='ALIVE')!;
 if(!winner)throw new Error('No alive winner');
 for(const p of match.participants)if(p!==winner)markDead(match,p,'TERRITORY_LOST');
 clearTrail(match,winner);for(const c of match.map.cells)setOwner(match,c.id,winner.slot+1);
 winner.cellId=match.map.byKey.get('0,0')!;winner.position={...match.map.cells[winner.cellId].center};
}
