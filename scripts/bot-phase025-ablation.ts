import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve('.'),local=resolve('.local/bot-phase025-ablation'),evidence=resolve('evidence/bot-phase025-ablation');
const seeds=[4,19,73,11,31,47,101,137];
const arms=[
 {id:'control',boundarySlots:0,reclaimPerCell:0,revengePerCell:0},
 {id:'boundaries',boundarySlots:2,reclaimPerCell:0,revengePerCell:0},
 {id:'reclaim',boundarySlots:2,reclaimPerCell:.5,revengePerCell:0},
 {id:'revenge',boundarySlots:2,reclaimPerCell:0,revengePerCell:.75},
 {id:'combined',boundarySlots:2,reclaimPerCell:.5,revengePerCell:.75}];
const digest=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
if(process.argv.includes('--prepare')){
 mkdirSync(local,{recursive:true});mkdirSync(evidence,{recursive:true});
 const sources:Record<string,Record<string,string>>={};
 for(const arm of arms){
  const dest=join(local,arm.id);mkdirSync(join(dest,'tests'),{recursive:true});
  cpSync(join(root,'src'),join(dest,'src'),{recursive:true});cpSync(join(root,'tests/bot-growth-tracker.ts'),join(dest,'tests/bot-growth-tracker.ts'));
  const config=join(dest,'src/shared/bot-phase025-config.ts');let text=readFileSync(config,'utf8');
  for(const [key,value]of Object.entries(arm))if(key!=='id'){
   const pattern=new RegExp(key+':(?:\\d*\\.)?\\d+');if(!pattern.test(text))throw new Error('Missing field '+key);text=text.replace(pattern,key+':'+value);
  }
  writeFileSync(config,text);
  sources[arm.id]=Object.fromEntries(files(join(dest,'src')).sort().map(p=>[relative(dest,p).replaceAll('\\','/'),digest(p)]));
 }
 const protocol={createdAt:new Date().toISOString(),baseCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),seeds,
  selection:'Previous seeds 4/19/73 plus five fixed integers 11/31/47/101/137, chosen before results. No result-based additions or exclusions.',
  conditions:{mapRadius:56,spawnRadius:1,bots:14,seconds:120,ticks:3600,safeRespawn:true,classic:true,bundle1:'ON in every arm',hardSafety:'UNCHANGED',reposition:'DEFERRED',phase3:'DEFERRED'},arms,
  comparisons:'Paired within identical seed, all arms versus control; incremental arms versus boundaries, combined versus single bonuses. Raw values, paired deltas, totals, improved/worsened/tied seed counts.',
  classification:'Exploratory directional signal only if at least 7/8 seed deltas share direction AND every leave-one-seed-out total retains that direction. Otherwise indistinguishable (not evidence of no effect). Counts, min/max, mean, median and sample SD are shown. No formal significance or generalization claimed from eight seeds.',
  mortality:'Expansion selected -> launch -> capture/home/death. Return/escape retain origin; ATTACK overrides marked separately. Selected vs launched denominators, episode death rate, end-censored plans and exposure ticks retained. Dead before launch reported separately.',
  distances:'Public ownership only. Minimum expected external-path distance at selection and actual existing+pending exposed line distance immediately before death, to launch-time grudge target set/top target/damage offender set; killer territory additionally at death. Null without target territory or line. Successful survivors at selection form comparison group.',
  attribution:'Observational proximity associations are not causal proof. D/V same-cell overlap intentional, combined cap +6 / 50% unchanged.',
  sourceHashes:sources,auditHashes:Object.fromEntries(['scripts/bot-phase025-audit.ts','scripts/bot-phase025-ablation.ts','tests/bot-phase025-plan-tracker.ts','tests/bot-growth-tracker.ts'].map(p=>[p,digest(p)]))};
 const protocolPath=join(evidence,'protocol.json');
 if(existsSync(protocolPath)){
  const frozen=JSON.parse(readFileSync(protocolPath,'utf8'));
  if(JSON.stringify(frozen.seeds)!==JSON.stringify(seeds)||JSON.stringify(frozen.arms)!==JSON.stringify(arms)||JSON.stringify(frozen.sourceHashes)!==JSON.stringify(sources))throw new Error('Existing protocol/source mismatch; use original source revision');
  console.log('Recreated snapshots; existing protocol preserved');
 }else {writeFileSync(protocolPath,JSON.stringify(protocol,null,2),{flag:'wx'});console.log('Protocol frozen for seeds '+seeds.join(','));}
}else if(process.argv.includes('--run')){
 const protocol=JSON.parse(readFileSync(join(evidence,'protocol.json'),'utf8'));
 if(JSON.stringify(protocol.seeds)!==JSON.stringify(seeds)||JSON.stringify(protocol.arms)!==JSON.stringify(arms))throw new Error('Protocol mismatch');
 for(const [p,hash]of Object.entries(protocol.auditHashes))if(digest(p)!==hash)throw new Error('Audit changed after freeze: '+p);
 for(const arm of arms){
  const dest=join(local,arm.id);for(const [p,hash]of Object.entries(protocol.sourceHashes[arm.id]))if(digest(join(dest,p))!==hash)throw new Error('Arm changed: '+arm.id+' '+p);
  console.error('Running '+arm.id);
  const r=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/bot-phase025-audit.ts','--source='+dest,'--seeds='+seeds.join(','),'--episodes','--out='+join(local,arm.id+'.json')],{stdio:'inherit'});
  if(r.status!==0)throw new Error('Audit failed: '+arm.id+' '+r.status);
 }
}
