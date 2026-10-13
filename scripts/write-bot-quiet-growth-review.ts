import {readFileSync,writeFileSync} from 'node:fs';
const s=JSON.parse(readFileSync('evidence/bot-quiet-growth-review/summary.json','utf8')),validation=JSON.parse(readFileSync('evidence/bot-quiet-growth-review/validation.json','utf8')),regression=JSON.parse(readFileSync('../bot-quiet-growth-review/recovery-regression.json','utf8'));
const n=(v:number|null,d=2)=>v===null?'결측':v.toFixed(d),pc=(v:number|null)=>v===null?'—':(v>0?'+':'')+n(v)+'%',signal=(v:any)=>v.direction==='INCREASE'?'증가 신호':v.direction==='DECREASE'?'감소 신호':'구분 불가',role:any={DEFEND:'안전지킴이',ATTACK:'선사냥꾼',EXPAND:'영역탐험가',SEEK_POINT:'영역도둑'},rows=(a:any[],f:(r:any)=>string)=>a.map(f).join('\n');
const c=s.comparisons[0],b=s.deathAnalysis.baseline.byHorizon[1],a=s.deathAnalysis.candidate.byHorizon[1];
const metrics:any={holding:'보유 시간 평균(칸)',final:'최종 보유 평균(칸)',deaths:'사망 합계',deathLoss:'사망 중립화 손실',totalCapture:'총 점령',net:'순영토 참고',reclaim:'실제 되찾기(기존 tick 경계)',enemyRecovery:'적 소유 피해 칸 회수(정확한 transfer)',neutralRecovery:'중립화된 피해 칸 회수',TV:'탐험가–도둑 TV',attacks:'공격 시작',attackKills:'활성 표적 처치',wallDeaths:'벽 사망'};
let text=`# 조용한 구간 큰 후보 비교와 사망 분석

2026-10-13. 승인한 단일 변경을 실험 브랜치에서 구현·측정했다. **현재 자동 채택을 추천하지 않는다.** 120초 보유는+3.71%지만 사망은+20%로 재검토 한계이며, 기존 재배치 후 실제 회수 테스트가 새로 실패한다. 비용 결과와 방향 신호도 아래에 함께 기록한다. 큰 보유의 위험 강화는 제안만 하며 구현하지 않았다. master133ee1f와 원격은 변경하지 않는다.

## 1. 변경과 실험 조건

- 기준 a535bf7(133ee1f 위 실제 벽 선택 검사). 269c8c1은 분석 문서 커밋이다. 후보는 fb075d3 위 승인한 큰 변형만 추가했다.
- 보유64칸 이상·관측 머리0명인 기존 확장 판단에서, 원래 경계/방향/shape에 settings 길이+2·폭+1 변형 최대1개를 추가한다. geometry는 같은 원래 난수를 최소 크기 clamp 전 값에서 재사용한다. 전체에서 후보 하나라는 뜻이 아니며 제안서의 경계/방향/shape별 변형 하나다.
- 원래 후보를 모두 생성·점수화한 뒤 추가 변형을 평가한다. 같은 경로 중복 변형은 제거한다. 128개 복제 판단에서 원래 후보3,023개의 경로/점수/순서/ordinal이 모두 동일했다. 추가 후보는2,620개였다.
- 전체 경로24, 자기 땅 prefix10, 성격별 선 한도, 선 회피/근접 머리/귀환 연결, 출발1초/벽0.65초, 실행 중 위험/조기 귀환, 점수·성격·전략200ms/전술100ms·스폰/인원/부활은 그대로다. 성장 전용 가산점은 없다.
- 동일8시드4·19·73·11·31·47·101·137, R56/14봇/스폰7칸/안전 부활/CLASSIC.120초 주 비교,240초 보조. 원본 소스와 시드를 결과 전에 동결했다.
- gate OFF refactor8시드120초는 기존 궤적/판단/메모리/RNG/예약과 동일. HUD·계측 없는 재생과 rich 사망 계측은 양쪽8시드120/240초의 궤적/메모리/RNG/예약/보유가 모두 동일했다.

## 2. 120초 주 비교와 240초 보조 비교

paired7/8 같은 방향 AND 모든 시드 하나씩 제외한 합계가 같은 방향일 때만 탐색적 방향 신호다. **구분 불가는 효과 없음이 아니다.** 정식 유의성·일반화 증거로 해석하지 않는다.
`;
for(const comp of s.comparisons){text+=`\n### ${comp.seconds}초\n\n|지표|기준|큰 후보|변화|방향|\n|---|---:|---:|---:|---|\n`+rows(Object.keys(metrics),k=>`|${metrics[k]}|${n(comp.totals.baseline[k])}|${n(comp.totals.candidate[k])}|${pc(comp.percent[k])}|${signal(comp.signals[k])}(${comp.signals[k].positive}↑/${comp.signals[k].negative}↓/${comp.signals[k].tied}=)|`)+`\n\n|seed|보유 기준→후보|차이|사망 기준→후보|최종 보유 기준→후보|\n|---|---:|---:|---:|---:|\n`+rows(comp.rows,(r:any)=>`|${r.seed}|${n(r.baseline.holding)}→${n(r.candidate.holding)}|${n(r.delta.holding)}|${r.baseline.deaths}→${r.candidate.deaths}|${r.baseline.final}→${r.candidate.final}|`)+`\n\n|성격|탈취 비중 기준→후보|방향|\n|---|---:|---|\n`+rows(comp.personality,(r:any)=>`|${role[r.personality]}|${n(r.baseline.stolenShare*100)}%→${n(r.candidate.stolenShare*100)}%|${signal(r.stolenShareSignal)}|`)+`\n`;}
text+=`\n점령 평균(240초 전체)은${n(s.captures.baseline.overall.mean)}→${n(s.captures.candidate.overall.mean)}칸, 중앙값${s.captures.baseline.overall.median}→${s.captures.candidate.overall.median}, p90 ${s.captures.baseline.overall.p90}→${s.captures.candidate.overall.p90}다. 큰 후보를 선택한 계획은${s.captures.candidate.selectedLargePlans}회다. 획득 단위가 커졌다는 사실과 장기 보유 개선은 구별한다. 순영토는 사망 중립화 손실을 제외한 기존 정의이고 총 점령은 사망으로 생긴 중립 땅 재획득도 포함하므로 둘만으로 채택하지 않는다.

## 3. 사망 크기·손실·원인

보유는 사망 중립화 직전 값이다. 그 전에 일어난 점령/영토 분리 손실은 생존 중 손실로 별도 회계에 남는다. 따라서 HOME_CAPTURE 직전 탈취로 이미 줄어든 영역을 사망 중립화 손실에 다시 합치지 않는다. 피해 크기별 사망 비중은 상관관계이며 크기 자체가 사망 원인이라는 뜻이 아니다. 실제 노출 칸수는 사망 callback의 확정 trailCells 집합 크기다. 같은tick 아직 확정되지 않은 pending 칸은 포함하지 않고 PENDING_TRAIL_CONTACT 원인으로 구분한다. 계획의 예정 외부 길이와 이 확정 노출 값을 섞지 않는다.

|240초 사망 당시 보유|기준 사망/손실/사망당|후보 사망/손실/사망당|후보 손실 비중|
|---|---:|---:|---:|
`+rows(a.bins,(r:any)=>{const old=b.bins.find((v:any)=>v.bin===r.bin);return `|${r.bin}|${old.count}/${old.total}/${n(old.mean)}|${r.count}/${r.total}/${n(r.mean)}|${n(r.lossFraction*100)}%|`;})+`

256칸 이상에서의 사망이 기준 손실${n(100*(b.bins[2].total+b.bins[3].total)/b.loss)}%, 후보${n(100*(a.bins[2].total+a.bins[3].total)/a.loss)}%를 차지했다. 작은 봇만 많이 죽는 상황으로 설명할 수 없다.120초 구간별 값·시드별 개별 사망은 summary/CSV에 함께 있다.

|240초 사망 원인|기준 사망/손실|후보 사망/손실|
|---|---:|---:|
`+rows([...new Set([...b.causes.map((v:any)=>v.name),...a.causes.map((v:any)=>v.name)])],name=>{const x=b.causes.find((v:any)=>v.name===name),y=a.causes.find((v:any)=>v.name===name);return `|${name}|${x?.count??0}/${x?.total??0}|${y?.count??0}/${y?.total??0}|`;})+`

|처치자 종류/성격|기준 사망/손실|후보 사망/손실|
|---|---:|---:|
`+rows([...new Set([...b.killers.map((v:any)=>v.name),...a.killers.map((v:any)=>v.name)])],name=>{const x=b.killers.find((v:any)=>v.name===name),y=a.killers.find((v:any)=>v.name===name);return `|${name}|${x?.count??0}/${x?.total??0}|${y?.count??0}/${y?.total??0}|`;})+`

14봇 구성의 처치자는 당연히 봇이다. 사람1+봇13에서도 처치자 BOT/HUMAN·성격·원인·크기·계획을 같은 사망 callback으로 기록해 human-bot-death-details.csv로 분리했다. 사람 사망으로 재생이 일찍 끝난 시드가 달라, 그 전체 합계를 동시간 paired 행동 성능으로 비교하지 않는다.

사망 당시 실제 노출 선 평균${n(b.actualExposure.mean)}→${n(a.actualExposure.mean)}, 같은 생명 마지막 확장의 예측 점령 평균${n(b.lastPlannedCapture.mean)}→${n(a.lastPlannedCapture.mean)}, 예정 외부 길이${n(b.lastPlannedExternal.mean)}→${n(a.lastPlannedExternal.mean)}다. 실제 ATTACK 중 사망${b.attackingDeaths}→${a.attackingDeaths}회, 아직 활성 확장인 사망${b.activeExpansionDeaths}→${a.activeExpansionDeaths}회다. RETURN 등으로 이미 중단된 계획을 ‘확장 중’으로 세지 않는다. 마지막 큰 후보가 있는 사망${a.lastQuietLargeDeaths}회/손실${a.lastQuietLargeDeathLoss}칸은 기술 통계이며 그 후보가 사망을 유발했다는 증거가 아니다. 현재 모드·실제 노출·남은 경로·마지막 계획의 나이와 예측 크기는 개별 CSV에 보존했다.

## 4. 새 재배치 회귀 — 테스트 유지

기존 bot-reposition.test.ts의 실제 이동·안전지킴이/영토집착 fixture를 그대로 두고 양쪽 동결 소스로 확인했다. 양쪽 모두 t103에15칸 재배치 도착. 기준은t190에 실제5칸 회수·사망0, 후보는t283에 EXISTING_TRAIL_CONTACT로 #2에게 죽고 회수0이다. 도착 직후 머리0명일 때 기준은예측21칸/외부11칸/D5 계획, 후보는큰 변형28칸/외부12칸/D0 계획을 선택했다. 후보도이후t232에D6, t240에D1 계획을 선택하지만 실제회수 전에 죽었다. 즉 더 큰 중립 확장이 도착 직후 되찾기 선택을 밀어내는 구체 사례가 있다. 테스트를 삭제하거나 기대 실패로 돌리거나 시간/안전 조건을 완화하지 않았다. 큰 후보 선택 후 접근하는 상대에 잘리는 장면이 새로 나타났다. 자세한 계획은 recovery-regression.json에 있다.

따라서 집계 재검토 숫자만 통과하더라도 ‘모든 회귀 통과’라고 보고하지 않는다. 변경 하나를 구현·비교하는 승인이 이 회귀 수용 승인은 아니다. 이번에 되찾기 가산점·RNG·안전 설정을 추가로 조정하지 않았다.

## 5. 필수 공격 회귀·성능·검증

- 중거리16개 **${s.checks.medium16.cuts}/16**, 실패ID5·6·14 그대로·새 손실0. 승인된 출발 안전의 대가는 유지한다.
- 확장 **${s.checks.expanded.cuts}/1,024**, 결과가 바뀐 사례${s.checks.expanded.changes.length}개,44개 observer동일 검사. 세부 성공 mask는 raw에 보존한다.
- known seed1 공격0tick·사람생존. 기대 실패/seed3 별도 테스트를 그대로 유지했다.
- 타입 검사/production build: ${validation.typecheckAndBuild}. Vitest: ${validation.vitest}. PC9개: ${validation.pcE2E}. 최초 병렬 부하 표본과 최종 단독 실행은 구분한다.
- 기존 궤적 pin4개만 승인된 성장 행동의 새 hash로 갱신했다. 실제 소유권/점령/벽0/부활·안전지킴이 제한 shape/사망0 검사는 그대로다. 새 회수 실패 테스트는 실패 상태로 보존한다.
`;
if(s.cost)text+=`- 같은 세션120초3라운드×8시드×2갈래,48표본·갈래별seed19warmup 제외. 기준${n(s.cost.summary.baseline.medianMsPerTick,4)}→후보${n(s.cost.summary.candidate.medianMsPerTick,4)}ms/tick(${pc(s.cost.percent)}). 전체8시드 비용의3라운드 중앙값이며 모든 표본을 보존했다. HUD/계측OFF, 다른 테스트와 중첩된 표본은 제외한다. 비용20% 재검토 기준과 함께 본다.\n\n|seed|기준ms/tick|후보ms/tick|변화|\n|---|---:|---:|---:|\n`+rows(s.cost.seedRows,(r:any)=>`|${r.seed}|${n(r.baseline,4)}|${n(r.candidate,4)}|${pc(r.percent)}|`)+`\n\n비용 방향: ${signal(s.cost.signal)}(${s.cost.signal.positive}↑/${s.cost.signal.negative}↓/${s.cost.signal.tied}=),3회 시드별 중앙값 기준. 전체값은 시드별 중앙값의 평균이 아니라 전체8시드3라운드의 중앙값이다.\n`;
text+=`
## 6. 사람1+봇13 180초 참고 목표

**1등 봇20% 이상**은 목표 방향을 정하는 참고 지표다. 주 합격 지표를 대신하지 않는다. 기존 자동 사람 입력4개 루프를 반복했으며 실제 사람이2~3분30%를 먹던 플레이를 재현한 fixture가 아니다. 사람이180초 전에 죽으면 결측으로 기록하고0%로 바꾸지 않는다.

|seed|기준180초 1등봇|후보180초 1등봇|기준/후보 종료초|
|---|---:|---:|---:|
`+rows(s.human.baseline,(r:any)=>{const v=s.human.candidate.find((p:any)=>p.seed===r.seed);return `|${r.seed}|${r.leaderAt180===null?'결측':n(r.leaderAt180*100)+'%'}|${v.leaderAt180===null?'결측':n(v.leaderAt180*100)+'%'}|${n(r.endSeconds)} / ${n(v.endSeconds)}|`;})+`

기준 유효180초 시드${s.human.baseline.filter((r:any)=>!r.censoredBefore180).length}/8, 후보${s.human.candidate.filter((r:any)=>!r.censoredBefore180).length}/8.20% 도달은 기준${s.human.baseline.filter((r:any)=>r.meets20).length}개/후보${s.human.candidate.filter((r:any)=>r.meets20).length}개다. 생존 조건에 따른 선택 편향과 서로 다른 재생 길이를 명시하며, 결측 시드를 새 시드로 대체하지 않았다.

## 7. 다음 단일 후보 — 승인 전 미구현

보유256칸 이상부터 **기존 위험 항만 강화하는 보유 배율**을 하나의 후속 후보로 제안한다. 현재 큰 루프의 회귀/비용 검토 후 채택할 기준 소스를 먼저 정해야 한다. 지금 후보 위에 자동으로 누적하지 않는다.

|보유|제안 위험 배율|
|---|---:|
|0~255|1.00(기존)|
|256|1.15|
|512|1.25|
|1024 이상|최대1.35|

256이상에서 m=1.15+0.10×clamp(log2(보유/256),0,2), 미만은1이다. 확장 기존 위험 감점(거리 위험 및 탐험가 excursionRisk)에만m을 곱한다. 실행 중 기존 적–노출선 위험 거리는256이상에서 max(기존거리,min(7,ceil(기존거리×m)))으로 강화한다(미만은기존거리 그대로). hex 거리가 정수여서 단순 소수 배율이 판정을 바꾸지 않는 경우를 피하려고 올림을 제안하며, 이 또한 승인 전 수치다. 모든 성격의 기존 상대 위험 배율·출발1초/벽/공격 조건은 유지하고 관측 밖 머리/선은 쓰지 않는다. 위험 감점/거리는 절대로 기존보다 작아지지 않는다.

이 후보는 ‘크면 무조건 후퇴’가 아니며 관측 머리0일 때 위험점수0인 사실은 바꾸지 않는다. 조용할 때 시작해 나중에 상대가 나타나는 사망을 실행 중 더 빨리 대응할 여지가 있다. 후보 사망234회 중216회는 이미 ESCAPE였으므로, 위험을 더 일찍 켜기만 하면 해결된다고 단정하지 않는다. 새 회수 fixture는256칸 미만이므로 이 제안으로 그 회귀까지 해결된다고 주장하지 않는다. 현재 큰 루프 후보의 채택/비채택을 먼저 결정해야 하는 이유다. HOME_CAPTURE나 관측 밖 기습을 모두 막는다는 보장도 없고 확장 축소·교체 증가가 가능하다. 보유 기준256과 배율은 **이번 결과를 보고 제안한 값**이며 사전 검증된 수치가 아니다. 구현 승인 후 같은8시드 보유·사망/손실·공격·탈취·TV·비용과 실패한 실제 회수 fixture를 포함해 다시 비교해야 한다.

## 8. 자료와 재현

[요약/시드별 방향/원본hash](../evidence/bot-quiet-growth-review/summary.json), [120/240초 시드별 전체 지표](../evidence/bot-quiet-growth-review/seed-comparison.csv), [개별 사망/직전 계획](../evidence/bot-quiet-growth-review/death-details.csv), [사람 구성 처치자/사망](../evidence/bot-quiet-growth-review/human-bot-death-details.csv), [사람 구성 보유 분포](../evidence/bot-quiet-growth-review/human-bot-shares.csv), [검증](../evidence/bot-quiet-growth-review/validation.json).

전체 원본은 메인.local/bot-quiet-growth-review와.local/bot-quiet-growth-expanded에 두며 저장소에는 요약/CSV만 남긴다. 최초 부하 시간 초과와 중단된PC실행도 로그에 보존한다. 성능 표본은 다른 재생/테스트가 끝난 뒤 새로 측정했다. 실험 브랜치 로컬 커밋만 남기고 master 반영/원격push는 하지 않는다.

준비: node --import tsx scripts/prepare-bot-quiet-growth-review.ts --out=../NEW_REVIEW. 이후 bot-growth-analysis.ts를 --arm=native --source-key=native/candidate/off로 실행한다(off는3600tick). 양쪽 --human 실행, bot-quiet-growth-neutral-audit.ts/pool-proof.ts/실제 회수 재현, 기존 medium/expanded/known-seed1, 같은 세션 성능과 요약 script를 순서대로 실행한다. 기존 결과를 덮어쓰지 말고 새 폴더를 사용하며 일부 요약/중립 audit 기본 root는 이번 동결 폴더를 가리킨다.
`;
writeFileSync('docs/bot-ai-quiet-growth-review.md',text);console.log('docs/bot-ai-quiet-growth-review.md');
