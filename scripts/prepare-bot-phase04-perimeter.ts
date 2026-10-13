import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv.find(v=>v.startsWith('--out='))?.slice(6)??'../bot-phase04-perimeter-analysis');
if(existsSync(root))throw Error('Preserve existing results: choose a new output directory');
const source=resolve(root,'native-source'),instrumented=resolve(root,'instrumented-source');mkdirSync(source,{recursive:true});
const commit=execFileSync('git',['rev-parse','133ee1f'],{encoding:'utf8',windowsHide:true}).trim();
const archive=resolve(root,'source.tar');execFileSync('git',['archive','--format=tar','--output='+archive,commit,'src/shared','package.json'],{windowsHide:true});execFileSync('tar.exe',['-xf',archive,'-C',source],{windowsHide:true});
const workingTree=process.argv.includes('--working-tree');
if(workingTree)for(const f of readdirSync(resolve('src/shared')))copyFileSync(resolve('src/shared',f),resolve(source,'src/shared',f));
for(const file of [...readdirSync(resolve(source,'src/shared')).map(f=>'src/shared/'+f),'package.json']){const dest=resolve(instrumented,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(source,file),dest);}
const hook=`// Optional read-only hook used only in this frozen diagnostic copy.
const listeners=new WeakMap<object,{prelude:(obs:any,trace:any)=>void;immediate:(obs:any,memory:any,intent:any,escape:any)=>void}>();
export function watchPerimeterAudit(memory:object,listener:any){listeners.set(memory,listener);return()=>listeners.delete(memory);}
export function perimeterPrelude(memory:object,obs:any,trace:any){listeners.get(memory)?.prelude(obs,trace);}
export function perimeterImmediate(obs:any,memory:object,intent:any,escape:any){listeners.get(memory)?.immediate(obs,memory,intent,escape);}
`;
writeFileSync(resolve(instrumented,'src/shared/bot-perimeter-audit-hook.ts'),hook);
const file=resolve(instrumented,'src/shared/bot.ts');let text=readFileSync(file,'utf8');
const prelude='if(trace&&observer){decisionTraces.delete(memory);',immediate='const escape=perimeterEscapeDirection(obs,direction);';
for(const marker of [prelude,immediate])if(text.split(marker).length!==2)throw Error('Unexpected native source marker');
text="import {perimeterPrelude,perimeterImmediate} from './bot-perimeter-audit-hook.js';\n"+text.replace(prelude,'if(trace&&observer){perimeterPrelude(memory,obs,trace);decisionTraces.delete(memory);').replace(immediate,immediate+'perimeterImmediate(obs,memory,direction,escape);');
writeFileSync(file,text);
const hashes=(dir:string)=>Object.fromEntries(readdirSync(resolve(dir,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>[f,createHash('sha256').update(readFileSync(resolve(dir,'src/shared',f))).digest('hex')]));
writeFileSync(resolve(root,'protocol.json'),JSON.stringify({status:workingTree?'APPROVED_SINGLE_BEHAVIOR_CHANGE':'READ_ONLY_ANALYSIS_NO_BEHAVIOR_CHANGE',commit,sourceState:workingTree?'Working shared source frozen before runs; commit is historical baseline, nativeHashes identify candidate':'Pristine commit archive',seeds:[4,19,73,11,31,47,101,137],ticks:3600,radius:56,spawnRadius:1,bots:14,simulationHz:30,safeRespawn:true,source,instrumented,nativeHashes:hashes(source),instrumentedHashes:hashes(instrumented),instrumentation:'Two optional observer calls and import only in frozen diagnostic copy; prove equivalence against same-arm native source. No instrumentation safety/candidate/steering/RNG/clock modification.'},null,2)+'\n');
console.log(root);
