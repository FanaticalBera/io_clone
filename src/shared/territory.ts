import type { MatchState,Participant } from './model.js';
export function participantForOwner(match:MatchState,owner:number):Participant|undefined { return match.participants.find(p=>p.slot+1===owner); }
export function setOwner(match:MatchState,cellId:number,owner:number):void {
 if(!Number.isInteger(cellId)||cellId<0||cellId>=match.owners.length||!Number.isInteger(owner)||owner<0||owner>8||
     (owner>0&&!participantForOwner(match,owner)))throw new Error('Invalid ownership');
 const previous=match.owners[cellId];if(previous===owner)return;
 const old=participantForOwner(match,previous),next=participantForOwner(match,owner);
 if(old)old.territoryCount--;if(next)next.territoryCount++;match.owners[cellId]=owner;
}
export function addTrail(match:MatchState,p:Participant,cellId:number):void {
 if(p.lifeState!=='ALIVE')return;
 if(!match.map.cells[cellId])throw new Error('Invalid trail cell');
 p.trailCells.add(cellId);match.trailMasks[cellId]|=1<<p.slot;
}
export function clearTrail(match:MatchState,p:Participant):void {
 for(const cell of p.trailCells)match.trailMasks[cell]&=~(1<<p.slot);
 p.trailCells.clear();
 p.trailOriginCellId=null;
}
export function visitCell(match:MatchState,p:Participant,cellId:number):'INSIDE'|'TRAIL'|'RETURN' {
 if(p.lifeState!=='ALIVE')return 'INSIDE';
 if(!p.trailCells.size&&p.trailOriginCellId===null&&match.owners[p.cellId]===p.slot+1&&match.owners[cellId]!==p.slot+1)p.trailOriginCellId=p.cellId;
 p.cellId=cellId;
 if(match.owners[cellId]===p.slot+1)return p.trailCells.size?'RETURN':'INSIDE';
 p.protectedUntilTick=0;addTrail(match,p,cellId);return 'TRAIL';
}
export function neutralizeTerritory(match:MatchState,p:Participant):void {
 for(let i=0;i<match.owners.length;i++)if(match.owners[i]===p.slot+1)setOwner(match,i,0);
}
export function pruneDisconnectedTerritory(match:MatchState,p:Participant,homeCellId?:number):void {
 const owner=p.slot+1,visited=new Uint8Array(match.owners.length),components:number[][]=[];
 for(let id=0;id<match.owners.length;id++){
  if(visited[id]||match.owners[id]!==owner)continue;
  const cells=[id];visited[id]=1;
  for(let head=0;head<cells.length;head++)for(const neighbor of match.map.cells[cells[head]].neighbors){
   if(neighbor>=0&&!visited[neighbor]&&match.owners[neighbor]===owner){visited[neighbor]=1;cells.push(neighbor);}
  }
  components.push(cells);
 }
 // Preserve a surviving gameplay home when supplied by capture resolution.
 // Without one, retain the original largest-component / lowest-root tie break.
 let main=homeCellId===undefined?undefined:components.find(cells=>cells.includes(homeCellId));
 if(!main)for(const cells of components)if(!main||cells.length>main.length)main=cells;
 for(const cells of components)if(cells!==main)for(const id of cells)setOwner(match,id,0);
}
export function assertOwnershipCounts(match:MatchState):void {
 for(const p of match.participants) {
  const expected=match.owners.reduce((count,owner)=>count+(owner===p.slot+1?1:0),0);
  if(expected!==p.territoryCount)throw new Error('Ownership count mismatch');
 }
}
