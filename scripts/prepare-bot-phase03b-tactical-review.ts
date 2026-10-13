import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const option=(prefix:string,fallback:string)=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)??fallback;
const root=resolve(option('--out=','../bot-phase03b-tactical-review')),base=option('--base=','5b714ea');
if(existsSync(root))throw Error('Preserve existing evidence: choose a new output directory');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const baseSha=git('rev-parse',base).trim(),parent=git('rev-parse','HEAD').trim();
const candidateFiles=[...readdirSync('src/shared').filter(f=>f.endsWith('.ts')).map(f=>'src/shared/'+f),'tests/bot-growth-tracker.ts','package.json'];
const baselineFiles=git('ls-tree','-r','--name-only',base,'src/shared','tests/bot-growth-tracker.ts','package.json').trim().split(/\r?\n/);
for(const arm of ['baseline','tactical'])for(const file of arm==='baseline'?baselineFiles:candidateFiles){const target=resolve(root,arm+'-source',file);mkdirSync(dirname(target),{recursive:true});if(arm==='baseline')writeFileSync(target,git('show',base+':'+file));else copyFileSync(file,target);}
const sourceHashes=(source:string)=>Object.fromEntries(readdirSync(resolve(source,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>['src/shared/'+f,createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex')]));
const protocol={createdAt:new Date().toISOString(),parent,baseline:baseSha,seeds:[4,19,73,11,31,47,101,137],ticks:3600,simulationHz:30,mapRadius:56,spawnRadius:1,bots:14,safeRespawn:true,variant:'combined',arms:['baseline','tactical'].map(name=>{const source=resolve(root,name+'-source');return {name,source,sourceHashes:sourceHashes(source)};}),cost:{sameSession:true,rounds:3,pairedSeedOrder:'4,19,73,11,31,47,101,137; alternate arm order by round+seed index',warmup:'one full seed19 replay per arm; discard warmups',timed:'getBotInputs+stepMatch only; observers/HUD off; immutable source snapshots; check source SHA256 before timing',aggregation:'per-seed median of three samples; overall median of three complete eight-seed rounds; preserve every sample',externalTests:'before/after probe excludes overlaps independent of value; never stop other work',baselineSource:'Unmodified actual 3A 5b714ea shared source, not the hook-augmented separation replay snapshot'},status:'Tactical-only spectator candidate; personal strategy inactive; final adoption pending cost and human spectating; no master merge'};
writeFileSync(resolve(root,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});console.log(root);
// Run the audit against both frozen sources before timing. Do not use replay
// elapsed times (which include diagnostics) as benchmark samples.
