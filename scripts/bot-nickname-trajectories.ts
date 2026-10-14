import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {getBotInputs} from '../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
const protocol=JSON.parse(readFileSync('../bot-inner-anchor-adoption/protocol.json','utf8'));
// Allow exactly the reviewed roster/content change; every decision source stays frozen.
const frozen=protocol.arms.find((a:any)=>a.name==='candidate');
for(const [file,hash]of Object.entries(frozen.sourceHashes))if(file!=='src/shared/bot-roster.ts')assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,file);
const rows=[];
for(const seed of protocol.seeds){
 const m=createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
 const trajectory=createHash('sha256');
 for(let t=0;t<3600;t++){
  const inputs=getBotInputs(m,memories);trajectory.update(JSON.stringify([...inputs]));stepMatch(m,inputs);
  trajectory.update(m.owners);trajectory.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));
  trajectory.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
 }
 const hash=trajectory.digest('hex'),reference=JSON.parse(readFileSync('../bot-inner-anchor-adoption/candidate-seed-'+seed+'.json','utf8')).checkpoints[0];
 assert.equal(hash,reference.trajectoryHash,'Nickname-only trajectory changed seed'+seed);
 assert.equal(m.participants.reduce((n,p)=>n+p.deaths,0),reference.deaths);
 rows.push({seed,ticks:m.tick,hash,matches:true});writeFileSync('../bot-freeze-final/nickname-trajectories.json',JSON.stringify({ticks:3600,seeds:protocol.seeds,allEqual:rows.length===protocol.seeds.length,rows},null,2)+'\n');
 console.error('Nickname trajectory seed'+seed+' PASS');
}
