import {auditDeaths} from '../tests/death-audit.js';
console.log(JSON.stringify([4,19,73,115,17,81,32,123].flatMap(seed=>[auditDeaths(seed),auditDeaths(seed,true)]),null,2));
