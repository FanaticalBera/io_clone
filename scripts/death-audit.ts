import {auditDeaths} from '../tests/death-audit.js';
import {summarizeDeaths} from './diagnostic-summary.js';
const total=Number(process.argv.find(arg=>arg.startsWith('--bots='))?.split('=')[1]??8),phase01=process.argv.includes('--phase01');
const reports=[4,19,73,115,17,81,32,123].flatMap(seed=>[auditDeaths(seed,false,3600,false,total,phase01),auditDeaths(seed,true,3600,false,total,phase01)]);
console.log(JSON.stringify(process.argv.includes('--raw')?reports:summarizeDeaths(reports),null,2));
