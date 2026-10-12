import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const option=(prefix:string,fallback:string)=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)??fallback;
const root=resolve(option('--out=','../bot-phase03b-separation')),base=option('--base=','5b714ea'),combined=option('--combined=','7ebf4eb');
if(existsSync(root))throw Error('Preserve prior measurements: choose a new output directory');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const baseSha=git('rev-parse',base).trim(),combinedSha=git('rev-parse',combined).trim();
const files=(ref:string)=>git('ls-tree','-r','--name-only',ref,'src/shared','tests/bot-growth-tracker.ts','package.json').trim().split(/\r?\n/);
const arms=['baseline','tactical','strategy','combined','legacy-control'] as const;
for(const name of arms){const source=resolve(root,name),ref=name==='baseline'?baseSha:combinedSha;
 for(const file of files(ref)){const dest=resolve(source,file);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,git('show',ref+':'+file));}
 if(name==='baseline')for(const file of ['src/shared/bot-strategy.ts','src/shared/bot-candidate-diagnostics.ts'])writeFileSync(resolve(source,file),git('show',combinedSha+':'+file));
 if(['tactical','strategy','legacy-control'].includes(name)){
  const file=resolve(source,'src/shared/bot-scheduler.ts');let text=readFileSync(file,'utf8');
  if(name==='tactical'){
   text=text.replace("Pick<PublicParticipant,'kind'|'personality'>","Pick<PublicParticipant,'kind'|'personality'|'slot'>");
   const before="schedule.profile=Object.freeze({personality,strategyTicks,strategyPhase:Math.floor(random()*strategyTicks),tacticalPhase:Math.floor(random()*BOT_PHASE03B.tacticalTicks)});";
   if(!text.includes(before))throw Error('Unexpected scheduler source');
   text=text.replace(before,"const strategyPhase=Math.floor(random()*strategyTicks),tacticalPhase=Math.floor(random()*BOT_PHASE03B.tacticalTicks);\n  schedule.profile=Object.freeze({personality,strategyTicks:6,strategyPhase:self.slot%6,tacticalPhase}); // Audit: only tactical cadence changes; retain legacy strategy/slot phase.");
  }else if(name==='strategy'){
   const before="const tactical=!!profile&&tick>=memory.schedule!.nextTacticalTick&&(trailLength>0||['ATTACK','RETURN','ESCAPE','REPOSITION'].includes(memory.goal));";
   if(!text.includes(before))throw Error('Unexpected scheduler source');
   text=text.replace(before,'const tactical=false; // Audit: tactical work runs only when personal strategy is due.');
  }else{
   text=text.replace("const schedule=memory.schedule;if(!schedule||self.kind!=='BOT')return undefined;","return undefined; // Audit: both cadence factors disabled, legacy fallback below.\n const schedule=memory.schedule;if(!schedule||self.kind!=='BOT')return undefined;");
  }
  writeFileSync(file,text);
 }
}
const hashes=(source:string)=>Object.fromEntries(readdirSync(resolve(source,'src/shared')).filter(f=>f.endsWith('.ts')).sort().map(f=>['src/shared/'+f,createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex')]));
const protocol={createdAt:new Date().toISOString(),base:baseSha,combined:combinedSha,seeds:[4,19,73,11,31,47,101,137],ticks:3600,simulationHz:30,mapRadius:56,spawnRadius:1,bots:14,safeRespawn:true,variant:'combined',definitions:{baseline:'3A actual source plus read-only candidate hooks; both cadence factors off',tactical:'100ms tactics only; strategy remains legacy 6 ticks with slot%6 phase; independent tactical phase equals combined',strategy:'Personal strategy periods/phases only; no independent tactical tick',combined:'Unadopted full 3B source reference',legacyControl:'3B machinery with both scheduling factors off; gameplay/RNG/normalized state/order must equal actual 3A'},arms:arms.map(name=>({name,source:resolve(root,name),sourceHashes:hashes(resolve(root,name))})),adoption:'No arm adopted; runtime source and master unchanged'};
writeFileSync(resolve(root,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});console.log(root);
