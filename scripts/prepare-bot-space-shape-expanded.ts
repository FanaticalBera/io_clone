import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const review=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-open-space-quiet-exploration');
const p=JSON.parse(readFileSync(resolve(review,'protocol.json'),'utf8')),root=resolve(review,'expanded');
if(existsSync(root))throw Error('Do not overwrite frozen expanded outcomes');mkdirSync(root,{recursive:true});
const baseline=JSON.parse(readFileSync('../bot-holding-risk-expanded/protocol.json','utf8'));
writeFileSync(resolve(root,'protocol.json'),JSON.stringify({...baseline,source:p.candidate,sourceCommit:p.baseCommit,sourceHashes:p.sourceHashes,stage:p.stage,comparisonBaseline:resolve('../bot-holding-risk-expanded/results.json'),legacy16:{cuts:13,failures:[5,6,14],unchanged:true},status:'FROZEN_BEFORE_CANDIDATE_PREFLIGHT_AND_RESULTS'},null,2)+'\n');
console.log(root);
