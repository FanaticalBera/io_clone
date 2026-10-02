import {createMatch,stepMatch} from '../src/shared/game.js';
import {normalizeDirection,stepSteering} from '../src/shared/movement.js';
function run(theta:number,neutral=true){
 const m=createMatch({},115,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}]),goal=m.map.byKey.get('-15,-3')!,target=m.map.cells[goal].center,arrivals:(number|null)[]=[null,null],pre:number[][]=[];
 for(let tick=0;tick<90&&m.participants.every(p=>p.lifeState==='ALIVE');tick++){
  const inputs=new Map();for(const p of m.participants){const d=p.slot===1&&tick<6?{x:Math.cos(theta),y:Math.sin(theta)}:normalizeDirection(target.x-p.position.x,target.y-p.position.y)!;
   inputs.set(p.participantId,{matchId:m.matchId,lifeId:p.lifeId,seq:tick+1,dx:d.x,dy:d.y});const move=stepSteering(m.map,p.position,p.cellId,p.direction,d,m.config);
   for(const e of move.entries)if(e.cellId===goal&&arrivals[p.slot]===null){arrivals[p.slot]=tick+e.t;pre[p.slot]=m.participants.map(p=>p.trailCells.size);}
  }stepMatch(m,inputs);
 }
 return {theta,arrivals,diff:arrivals.every(n=>n!==null)?arrivals[1]!-arrivals[0]!:null,pre,deaths:m.events.filter(e=>e.type==='DEATH')};
}
let previous:ReturnType<typeof run>|null=null;const brackets:unknown[]=[];
for(let i=-180;i<=180;i++){const current=run(i*Math.PI/180);if(current.diff!==null&&previous?.diff!==null&&previous?.diff!==undefined&&current.diff*previous.diff<=0){let low=previous.theta,high=current.theta,best=current;
 for(let j=0;j<35;j++){const mid=run((low+high)/2);if(mid.diff===null)break;best=mid;const l=run(low);if(l.diff!*mid.diff<=0)high=mid.theta;else low=mid.theta;}
 brackets.push(best);
 }previous=current;}
console.log(JSON.stringify(brackets,null,2));
