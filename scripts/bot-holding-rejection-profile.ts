import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,watchBotDecisions} from '../src/shared/bot.js';
import {botSeed,createBotIdentity} from '../src/shared/bot-identity.js';
import {getBotInputs} from '../src/shared/bot-director.js';
import {setSafeBotRespawn} from '../src/shared/safe-bot-respawn.js';
const seed=19,m=createMatch({mapRadius:56,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
const rejected:Record<string,number>={},hash=createHash('sha256');let accepted=0;
for(const memory of memories.values())watchBotDecisions(memory,t=>{accepted+=t.expansionAccepted?.length??0;for(const [reason,n]of Object.entries(t.expansionRejected??{}))rejected[reason]=(rejected[reason]??0)+n;},{shadow:false});
for(let i=0;i<3600;i++){const inputs=getBotInputs(m,memories);hash.update(JSON.stringify([...inputs]));stepMatch(m,inputs);hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));}
const trajectoryHash=hash.digest('hex'),reference=JSON.parse(readFileSync('../bot-holding-review/start.json','utf8')).reports.find((r:any)=>r.seed===seed);if(trajectoryHash!==reference.trajectoryHash)throw Error('Rejection observer altered replay');
// These reasons occur after plannedCapture, unlike path/closure/launch filters.
const avoidable=(rejected.TRAIL_BUDGET??0)+(rejected.NEAR_HEAD??0),floodCandidates=accepted+avoidable+(rejected.NO_GAIN??0);
const result={seed,ticks:m.tick,accepted,rejected,avoidable,floodCandidates,avoidableFraction:floodCandidates?avoidable/floodCandidates:0,trajectoryHash,verified:true,method:'Current existing decision traces, shadow disabled; inference from existing rejection ordering, not a new behavior variant or a timing speedup.'};writeFileSync('../bot-holding-review/rejection-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
