import {BotReclaimDiagnostics} from '../src/shared/bot-reclaim-diagnostics.js';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions} from '../src/shared/bot.js';
import {createBotIdentity} from '../src/shared/bot-identity.js';
import {updateBotEmotion} from '../src/shared/bot-emotion.js';
import {neutralizeTerritory,setOwner} from '../src/shared/territory.js';
import {normalizeDirection} from '../src/shared/movement.js';
import {moveSpeed} from '../src/shared/config.js';
import type {MatchState,Participant,DirectionInput} from '../src/shared/model.js';
function input(m:MatchState,p:Participant,path:number[],seq:number):DirectionInput {
 const reach=moveSpeed(m.config)/m.config.turnRadiansPerSecond+moveSpeed(m.config)/m.config.simulationHz;
 while(path.length>1&&p.cellId===path[0]&&Math.hypot(m.map.cells[path[0]].center.x-p.position.x,m.map.cells[path[0]].center.y-p.position.y)<reach)path.shift();
 const center=m.map.cells[path[0]].center,d=normalizeDirection(center.x-p.position.x,center.y-p.position.y)??p.direction;
 return {matchId:m.matchId,lifeId:p.lifeId,seq,dx:d.x,dy:d.y};
}
export function runRepeatedTheft(seed=19,diagnostics=false,far=false){
 const m=createMatch({mapRadius:22},19,botSpecs(2)),[a,b]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants)neutralizeTerritory(m,p);
 for(const c of m.map.cells)if(c.q>=(far?-18:-8)&&c.q<=0&&c.r>=-5&&c.r<=5)setOwner(m,c.id,1);else if(c.q>=1&&c.q<=17&&c.r>=-5&&c.r<=5)setOwner(m,c.id,2);
 a.cellId=id(far?-16:-4,0);a.position={...m.map.cells[a.cellId].center};a.direction={x:1,y:0};a.personality='DEFEND';
 b.cellId=id(1,-3);b.position={...m.map.cells[b.cellId].center};b.direction={x:-1,y:0};
 const memory=createBotMemory(seed,'combined',createBotIdentity(seed,'DEFEND',{secondaryTrait:'Territorial'}));
 const offset=far?-12:0,apatrol=[id(-2+offset,0),id(-2+offset,-2),id(-4+offset,-2),id(-4+offset,0)],broute=[[0,-3],[-1,-3],[-1,-2],[0,-2],[1,-2],[2,-2],[2,0],[1,1],[0,1],[-1,1],[-1,2],[0,2],[1,2],[3,2],[8,2],[13,2]].map(([q,r])=>id(q,r));
 let ap=[...apatrol],bp=[...broute],bpatrol=[id(13,2),id(13,4),id(15,4),id(15,2)],released=false,stolen=0,reclaimed=0;const captures:any[]=[],plans:any[]=[];
 const tracker=diagnostics?new BotReclaimDiagnostics(m,new Map([[a.participantId,memory]])):null;
 watchBotDecisions(memory,t=>{tracker?.decision(a.participantId,t);if(t.expansionPlan)plans.push({tick:m.tick,cell:a.cellId,...t.expansionPlan});},{shadow:false});
 for(let t=0;t<900;t++){
  const obs=observeBot(m,a.participantId);updateBotEmotion(obs,memory.emotion,memory.identity);
  if(bp.length===1&&b.cellId===bp[0]){if(!released){memory.seq=t;memory.plannedLifeId=a.lifeId;}released=true;bp=[...bpatrol];}
  if(ap.length===1&&a.cellId===ap[0])ap=[...apatrol];
  const before=m.eventCounter,owners=m.owners.slice(),regions=new Set(memory.emotion.damage.regions.keys());
  const ai=released?getBotInput(obs,memory):input(m,a,ap,t+1),bi=input(m,b,bp,t+1);
  stepMatch(m,new Map([[a.participantId,ai!],[b.participantId,bi]]));tracker?.afterTick();
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before&&e.type==='CAPTURE'){const cells=owners.reduce((sum,o,i)=>sum+Number(o===1&&m.owners[i]===2),0);captures.push({tick:m.tick,slot:m.participants.find(p=>p.participantId===e.participantId)?.slot,amount:e.amount,cells});stolen+=cells;}
  for(const c of regions)if(owners[c]!==1&&m.owners[c]===1)reclaimed++;
  if(a.lifeState!=='ALIVE'||b.lifeState!=='ALIVE')break;
 }
 const diagnosticPlans=tracker?.snapshot(a.participantId).recent??[];tracker?.dispose();
 return {diagnosticPlans,match:m,victim:a,thief:b,memory,stolen,reclaimed,captures,plans};
}
