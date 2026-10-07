import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {runSeed} from './classic-100-validation.js';

const output=resolve('.local/classic-100-validation/isolated-timing.json');
const warmup=runSeed({seed:1,minutes:1,instrument:false});
const measured=runSeed({seed:1,minutes:2,instrument:false});
const data={createdAt:new Date().toISOString(),condition:'Observer-free desktop elapsed time; run after experiment workers exit',warmup:{seed:1,simulationSeconds:warmup.simulationSeconds},
 measured:{seed:1,simulationSeconds:measured.simulationSeconds,wallSeconds:measured.wallSeconds,timing:measured.timing,hash:measured.hash}};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(data,null,2));
console.log(JSON.stringify(data,null,2));
