import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-quiet-growth-review'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8')),results=[];
for(const arm of protocol.arms??['baseline','candidate']){
 const source=protocol.arms?protocol[arm]:arm==='baseline'?protocol.native:protocol.candidate,load=(f:string)=>import(pathToFileURL(resolve(source,'src/shared',f+'.ts')).href);
 const [game,bot,identity,territory,emotion,diagnostics]=await Promise.all(['game','bot','bot-identity','territory','bot-emotion','bot-reclaim-diagnostics'].map(load));
 const m=game.createMatch({mapRadius:28},19,bot.botSpecs(3)),[a,b,c]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 for(const p of m.participants)territory.neutralizeTerritory(m,p);a.personality='DEFEND';a.cellId=id(0);b.cellId=id(25);c.cellId=id(-25);
 for(const p of m.participants){p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};territory.setOwner(m,p.cellId,p.slot+1);}
 for(let q=0;q<=14;q++)for(let r=-2;r<=2;r++)territory.setOwner(m,id(q,r),a.slot+1);
 const memory=bot.createBotMemory(19,'combined',identity.createBotIdentity(19,'DEFEND',{secondaryTrait:'Territorial'}));emotion.updateBotEmotion(bot.observeBot(m,a.participantId),memory.emotion,memory.identity);memory.plannedLifeId=a.lifeId;
 for(const q of [17,18])for(const r of [-1,0,1]){const cell=id(q,r);territory.setOwner(m,cell,b.slot+1);memory.emotion.damage.regions.set(cell,{attackerId:b.participantId,tick:0});}memory.emotion.damage.recent.set(b.participantId,[{tick:0,cells:6,observedCells:0}]);
 const closed:any[]=[],plans:any[]=[],tracker=new diagnostics.BotReclaimDiagnostics(m,new Map([[a.participantId,memory]]));tracker.onClose=(r:any)=>closed.push(r);let arrived=false;
 bot.watchBotDecisions(memory,(t:any)=>{tracker.decision(a.participantId,t);if(t.expansionPlan)plans.push({tick:t.tick,plan:t.expansionPlan,observedHeads:bot.observeBot(m,a.participantId).others.length,location:{q:m.map.cells[a.cellId].q,r:m.map.cells[a.cellId].r}});},{shadow:false});
 for(let tick=0;tick<750;tick++){const input=bot.getBotInput(bot.observeBotForTick(m,a.participantId,memory),memory);if(input)game.stepMatch(m,new Map([[a.participantId,input]]));tracker.afterTick();if(memory.reposition.last?.outcome==='ARRIVED')arrived=true;if(closed.some(r=>r.actualCellIds.length))break;}
 results.push({arm,ticks:m.tick,arrived,lastReposition:memory.reposition.last,actualRecovered:closed.reduce((n,r)=>n+r.actualCellIds.length,0),deaths:a.deaths,deathReason:a.deathReason,deathContext:a.deathContext,finalHoldings:a.territoryCount,plans,closed});tracker.dispose();
}
writeFileSync(resolve(root,'recovery-regression.json'),JSON.stringify({case:'Unchanged bot-reposition.test.ts actual movement recovery fixture,750 ticks. No threshold/test relaxation.',results},null,2)+'\n');console.log(results.map(({plans,closed,...r})=>r));
