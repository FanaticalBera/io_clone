// Spike analysis for stage 3 C1/C3: per-tick cost with the bot share, the slow-tick list (tick, bots
// deciding that tick, events) and, with --trace-gc, how GC lines up. Run under --cpu-prof for functions:
//   node --import tsx --cpu-prof --cpu-prof-dir .local/perf/prof scripts/perf/tick-profile.mts --seed 137
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {loadModules,createScenario,type ScenarioName} from './scenario.mts';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const seed=Number(args.get('seed')??137),ticks=Number(args.get('ticks')??3600),slowMs=Number(args.get('slow')??10);
const m=await loadModules(resolve(args.get('source')??'.')),s=createScenario(m,(args.get('scenario')??'bots14') as ScenarioName,seed);
const rows:{tick:number;ms:number;botMs:number;due:number;events:string[]}[]=[];
for(let t=0;t<ticks;t++){
 const due=[...s.memories.values()].filter((mem:any)=>mem.nextDecisionTick<=s.match.tick).length;
 const a=performance.now(),inputs=s.inputs(),b=performance.now();s.step(inputs);const c=performance.now();
 rows.push({tick:s.match.tick,ms:c-a,botMs:b-a,due,events:s.match.events.filter((e:any)=>e.tick===s.match.tick).map((e:any)=>e.type)});
}
const sorted=[...rows].sort((x,y)=>y.ms-x.ms),slow=rows.filter(r=>r.ms>=slowMs);
const byDue=new Map<number,number[]>();for(const r of rows){const l=byDue.get(r.due)??[];l.push(r.ms);byDue.set(r.due,l);}
const report={seed,ticks,meanMs:rows.reduce((n,r)=>n+r.ms,0)/ticks,slowCount:slow.length,slowShareOfTime:slow.reduce((n,r)=>n+r.ms,0)/rows.reduce((n,r)=>n+r.ms,0),
 slowestTicks:sorted.slice(0,25).map(r=>({...r,ms:+r.ms.toFixed(2),botMs:+r.botMs.toFixed(2)})),
 meanByStrategyDueCount:[...byDue].sort((a,b)=>a[0]-b[0]).map(([due,l])=>({due,ticks:l.length,meanMs:+(l.reduce((n,v)=>n+v,0)/l.length).toFixed(2),p95:+[...l].sort((a,b)=>a-b)[Math.floor(l.length*.95)].toFixed(2)})),
 tickModulo6:[0,1,2,3,4,5].map(k=>{const l=rows.filter(r=>r.tick%6===k).map(r=>r.ms);return {k,meanMs:+(l.reduce((n,v)=>n+v,0)/l.length).toFixed(2)};})};
const out=args.get('out');if(out){mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(resolve(out),JSON.stringify(report,null,1)+'\n');}
console.log(JSON.stringify({meanMs:report.meanMs,slowCount:report.slowCount,slowShareOfTime:report.slowShareOfTime,byDue:report.meanByStrategyDueCount,mod6:report.tickModulo6,top:report.slowestTicks.slice(0,8)},null,0));
