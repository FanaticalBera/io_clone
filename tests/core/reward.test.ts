import {describe,it,expect} from 'vitest';
import {calculateReward} from '../../src/client/reward.js';
import {emptyProfile,validProfile,admitRun,grantProfileReward,closeProfileWorld} from '../../src/client/profile.js';
import type {RunResult} from '../../src/shared/model.js';
import {createMatch} from '../../src/shared/game.js';
import {markDead} from '../../src/shared/life.js';
import {retryHumanRun} from '../../src/shared/retry.js';
function run(cells=21,kills=0,lifeId=1,endReason:RunResult['endReason']='DEATH'):RunResult{return{runId:'m:h:life:'+lifeId,matchId:'m',participantId:'h',lifeId,endReason,startedAtTick:30,endedAtTick:330,durationTicks:300,simulationHz:30,mapCellCount:1000,kills,bestTerritoryCells:cells,bestTerritoryPercent:cells/10};}
const admission=(lifeId=1)=>({matchId:'m',participantId:'h',lifeId,initialTerritoryCells:7,ownerId:'tab'});
describe('Coins formula and progress eligibility',()=>{
 it.each([[21,0,'DEATH',9],[187,3,'DEATH',51],[462,8,'DEATH',121],[1000,12,'FULL_CAPTURE_WIN',335],[1000,12,'FULL_CAPTURE_LOSS',235]] as const)('pays %s cells / %s kills / %s = %s', (cells,kills,reason,total)=>expect(calculateReward(run(cells,kills,1,reason)).totalCoins).toBe(total));
 it('pays zero for starting territory, independent of survival duration',()=>{const r=run(7);r.durationTicks=300000;r.endedAtTick=r.startedAtTick+r.durationTicks;expect(calculateReward(r).totalCoins).toBe(0);expect(calculateReward(run(19),19).totalCoins).toBe(0);expect(calculateReward(run(7,1)).totalCoins).toBe(9);});
 it('rejects corrupt, nonfinite and mismatched identity input',()=>{for(const patch of [{kills:-1},{kills:NaN},{simulationHz:0},{runId:'other'},{durationTicks:Infinity},{bestTerritoryPercent:50}])expect(()=>calculateReward({...run(),...patch})).toThrow();});
});
describe('Profile ledger',()=>{
 it('applies coins, seconds-normalized stats and dedup together',()=>{const p=emptyProfile();admitRun(p,admission());expect(grantProfileReward(p,run()).status).toBe('granted');const saved=structuredClone(p);expect(p.coins).toBe(9);expect(p.stats).toMatchObject({runsPlayed:1,longestRunSeconds:10,bestTerritoryPercent:2.1});expect(grantProfileReward(p,run()).status).toBe('duplicate');expect(p).toEqual(saved);});
 it('records a zero coin Run once',()=>{const p=emptyProfile();grantProfileReward(p,run(7),admission());grantProfileReward(p,run(7));expect(p.coins).toBe(0);expect(p.stats.runsPlayed).toBe(1);});
 it('keeps dedup after details are trimmed beyond 256 Runs',()=>{const p=emptyProfile();for(let life=1;life<=300;life++)grantProfileReward(p,run(21,0,life),admission(life));expect(p.processedRuns).toHaveLength(256);expect(p.coins).toBe(2700);expect(grantProfileReward(p,run()).status).toBe('duplicate');expect(p.coins).toBe(2700);expect(p.stats.runsPlayed).toBe(300);});
 it('will not admit ended unknown worlds or reopen retired worlds',()=>{const p=emptyProfile();expect(grantProfileReward(p,run()).status).toBe('ignored');admitRun(p,admission());closeProfileWorld(p,'m','h','tab');expect(grantProfileReward(p,run(),admission()).status).toBe('ignored');});
 it('bounds retired worlds without accepting an old result',()=>{const p=emptyProfile();for(let i=0;i<40;i++){const a={...admission(),matchId:'world'+i};admitRun(p,a);closeProfileWorld(p,a.matchId,'h','tab');}expect(p.worlds).toHaveLength(32);expect(grantProfileReward(p,{...run(),matchId:'world0',runId:'world0:h:life:1'}).status).toBe('ignored');});
 it('rejects corrupt profiles and prevents partial integer overflow',()=>{expect(validProfile('broken JSON')).toBe(false);expect(validProfile({...emptyProfile(),coins:-1})).toBe(false);const p=emptyProfile();p.coins=Number.MAX_SAFE_INTEGER;admitRun(p,admission());const before=structuredClone(p);expect(()=>grantProfileReward(p,run())).toThrow();expect(p).toEqual(before);});
 it('rewards two actual engine Runs in the same world without changing gameplay',()=>{const m=createMatch({},4,[{participantId:'h',nickname:'H',slot:0,kind:'HUMAN'}]),h=m.participants[0],p=emptyProfile();h.kills=1;markDead(m,h,'WALL_HIT');const first=structuredClone(m);grantProfileReward(p,h.run!.result!,{...admission(),matchId:m.matchId});expect(m).toEqual(first);expect(retryHumanRun(m,h)).toBe(true);h.kills++;markDead(m,h,'WALL_HIT');const second=structuredClone(m);grantProfileReward(p,h.run!.result!,{...admission(2),matchId:m.matchId});expect(m).toEqual(second);expect(p.stats.runsPlayed).toBe(2);expect(p.stats.totalKills).toBe(2);});
});
