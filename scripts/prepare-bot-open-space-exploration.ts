import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {BOT_OPEN_SPACE} from '../src/shared/bot-open-space.js';

const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-open-space-exploration');
const stage=process.argv.find(v=>v.startsWith('--stage='))?.slice(8)??'B';
if(existsSync(root))throw Error('Preserve existing outcomes: exploration directory already exists');
mkdirSync(root,{recursive:true});
const previous=JSON.parse(readFileSync('../bot-open-space-analysis/protocol.json','utf8'));
const candidate=resolve(root,'candidate'),audit=resolve(root,'candidate-audit');
const hashes=(dir:string)=>Object.fromEntries(readdirSync(resolve(dir,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>[f,createHash('sha256').update(readFileSync(resolve(dir,'src/shared',f))).digest('hex')]));
for(const dir of [candidate,audit]){
 mkdirSync(resolve(dir,'src/shared'),{recursive:true});
 for(const f of readdirSync('src/shared').filter(f=>f.endsWith('.ts')))copyFileSync(resolve('src/shared',f),resolve(dir,'src/shared',f));
 copyFileSync('package.json',resolve(dir,'package.json'));
}
const hook=`let listener:any;export function watchOpenSpaceAudit(value:any){listener=value;}export function beginOpenAudit(obs:any,memory:any){listener?.before?.(obs,memory);}export function recordOpenGeometry(memory:any,index:number,geometry:any){listener?.geometry?.(memory,index,geometry);}\n`;
writeFileSync(resolve(audit,'src/shared/bot-open-space-audit.ts'),hook);
const file=resolve(audit,'src/shared/bot-strategy.ts');let source=readFileSync(file,'utf8');
const replace=(a:string,b:string)=>{if(!source.includes(a))throw Error('Instrumentation anchor missing');source=source.replace(a,b);};
replace('export function planExpansion(obs:BotObservation,memory:BotMemory):number[] {','export function planExpansion(obs:BotObservation,memory:BotMemory):number[] {\n beginOpenAudit(obs,memory);');
const push=source.split(/\r?\n/).find(line=>line.includes('candidates.push({path,score:baseScore+response.bonus'));if(!push)throw Error('No candidate push');
replace(push,push+'\n recordOpenGeometry(memory,candidates.length-1,{anchor:anchor.id,direction:d,length,width,bevel,shape});');
writeFileSync(file,"import {beginOpenAudit,recordOpenGeometry} from './bot-open-space-audit.js';\n"+source);
writeFileSync(resolve(root,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),stage,baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),baselineCommit:previous.commit,seeds:previous.seeds,ticks:3600,config:previous.config,arms:['baseline','candidate'],baseline:previous.source,candidate,audit,sourceHashes:hashes(candidate),auditHashes:hashes(audit),baselineHashes:previous.sourceHashes,settings:BOT_OPEN_SPACE,baselineRaw:resolve('../bot-open-space-analysis'),scope:stage==='B-quiet'?'Revised B: add one open anchor only when observed heads AND rival trails are empty. Candidate120s8seeds,medium16,expanded1024,actual RP recovery.':'Approved crowded shapes only on selected base; candidate120s8seeds,medium16,actual RP recovery.',movement:'Same-life adjacent actual EXPAND/STEAL departures. Crowded pairs require both adjacent departures crowded; named size normalized with expansionSides(direction0). Also record actual selected-path geometry ignoring shape names.',decision:'B is screened before adding C. No safety threshold changes. No240s/cost/full-suite/player checks at this stage.'},null,2)+'\n');
console.log(root);
