import {auditDeaths} from '../death-audit.js';
import {DEFAULT_CONFIG} from '../../src/shared/config.js';
import {mkdirSync,writeFileSync} from 'node:fs';

// Current production rules, without changing ownership/trails to manufacture incidents.
// This is a shared-engine audit, not a replay of a user's single-player or LAN session.
const runs=[];
for(const mixed of [false,true])for(const seed of [4,137]){
 const result=auditDeaths(seed,mixed,1800,false,14,true,true,DEFAULT_CONFIG);
 const run={seed,mixed,ticks:result.ticks,deaths:result.deaths,causes:result.causes,failures:result.failures};
 runs.push(run);console.log(JSON.stringify(run));
}
mkdirSync('artifacts/contact-audit',{recursive:true});
writeFileSync('artifacts/contact-audit/engine-audit.json',JSON.stringify({config:DEFAULT_CONFIG,condition:'Normal shared-engine simulation; scripted human input; not a user incident replay',runs},null,2));
if(runs.some(run=>run.failures.length))process.exitCode=1;
