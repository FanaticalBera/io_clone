import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const local=resolve('.local/bot-phase025-boundary'),evidence=resolve('evidence/bot-phase025-boundary');
const seeds=[4,19,73,11,31,47,101,137];
const digest=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
if(process.argv.includes('--prepare')){
 mkdirSync(local,{recursive:true});mkdirSync(evidence,{recursive:true});
 const old=JSON.parse(readFileSync('evidence/bot-phase025-ablation/protocol.json','utf8'));
 const sourceHashes:Record<string,Record<string,string>>={};
 for(const arm of ['control','reclaim','append']){
  const src=arm==='append'?resolve('.'):resolve('.local/bot-phase025-ablation',arm);
  if(arm!=='append')for(const [p,hash]of Object.entries(old.sourceHashes[arm]))if(digest(join(src,p))!==hash)throw new Error('Previous snapshot changed: '+arm+' '+p);
  const dest=join(local,arm);mkdirSync(join(dest,'tests'),{recursive:true});cpSync(join(src,'src'),join(dest,'src'),{recursive:true});cpSync(join(src,'tests/bot-growth-tracker.ts'),join(dest,'tests/bot-growth-tracker.ts'));
  sourceHashes[arm]=Object.fromEntries(files(join(dest,'src')).sort().map(p=>[relative(dest,p).replaceAll('\\','/'),digest(p)]));
 }
 const protocol={createdAt:new Date().toISOString(),baseCommit:'02c4e18',seeds,arms:['control','reclaim','append'],
  conditions:{mapRadius:56,spawnRadius:1,bots:14,seconds:120,safeRespawn:true,classic:true,revengePerCell:0,hardSafety:'UNCHANGED',reposition:'DEFERRED',phase3:'DEFERRED'},
  sourceHashes,oldSourceProtocol:'../bot-phase025-ablation/protocol.json',
  behaviorComparison:'Reuse unchanged verified control/reclaim 8-seed movement archives from previous experiment; run append arm through identical audit. Sources, seeds, identities, time, metrics and classification unchanged.',
  classification:old.classification,
  cost:'Same PC, one observer-free process, Latin-rotated arm order across 8 seeds and 3 measured rounds. One full seed19 warm-up per arm discarded. Each batch 3600 ticks. Time getBotInputs + stepMatch only, exclude creation/loading/output/HUD/audit. Per-seed 3 batch averages and median; overall median of 3 rounds each containing all 8 seeds. Review if append median cost >=20% above either reference.',
  auditHashes:Object.fromEntries(['scripts/bot-phase025-audit.ts','tests/bot-phase025-plan-tracker.ts','tests/bot-growth-tracker.ts','scripts/bot-phase025-boundary.ts','scripts/bot-phase025-boundary-performance.ts'].map(p=>[p,digest(p)]))};
 writeFileSync(join(evidence,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});console.log('Boundary comparison protocol fixed');
}else if(process.argv.includes('--audit')){
 const p=JSON.parse(readFileSync(join(evidence,'protocol.json'),'utf8'));
 for(const [file,hash]of Object.entries(p.auditHashes))if(digest(file)!==hash)throw new Error('Audit changed '+file);
 for(const arm of p.arms)for(const [file,hash]of Object.entries(p.sourceHashes[arm]))if(digest(join(local,arm,file))!==hash)throw new Error('Arm changed '+arm+' '+file);
 for(const arm of ['control','reclaim'])cpSync(resolve('.local/bot-phase025-ablation',arm+'.json'),join(local,arm+'.json'));
 const r=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/bot-phase025-audit.ts','--source='+join(local,'append'),'--seeds='+seeds.join(','),'--episodes','--out='+join(local,'append.json')],{stdio:'inherit'});
 if(r.status!==0)throw new Error('Audit failed');
}
