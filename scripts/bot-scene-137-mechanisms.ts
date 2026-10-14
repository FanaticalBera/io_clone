import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('../bot-scene-137-mechanisms');
if(existsSync(root))throw Error('Preserve prior evidence');mkdirSync(root,{recursive:true});
const protocol=JSON.parse(readFileSync('../bot-space-shape-adoption/protocol.json','utf8'));
const source=protocol.arms.find((a:any)=>a.name==='candidate').source;
const load=(f:string)=>import(pathToFileURL(resolve(source,'src/shared',f+'.ts')).href);
const [game,bot,identity,director,respawn,hex,life,capture]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn','hex','life','capture-diagnostics'].map(load));
const match=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},137,bot.botSpecs(14,0,'bot',{seed:137}));
respawn.setSafeBotRespawn(match,true);
const memories=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(137,p.slot),'combined',identity.createBotIdentity(identity.botSeed(137,p.slot),p.personality))]));
const losses:number[]=Array(14).fill(0),gains:number[]=Array(14).fill(0),deaths:any[]=[],prunes:any[]=[],reachability:any[]=[];
const targeted=(slot:number)=>slot===7&&match.tick>=1500&&match.tick<9500||slot===1&&match.tick>=14000&&match.tick<=19000;
const location=(cellId:number)=>{const c=match.map.cells[cellId];return {cellId,q:c.q,r:c.r};};
life.watchDeaths(match,(t:any)=>{const p=match.participants.find((p:any)=>p.participantId===t.victimId);deaths.push({tick:match.tick,slot:p.slot,nickname:p.nickname,life:p.lifeId,cause:t.context?.cause??t.reason,killer:match.participants.find((p:any)=>p.participantId===t.killerId)?.slot,...location(p.cellId),goal:memories.get(p.participantId).goal,trail:t.trailCells.length});});
capture.watchCaptureTransfers(match,(t:any)=>{for(const gain of t.gains){const attacker=match.participants.find((p:any)=>p.participantId===gain.participantId);gains[attacker.slot]+=gain.cells.length;for(const c of gain.cells)if(c.previousOwner>0)losses[c.previousOwner-1]++;}});
function inspectReachability(p:any){
 const memory=memories.get(p.participantId),damage=memory.emotion.damage,owner=p.slot+1;
 if(match.owners[p.cellId]!==owner)return;
 const distances=new Map<number,number>([[p.cellId,0]]),queue=[p.cellId];
 for(let i=0;i<queue.length;i++){const id=queue[i],depth=distances.get(id)!;for(const n of match.map.cells[id].neighbors)if(n>=0&&match.owners[n]===owner&&!distances.has(n)){distances.set(n,depth+1);queue.push(n);}}
 const eligible=new Set<string>();
 for(const region of damage.regions.values())if((damage.recent.get(region.attackerId)??[]).filter((s:any)=>s.tick>match.tick-300).reduce((n:number,s:any)=>n+s.cells,0)>=6||(memory.emotion.grudge.get(region.attackerId)?.amount??0)>=6)eligible.add(region.attackerId);
 const targets=new Set<number>();
 for(const [id,region]of damage.regions){if(!eligible.has(region.attackerId))continue;const seen=new Set([id]),near=[id];for(let i=0;i<near.length;i++){const current=near[i],cell=match.map.cells[current];if(match.owners[current]===owner&&cell.neighbors.some((n:number)=>n>=0&&match.owners[n]!==owner))targets.add(current);for(const n of cell.neighbors)if(n>=0&&!seen.has(n)&&hex.hexDistance(match.map.cells[id],match.map.cells[n])<=3){seen.add(n);near.push(n);}}}
 const routes=[...targets].map(id=>({id,distance:distances.get(id)??null}));
 reachability.push({tick:match.tick,slot:p.slot,...location(p.cellId),damage:damage.regions.size,targets:targets.size,within10:routes.filter(x=>x.distance!==null&&x.distance<11).length,within11to20:routes.filter(x=>x.distance!==null&&x.distance>=11&&x.distance<=20).length,beyond20:routes.filter(x=>x.distance!==null&&x.distance>20).length,disconnected:routes.filter(x=>x.distance===null).length,minOwnedRoute:Math.min(...routes.flatMap(x=>x.distance===null?[]:[x.distance])),selection:memory.reposition.selection?.reason});
}
const hash=createHash('sha256');let prefixHash='';
for(let tick=0;tick<20001;tick++){
 losses.fill(0);gains.fill(0);
 const before=match.participants.map((p:any)=>({holding:p.territoryCount,life:p.lifeId,alive:p.lifeState==='ALIVE'}));
 const inputs=director.getBotInputs(match,memories);
 if(match.tick<3600)hash.update(JSON.stringify([...inputs]));
 if(match.tick%300===0)for(const p of match.participants)if(targeted(p.slot))inspectReachability(p);
 game.stepMatch(match,inputs);
 for(const p of match.participants)if(targeted(p.slot)&&before[p.slot].alive&&p.lifeState==='ALIVE'&&before[p.slot].life===p.lifeId){const extra=before[p.slot].holding+gains[p.slot]-losses[p.slot]-p.territoryCount;if(extra>0)prunes.push({tick:match.tick-1,slot:p.slot,before:before[p.slot].holding,after:p.territoryCount,directLoss:losses[p.slot],gain:gains[p.slot],neutralized:extra,...location(p.cellId)});}
 if(match.tick<=3600){hash.update(match.owners);hash.update(Buffer.from(match.trailMasks.buffer,match.trailMasks.byteOffset,match.trailMasks.byteLength));hash.update(JSON.stringify(match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(match.tick===3600)prefixHash=hash.digest('hex');}
}
assert.equal(prefixHash,JSON.parse(readFileSync('../bot-space-shape-adoption/candidate-seed-137.json','utf8')).checkpoints[0].trajectoryHash);
const result={prefixHash,prefixMatches:true,deaths,prunes,reachability};
writeFileSync(resolve(root,'candidate.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({prefixMatches:true,slot9Deaths:deaths.filter(d=>d.slot===9),nearbyDeaths:deaths.filter(d=>d.tick>=13500&&d.tick<=16000),prunes:prunes.filter(p=>p.neutralized>=20),reachability}));
