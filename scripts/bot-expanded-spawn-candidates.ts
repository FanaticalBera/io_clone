// Select by public initial geometry only. Never runs getBotInput or a human loop.
import {createMatch} from '../src/shared/game.js';
import {createMap,hexDistance} from '../src/shared/hex.js';
import {seededRandom,shuffled} from '../src/shared/random.js';
import {writeFileSync} from 'node:fs';
const map=createMap(22),candidates=new Map<string,any>();
for(let seed=0;seed<=4095;seed++){
 const anchors=shuffled(map.anchors,seededRandom(seed^0x51a7)),h=map.cells[anchors[0]],b=map.cells[anchors[1]],key=[h.id,b.id].join(':');
 if(!candidates.has(key))candidates.set(key,{minimumMatchSeed:seed,human:{q:h.q,r:h.r,cell:h.id},bot:{q:b.q,r:b.r,cell:b.id},distance:hexDistance(h,b)});
}
const rows=[...candidates.values()].sort((a,b)=>a.distance-b.distance||a.minimumMatchSeed-b.minimumMatchSeed);
for(const row of rows){
 const m=createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},row.minimumMatchSeed,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality:'ATTACK'}]);
 if(m.participants[0].cellId!==row.human.cell||m.participants[1].cellId!==row.bot.cell)throw Error('Native createMatch layout mismatch');
}
const result={status:'GEOMETRY_CANDIDATES_ONLY_NO_ATTACK_RESULTS',rule:'Scan integers 0..4095 in ascending order; one minimum seed per ordered human/bot spawn pair; verify each pair via native createMatch. Selection may use distance and pair uniqueness only.',config:{radius:22,maxSlots:8,spawnRadius:2,humanSlot:0,botSlot:1},distanceSet:[...new Set(rows.map(r=>r.distance))],requestedTargets:[5,7,9,11],tolerance:1,availableNearTargets:[5,12],unavailableTargets:[7,9],rows};
const out=process.argv.find(v=>v.startsWith('--out='))?.slice(6);if(out)writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({distanceSet:result.distanceSet,near:rows.filter(r=>r.distance<=12),farFirst:rows.find(r=>r.distance>=17)}));
