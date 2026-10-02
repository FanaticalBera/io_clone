import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {watchDeaths,type DeathTrace} from '../src/shared/life.js';
import {watchCaptureResolution,type CaptureResolutionTrace} from '../src/shared/engine.js';
import {axialToWorld} from '../src/shared/hex.js';
import {normalizeDirection} from '../src/shared/movement.js';
import type {DirectionInput,Vec} from '../src/shared/model.js';

function distanceToSegment(p:Vec,a:Vec,b:Vec):number {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
}
// All positions, territories and trails here emerge from normal spawns,
// ordinary input and stepMatch. No setOwner/addTrail or direct state setup.
export function auditDeaths(seed:number,mixed=false,ticks=3600){
 const specs=mixed?[{participantId:'human-0',slot:0,nickname:'H0',kind:'HUMAN' as const},{participantId:'human-1',slot:1,nickname:'H1',kind:'HUMAN' as const},...botSpecs(6,2)]:botSpecs(8);
 const m=createMatch({},seed,specs),memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(seed+p.slot)]));
 const deaths:DeathTrace[]=[],captures:CaptureResolutionTrace[]=[],failures:string[]=[],seen=new Set<string>(),frozen=new Map<string,{lifeId:number;position:Vec}>();
 const origins=new Map(m.participants.map(p=>[p.participantId,{...m.map.cells[p.cellId]}])),lifeIds=new Map(m.participants.map(p=>[p.participantId,p.lifeId])),legs=new Map<string,number>();
 watchDeaths(m,trace=>deaths.push(trace));watchCaptureResolution(m,trace=>captures.push(trace));
 const check=(ok:boolean,message:string)=>{if(!ok)failures.push(`tick ${m.tick}: ${message}`);};
 for(let tick=0;tick<ticks&&m.phase==='RUNNING';tick++){
  const before=deaths.length,eventCounter=m.eventCounter,inputs=new Map<string,DirectionInput>();
  for(const p of m.participants){
   if(p.kind==='BOT'){const input=getBotInput(observeBot(m,p.participantId),memories.get(p.participantId)!);if(input)inputs.set(p.participantId,input);}
   else if(p.lifeState==='ALIVE'){
    if(lifeIds.get(p.participantId)!==p.lifeId){lifeIds.set(p.participantId,p.lifeId);origins.set(p.participantId,{...m.map.cells[p.cellId]});legs.set(p.participantId,0);}
    const origin=origins.get(p.participantId)!,routes=[[[0,3],[-3,5],[-5,3],[-3,0],[0,0]],[[3,0],[5,-3],[3,-5],[0,-3],[0,0]]],route=routes[p.slot%2];
    let index=legs.get(p.participantId)??0;
    let target=axialToWorld(origin.q+route[index][0],origin.r+route[index][1],m.map.side);
    if(Math.hypot(target.x-p.position.x,target.y-p.position.y)<18){index=(index+1)%route.length;legs.set(p.participantId,index);target=axialToWorld(origin.q+route[index][0],origin.r+route[index][1],m.map.side);}
    const d=normalizeDirection(target.x-p.position.x,target.y-p.position.y)!;inputs.set(p.participantId,{matchId:m.matchId,lifeId:p.lifeId,seq:tick+1,dx:d.x,dy:d.y});
   }
  }
  stepMatch(m,inputs);
  for(const trace of deaths.slice(before)){
   const key=trace.victimId+':'+trace.lifeId,p=m.participants.find(p=>p.participantId===trace.victimId)!;
   check(!seen.has(key),'duplicate death '+key);seen.add(key);
   check(trace.territoryCount===trace.ownerCells,'ownership count '+key);
   check(JSON.stringify([...trace.trailCells].sort((a,b)=>a-b))===JSON.stringify([...trace.trailMaskCells].sort((a,b)=>a-b)),'trail mask mismatch '+key);
   if(trace.reason==='TRAIL_CUT'){
    check(!!trace.context&&!!trace.killerId&&trace.killerId!==trace.victimId,'missing cause/killer '+key);
    if(trace.context?.cause==='TRAIL_CONTACT')check(trace.killerCell===trace.context.cellId&&(trace.trailCells.includes(trace.context.cellId)||trace.pendingContact),'contact without trail '+key);
    if(trace.context?.cause==='HOME_CAPTURE')check(trace.trailCells[0]===trace.context.cellId&&trace.rootHomeNeighbors.length===0,'connected home died '+key);
    if(trace.context?.cause==='TRAIL_CAPTURE')check(captures.some(c=>c.tick===trace.tick&&c.participants.some(v=>v.participantId===p.participantId&&v.trailCells.includes(trace.context!.cellId)&&v.claimedTrailCells.includes(trace.context!.cellId))),'capture without trail '+key);
   }else if(trace.reason==='TERRITORY_LOST')check(trace.ownerCells===0,'territory death with land '+key);
   else if(trace.reason==='WALL_HIT')check(m.map.boundaryEdges.some(e=>distanceToSegment(trace.position,e.a,e.b)<.01),'wall death away from boundary '+key);
   else check(false,'unknown death reason '+trace.reason);
   check(p.lifeState==='DEAD_WAIT'&&p.trailCells.size===0&&p.territoryCount===0&&!m.trailMasks.some(mask=>(mask&(1<<p.slot))!==0),'death cleanup '+key);
   check(m.events.filter(e=>e.type==='DEATH'&&e.participantId===p.participantId&&Number(e.eventId.split(':').at(-1))>eventCounter).length===1,'death event count '+key);
   frozen.set(p.participantId,{lifeId:p.lifeId,position:{...p.position}});
  }
  for(const [id,record]of frozen){const p=m.participants.find(p=>p.participantId===id)!;if(p.lifeId!==record.lifeId){frozen.delete(id);continue;}
   check(p.position.x===record.position.x&&p.position.y===record.position.y&&p.trailCells.size===0,'dead movement '+id);
  }
 }
 const causes:Record<string,number>={};for(const trace of deaths){const cause=trace.context?.cause??trace.reason;causes[cause]=(causes[cause]??0)+1;}
 return {seed,mixed,ticks:m.tick,deaths:deaths.length,causes,failures,traces:deaths};
}
