// Read-only post hoc analysis. Future human turns are never fed to the bot.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const option=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(name))?.slice(name.length)??fallback;
const raw=resolve(option('--raw=','../bot-phase04-medium-history'));
const out=resolve(option('--out=','evidence/bot-phase04-medium-history'));
const read=(name:string)=>JSON.parse(readFileSync(resolve(raw,name),'utf8'));
const history=read('history.json'),parent=read('parent-frames.json'),child=read('first-break-frames.json');
const snapshotHash=createHash('sha256').update(readFileSync(resolve(raw,'audit-script-used.ts'))).digest('hex');
if(snapshotHash!==history.auditScriptHash)throw Error('Historical audit script snapshot changed');
for(const row of history.rows){
 for(const [name,expected] of Object.entries(row.sourceHashes)){
  if(createHash('sha256').update(readFileSync(resolve(row.source,name))).digest('hex')!==expected)throw Error('Frozen source changed: '+row.short+'/'+name);
 }
 const reports=JSON.parse(readFileSync(row.report,'utf8'));
 if(reports.length!==16||reports.filter((r:any)=>r.confirmedTrailCut).length!==row.cuts)throw Error('Historical result changed: '+row.short);
}
const first=history.rows.findIndex((r:any)=>r.cuts<16);
if(first<1||history.rows[first].short!=='6c307e3'||history.rows[first-1].short!=='fafca32')throw Error('Unexpected first regression');
for(const [frames,row] of [[parent,history.rows[first-1]],[child,history.rows[first]]]){
 if(frames.length!==16||frames.some((v:any,i:number)=>v.confirmedTrailCut!==row.results[i].cut||v.tick!==row.results[i].tick))throw Error('Frame audit differs from historical outcomes');
}
const load=(name:string)=>import(pathToFileURL(resolve(raw,'6c307e3/source/src/shared',name+'.ts')).href);
const [game,movement]=await Promise.all(['game','movement'].map(load));
const match=game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},115,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality:'ATTACK'}]);
const details=[];
for(const i of [4,5,12,13]){
 const a=parent[i],b=child[i];
 const diff=b.frames.find((f:any)=>{const old=a.frames.find((p:any)=>p.tick===f.tick);return old&&(old.selectedGoal!==f.selectedGoal||JSON.stringify(old.input)!==JSON.stringify(f.input));});
 if(!diff||diff.tick!==4||diff.trace.departure.reason!=='PREDICTED_OVERLAP')throw Error('Unexpected first difference');
 const firstCell=diff.trace.departure.firstCell,start=diff.human;
 // Reconstruct every real segment, including cells only crossed between frames.
 const actual=[];
 for(const version of [a,b]){
  const visits=new Set<number>(),segments=[];
  for(let tick=4;tick<34;tick++){
   const f=version.frames.find((v:any)=>v.tick===tick),next=version.frames.find((v:any)=>v.tick===tick+1);
   const dx=next.human.position.x-f.human.position.x,dy=next.human.position.y-f.human.position.y;
   const trace=movement.traceMovement(match.map,f.human.position,f.human.cell,{x:dx,y:dy},Math.hypot(dx,dy));
   if(trace.cellId!==next.human.cell||Math.hypot(trace.position.x-next.human.position.x,trace.position.y-next.human.position.y)>1e-7)throw Error('Actual segment reconstruction mismatch');
   const cells=[f.human.cell,...trace.entries.map((e:any)=>e.cellId),trace.cellId];
   for(const cell of cells)visits.add(cell);segments.push({tick,cells});
  }
  actual.push({segmentsVerified:segments.length,firstExteriorCellVisited:visits.has(firstCell),visitedCells:[...visits],segments});
 }
 // Reproduce only the guard's current-heading prediction, with fractional entry times.
 let position=start.position,direction=start.direction,cell=start.cell,enteredAt=0;
 const predicted:any[]=[];
 for(let n=0;n<30;n++){
  const next=movement.stepSteering(match.map,position,cell,direction,start.direction,match.config);
  for(const entry of next.entries){const time=(n+entry.t)/30;predicted.push({cell,start:enteredAt,end:time});cell=entry.cellId;enteredAt=time;}
  if(next.blocked)break;position=next.position;direction=next.direction;cell=next.cellId;
 }
 predicted.push({cell,start:enteredAt,end:1});
 const forecast=predicted.filter(v=>v.cell===firstCell);
 if(!forecast.length||actual.some(v=>v.firstExteriorCellVisited))throw Error('Unexpected overlap evidence');
 const attack=a.frames.find((f:any)=>f.selectedGoal==='ATTACK'),later=b.frames.find((f:any)=>f.tick===attack.tick);
 const candidate=(frame:any)=>frame.trace.attacks.find((v:any)=>v.target===612);
 details.push({id:i+1,personality:a.personality,route:i%4+1,firstDifferenceTick:diff.tick,firstExteriorCell:firstCell,
  guard:diff.trace.departure,forecast,actual:actual.map(({segments,...rest})=>rest),
  parentAtAttack:{tick:attack.tick,cell:attack.bot.cell,direction:attack.bot.direction,candidate:candidate(attack)},
  childAtSameTick:{tick:later.tick,cell:later.bot.cell,direction:later.bot.direction,candidate:candidate(later)},
  attackTicks:{parent:a.frames.filter((f:any)=>f.selectedGoal==='ATTACK').length,child:b.frames.filter((f:any)=>f.selectedGoal==='ATTACK').length},
  parentOutcome:{tick:a.tick,cut:a.confirmedTrailCut,cause:a.deathCause},childOutcome:{tick:b.tick,cut:b.confirmedTrailCut,humanState:b.humanState}});
 writeFileSync(resolve(raw,'segments-'+(i+1)+'.json'),JSON.stringify({actual,forecast},null,2));
}
mkdirSync(out,{recursive:true});
const summary={protocol:history.protocol,auditScriptHash:snapshotHash,commits:history.rows.length,
 firstBrokenCommit:history.rows[first].sha,immediateParent:history.rows[first-1].sha,
 matrix:history.rows.map(({sha,short,title,cuts,results}:any)=>({sha,short,title,cuts,failed:results.filter((r:any)=>!r.cut).map((r:any)=>r.id)})),
 details,conclusion:'Launch guard t4 current-heading overlap forecast causes detour; t37 ETA fails VICTIM_RETURNS_FIRST. No attack/safety changes made.',
 limitation:'Post hoc actual-turn check establishes a conservative false positive in these four fixed trajectories only; it is not information available to the bot at t4.'};
writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
writeFileSync(resolve(out,'commits.csv'),'commit,cuts,failed_ids,title\n'+history.rows.map((r:any)=>[r.sha,r.cuts,r.results.filter((v:any)=>!v.cut).map((v:any)=>v.id).join('|'),'"'+r.title.replaceAll('"','""')+'"'].join(',')).join('\n')+'\n');
writeFileSync(resolve(out,'scenarios.csv'),'commit,id,personality,route,confirmed_cut,end_tick,human_state,cause\n'+history.rows.flatMap((r:any)=>r.results.map((v:any)=>[r.short,v.id,v.personality,v.route,v.cut,v.tick,v.humanState,v.cause??''].join(','))).join('\n')+'\n');
writeFileSync(resolve(out,'sources.json'),JSON.stringify({auditScriptHash:snapshotHash,sources:history.rows.map((r:any)=>({commit:r.sha,sharedSourceManifestHash:createHash('sha256').update(JSON.stringify(r.sourceHashes)).digest('hex'),reportHash:createHash('sha256').update(readFileSync(r.report)).digest('hex')}))},null,2)+'\n');
console.log(JSON.stringify({firstBrokenCommit:summary.firstBrokenCommit,commits:summary.commits,verifiedSegments:details.reduce((n,v)=>n+v.actual.reduce((k,a)=>k+a.segmentsVerified,0),0),details:details.map(v=>({id:v.id,forecast:v.forecast,actual:v.actual}))}));
