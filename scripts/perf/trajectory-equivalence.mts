// Behaviour-equivalence check for performance work (performance PRD v0.4.2, stage 3 verification).
// Bots are frozen (docs/bot-ai-freeze.md): an optimisation passes only if every tick behaves identically.
// Unlike scripts/bot-nickname-trajectories.ts this does not require the frozen source bytes: source hashes
// are recorded for reference and the pass/fail criterion is the behaviour hash.
//
// Make a baseline from a checkout of the frozen commit, then compare a candidate against it:
//   node scripts/perf/trajectory-equivalence.mts --source <frozen checkout> --out evidence/perf-trajectory-baseline/baseline.json
//   node scripts/perf/trajectory-equivalence.mts --source . --compare evidence/perf-trajectory-baseline/baseline.json --out .local/perf/candidate.json
// Compatibility self-check: legacy hashes (bots14) must equal the freeze evidence:
//   ... --legacy-reference ../../.local/bot-freeze-final/nickname-trajectories.json
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadModules,createScenario,FREEZE_SEEDS,type ScenarioName} from './scenario.mts';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const source=resolve(args.get('source')??'.'),ticks=Number(args.get('ticks')??3600),every=Number(args.get('checkpoint')??30);
const seeds=(args.get('seeds')??FREEZE_SEEDS.join(',')).split(',').map(Number);
const scenarios=(args.get('scenarios')??'bots14,practice').split(',') as ScenarioName[];
// Stable serialisation of bot memory: Maps/Sets become entry lists, functions (RNG closures) are skipped.
// RNG state is covered indirectly: any change in draws changes later decisions, which are hashed.
const stable=(value:unknown):unknown=>{
 if(value instanceof Map)return {$map:[...value].map(([k,v])=>[stable(k),stable(v)])};
 if(value instanceof Set)return {$set:[...value].map(stable)};
 if(ArrayBuffer.isView(value))return Array.from(value as unknown as ArrayLike<number>);
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [k,v]of Object.entries(value))if(typeof v!=='function')out[k]=stable(v);return out;}
 return value;
};
const commitOf=(dir:string)=>{try{const head=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=execFileSync('git',['-C',dir,'status','--porcelain','--','src'],{encoding:'utf8'}).trim()!=='';return {head,dirtySrc:dirty};}catch{return null;}};
const sourceHashes=Object.fromEntries(readdirSync(resolve(source,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>['src/shared/'+f,createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex')]));
const modules=await loadModules(source);
const results:any[]=[];
for(const scenario of scenarios)for(const seed of seeds){
 const s=createScenario(modules,scenario,seed),legacy=createHash('sha256'),extended=createHash('sha256'),checkpoints:{tick:number;legacy:string;extended:string}[]=[];
 const started=performance.now();
 for(let t=0;t<ticks;t++){
  const inputs=s.inputs(),encoded=JSON.stringify([...inputs]);legacy.update(encoded);extended.update(encoded);s.step(inputs);
  const owners=s.match.owners,trails=Buffer.from(s.match.trailMasks.buffer,s.match.trailMasks.byteOffset,s.match.trailMasks.byteLength);
  const people=JSON.stringify(s.match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq})));
  for(const h of [legacy,extended]){h.update(owners);h.update(trails);h.update(people);}
  // Extended: this tick's events, scores and every bot's memory (goal, next decision tick, plans, emotions).
  extended.update(JSON.stringify(s.match.events.filter((e:any)=>e.tick===s.match.tick)));
  extended.update(JSON.stringify(s.match.participants.map((p:any)=>[p.territoryCount,p.kills,p.deaths])));
  extended.update(JSON.stringify(stable([...s.memories])));
  if(s.match.tick%every===0)checkpoints.push({tick:s.match.tick,legacy:legacy.copy().digest('hex'),extended:extended.copy().digest('hex')});
 }
 const row={scenario,seed,ticks:s.match.tick,legacyHash:legacy.digest('hex'),extendedHash:extended.digest('hex'),deaths:s.match.participants.reduce((n:number,p:any)=>n+p.deaths,0),checkpoints,seconds:Math.round((performance.now()-started)/100)/10};
 results.push(row);console.error(`${scenario} seed ${seed}: ${row.extendedHash.slice(0,12)} deaths ${row.deaths} (${row.seconds}s)`);
}
const report:any={tool:'perf-trajectory-equivalence v1',ticks,checkpointEvery:every,seeds,scenarios,source:{dir:source,git:commitOf(source),sourceHashes},results};
let failed=false;
if(args.has('legacy-reference')){
 const ref=JSON.parse(readFileSync(resolve(args.get('legacy-reference')!),'utf8'));
 report.legacyCheck=results.filter(r=>r.scenario==='bots14').map(r=>{const expected=ref.rows.find((x:any)=>x.seed===r.seed)?.hash;return {seed:r.seed,expected,actual:r.legacyHash,equal:expected===r.legacyHash};});
 for(const c of report.legacyCheck)if(!c.equal){failed=true;console.error('LEGACY MISMATCH seed',c.seed);}
}
if(args.has('compare')){
 const ref=JSON.parse(readFileSync(resolve(args.get('compare')!),'utf8'));
 report.comparison={reference:args.get('compare'),referenceGit:ref.source?.git,rows:results.map(r=>{
  const base=ref.results.find((x:any)=>x.scenario===r.scenario&&x.seed===r.seed);if(!base)return {scenario:r.scenario,seed:r.seed,missing:true,equal:false};
  const first=r.checkpoints.find((c:any,i:number)=>c.extended!==base.checkpoints[i]?.extended);
  return {scenario:r.scenario,seed:r.seed,equal:r.extendedHash===base.extendedHash&&!first&&r.deaths===base.deaths,firstDivergentCheckpoint:first?.tick??null};
 })};
 for(const c of report.comparison.rows)if(!c.equal){failed=true;console.error('DIVERGED',c.scenario,'seed',c.seed,'first checkpoint',c.firstDivergentCheckpoint);}
 if(!failed)console.error('ALL EQUAL',results.length,'runs');
}
report.passed=!failed;
const out=args.get('out');if(out){mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(resolve(out),JSON.stringify(report,null,1)+'\n');console.error('saved',out);}
process.exitCode=failed?1:0;
