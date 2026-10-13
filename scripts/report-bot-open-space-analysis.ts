import {readFileSync,writeFileSync} from 'node:fs';
const result=JSON.parse(readFileSync('../bot-open-space-analysis/summary.json','utf8')),p=JSON.parse(readFileSync('../bot-open-space-analysis/protocol.json','utf8')),a=result.opportunities,m=result.movement;
const percent=(n:number|null)=>n===null?'결측':(n*100).toFixed(2)+'%',num=(n:number|null)=>n===null?'결측':n.toFixed(2),labels:Record<string,string>={EXPAND:'영역탐험가',ATTACK:'선사냥꾼',DEFEND:'안전지킴이',SEEK_POINT:'영역도둑'};
const names=readFileSync('docs/bot-nickname-pool-review.txt','utf8').trim().split(/\r?\n/),fit=JSON.parse(readFileSync('evidence/bot-open-space-analysis/nickname-fit.json','utf8'));
writeFileSync('docs/bot-nickname-pool-review.md',[
'# 봇 닉네임 풀 검토용 초안','',
'[전체288개 목록](bot-nickname-pool-review.txt)의1~48행은 기존 이름 그대로,49~288행은 신규240개다. 코드의48개 풀과 배정 RNG는 변경하지 않았다. 검토 후 승인된 이름만 코드에 추가한다.','',
'신규는 짧은 문장·일상/게임 농담·영문/숫자·일본어·이모티콘·도발/욕설을 섞었다. 마지막20개는 요청에 맞춘 욕설/성인 느낌의 후보다. 실존 유명인·브랜드를 의도한 이름이나 특정 집단을 비하하는 이름은 넣지 않았다. 번호만 붙인 변형·대소문자 변형으로 목록을 늘리지 않았다.','',
'기존 이름과의 NFKC/대소문자 정규화 중복0, 신규 중 기존/신규와 편집거리1 이내인 쌍0, 현재 normalizeNickname 통과288개다. 이 검사는 뜻이 비슷한 이름까지 자동으로 판별하는 검사가 아니므로 최종 취향 검토는 목록에서 한다.','',
`PC1280×720의 실제Jua 폰트와 현재HUD CSS로 검증했다. 순위14·점유율100.0%·처치99·봇 표시까지 넣은 미니/전체 순위에서 잘림${fit.clipped.length}개다. 이름 최대 폭은 전체${fit.rankMaxWidth}px/미니${fit.miniMaxWidth}px, 미니 이름칸 최소${fit.minimumMiniAvailable}px였다. UI를 수정해 맞춘 것이 아니다.`,'',
'예시: `내땅인데요`, `퇴근까지3분`, `도망가는쌀`, `오입력장인`, `lag_goose`, `exit_pls`, `ねむいです`, `🐸퇴근함`, `씨발벽이네`.','',
'목록 파일은 한 행당 하나의 이름이다. 뜻/말투가 마음에 안 드는 항목을 지우거나 수정해서 전달하면 그 검토본을 사용한다. 지금은 생성/배정 코드에 반영하지 않았다.',''
].join('\n'));
const lines=['# 열린 공간 경계 분석과 B 단일 변경 제안','',
'**제안: 기존 성격별 경계6개와 피해 경계최대2개를 그대로 두고, 열린 공간 경계를 최대1개 추가한다.** 새 가산점·모양·크기·안전 완화·강제 계획 취소는 넣지 않는다. 구현은 사용자 승인 후다. A닉네임은 별도 파일 검토, C새모양은B 적용과 관전 후로 보류한다.','',
`기준은 master ${p.commit.slice(0,7)}(c8f825d 채택 내용)다. 고정 시드 ${p.seeds.join('·')}의 120초를 **각각 한 번씩** 재생했다. 별도shadow에서는 새 경계의 후보만 평가했고 원래 후보 전체를 다시 돌리지 않았다. 행동/배정/예약 RNG를 소비하지 않는 post-native RNG 복제본을 사용했다. 추가1개/2개 결과는 같은 재생에서 함께 계산한 반사실 결과이며 실제 B 실행 결과가 아니다.`,'',
'## 읽기 전용 결과','',
`전략 계획 선택 ${a.decisions}회, 원본에서 적용된 확장 계획 ${a.applied}회, 실제 외부 출발 ${m.departures}회다. 계획 선택과 실제 출발을 같은 분모로 합치지 않는다. 현재 확장 출발 경계와 가장 열린 경계가 다른 것은 ${a.bestOpenDifferent}/${a.comparableAnchors}(${percent(a.bestOpenDifferentRate)})이며, 둘 사이 hex거리 중앙값${a.anchorShift.median}/p90 ${a.anchorShift.p90}칸이다. 가장 열린 경계가 기존 경계 목록 밖인 경우는 ${a.bestOpenNotInExisting}회다.`,'',
`새 경계를 찾은 판단 ${a.withOpenExtra}회 중 ${a.decisionsWithSafe}회(${percent(a.safeGivenExtra)})에서 기존 검사 전부를 통과하는 새 확장 후보가 최소1개 있었다. 새 후보 ${a.newCandidates}개 중 ${a.newSafeCandidates}개가 출발1초·벽 검사를 포함해 통과했다. 단, 이것은 현재 정보에서의 계획 검사 통과이며 이후의 생존 보장이 아니다.`,'',
'|추가 경계|선택 경로 변경 /전체 판단|첫 외부 출발 방향 변경|기존 공격 선택 대체|RETURN 대신 확장 가능|열린 평가 방향과 정확히 같은 출발|',
'|---|---:|---:|---:|---:|---:|'];
for(const v of a.variants)lines.push(`|최대${v.slots}개|${v.changed}/${a.decisions} (${percent(v.changedRate)})|${v.changedDirection}|${v.replacesAttack}|${v.replacesReturn}|${v.alignedToOpenDirection}/${v.changed}|`);
lines.push('', '점수 동률에서는 원래 후보를 먼저 유지했다. 경계 추가는 선택지 증가이며 특정 방향을 강제하지 않는다. 추가1개에서 열린 평가의 정확한 방향을 따른 것은545/1034이고 나머지는 같은 경계에서 다른 기존 방향 후보를 선택했다. 실제 방향 분포 개선은 구현/재생/관전 전에는 주장할 수 없다.','',
'|상황|판단 수|추가1개 선택 변경|추가2개 선택 변경|','|---|---:|---:|---:|');
for(const [key,label]of [['crowded','관측 머리6칸 이내'],['stagnant','12초간 생존 중 보유 고점 갱신 없음'],['crowdedOrStagnant','둘 중 하나'],['quiet','관측 머리0명']]){const c=result.cohorts[key];lines.push(`|${label}|${c.decisions}|${c.variants[0].changed} (${percent(c.variants[0].changedRate)})|${c.variants[1].changed} (${percent(c.variants[1].changedRate)})|`);}
lines.push('','12초 정체 기준은 이번 분석의 분류용이다. 새로운 대기/취소 타이머로 구현하지 않는다. 가장 열린 곳이 원래6개에 이미 있어도 기존 점수는 탈취/면적/위험/회전까지 보므로 그 경계를 반드시 고르는 것은 아니다. 열린 점수와 최종 행동 점수는 다르다.','',
'|seed|보유 시간 평균|사망|추가 경계 판단 /안전 대안|추가1개 경로 변경|추가2개 경로 변경|실제 확장 출발|','|---|---:|---:|---:|---:|---:|---:|');
for(const r of result.perSeed)lines.push(`|${r.seed}|${num(r.holding)}|${r.deaths}|${r.opportunities.withOpenExtra} / ${r.opportunities.decisionsWithSafe}|${r.opportunities.variants[0].changed}|${r.opportunities.variants[1].changed}|${r.movement.departures}|`);
lines.push('','## 움직임 유사도 기준값 — C는 측정만','',
'한 봇의 같은 생명에서 인접한 실제 확장 출발끼리만 비교한다. 출발 당시 목표EXPAND/STEAL이고 선택 계획의 생명이 일치한 경우를 확장 출발로 분류하며 ATTACK/RETURN 출발은 섞지 않는다. 사망/부활을 가로질러 반복으로 세지 않는다. 방향은 첫 외부 칸으로 실제 들어간 이웃 방향이다. 같은 모양·크기는 회전을0으로 정규화한 expansionSides의 변 방향/길이가 같다는 뜻이며, 쓰이지 않는 bevel 값 차이를 별개 모양으로 세지 않는다. 실제 조기 닫힘/회수 경로는 계획과 달라질 수 있어 경로 길이+노출 길이 반복도 별도로 보고한다.','',
`전체의 같은 모양 반복 ${percent(m.shapeRepeat)}, 같은 모양·크기 반복 ${percent(m.shapeSizeRepeat)}, 같은 모양·계획 경로/노출 길이 반복 ${percent(m.effectiveRepeat)}다. 같은 실제 출발 칸 반복은 ${percent(m.launchRepeat)}, 출발 칸 이동 중앙값${m.launchShift.median}/p90 ${m.launchShift.p90}칸이다. 방향의 전체 합계는 고르게 보여도 개별 봇과 국소 혼잡 장면을 대신하지 않는다.`,'',
`두 인접 출발 모두 혼잡한 경우 ${result.movementCohorts.crowded.pairs}쌍에서 같은 모양100%, 같은 모양·크기${percent(result.movementCohorts.crowded.shapeSizeRepeat)}다. 두 출발 모두 관측 머리0명이었던 경우의 같은 모양·크기는${percent(result.movementCohorts.quiet.shapeSizeRepeat)}다. 기존 crowded 분기가 RHOMBUS/길이1~2/폭1로 제한하므로, 붙어 있을 때 비슷해 보인다는 관전과 맞는 제한이 존재한다. 이것만으로 혼잡이 성장/사망의 원인이라고 단정하지 않는다.`,'',
'|성격|실제 출발|동|북동|북서|서|남서|남동|같은 모양·크기 반복|같은 방향 반복|출발 이동 중앙값|','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const r of result.byRole){const d=r.movement;lines.push(`|${labels[r.role]}|${d.departures}|${d.bins.join('|')}|${percent(d.shapeSizeRepeat)}|${percent(d.directionRepeat)}|${d.launchShift.median}|`);}
lines.push('','봇별112행의6방향 분포·엔트로피·반복률·출발 이동 거리는 [CSV](../evidence/bot-open-space-analysis/movement-by-bot.csv)에 있다. 분포는 모든 생명의 출발을 포함하지만 연속 반복은 같은 생명 안에서만 센다. 전체 엔트로피가 높다고 관전의 유사도가 없다고 결론내리지 않는다.','',
'## 승인 요청용 수치와 구조 — 미구현','',
'|항목|제안|','|---|---|',
'|적용 시점|기존 새 확장 계획 생성 시, 실행 중 계획은 유지|',
'|기존 후보|성격별 우선 경계6개 순서+피해 경계최대2개 유지|',
'|새 후보|기존 목록에 없는 열린 경계최대1개를 뒤에 추가|',
'|정보 범위|현재 자기 위치에서 관측 범위12칸 안의 소유/중립 정보, 관측된 머리와 선만|',
'|출발 접근|자기 영토 안의 기존최대10칸 prefix, 총 경로24칸에 그대로 포함|',
'|열린 공간|경계의 외부 이웃 방향마다 깊이4칸·±30도 부채꼴12칸, 범위 밖/맵 밖은 중립으로 세지 않음|',
'|경계 순위|중립 칸N +0.5×min(관측 머리 거리,6)+0.25×min(관측 선 거리,6)−0.5×접근 길이|',
'|동률|접근 길이가 짧은 경계, 그다음 칸ID순; 추가 RNG 없음|',
'|확장 생성|새 경계도 기존6방향·같은 모양/길이/폭·성격별 선 한도로 생성|',
'|최종 후보 점수|기존 점수·D·보유 위험 강화 그대로, 열린 점수 가산 안 함|',
'|안전|기존 선/귀환/근접 머리·출발1초·벽·위험 강화 검사 모두 유지|',
'|정체 시 재선택|다음 정상 새 계획에서 열린 경계를 다시 평가; 강제 취소·새 REPOSITION·고정 대기 없음|','',
'최대1개를 먼저 권한다. 같은 시점 선택 변경18.31%로 제안 근거가 있고, 최대2개는26.99%지만 후보 생성 비용과 행동 변화 폭이 더 크다. 비용 개선/생존 개선/시드별 방향 신호를 아직 측정한 것으로 표시하지 않는다. 승인 후 하나만 실제 적용해120초8시드의 보유·사망·점령 크기+중거리16개+실제회수부터 본다.','',
'C는 B실행과 관전 후에도 필요한 경우에만 새 단일 변경을 제안한다. 단순히 EXPANSION_SHAPES에 새 이름을 더해도 현재 crowded의 강제 RHOMBUS 분기에는 적용되지 않는다는 점을 후속 설계에서 확인해야 한다. 이번에는 새 도형/긴 띠/선길이 확대를 넣지 않았다.','',
'## 탐색 검증과 범위 경계','',
`읽기 전용 기준의 보유 평균${num(result.holdingMean)}, 사망${result.deaths}, 실제 점령 평균${num(result.captures.mean)}·중앙값${result.captures.median}·p90 ${result.captures.p90}·최대${result.captures.max}다. 기존 값과 같은 결과로 B 개선이 아니다. 중거리13/16·새손실0(ID5·6·14 유지), 실제 재배치t103도착/t190에5칸회수·사망0이다. 450tick source/분석 비간섭 probe 및8시드 궤적·메모리·RNG·예약·보유 일치를 확인했다.`,'',
'앞으로 탐색은120초8시드 보유·사망·점령 분포+중거리16개+재배치 회수로 제한한다. 채택은 선택한 조합 하나만240초·확장1,024·observer 없는 비용·전체 테스트, 이후 사용자 플레이로 진행한다. 지금은 채택 검증·실제 B/C 행동·닉네임 배정을 실행하지 않았다. master/원격은 수정하지 않았다.','',
'원본과 동결 소스는 `.local/bot-open-space-analysis/`에, 저장소에는 [요약](../evidence/bot-open-space-analysis/summary.json), [프로토콜](../evidence/bot-open-space-analysis/protocol.json), [봇별CSV](../evidence/bot-open-space-analysis/movement-by-bot.csv)만 보존한다. 추가 원본 전체를 커밋하지 않는다.','');
writeFileSync('docs/bot-ai-open-space-proposal.md',lines.join('\n'));console.log('Nickname review and B proposal written; no gameplay changes.');
