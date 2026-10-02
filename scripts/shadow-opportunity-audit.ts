import {auditDeaths} from '../tests/death-audit.js';
// Same ordinary movement and rosters as the death audit. The opt-in observer
// measures counterfactual opportunities, but never sends inputs or sets goals.
const reports=[4,19,73,115,17,81,32,123].flatMap(seed=>[false,true].map(mixed=>{
 const {traces,...report}=auditDeaths(seed,mixed,3600,true);return report;
}));
console.log(JSON.stringify(reports,null,2));
