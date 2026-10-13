import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('../bot-space-shape-adoption');if(existsSync(root))throw Error('Preserve adoption outcomes');mkdirSync(root,{recursive:true});
const previous=JSON.parse(readFileSync('../bot-crowded-shape-exploration/protocol.json','utf8'));
for(const [file,hash]of Object.entries(previous.sourceHashes))assert.equal(createHash('sha256').update(readFileSync('src/shared/'+file)).digest('hex'),hash);
const definitions=[{name:'baseline',source:previous.baseline,sourceHashes:Object.fromEntries(Object.entries(previous.baselineHashes).map(([k,v])=>['src/shared/'+k,v]))},{name:'candidate',source:previous.candidate,sourceHashes:Object.fromEntries(Object.entries(previous.sourceHashes).map(([k,v])=>['src/shared/'+k,v]))}];
for(const arm of ['baseline','candidate']){
 const folder=arm==='baseline'?'../bot-open-space-analysis':'../bot-crowded-shape-exploration';
 const reports=previous.seeds.map((seed:number)=>{const r=JSON.parse(readFileSync(resolve(folder,arm+'-seed-'+seed+'.json'),'utf8'));return {seed,deaths:r.deaths.length,trajectoryHash:r.trajectoryHash};});
 writeFileSync(resolve(root,arm+'.json'),JSON.stringify({reports})+'\n');
}
const protocol={date:'2026-10-14',approval:'B-quiet+C accepted; 16case losses defer to fixed1024 attack audit if aggregate cuts do not worsen. Preserve case transitions and known costs.',baselineCommit:previous.baselineCommit,seeds:previous.seeds,ticks:7200,config:previous.config,arms:definitions,cost:'Observer-free120s,one discarded seed19 warmup per arm,3 rounds of all8seeds,AB/BA order alternating by round+seed;median round total ms/tick,paired per-seed medians. Exclude external Vitest/Playwright overlap before/after regardless of timings. Existing +20% cost recheck threshold.',recheck:{holdingPercent:-5,deathsPercent:20,costPercent:20},scope:'Only selected B-quiet+C.240s8seed,observer-free same-session cost,allVitest tests+typecheck. Existing expanded164/1024/44observer checks and actual recovery retained from byte-identical source. User spectating/player review next,then nicknames/master merge/freeze.',knownCosts:{medium16:11,newFailures:[10,13,16],recovered:[5],expandedBaseline:155,expandedCandidate:164}};
writeFileSync(resolve(root,'protocol.json'),JSON.stringify(protocol,null,2)+'\n');
copyFileSync('../bot-crowded-shape-exploration/expanded/protocol.json',resolve(root,'expanded-protocol.json'));
console.log(root);
