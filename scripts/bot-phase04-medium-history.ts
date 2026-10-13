import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const option=(prefix:string,fallback:string)=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)??fallback;
const root=resolve(option('--out=','../bot-phase04-medium-history')),start='0384f9a',end='c84fc7a';
if(existsSync(root))throw Error('Preserve old results: choose a new output directory');mkdirSync(root,{recursive:true});
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const commits=[git('rev-parse',start).trim(),...git('rev-list','--reverse','--ancestry-path',start+'..'+end).trim().split(/\r?\n/)];
const auditScript=resolve(root,'audit-script-used.ts');writeFileSync(auditScript,readFileSync('scripts/medium-attack-audit.ts'));const auditScriptHash=createHash('sha256').update(readFileSync(auditScript)).digest('hex');
const rows:any[]=[];
for(const sha of commits){const short=sha.slice(0,7),dir=resolve(root,short),source=resolve(dir,'source');mkdirSync(source,{recursive:true});
 const archive=resolve(dir,'shared-source.tar');execFileSync('git',['archive','--format=tar','--output='+archive,sha,'src/shared','package.json'],{windowsHide:true});execFileSync('tar.exe',['-xf',archive,'-C',source],{windowsHide:true});
 const sourceHashes=Object.fromEntries(readdirSync(resolve(source,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>['src/shared/'+f,createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex')]));
 const out=resolve(dir,'medium.json');execFileSync(process.execPath,['--import','tsx',auditScript,'--source='+source,'--phase01','--phase02','--out='+out],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
 const reports=JSON.parse(readFileSync(out,'utf8'));
 rows.push({sha,short,title:git('show','-s','--format=%s',sha).trim(),sharedChanges:git('diff-tree','--no-commit-id','--name-only','-r',sha,'--','src/shared').trim().split(/\r?\n/).filter(Boolean),sourceHashes,source,report:out,scenarios:reports.length,cuts:reports.filter((r:any)=>r.confirmedTrailCut).length,results:reports.map((r:any,i:number)=>({id:i+1,personality:r.personality,route:i%4+1,cut:r.confirmedTrailCut,tick:r.tick,humanState:r.humanState,killer:r.killer??null,cause:r.deathCause??null}))});
 writeFileSync(resolve(root,'history.json'),JSON.stringify({start,end,auditScript,auditScriptHash,protocol:{seed:115,memorySeed:7,radius:22,spawnRadius:2,humanSlot:0,botSlot:1,identity:true,director:true,scenarios:16},rows},null,2));console.error(short+' '+rows.at(-1).cuts+'/16');
}
