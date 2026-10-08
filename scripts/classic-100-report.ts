import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {summarize,statistics,sourceHashes,thresholds,type Run} from './classic-100-validation.js';

const directory=resolve('.local/classic-100-validation');
const shards=Array.from({length:4},(_,i)=>JSON.parse(readFileSync(resolve(directory,`production-${i}.json`),'utf8')));
const control=JSON.parse(readFileSync(resolve(directory,'control.json'),'utf8'));
const runs:Run[]=shards.flatMap(s=>s.runs).sort((a:Run,b:Run)=>a.seed-b.seed);
const controls:Run[]=control.runs;
if(runs.length!==100||new Set(runs.map(r=>r.seed)).size!==100||runs.some((r,i)=>r.seed!==i+1||r.simulationSeconds!==1200&&!r.success))throw new Error('Incomplete production experiment');
if(controls.length!==8||controls.some((r,i)=>r.seed!==i+1||r.variant!=='no-respawn'||r.respawns!==0))throw new Error('Incomplete control');
const hashes=sourceHashes();
for(const shard of [...shards,control])if(JSON.stringify(shard.sourceHashes)!==JSON.stringify(hashes))throw new Error('Source mismatch');
const summary=summarize(runs),cs=summarize(controls),lives=runs.flatMap(r=>r.lives);
const horizons=Object.fromEntries([10,15,20].map(minutes=>[minutes,{
 thresholds:Object.fromEntries(thresholds.map(t=>[t,runs.filter(r=>r.thresholdTimes[t]!==null&&r.thresholdTimes[t]!<=minutes*60).length])),
 maxPercent:statistics(runs.map(r=>minutes===20?r.maxPercent:(r.checkpoints.find((c:any)=>c.seconds===minutes*60) as any)?.maxPercent??r.maxPercent))
}]));
const paired=runs.filter(r=>r.seed<=8).map(r=>({seed:r.seed,productionMaxPercent:r.maxPercent,controlMaxPercent:controls.find(c=>c.seed===r.seed)!.maxPercent,
 productionDeaths:r.deaths,controlDeaths:controls.find(c=>c.seed===r.seed)!.deaths,productionSuccess:r.success,controlSuccess:controls.find(c=>c.seed===r.seed)!.success}));
const deathCauses=Object.fromEntries([...new Set(lives.filter(l=>l.deaths).map(l=>l.endReason))].map(reason=>[reason,lives.filter(l=>l.deaths&&l.endReason===reason).length]));
const spawned=runs.flatMap(r=>r.spawnEvents) as {success:boolean;leaderCellsDelta:number;validCenterCount:number}[];
if(spawned.some(s=>s.success&&s.leaderCellsDelta!==0))throw new Error('Unexpected direct leader change at spawn');
const master=execFileSync('git',['rev-parse','master'],{encoding:'utf8'}).trim();
const productionDiff=execFileSync('git',['diff','master','--','src/shared','src/server','src/client/practice.ts'],{encoding:'utf8'});
if(productionDiff.trim())throw new Error('Production simulation changed');
const isolated=JSON.parse(readFileSync(resolve(directory,'isolated-timing.json'),'utf8'));
const artifact={schemaVersion:1,createdAt:new Date().toISOString(),masterCommit:master,branch:'experiment/classic-100-validation',sourceHashes:hashes,
 condition:shards[0].condition,methodology:shards[0].methodology,environment:{node:process.version,cpu:'AMD Ryzen 5 5600X, 6 physical / 12 logical cores',workers:4,startedAt:statSync(resolve(directory,'processes.json')).mtime.toISOString(),completedAt:new Date().toISOString()},
 summary,horizons,lifeSurvivalSeconds:statistics(lives.filter(l=>l.deaths).map(l=>l.durationSeconds)),deathCauses,
 performance:{parallelWorkerPooledTiming:shards.map(s=>s.pooledTiming),isolated},
 control:{condition:control.condition,methodology:control.methodology,summary:cs,paired,runs:controls},runs};
writeFileSync(resolve('evidence/classic-100-validation.json'),JSON.stringify(artifact));
const f=(n:number,d=2)=>n.toFixed(d),s=(value:any)=>value?`${f(value.median)} / ${f(value.p75)} / ${f(value.p90)} / ${f(value.min)} / ${f(value.max)}`:'미도달 — 계산 불가';
const best=runs.reduce((a,b)=>a.maxPercent>b.maxPercent?a:b);
const lifeBuckets=[[0,10],[10,25],[25,50],[50,75],[75,90],[90,95],[95,99],[99,100.0001]].map(([a,b])=>({label:`${a}–${b===100.0001?100:b}%`,count:lives.filter(l=>l.maxPercent>=a&&l.maxPercent<b).length}));
const meanNeutral=statistics(runs.map(r=>r.final.neutralCells))!;
const totalSimulationMinutes=runs.reduce((n,r)=>n+r.simulationSeconds/60,0);
const timing=isolated.measured.timing;
const md=`# Classic 100% 점령 검증 — 2026-10-07

**결론: BOT-only 환경에서는 C에 해당하지만, 인간 플레이 규칙에 대한 최종 판정은 D다.** 운영 조건 100 seeds × 20분에서 50%부터 100%까지 모든 threshold 도달률이 0%였다. 마지막 1% 정체를 관측한 것이 아니라 선두가 50%에 도달하기 전 단계에서 머물렀다. 이 결과로 100% 유지가 현실적이라고 검증됐다고 말할 수 없으며, 100%가 수학적으로 불가능하다고 말할 수도 없다. 승리 조건 또는 부활 규칙 변경은 하지 않았다.

## 조건 및 재현

- 브랜치: experiment/classic-100-validation. 기준 master: ${master}.
- seed 1–100, 각 최대 1,200초 / 36,000 ticks, 총 ${totalSimulationMinutes}분 / ${summary.totalTicks.toLocaleString('en-US')} ticks. 100% 승리 시 조기 종료 가능; 이번에는 ${summary.successes}개.
- Classic, R56, 9,577칸, BOT 16명, 초기 7칸, 30Hz, 이동 4.2칸/s, 회전 9rad/s, BOT 사망 후 3초, 보호 2초, 재등장 실패 재시도 1초, 안전 간격 3칸, BOT 판단 200ms·관측 범위 12, 벽 여유 ¼칸.
- 기본 combined AI, personality 순환과 seed^(slot×2654435761) 메모리 초기화, 생존 BOT만 observeBotForTick → getBotInput → stepMatch. 운영과 동일하게 입력 seq를 보정하고 재등장 시 기존 메모리를 유지한다. Phaser/UI/소켓 없이 공유 엔진을 호출한다. 임의 규칙 재구현, AI 튜닝, 성능 최적화 없음.
- 100 seeds 목표를 모두 실행했다. 초기 20분 파일럿은 약 106초였고, 본 실험은 Node 프로세스 4개로 seed 25개씩 분할했다. 파일럿은 통계에 중복 포함하지 않았다.
- Windows / Node ${process.version} / Ryzen 5 5600X. 병렬 실행은 CPU 경쟁이 있으므로 성능 해석에 단독 측정을 별도로 사용한다.

~~~powershell
# 전체 분할 실행 + 대조군 + 단독 성능 + 집계 재현
.\\scripts\\classic-100-run.ps1
# 아래는 단일 프로세스로 운영 조건만 실행하는 명령
& '.\\.tools\\node-v24.21.0-win-x64\\node.exe' '.\\node_modules\\tsx\\dist\\cli.mjs' scripts/classic-100-validation.ts --seeds=100 --minutes=20 --first=1 --output=evidence/classic-100-validation.json
# 분석용 대조군; 운영 반영 아님
& '.\\.tools\\node-v24.21.0-win-x64\\node.exe' '.\\node_modules\\tsx\\dist\\cli.mjs' scripts/classic-100-validation.ts --seeds=8 --minutes=20 --first=1 --variant=no-respawn --output=.local/classic-100-validation/control.json
# worker가 모두 종료된 후 1분 warm-up + 2분 단독 성능
& '.\\.tools\\node-v24.21.0-win-x64\\node.exe' '.\\node_modules\\tsx\\dist\\cli.mjs' scripts/classic-100-timing.ts
# 분할 실행 결과 + 단독 성능을 같은 형태로 집계
& '.\\.tools\\node-v24.21.0-win-x64\\node.exe' '.\\node_modules\\tsx\\dist\\cli.mjs' scripts/classic-100-report.ts
~~~

분할 원본 및 로그는 .local/classic-100-validation/production-0..3.json과 *.stdout.log / *.stderr.log에 보존했다. 집계 raw JSON은 evidence/classic-100-validation.json에 전체 100경기 및 8개 대조군, 생명 기록, 5초 시계열, 모든 부활 시도, 설정·소스 SHA-256을 포함한다. report 스크립트는 4개 분할 원본과 control.json, isolated-timing.json이 필요하다. 단일 명령의 JSON은 같은 run 데이터와 요약을 만들지만 환경/대조군/보고서 포장은 별도다.

## 도달률 및 시간

| 점유율 | 10분 | 15분 | 20분 | 20분 도달률 | 시간 median / p75 / p90 / min / max (초) |
|---|---:|---:|---:|---:|---|
${thresholds.map(t=>`| ${t}% | ${(horizons[10] as any).thresholds[t]} | ${(horizons[15] as any).thresholds[t]} | ${summary.thresholds[t].reached} | ${f(summary.thresholds[t].rate*100)}% | ${s(summary.thresholds[t].times)} |`).join('\n')}

미도달은 null로 보존했으며 성공 시간 분포에 넣지 않았다. 90→95, 95→99, 99→100, 전체 90→100 소요 시간은 출발 threshold 자체에 도달한 seed가 없어 측정할 수 없다. 같은 참가자·같은 lifeId의 구간 통계도 별도로 집계했으며 모든 구간의 시작/완료/미완료 수는 0이다. 결과가 없는 시간을 0초로 표시하지 않았다.

## 최고 점유율

경기별 최고 점유율의 median / p75 / p90 / min / max: **${s(summary.maxPercent)}%**. 최고는 seed ${best.seed}, ${best.maxCells}칸 / ${f(best.maxPercent)}%, 시점 ${f(best.peakSeconds)}초였다. 전체 maximum은 선두가 바뀔 수 있는 생태계 지표이며 한 생명의 성장 시간과 구분한다.

| horizon | 경기 최고 점유율 median / p75 / p90 / min / max (%) |
|---|---|
${[10,15,20].map(h=>`| ${h}분 | ${s((horizons[h] as any).maxPercent)} |`).join('\n')}

| 실패 경기의 최고 점유율 | 수 |
|---|---:|
${Object.entries(summary.failedMaxDistribution).map(([k,v])=>`| ${k}% | ${v} |`).join('\n')}
| 100% 성공 | ${summary.successes} |

50% 미만 경기: ${runs.filter(r=>r.maxPercent<50).length}/100. 20분 내 100% 미관측은 불가능의 증명이 아니다. seed 1–100 표본이 전체 RNG 공간을 대표한다고 보장하지 않는다. 독립·동일분포의 seed 표본이라는 가정 아래 성공 0/100의 단측 95% 상한은 약 2.95%이나, 이는 인간 승률의 상한이 아니다.

## 생명별 기록

participantId + lifeId별 ${summary.totalLives.toLocaleString('en-US')}개 생명을 추적했다. 최고 점유율, 최고 시점(경기 절대 시간), spawn 시점, 생존 시간, life별 kill/death, 상대 threshold 도달 시간(부활 후 경과 초), 종료 사유를 저장했다. ${lives.filter(l=>l.endReason==='HORIZON').length}개 생명은 horizon에서 생존 중이므로 종료된 생존 시간으로 해석하지 않는다.

생명별 최고 점유율 median / p75 / p90 / min / max: ${s(summary.lifeMaxPercent)}%. 사망한 생명의 생존 시간 median / p75 / p90 / min / max: ${s(artifact.lifeSurvivalSeconds)}초.

| 생명 최고 점유율 | 수 |
|---|---:|
${lifeBuckets.map(b=>`| ${b.label} | ${b.count} |`).join('\n')}

threshold와 peak는 tick 종료 시점(1/30초)에서 관측한다. 같은 tick 안에서 잠깐 점령한 뒤 즉시 죽거나 잃은 영역은 peak에서 누락될 수 있다. 운영 100% 승리는 tick 종료 evaluateMode에서 판정하므로 성공 여부는 운영 outcome을 직접 사용한다. 미세한 내부 사건 peak를 인간 체감 최고값과 동일하다고 주장하지 않는다.

## 사망·부활·정체

총 사망 **${summary.deaths}회**, 성공 부활 **${summary.respawns}회**, SPAWN_BLOCKED 실패 시도 **${summary.blockedAttempts}회**, 막힌 참가자 시간 **${f(runs.reduce((s,r)=>s+r.blockedParticipantSeconds,0))} participant-seconds**. 경기별 평균 생존 인원 median / min / max: ${f(summary.meanAlive!.median)} / ${f(summary.meanAlive!.min)} / ${f(summary.meanAlive!.max)}명. 최종 중립 칸 median / min / max: ${meanNeutral.median} / ${meanNeutral.min} / ${meanNeutral.max}.

| 사망 원인 | 수 |
|---|---:|
${Object.entries(deathCauses).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}

부활은 중립의 안전한 7칸에서만 성공한다. 모든 성공 부활에서 직전/직후 최대 영토 수 차이는 0이었으며, 직접 선두 영토를 훔친 부활은 없다. 이후 BOT 공격에 의한 탈취와 사망 후 중립화는 별개다. 5초 시계열의 각 participant territoryCount와 life/death 기록으로 후퇴 및 선두 교체를 추적할 수 있다.

정체 정의는 90/95/99%를 한 번 달성한 후 전체 선두의 역대 최고 칸 수가 30초 이상 갱신되지 않은 구간이다. 매 tick 상태로 계산하며 시작 시점부터 부활·막힘·선두 교체·시작 선두 사망·최저 현재 점유율·중립 수를 수집한다. A(영토 후퇴)는 threshold 아래로 하락, B(소량 잔여)는 threshold 이상 유지하며 기록 미갱신, C(선두 교체)는 leaderChanges/leaderDeaths, D(부활 중단)는 blockedAttempts와 blockedParticipantSeconds로 확인한다. 원인들은 배타적이지 않으며 단순 동시 발생을 인과관계로 확정하지 않는다.

90% 도달이 없어 후반 정체 구간은 ${summary.stagnationEpisodes}개다. afterThreshold 90/95/99의 부활·막힘 통계가 0인 것은 해당 단계에 들어가지 않았기 때문이며, 마지막 몇 %가 잘 정리된다는 뜻이 아니다.

## 부활 없음 대조군 — 별도 분석

전체 결과 확인 전에 seed 1–8을 지정했고, 같은 20분 horizon과 초기 상태·AI·movement/capture/death/Classic 판정을 사용했다. stepMatch가 정상 BOT 사망을 처리한 후 실험 harness만 해당 BOT을 ELIMINATED로 두어 tryRespawns 대상에서 제외했다. 설정의 respawnSeconds를 조정하거나 운영 코드를 수정하지 않았다. 인구가 감소하는 대조군이므로 부활 제거 정책의 공정성/재미를 검증하는 실험은 아니다.

| seed | Production 최고 % | Control 최고 % | Production deaths | Control deaths | Production 100% | Control 100% |
|---|---:|---:|---:|---:|---|---|
${paired.map(p=>`| ${p.seed} | ${f(p.productionMaxPercent)} | ${f(p.controlMaxPercent)} | ${p.productionDeaths} | ${p.controlDeaths} | ${p.productionSuccess?'성공':'미도달'} | ${p.controlSuccess?'성공':'미도달'} |`).join('\n')}

같은 seed의 8개 짝에서 대조군 최고 점유율은 모두 상승했다. Production 최고 점유율 평균 ${f(statistics(paired.map(p=>p.productionMaxPercent))!.mean)}% → Control 평균 ${f(cs.maxPercent!.mean)}%였다. 이는 지속 부활과 인구 유지가 BOT의 독주 성장을 억제한다는 근거다. 다만 부활 제거는 동시에 참가자 수를 감소시키며, 3초와 다른 부활 간격의 차이 또는 90% 이후 효과를 분리하지는 못한다.\n\n대조군 최고 점유율 median / p75 / p90 / min / max: ${s(cs.maxPercent)}%. 100% ${cs.successes}/8, 부활 ${cs.respawns}, 총 사망 ${cs.deaths}. 각 threshold 도달 수: ${thresholds.map(t=>`${t}% ${cs.thresholds[t].reached}/8`).join(', ')}.

${cs.successes===0?'부활을 제거해도 100% 완주가 관측되지 않았다. 따라서 현재 데이터만으로 어려움의 원인을 3초 부활 하나로 단정할 수 없다.':'부활 없는 대조군에서 완주가 관측되어 부활/참가자 지속 유입이 결과에 영향을 주는 근거가 생겼다. 표본 8개와 감소하는 인구 조건의 한계를 고려해야 한다.'} 이는 마지막 1% 단계의 인과 효과 측정이 아니라 전체 BOT 생태계의 비교다.

## 성능

초 단위 시뮬레이션 시간과 실제 실행 시간을 구분했다. 측정은 performance.now()의 경과 시간이며 OS CPU 사용률이나 모바일 FPS가 아니다. BOT+engine에는 observation/input 생성/stepMatch가 들어가며, engine은 stepMatch만이다. 장기 실험은 spawn hook 비용을 포함하고 매 tick 후 계측·파일 저장은 제외한다. 4개 병렬 worker에는 CPU 경쟁이 있어 worker별 pooled 통계를 raw에 별도 보존했다.

단독 측정은 진행 중인 실험 worker가 모두 종료된 뒤 동일 seed 1의 1분 warm-up을 버리고 2분 / 3,600 ticks를 observer 없이 실행했다. 계측 ON과 OFF의 같은 seed·horizon 상태 hash가 일치하는 회귀 검사는 별도로 통과했다.

| 단독 경과 시간 (ms/tick) | 평균 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| BOT + engine | ${f(timing.botAndEngine.mean,3)} | ${f(timing.botAndEngine.p95,3)} | ${f(timing.botAndEngine.p99,3)} | ${f(timing.botAndEngine.max,3)} |
| engine만 | ${f(timing.engine.mean,3)} | ${f(timing.engine.p95,3)} | ${f(timing.engine.p99,3)} | ${f(timing.engine.max,3)} |

긴 경기에서의 비용은 raw 각 seed의 timing에 보존했다. 위 단독 2분 구간은 장기 경기 전체의 성능 보장치가 아니다. GC·스케줄링 영향이 포함될 수 있으며 최적화는 하지 않았다.

## 검증과 추가 판단

- 전체 코어/서버 테스트: 78파일 / 453개 통과. 신규 4개는 정확한 칸 수 threshold, 2분 계측 ON/OFF 최종 논리 상태 일치(실제 capture/death/respawn 포함), no-respawn 격리, 빈 표본·quantile 검증을 포함한다.
- client/server/tests 타입 검사 및 실험/보고서 스크립트 타입 검사 통과.
- 매 5초 ownership count invariant와 매 seed 종료 death/respawn/life kill 집계 invariant 검사. 모든 seed에 오류 없이 통과했다. 통계 집계 단계에서 seed 1–100 누락/중복, 20분 또는 조기 승리 종료, 대조군 분리, 소스 hash 일치를 검사했다.
- src/shared, src/server, src/client/practice.ts는 master와 diff 없음. 작업 전부터 있던 reward.ts / reward.test.ts / reward-profile-v1-results.md 변경은 보존했으며 본 실험에서 수정하지 않았다. 게임·UI·보상·상점·프로필 규칙 변경 없음.

현재 BOT-only 검증으로는 100%를 그대로 유지해도 된다는 긍정적 근거를 확보하지 못했다. 동시에 BOT이 낮은 점유율에서 경쟁하는 결과를 인간의 한 Run과 동일시해 승리 조건을 바꾸는 근거로 삼아서는 안 된다.

다음 검증은 실제 숙련 플레이어의 1 HUMAN + 15 BOT 입력을 seed·lifeId와 함께 기록해 공유 엔진에서 재생하고, 같은 생명에서 50→75→90→95→99→100 시간을 측정하는 방식이 적합하다. 자연 플레이로 90% 이상에 도달한 동일 snapshot에서 BOT 부활 유무를 짝지어 비교하면 마지막 청소 구간의 원인을 더 직접적으로 분리할 수 있다. 강제로 영토를 세팅한 후반 fixture는 기계적 가능성 검사용으로 따로 표시하고 자연 완주 증거로 사용하지 않아야 한다. 이 후속 실험과 게임 규칙 변경은 이번 작업에서 실행하지 않았다.
`;
writeFileSync(resolve('docs/classic-100-validation.md'),md);
console.log(JSON.stringify({summary,control:cs,deathCauses,paired,best:{seed:best.seed,maxPercent:best.maxPercent,peakSeconds:best.peakSeconds},artifactBytes:statSync(resolve('evidence/classic-100-validation.json')).size},null,2));



