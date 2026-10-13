import type {MatchState,Personality} from '../src/shared/model.js';
// Audit only. One post-resolution sample per simulation tick; dead time and
// spawn grants are actual holdings, with no death/reset correction.
export class BotHoldingTracker {
 private samples=0;private lastTick:number;private totalSum=0;private totalMaximum=0;private totalMaximumTick:number|null=null;
 private rows=new Map<string,{slot:number;personality:Personality|undefined;nickname:string;sum:number;final:number;maximum:number;maximumTick:number|null}>();
 constructor(private match:MatchState){this.lastTick=match.tick;for(const p of match.participants)if(p.kind==='BOT')this.rows.set(p.participantId,{slot:p.slot,personality:p.personality,nickname:p.nickname,sum:0,final:p.territoryCount,maximum:0,maximumTick:null});}
 afterTick(){
  if(this.match.tick!==this.lastTick+1)throw Error('Holding audit requires exactly one sample per consecutive resolved tick');
  let total=0;for(const p of this.match.participants){const r=this.rows.get(p.participantId);if(!r)continue;const cells=p.territoryCount;
   if(!Number.isSafeInteger(cells)||cells<0)throw Error('Invalid actual holdings');r.sum+=cells;r.final=cells;total+=cells;if(r.maximumTick===null||cells>r.maximum){r.maximum=cells;r.maximumTick=this.match.tick;}
  }
  this.samples++;this.lastTick=this.match.tick;this.totalSum+=total;if(this.totalMaximumTick===null||total>this.totalMaximum){this.totalMaximum=total;this.totalMaximumTick=this.match.tick;}
 }
 snapshot(){
  const mapCells=this.match.map.cells.length,participants=[...this.rows].map(([participantId,r])=>({participantId,slot:r.slot,personality:r.personality,nickname:r.nickname,holdingCellTicks:r.sum,timeAverageCells:this.samples?r.sum/this.samples:null,finalCells:r.final,maximumCells:r.maximum,maximumShare:this.samples?r.maximum/mapCells:null,maximumTick:r.maximumTick}));
  return {samples:this.samples,firstSampleTick:this.samples?this.lastTick-this.samples+1:null,lastSampleTick:this.samples?this.lastTick:null,mapCells,sampling:'Every resolved tick boundary; initial t0 excluded. Dead time included. No death loss/spawn grant correction. Whole maximum is one simultaneous ownership total, not the sum of personal peaks.',total:{holdingCellTicks:this.totalSum,timeAverageCells:this.samples?this.totalSum/this.samples:null,finalCells:participants.reduce((n,r)=>n+r.finalCells,0),maximumCells:this.totalMaximum,maximumShare:this.samples?this.totalMaximum/mapCells:null,maximumTick:this.totalMaximumTick,largestBotMaximumShare:this.samples?Math.max(0,...participants.map(r=>r.maximumShare!)):null},participants};
 }
}
