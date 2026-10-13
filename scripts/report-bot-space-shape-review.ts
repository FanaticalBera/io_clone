import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {expansionSides} from '../src/shared/bot-expansion.js';
import {hexDistance} from '../src/shared/hex.js';

const baseRoot=resolve('../bot-open-space-analysis'),bRoot=resolve('../bot-open-space-quiet-exploration'),cRoot=resolve('../bot-crowded-shape-exploration');
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const p=read(resolve(bRoot,'protocol.json')),seeds:number[]=p.seeds;
const sum=(xs:number[])=>xs.reduce((n,v)=>n+v,0),mean=(xs:number[])=>xs.length?sum(xs)/xs.length:0;
function distribution(xs:number[]){
 const sorted=[...xs].sort((a,b)=>a-b),q=(x:number)=>sorted[Math.ceil(x*sorted.length)-1]??null;
 return {count:xs.length,total:sum(xs),mean:mean(xs),median:q(.5),p90:q(.9),max:sorted.at(-1)??null,
  bins:[0,4,8,16,32,64,128].map((from,i,limits)=>({from,to:limits[i+1]??null,count:xs.filter(x=>x>=from&&(limits[i+1]===undefined||x<limits[i+1])).length}))};
}
function movement(events:any[],include:(e:any)=>boolean=()=>true){
 const previous=new Map<string,any>(),directions=Array(6).fill(0),shifts:number[]=[];
 let pairs=0,sameShape=0,sameSize=0,sameLegs=0,sameActualPath=0,pathPairs=0,reconstructedPaths=0;
 const legs=(g:any)=>JSON.stringify(expansionSides(g.shape,0,g.length,g.width,g.bevel));
 const path=(e:any)=>{
  if(e.canonicalPath)return e.canonicalPath;
  // The first B collector sliced after a closing return to the launch cell
  // when prefix was empty. For a RHOMBUS this exact path is its first N legs.
  // Recover that recorded case without rerunning or relabelling other shapes.
  if(e.canonicalPath===''&&e.geometry?.shape==='RHOMBUS'){
   const directions=expansionSides('RHOMBUS',0,e.geometry.length,e.geometry.width,0).flatMap(([d,n])=>Array(n).fill(d));
   assert(e.path<=directions.length);reconstructedPaths++;return directions.slice(0,e.path).join(',');
  }
  return null;
 };
 for(const e of events){
  if(include(e)&&e.direction>=0)directions[e.direction]++;
  const key=e.seed+':'+e.slot,last=previous.get(key);
  if(last&&last.life===e.life&&include(last)&&include(e)){
   pairs++;const a=last.geometry,b=e.geometry;
   if(a.shape===b.shape)sameShape++;
   if(legs(a)===legs(b)){sameLegs++;if(a.shape===b.shape)sameSize++;}
   const ap=path(last),bp=path(e);if(ap!==null&&bp!==null){pathPairs++;if(ap===bp)sameActualPath++;}
   shifts.push(hexDistance(last,e));
  }
  previous.set(key,e);
 }
 return {departures:events.filter(include).length,directions,pairs,sameShape,sameShapeRate:pairs?sameShape/pairs:null,
  sameShapeSize:sameSize,sameShapeSizeRate:pairs?sameSize/pairs:null,sameLegsIgnoringNameRate:pairs?sameLegs/pairs:null,
  actualPathComparablePairs:pathPairs,sameActualPathRate:pathPairs?sameActualPath/pathPairs:null,reconstructedPaths,launchShift:distribution(shifts),
  shapes:Object.fromEntries([...new Set(events.filter(include).map(e=>e.geometry.shape))].map(shape=>[shape,events.filter(e=>include(e)&&e.geometry.shape===shape).length]))};
}
function arm(name:string,root:string,fileArm:string){
 const reports=seeds.map(seed=>read(resolve(root,fileArm+'-seed-'+seed+'.json'))),events:any[]=reports.flatMap((r:any)=>r.departures.map((d:any)=>({...d,seed:r.seed})));
 if(name==='master'){
  const histories=new Map<string,any[]>();
  for(const r of reports)for(const t of r.strategyRows){const key=r.seed+':'+t.slot;if(!histories.has(key))histories.set(key,[]);histories.get(key)!.push(t);}
  for(const d of events){const history=histories.get(d.seed+':'+d.slot)!;let i=history.length-1;while(i>=0&&(history[i].tick>=d.tick||history[i].life!==d.life))i--;assert(history[i]?.applied);d.crowded=history[i].crowded;d.heads=history[i].heads;}
 }
 for(const d of events.filter(e=>e.crowded)){
  assert(d.external<=6);assert(d.geometry.length>=1&&d.geometry.length<=2);assert.equal(d.geometry.width,1);
 }
 const medium=read(resolve(name==='master'?baseRoot:root,name==='master'?'medium.json':'candidate-medium.json'));
 const failed:number[]=medium.flatMap((r:any,i:number)=>r.confirmedTrailCut?[]:[i+1]);
 return {name,holding:mean(reports.map((r:any)=>r.holding.total.timeAverageCells)),deaths:sum(reports.map((r:any)=>r.deaths.length)),
  capture:distribution(reports.flatMap((r:any)=>r.captures.map((c:any)=>c.cells))),movement:movement(events),crowded:movement(events,e=>e.crowded),
  perSeed:reports.map((r:any)=>({seed:r.seed,holding:r.holding.total.timeAverageCells,deaths:r.deaths.length,capture:distribution(r.captures.map((c:any)=>c.cells)),crowded:movement(events.filter(d=>d.seed===r.seed),e=>e.crowded),trajectoryHash:r.trajectoryHash})),
  byRole:['EXPAND','ATTACK','DEFEND','SEEK_POINT'].map(role=>({role,movement:movement(events.filter(d=>d.personality===role)),crowded:movement(events.filter(d=>d.personality===role),e=>e.crowded)})),
  medium:{cuts:16-failed.length,failed}};
}
const master=arm('master',baseRoot,'baseline'),b=arm('B-quiet',bRoot,'candidate'),c=arm('B-quiet+C',cRoot,'candidate');
const signal=(deltas:number[])=>{
 const positive=deltas.filter(v=>v>0).length,negative=deltas.filter(v=>v<0).length,total=sum(deltas),loo=deltas.map(v=>total-v);
 return {positive,negative,tied:8-positive-negative,total,leaveOneOut:loo,direction:positive>=7&&loo.every(v=>v>0)?'INCREASE':negative>=7&&loo.every(v=>v<0)?'DECREASE':'INDISTINGUISHABLE'};
};
function compare(a:typeof master,z:typeof master){
 const paired=a.perSeed.map((r:any,i:number)=>{const s=z.perSeed[i];return {seed:r.seed,holdingBefore:r.holding,holdingAfter:s.holding,holdingDelta:s.holding-r.holding,holdingPercent:100*(s.holding/r.holding-1),deathsBefore:r.deaths,deathsAfter:s.deaths,deathsDelta:s.deaths-r.deaths,crowdedRepeatBefore:r.crowded.sameShapeSizeRate,crowdedRepeatAfter:s.crowded.sameShapeSizeRate};});
 return {from:a.name,to:z.name,holdingPercent:100*(z.holding/a.holding-1),deathPercent:100*(z.deaths/a.deaths-1),holdingSignal:signal(paired.map((r:any)=>r.holdingDelta)),deathSignal:signal(paired.map((r:any)=>r.deathsDelta)),
  crowdedRepeatSignal:signal(paired.map((r:any)=>r.crowdedRepeatAfter-r.crowdedRepeatBefore)),newMediumLosses:z.medium.failed.filter(id=>!a.medium.failed.includes(id)),recoveredMedium:a.medium.failed.filter(id=>!z.medium.failed.includes(id)),paired};
}
const comparisons=[compare(master,b),compare(b,c),compare(master,c)];
const oldExpanded=read('../bot-holding-risk-expanded/results.json'),expanded=read(resolve(bRoot,'expanded/results.json'));
assert.equal(oldExpanded.results.length,1024);assert.equal(expanded.results.length,1024);
const oldCases=new Map<string,any>(oldExpanded.results.map((r:any)=>[r.id,r]));
for(const r of expanded.results)assert(oldCases.has(r.id));
const expandedCheck={baselineCuts:oldExpanded.results.filter((r:any)=>r.cut).length,candidateCuts:expanded.results.filter((r:any)=>r.cut).length,
 lost:expanded.results.filter((r:any)=>oldCases.get(r.id).cut&&!r.cut).map((r:any)=>r.id),gained:expanded.results.filter((r:any)=>!oldCases.get(r.id).cut&&r.cut).map((r:any)=>r.id),
 observerEquivalentChecks:expanded.observerChecks.length,legacy16:expanded.legacy16,
 byLayout:read(resolve(bRoot,'expanded/protocol.json')).axes.layouts.map((l:any)=>({matchSeed:l.minimumMatchSeed,distance:l.distance,cases:128,before:oldExpanded.results.filter((r:any)=>r.matchSeed===l.minimumMatchSeed&&r.cut).length,after:expanded.results.filter((r:any)=>r.matchSeed===l.minimumMatchSeed&&r.cut).length})),
 byRole:['DEFEND','ATTACK','EXPAND','SEEK_POINT'].map(role=>({role,cases:256,before:oldExpanded.results.filter((r:any)=>r.personality===role&&r.cut).length,after:expanded.results.filter((r:any)=>r.personality===role&&r.cut).length}))};
const cExpanded=read(resolve(cRoot,'expanded/results.json'));
assert.equal(cExpanded.results.length,1024);
const expandedC={baselineCuts:expandedCheck.candidateCuts,candidateCuts:cExpanded.results.filter((r:any)=>r.cut).length,
 lost:cExpanded.results.filter((r:any)=>oldCases.get(r.id).cut&&!r.cut).map((r:any)=>r.id),gained:cExpanded.results.filter((r:any)=>!oldCases.get(r.id).cut&&r.cut).map((r:any)=>r.id),observerEquivalentChecks:cExpanded.observerChecks.length,legacy16:cExpanded.legacy16,
 byRole:['DEFEND','ATTACK','EXPAND','SEEK_POINT'].map(role=>({role,cases:256,before:expanded.results.filter((r:any)=>r.personality===role&&r.cut).length,after:cExpanded.results.filter((r:any)=>r.personality===role&&r.cut).length}))};
const checks=[bRoot,cRoot].map(root=>({root:root.split(/[\\/]/).at(-1),probe:read(resolve(root,'probe.json')),recovery:read(resolve(root,'recovery-regression.json')).results.map((r:any)=>({arm:r.arm,arrived:r.arrived,arrivalTick:r.lastReposition.endedTick,captureTick:r.ticks,cells:r.actualRecovered,deaths:r.deaths}))}));
assert.equal(master.medium.cuts,13);assert.deepEqual(master.medium.failed,[5,6,14]);
assert(checks.every(r=>r.probe.allEqual));
const bPass=!comparisons[0].newMediumLosses.length&&!expandedCheck.lost.length&&checks[0].recovery.every((r:any)=>r.cells===5&&r.deaths===0)&&comparisons[0].holdingPercent>=-5&&comparisons[0].deathPercent<=20;
const cPass=!comparisons[1].newMediumLosses.length&&checks[1].recovery.every((r:any)=>r.cells===5&&r.deaths===0)&&comparisons[1].holdingPercent>=-5&&comparisons[1].deathPercent<=20;
const result={date:'2026-10-13',seeds,durationSeconds:120,baseline:'master6578389',arms:[master,b,c],comparisons,expandedB:expandedCheck,expandedC,checks,
 decision:{bExplorationPass:bPass,cExplorationPass:cPass,finalExplorationCandidate:bPass?(cPass?'B-quiet+C':'B-quiet'):'master',notAdopted:true},
 scope:'Expanded1024 added to this exploration for both revised B and C. No240s/cost/full-suite/user-play. No safety thresholds changed. No nickname application,master modification or push.'};
const out='evidence/bot-space-shape-review';mkdirSync(out,{recursive:true});
writeFileSync(resolve(cRoot,'review-summary.json'),JSON.stringify(result,null,2)+'\n');
const thinDistribution=(d:any)=>{const {bins,total,...stats}=d;return stats;};
const thinMovement=(m:any)=>({...m,launchShift:thinDistribution(m.launchShift)});
const compact={...result,arms:result.arms.map(a=>({...a,movement:thinMovement(a.movement),crowded:thinMovement(a.crowded),perSeed:a.perSeed.map((r:any)=>({...r,capture:thinDistribution(r.capture),crowded:thinMovement(r.crowded)})),byRole:a.byRole.map((r:any)=>({...r,movement:thinMovement(r.movement),crowded:thinMovement(r.crowded)}))}))};
writeFileSync(out+'/summary.json',JSON.stringify(compact,null,2)+'\n');
for(const [name,root]of [['B-quiet',bRoot],['C',cRoot]]){
 const {baseline,candidate,audit,baselineRaw,...publicProtocol}=read(resolve(root,'protocol.json'));
 writeFileSync(out+'/'+name+'-protocol.json',JSON.stringify(publicProtocol,null,2)+'\n');
}
const fmt=(v:number)=>v.toFixed(2),pct=(v:number)=>fmt(v)+'%',rate=(v:number|null)=>v===null?'결측':pct(v*100);
const table=(m:any)=>m.paired.map((r:any)=>`|${r.seed}|${fmt(r.holdingBefore)} → ${fmt(r.holdingAfter)}|${pct(r.holdingPercent)}|${r.deathsBefore} → ${r.deathsAfter}|${rate(r.crowdedRepeatBefore)} → ${rate(r.crowdedRepeatAfter)}|`).join('\n');
const roleTable=c.byRole.map((r:any)=>`|${r.role}|${r.crowded.departures}|${Object.entries(r.crowded.shapes).map(([s,n])=>s+': '+n).join(', ')}|${rate(r.crowded.sameShapeSizeRate)}|`).join('\n');
writeFileSync('docs/bot-ai-space-shape-review.md',`# 수정 B와 C 작은 모양: 탐색 결과\n\n2026-10-13. 최종 탐색 후보는 **${result.decision.finalExplorationCandidate}**다. 실제 채택·플레이 검증 완료를 뜻하지 않는다. 수정 B는 통과해 그 위에서 C를 비교했다. B의 머리·선 무관측 조건 외 경계 점수/후보는 그대로이고, C는 혼잡 모양 선택만 바꿨다. 모든 안전·위험·벽·외부6칸 검사는 유지했다.\n\n|지표|master|수정 B|수정 B+C|\n|---|---:|---:|---:|\n|120초 보유 시간 평균|${fmt(master.holding)}|${fmt(b.holding)}|${fmt(c.holding)}|\n|사망|${master.deaths}|${b.deaths}|${c.deaths}|\n|실제 점령 평균|${fmt(master.capture.mean)}|${fmt(b.capture.mean)}|${fmt(c.capture.mean)}|\n|점령 중앙값 / p90|${master.capture.median} / ${master.capture.p90}|${b.capture.median} / ${b.capture.p90}|${c.capture.median} / ${c.capture.p90}|\n|중거리16개|${master.medium.cuts}/16|${b.medium.cuts}/16|${c.medium.cuts}/16|\n|crowded 같은 모양·크기 반복|${rate(master.crowded.sameShapeSizeRate)}|${rate(b.crowded.sameShapeSizeRate)}|${rate(c.crowded.sameShapeSizeRate)}|\n|crowded 인접 쌍 수|${master.crowded.pairs}|${b.crowded.pairs}|${c.crowded.pairs}|\n|재배치 실제 회수|5칸·사망0|5칸·사망0|5칸·사망0|\n\n## 수정 B\n\n상대 머리·선 중 하나라도 관측되면 열린 경계를 추가하지 않고 순위 계산도 생략한다. 원래 경계6개+피해최대2개, 모양·점수·RNG 흐름은 이 판단 안에서 그대로다. 무관측일 때만 이전 열린 경계최대1개를 추가한다. 단, 앞선 조용한 판단에서 바뀐 경로/RNG의 영향까지 이후 모든 경기가 같다는 뜻은 아니다.\n\n보유 ${pct(comparisons[0].holdingPercent)}, 사망 ${pct(comparisons[0].deathPercent)}. 보유 증가 ${comparisons[0].holdingSignal.positive}/8, 감소 ${comparisons[0].holdingSignal.negative}/8로 **${comparisons[0].holdingSignal.direction}**다. 구분 불가는 효과 없음을 뜻하지 않는다. 재검토선 보유−5%·사망+20% 안이고 필수 회귀가 유지되어 C를 올릴 기준으로 사용했다. 성장 개선 확정이나 채택 완료를 주장하지 않는다.\n\n|seed|보유: master → B|변화|사망: master → B|crowded 모양·크기 반복|\n|---|---:|---:|---:|---:|\n${table(comparisons[0])}\n\n확장 공격 **${expandedCheck.baselineCuts} → ${expandedCheck.candidateCuts}/1,024**, 사례별 성공→실패 ${expandedCheck.lost.length}, 실패→성공 ${expandedCheck.gained.length}다. 같은 배치/사람루프/memorySeed를 사용했고 44개 observer ON/OFF의 궤적·메모리·다음RNG·예약도 같다. 기존 16개는 ${b.medium.cuts}/16, 실패 ${b.medium.failed.join('·')}다.\n\n## C: 승인된 작은 모양을 B 위에서 비교\n\n길이1~2·폭1·한 경계방향에 후보1개를 유지하며 일반 성격은 RHOMBUS/NATURAL/BEVEL/HOOK, 안전지킴이는 RHOMBUS/NATURAL/BEVEL을 기존 인덱스 순환으로 고른다. BEVEL만1칸 bevel이고 추가 모양 RNG는 없다. NATURAL/HOOK은 기존 귀환 탐색으로 닫고 외부6칸이 넘으면 탈락한다.\n\nB 대비 보유 ${pct(comparisons[1].holdingPercent)}, 사망 ${pct(comparisons[1].deathPercent)}. crowded 반복은 ${rate(b.crowded.sameShapeSizeRate)} → ${rate(c.crowded.sameShapeSizeRate)}다. 이름을 제외한 변 기하 반복 ${rate(b.crowded.sameLegsIgnoringNameRate)} → ${rate(c.crowded.sameLegsIgnoringNameRate)}, 이름을 제외한 회전 정규화 선택경로 반복 ${rate(b.crowded.sameActualPathRate)} → ${rate(c.crowded.sameActualPathRate)}도 별도로 측정했다. C의 모양·크기 반복 변화 방향은 ${comparisons[1].crowdedRepeatSignal.direction}다.\n\n**C 중거리 ${c.medium.cuts}/16, 새 실패 ${comparisons[1].newMediumLosses.join('·')}, 회복 ${comparisons[1].recoveredMedium.join('·')}다. 반복이 줄어도 이 공격 회귀를 상쇄하지 않는다. C는 채택을 권하지 않는다.** 안전 완화나 추가 공격 조정은 하지 않았다.\n\nC의 확장 공격은 ${expandedC.baselineCuts} → ${expandedC.candidateCuts}/1,024이고 성공→실패 ${expandedC.lost.length}, 실패→성공 ${expandedC.gained.length}이다. 관측 비간섭44개는 모두 동일했다.\n\n|seed|보유: B → B+C|변화|사망: B → B+C|crowded 모양·크기 반복|\n|---|---:|---:|---:|---:|\n${table(comparisons[1])}\n\n|성격|C crowded 실제 출발|선택 후 실제 출발 모양|같은 모양·크기 반복|\n|---|---:|---|---:|\n${roleTable}\n\n## 계측과 다음 순서\n\n각 후보는 동결 소스로120초8시드를 실행했고 450tick 원본/계측의 궤적·메모리·다음RNG·예약·보유 동일성을 확인했다. master의120초 결과는 이전 동결 결과를 재사용했다. 모양·크기는 이전 정의를 유지하고, 이름만 바뀐 경우를 구분하려고 변 기하 및 선택경로의 회전 정규화 비교를 추가했다.\n\nB의 초기 선택경로 기록 중 출발칸이 귀환 종점인 RHOMBUS는 잘못 빈 값으로 기록돼, 원본 geometry와 경로길이에서 정확한 처음N개 변을 복원했다. 다른 모양의 결측은 복원하지 않는다. crowded B는 모두RHOMBUS여서 해당 비교에 결측이 없다. 원본은 덮어쓰지 않았고 재생을 추가로 반복하지 않았다. 전체 구간별 점령분포·시드별 차이·방향신호·성격별 분포와 소스해시는 [요약](../evidence/bot-space-shape-review/summary.json)에 있다.\n\n최종 탐색 후보는 수정B만 유지한다. C 소스와 결과는 동결해 보존하고 실험 실행 상태에서 제외한다.240초·비용·전체테스트·사용자 플레이는 실행하지 않았다. 채택 검증과 사용자 관전·플레이 완료 전에는 master에 병합하거나 push하지 않는다.\n`);
console.log(JSON.stringify({decision:result.decision,holding:[master.holding,b.holding,c.holding],deaths:[master.deaths,b.deaths,c.deaths],crowded:[master.crowded.sameShapeSizeRate,b.crowded.sameShapeSizeRate,c.crowded.sameShapeSizeRate],medium:[master.medium,b.medium,c.medium],expandedB:expandedCheck.candidateCuts,expandedC:expandedC.candidateCuts},null,2));
