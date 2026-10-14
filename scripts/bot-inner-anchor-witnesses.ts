import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {runMediumAttack} from '../tests/medium-attack-fixture.js';
import {runRepeatedTheft} from '../tests/bot-damage-fixture.js';
function checkCut(f:ReturnType<typeof runMediumAttack>){
 assert(f.attackTicks>0);assert(f.maxTrail>=2&&f.maxTrail<=6);assert.equal(f.captures,0);
 assert.equal(f.human.lifeState,'ELIMINATED');assert.equal(f.human.deathReason,'TRAIL_CUT');assert.equal(f.human.deaths,1);
 const death=f.match.events.find(e=>e.type==='DEATH'&&e.participantId===f.human.participantId)!;
 assert.equal(death.killerId,f.bot.participantId);assert.equal(death.deathContext?.cause,'EXISTING_TRAIL_CONTACT');
 assert.equal(f.bot.kills,1);assert.equal(f.human.trailCells.size,0);assert(!f.match.trailMasks.some(mask=>(mask&(1<<f.human.slot))!==0));
}
const rows=[];
for(let seed=1;seed<=5;seed++){
 const f=runMediumAttack('SEEK_POINT',false,false,seed);let allOriginalAssertionsPass=true;try{checkCut(f);}catch{allOriginalAssertionsPass=false;}
 rows.push({seed,reverse:false,tick:f.match.tick,attackTicks:f.attackTicks,maxTrail:f.maxTrail,humanCaptures:f.captures,humanState:f.human.lifeState,kills:f.bot.kills,allOriginalAssertionsPass});
}
assert.equal(rows.find(r=>r.seed===2)!.allOriginalAssertionsPass,false);assert.equal(rows.find(r=>r.allOriginalAssertionsPass)!.seed,5);
const reverse=runMediumAttack('SEEK_POINT',true,false,5);checkCut(reverse);
const recovery=runRepeatedTheft(19,true,true);
assert.deepEqual(recovery.captures.filter(c=>c.slot===1).map(c=>c.cells),[4,4]);assert.equal(recovery.stolen,8);assert(recovery.reclaimed>0);assert(recovery.match.participants.every(p=>p.deaths===0));
const result={selectionRule:'First memorySeed 1..256 passing all unchanged actual-cut assertions; 1..5 suffice to verify first pass5',normal:rows,reverse:{seed:5,tick:reverse.match.tick,allOriginalAssertionsPass:true},recovery:{stolen:recovery.stolen,reclaimed:recovery.reclaimed,deaths:recovery.match.participants.map(p=>p.deaths),repositionSequence:recovery.memory.reposition.sequence}};
writeFileSync('../bot-inner-anchor-adoption/witnesses.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
