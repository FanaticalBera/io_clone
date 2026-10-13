import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=resolve('../bot-quiet-growth-review'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const modules=await Promise.all([protocol.candidate,protocol.off].map(async source=>{const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);const [game,bot,strategy,diagnostics,hex]=await Promise.all(['game','bot','bot-strategy','bot-candidate-diagnostics','hex'].map(load));return {game,bot,strategy,diagnostics,hex};}));
let checks=0,originals=0,extras=0;
for(const personality of ['EXPAND','ATTACK','DEFEND','SEEK_POINT'])for(let seed=1;seed<=32;seed++){
 const batches=modules.map(({game,bot,strategy,diagnostics,hex})=>{
  const m=game.createMatch({mapRadius:22},73,bot.botSpecs(1)),p=m.participants[0];p.personality=personality;p.cellId=m.map.byKey.get('6,0');p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};m.owners.fill(0);for(const cell of m.map.cells)if(hex.hexDistance(cell,{q:0,r:0})<=6)m.owners[cell.id]=p.slot+1;p.territoryCount=127;
  const memory=bot.createBotMemory(seed);let batch:any;diagnostics.watchBotCandidates(memory,(_obs:any,b:any)=>{if(b.kind==='STRATEGY')batch=b;});strategy.planExpansion(bot.observeBot(m,p.participantId),memory);assert(batch);return batch;
 });
 const [on,off]=batches,normal=on.candidates.filter((c:any)=>!c.expansion?.quietLarge);assert.deepEqual(normal,off.candidates);originals+=normal.length;extras+=on.candidates.length-normal.length;checks++;
}
writeFileSync(resolve(root,'pool-proof.json'),JSON.stringify({checks,originals,extras,originalPathScoreGeometryOrdinalAndOrderIdentical:true,randomGeometry:'Original generation and scoring draws finish before additional candidates; full gate-off eight-seed proof separately checks RNG'},null,2)+'\n');console.log({checks,originals,extras});
