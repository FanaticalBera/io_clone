import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const root=resolve('../bot-loop-ceiling-range-exploration'),result=JSON.parse(readFileSync(resolve(root,'summary.json'),'utf8')),arms=result.summaries;
const fmt=(n:number|null,d=2)=>n===null?'결측':n.toFixed(d),pct=(n:number|null)=>n===null?'결측':fmt(n*100)+'%',signed=(n:number)=>`${n>=0?'+':''}${fmt(n)}`;
const signal=(v:string)=>v==='INCREASE'?'증가 신호':v==='DECREASE'?'감소 신호':'구분 불가';
const lines=['# 조용한 quota 이상 구간의 루프 천장 탐색','',`기준은 사용자 채택 holding-risk ${result.baselineCommit.slice(0,7)}다. 고정 시드 ${result.seeds.join('·')}를 같은 세션에서 네 갈래로 재생했다. **탐색 결과이며 채택 검증이 아니다.** 인원/부활·위험 강화·출발·벽·근접 머리 검사·공격 조건은 유지한다.`, '',
'세 조합 모두 사망이+20% 재검토선을 넘어서 채택을 권하지 않는다. 32칸은 보유 증가 신호(+5.21%)가 있으나 사망도 증가 신호(+27.85%)다. 일반 경기 실험은 비활성이고 기존 채택 기준과8시드 동작이같다.','',
'## 고정 조합과 시행 방식','',
'관측된 적 머리0명이고 보유가 위험 강화 시작 quota 이상일 때만 확대한다. 사용자 확인으로 R56/14에서256칸을 사용한다. 세 후보의 경로 상한만32/40/48로 다르고 선 한도 및 길이·폭 생성 상한은 모두×1.75다. 최소값을 유지하여 작은 후보도 남긴다. 차원x의 생성식은 `floor((x−1)+U×((x+2)×1.75−(x−1)))`이며 기존 min clamp를 유지한다. 같은 경계/방향/shape 풀과 후보 수를 사용한다. 후보의 통과 변화 때문에 점수 RNG 소비까지 같다고 주장하지 않는다.','',
'초기 pilot은 생성한 정수 길이·폭을 그대로 배율로 키워 최소값까지 올렸다. 이를 범위 확대 요청에 맞게 수정했고, 초기 수치는 채택 근거로 쓰지 않는다. 초기 원본은 `.local/bot-loop-ceiling-exploration/`에 남겨 두었다. 수정식과32/40/48·8시드를 새로운 원본 측정 전에 다시 동결했다. 같은 세션 기준군은source hash와8시드 이전 채택 버전 동일성을 확인하고 그대로 재사용했다.','',
'경로에는 자기 땅 출발 prefix도 포함한다. 성격별 선 한도는 안전지킴이21, 선사냥꾼/영역도둑31.5, 영역탐험가35다. 정수 선 길이와 비교하는31.5를 임의 반올림하지 않아 성격 비율을 유지한다. 선택한 확장의 허용치를 RETURN/ESCAPE까지 보관하며, 새로운 머리를 관측해도 기존 모든 머리 위험 검사와 근접 압력/조기 귀환을 적용한다. 공격 전환 때 확대 허용치를 없애고 공격 예산은 원래 값이다.','',
'## 120초 주 비교','',
'보유는 매tick 처리 후 봇14명의 실제 보유 합을 시간 평균한 값이다. 사망 대기0칸과 부활 지급을 포함하고 사망 손실을 되더하지 않는다. 전체 평균은8시드의 평균, 사망/손실/점령 횟수는8시드의 합이다.','',
'|갈래|보유 시간 평균|기준 대비|paired 방향|사망|기준 대비|paired 방향|실제 점령 평균 / 중앙값 / p90 / 최대|',
'|---|---:|---:|---|---:|---:|---|---|'];
for(const a of arms)lines.push(`|${a.arm}|${fmt(a.holdingMean)}|${signed(a.holdingPercent)}%|${signal(a.holdingDirection.signal)} (${a.holdingDirection.increase}↑/${a.holdingDirection.decrease}↓/${a.holdingDirection.equal}=)|${a.deaths}|${signed(a.deathPercent)}%|${signal(a.deathDirection.signal)} (${a.deathDirection.increase}↑/${a.deathDirection.decrease}↓/${a.deathDirection.equal}=)|${fmt(a.captures.mean)} / ${a.captures.median} / ${a.captures.p90} / ${a.captures.maximum}|`);
lines.push('','신호는 같은시드 기준 대비7/8 같은 방향이고 어느시드 하나를 빼도 합계 방향이 같을 때만 표시한다. 구분 불가는 효과 없음이 아니다. 점령은 실제 capture transfer의 획득 칸 수다. 예상 큰 후보와 실제 회수 크기를 구별한다.','','### 시드별 값','', '|seed|기준 보유 / 사망|32 보유 차이 / 사망 차이|40 보유 차이 / 사망 차이|48 보유 차이 / 사망 차이|','|---|---:|---:|---:|---:|');
for(let i=0;i<result.seeds.length;i++){const b=arms[0].perSeed[i];lines.push(`|${b.seed}|${fmt(b.holding)} / ${b.deaths}|${arms.slice(1).map((a:any)=>`${signed(a.perSeed[i].holdingDifference)} / ${a.perSeed[i].deathDifference>=0?'+':''}${a.perSeed[i].deathDifference}`).join('|')}|`);}
lines.push('','### 점령 크기 분포','', '|갈래|0~3|4~7|8~15|16~31|32~63|64~127|128+|점령 횟수|사망 손실 칸|','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const a of arms)lines.push(`|${a.arm}|${a.captures.bins.map((b:any)=>b.count).join('|')}|${a.captures.count}|${a.deathLoss}|`);
lines.push('','|갈래|첫30초 평균|30~60초 평균|60~90초 평균|90~120초 평균|확대 계획 수|확대 계획 정상 점령 완료 / 실제 획득|','|---|---:|---:|---:|---:|---:|---|');
for(const a of arms)lines.push(`|${a.arm}|${a.by30Seconds.map((w:any)=>fmt(w.distribution.mean)).join('|')}|${a.quietPlans.count}|${a.quietPlans.completed} / ${a.quietPlans.gain}|`);
lines.push('','확대 계획 완료는 해당 계획 episode가 CAPTURE로 닫힌 경우다. 안전 중단 후 다른 계획으로 점령한 칸은 이 완료 수에 넣지 않는다. 전체 점령 통계에는 포함한다.','','|갈래|안전지킴이 평균 / p90|선사냥꾼 평균 / p90|영역탐험가 평균 / p90|영역도둑 평균 / p90|','|---|---:|---:|---:|---:|');
for(const a of arms)lines.push(`|${a.arm}|${a.byPersonality.map((r:any)=>`${fmt(r.distribution.mean)} / ${r.distribution.p90}`).join('|')}|`);
lines.push('','## 사람1+봇13의180초 선두 참고','', '기존 자동 입력4개 루프 fixture를 그대로 사용했다. 사용자의2~3분30% 실제 플레이를 재현하는 입력은 아니다. 사람 사망 시 연습이 멈추므로180초 전에 끝난 시드는 결측으로 표시한다. 도달한 시드만 모은 평균을8시드 개선 근거로 쓰지 않는다.','', '|seed|기준|32|40|48|','|---|---:|---:|---:|---:|');
for(let i=0;i<result.seeds.length;i++)lines.push(`|${result.seeds[i]}|${arms.map((a:any)=>{const r=a.human.perSeed[i];return r.reached180?pct(r.leadingBotShare):`결측 (t${r.endedTick}, ${r.humanState})`;}).join('|')}|`);
lines.push('','|갈래|180초 도달 /8|선두20% 도달 /유효 시드|기준과 모두 도달한 시드|','|---|---:|---:|---|');
for(const a of arms)lines.push(`|${a.arm}|${a.human.available}/8|${a.human.target20}/${a.human.available}|${a.human.pairedSeeds.join('·')}|`);
lines.push('','## 정확 캐시 중복률 — 구현하지 않음','', '동일 전략 판단 안의 map/owners/owner 고정 상태에서 plannedCapture 입력을 정렬된 unique 비자기영토 blocked 칸 집합으로 묶었다. 자기 영토는 이미 flood 장벽이라 경로의 자기 땅 prefix 차이는 결과에 영향을 주지 않는다. 결과를 재사용하지 않고 같은 flood를 전부 실행했다. Tactical earlyClosure나 다른tick 사이의 결과를 섞지 않는다.','', '|갈래|전체 호출 / 정확 중복|전체 중복률|확대 가능 판단 수|그 판단의 호출 / 정확 중복|그 판단 중복률|원래 순서 경로가 같은 중복 수|','|---|---:|---:|---:|---:|---:|---:|');
for(const a of arms){const all=a.cache.all,q=a.cache.eligible;lines.push(`|${a.arm}|${all.calls} / ${all.duplicates}|${pct(all.duplicateRatio)}|${q.decisions}|${q.calls} / ${q.duplicates}|${pct(q.duplicateRatio)}|${q.pathDuplicates}|`);}
lines.push('', '중복률은 피할 수 있는 flood 호출의 이론상 상한이며 tick 비용 절감률이 아니다. key 생성/정렬/할당·캐시 조회 비용을 제외한 수치다. 비용 최적화와 행동 변경은 이번에 섞지 않았다.','',
'## 탐색 회귀와 계측 비간섭','', '|갈래|중거리 실제 선 절단 /16|실패ID|새 손실|재배치 도착tick|회수tick / 칸|사망|계측 제거8시드|','|---|---:|---|---:|---:|---|---:|---|');
for(const a of arms){const r=result.recovery.find((r:any)=>r.arm===a.arm);lines.push(`|${a.arm}|${a.medium.cuts}/16|${a.medium.failedIds.join('·')}|${a.medium.newLossIds.length}|${r.lastReposition.endedTick}|${r.ticks} / ${r.actualRecovered}|${r.deaths}|궤적·메모리·RNG·예약·보유 동일|`);}
lines.push('', '기준 재생은 이전 채택c8f825d의8시드120초 궤적·판단·메모리·RNG·예약과도 같았다. quota 문턱·확장 예산의 귀환 유지·관측 머리 위험·공격 예산 분리를 확인하는 신규 focused tests2개와 타입 검사도 확인했다. 전체 테스트/PC/known seed1 별도/확장1,024/240초/observer 없는 비용은 탐색 범위 밖이라 이번에 실행하지 않았다.','',
'기존 재배치 회수 fixture의 보유는75칸이고 R28/3의quota 시작값은약304칸이므로 확대 조건이 켜지지 않는다. 이 통과는 기존 작은 봇 회귀의 보존이며 quota 이상 큰 봇의 회수 안전성을 보증하지 않는다.','',
'## 검토와 다음 단계','',
'32칸은 보유 평균 증가7/8 방향 신호가 있으나 사망도 증가 신호이고+20% 재검토 기준을 넘는다. 40·48칸은 보유 증가 방향 구분 불가이며 사망도+20%를 넘는다. 이번 세 조합은 채택 후보로 권하지 않는다. 경로32/40/48만 비교한 실험이라 선 예산 확대와 geometry 중 어느 요인이 사망을 늘렸는지는 분리하지 않았다.','',
'현재 일반 경기의 실험 플래그는비활성이다. 새 경기에서 같은8시드120초를 돌려 궤적·메모리·RNG·예약·보유 모두c8f825d 기준과같음을 확인했다. 큰루프3조합의 동결 소스와 결과는 보존한다. 기존 위험 강화/출발/벽 안전은 유지한다.240초·확장1,024·known seed1·비용·전체 테스트·사람 플레이의 채택 검증은 시작하지 않았다.','',
'다음 작업을 제안한다면 같은 재생에서 확대 선 허용치를 가진 계획의 위험 중단/노출길이/사망 손실을 먼저분리한뒤, 경로/geometry는유지하고 확대 선 예산만낮추는 단일 후보의 수치를 별도로 제안한다. 아직 그 후보를 구현하거나 추가 수치 갈래를실험하지 않았다.','',
'최종 원본 JSON과 동결 source는 메인 checkout의 `.local/bot-loop-ceiling-range-exploration/`에, 폐기한 초기 pilot은 `.local/bot-loop-ceiling-exploration/`에 보존했다. 저장소에는 [요약](../evidence/bot-loop-ceiling-exploration/summary.json), [시드별CSV](../evidence/bot-loop-ceiling-exploration/seeds.csv), [사전 프로토콜·source hashes](../evidence/bot-loop-ceiling-exploration/protocol.json)만 둔다. master/원격은 변경하지 않는다.','');
writeFileSync('docs/bot-ai-loop-ceiling-exploration.md',lines.join('\n'));console.log('docs/bot-ai-loop-ceiling-exploration.md');
