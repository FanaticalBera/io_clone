import {auditDeaths} from '../tests/death-audit.js';
import {summarizeDeaths} from './diagnostic-summary.js';
const reports=[4,19,73,115,17,81,32,123].flatMap(seed=>[auditDeaths(seed),auditDeaths(seed,true)]);
console.log(JSON.stringify(process.argv.includes('--raw')?reports:summarizeDeaths(reports),null,2));
