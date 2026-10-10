import type {MatchState,Participant} from '../src/shared/model.js';
import type {BotMemory,BotDecisionTrace,ExpansionPlan} from '../src/shared/bot.js';
import type {DeathTrace} from '../src/shared/life.js';

// Audit only. No memory writes, policy calls or RNG draws.
export class TerritoryDistances {
 private stamp='';private fields=new Map<number,Uint16Array>();
 constructor(private match:MatchState){}
 invalidate(){this.stamp='';this.fields.clear();}
 minimum(line:readonly number[],slots:readonly number[]):number|null {
  if(!line.length||!slots.length)return null;
  const stamp=this.match.tick+':'+this.match.eventCounter;
  if(stamp!==this.stamp){this.fields.clear();this.stamp=stamp;}
  let result=65535;
  for(const slot of slots){
   let field=this.fields.get(slot);
   if(!field){
    field=new Uint16Array(this.match.owners.length).fill(65535);const queue=new Int32Array(field.length);let tail=0;
    for(let id=0;id<field.length;id++)if(this.match.owners[id]===slot+1){field[id]=0;queue[tail++]=id;}
    for(let head=0;head<tail;head++){const id=queue[head],next=field[id]+1;for(const n of this.match.map.cells[id].neighbors)if(n>=0&&field[n]===65535){field[n]=next;queue[tail++]=n;}}
    this.fields.set(slot,field);
   }
   for(const id of line)if(id>=0&&id<field.length)result=Math.min(result,field[id]);
  }
  return result===65535?null:result;
 }
}
export interface ExpansionEpisode {
 id:string;slot:number;personality:Participant['personality'];lifeId:number;selectedTick:number;launchedTick:number|null;
 endedTick:number|null;outcome:'OPEN'|'CAPTURE'|'HOME'|'REPLANNED'|'LIFE_RESET'|'DEATH'|'CENSORED';
 goalAtSelection:string;attackInterrupted:boolean;attackTick:number|null;escape:boolean;exposureTicks:number;
 plan:ExpansionPlan;grudgeSlots:number[];topGrudgeSlot:number|null;damageSlots:number[];
 plannedDistances:{grudge:number|null;topGrudge:number|null;damage:number|null};
 terminalDistances?:{grudge:number|null;topGrudge:number|null;damage:number|null;killer:number|null};
 terminalLineCells?:number;deathGoal?:string;deathCause?:string;killerSlot?:number|null;
}
export class ExpansionEpisodeTracker {
 readonly rows:ExpansionEpisode[]=[];readonly deathLinks:any[]=[];
 private active=new Map<string,ExpansionEpisode>();private sequence=0;
 readonly distances:TerritoryDistances;
 constructor(private match:MatchState,private seed:number){this.distances=new TerritoryDistances(match);}
 private close(row:ExpansionEpisode,outcome:ExpansionEpisode['outcome']){row.outcome=outcome;row.endedTick=this.match.tick;}
 before(p:Participant,memory:BotMemory,trace?:BotDecisionTrace){
  let active=this.active.get(p.participantId);
  if(active&&active.lifeId!==p.lifeId){this.close(active,'LIFE_RESET');this.active.delete(p.participantId);active=undefined;}
  if(trace?.expansionPlan){
   if(active)this.close(active,'REPLANNED');
   const roster=new Map(this.match.participants.map(q=>[q.participantId,q.slot]));
   const grudges=[...memory.emotion.grudge].filter(([id,r])=>r.amount>0&&roster.has(id)).sort((a,b)=>b[1].amount-a[1].amount||roster.get(a[0])!-roster.get(b[0])!);
   const grudgeSlots=grudges.map(([id])=>roster.get(id)!);
   const topGrudgeSlot=grudgeSlots[0]??null;
   const damageSlots=[...new Set([...memory.emotion.damage.regions.values()].flatMap(r=>roster.has(r.attackerId)?[roster.get(r.attackerId)!]:[]))];
   const line=(trace.expansionPath??[]).filter(id=>this.match.owners[id]!==p.slot+1);
   active={id:[this.seed,p.slot,p.lifeId,++this.sequence].join(':'),slot:p.slot,personality:p.personality,lifeId:p.lifeId,
    selectedTick:this.match.tick,launchedTick:null,endedTick:null,outcome:'OPEN',goalAtSelection:trace.to,
    attackInterrupted:false,attackTick:null,escape:false,exposureTicks:0,
    plan:{...trace.expansionPlan,response:trace.expansionPlan.response?{...trace.expansionPlan.response}:undefined},
    grudgeSlots,topGrudgeSlot,damageSlots,
    plannedDistances:{grudge:this.distances.minimum(line,grudgeSlots),topGrudge:this.distances.minimum(line,topGrudgeSlot===null?[]:[topGrudgeSlot]),damage:this.distances.minimum(line,damageSlots)}};
   this.rows.push(active);this.active.set(p.participantId,active);
  }
  if(active){
   if(memory.goal==='ATTACK'){active.attackInterrupted=true;active.attackTick??=this.match.tick;}
   if(memory.goal==='ESCAPE')active.escape=true;
  }
 }
 death(trace:DeathTrace,memory:BotMemory){
  const p=this.match.participants.find(q=>q.participantId===trace.victimId)!;
  const row=this.active.get(trace.victimId);
  const pending=trace.diagnostic?.pendingTrails.filter(t=>t.participantId===trace.victimId).map(t=>t.cellId)??[];
  const line=[...new Set([...trace.trailCells,...pending])];
  this.distances.invalidate(); // Captures earlier in this resolution may already have changed public owners.
  const killerSlot=this.match.participants.find(q=>q.participantId===trace.killerId)?.slot??null;
  if(row&&row.lifeId===trace.lifeId){
   if(line.length||this.match.owners[trace.victimCell]!==p.slot+1)row.launchedTick??=this.match.tick;
   row.terminalDistances={grudge:this.distances.minimum(line,row.grudgeSlots),topGrudge:this.distances.minimum(line,row.topGrudgeSlot===null?[]:[row.topGrudgeSlot]),damage:this.distances.minimum(line,row.damageSlots),killer:this.distances.minimum(line,killerSlot===null?[]:[killerSlot])};
   row.terminalLineCells=line.length;row.deathGoal=memory.goal;row.deathCause=trace.context?.cause??trace.reason;row.killerSlot=killerSlot;
   this.close(row,'DEATH');this.active.delete(trace.victimId);
  }
  this.deathLinks.push({slot:p.slot,lifeId:trace.lifeId,tick:trace.tick,episodeId:row?.lifeId===trace.lifeId?row.id:null,
   goal:memory.goal,cause:trace.context?.cause??trace.reason,killerSlot,lineCells:line.length,
   rememberedBonus:memory.expansion?.response?.bonus??0,
   attributedBonus:row?.lifeId===trace.lifeId?row.plan.response?.bonus??0:null,
   interruptedByAttack:row?.lifeId===trace.lifeId?row.attackInterrupted:false});
 }
 after(p:Participant,captured:boolean){
  const row=this.active.get(p.participantId);if(!row||row.lifeId!==p.lifeId||p.lifeState!=='ALIVE')return;
  if(p.trailCells.size||this.match.owners[p.cellId]!==p.slot+1)row.launchedTick??=this.match.tick;
  if(p.trailCells.size)row.exposureTicks++;
  if(captured||row.launchedTick!==null&&!p.trailCells.size&&this.match.owners[p.cellId]===p.slot+1){
   this.close(row,captured?'CAPTURE':'HOME');this.active.delete(p.participantId);
  }
 }
 finish(){for(const row of this.active.values())this.close(row,'CENSORED');this.active.clear();return {episodes:this.rows,deathLinks:this.deathLinks};}
}
