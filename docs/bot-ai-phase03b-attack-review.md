# 3B 공격 회귀 검토 — 조건 변경 없이 비교

2026-10-13 · 실제3A 5b714ea vs 전술100ms 관전 후보 b23f47b · 최종 채택 검토 대기

사용자 요청대로 기존16개 중거리 시나리오, 고정8시드 공격 시작·표적 처치·거절 사유, 원래 탐험가 시드1의 같은 구간 판단을 비교했다. 게임의 공격·안전·주기·점수·예약·RNG 조건과 현재 관전 빌드는 변경하지 않았다. 이번 변경은 읽기 전용 audit·테스트·문서다. 개인별 전략은OFF, 근접 B안은 미구현이다.

전체 공격 시작은163→179로 증가 방향 신호다. 표적 처치는75→73이고, 시드별 증가3/감소4/동률1로 방향 구분 불가다. 공격당 표적 처치는46.01%→40.78%로 낮아졌다(3증가/5감소, 구분 불가). 따라서 전술 단독이 광범위하게 공격을 막는다는 증거는 이번 표본에서 나오지 않았지만, 효율 하락과 원래 시드1의 실제 기회 손실은 보존한다. 성격 구별 관전이 긍정적이라는 사용자 피드백도 함께 검토하되, 최종 채택은 사용자 결정 전이다.

## 16개 중거리 공격 audit의 기준 정정

**이번 실제3A는12/16이고 전술 후보는13/16이다.** 16/16은 저장된2단계 결과(evidence/bot-phase02/medium-results.json)이며 실제3A 기준으로 재현되지 않는다. 5b714ea의 원본 medium-attack-audit.ts를 그대로 동결3A에서 실행했고, 소스 선택을 추가한 현재 adapter의 결과 전체JSON과 동일함을 확인했다. 좋은 결과가 나오는 새 봇 시드를 선택하거나 실패 시나리오를 빼지 않았다.

R22·spawnRadius2(19칸)·matchSeed115·사람#0/봇#1·봇 memorySeed7, 성격4개×원래 이동 경로4개다. 실제 선 절단은 피해 사람의 DEATH가 해당 봇 처치이며 원인이 EXISTING_TRAIL_CONTACT/PENDING_TRAIL_CONTACT인 경우다. HOME_CAPTURE나 단순 사망은 이 지표에 넣지 않는다.

|같은16개 시나리오 호출|3A|전술 후보|새 손실|회복|
|---|---:|---:|---:|---:|
|기존 기본 호출(개인 성격 특성 identity 없음, getBotInput)|12/16|13/16|0|1|
|--phase01(identity 포함, getBotInput)|12/16|13/16|0|1|
|--phase01 --phase02(identity와 실제 예약 director 포함)|12/16|13/16|0|1|

기존 실패는 선사냥꾼 경로1·2, 영역도둑 경로1·2다. 전술 후보는 영역도둑 경로1만 회복했고 다른3개 실패는 그대로다. 영역탐험가의 네 경로는 양쪽 모두 성공한다. 이16개는 memorySeed7이며, 원래 회귀 테스트의 memorySeed1은 별도 사례다. 16개 개선으로 시드1을 해결했다고 해석하지 않는다.

## 자연 대전의 정의와 8시드 결과

4·19·73·11·31·47·101·137, R56·14봇·spawnRadius1·safeRespawn·classic·30Hz·t0~3599 입력/해결t1~3600(120초)다. 기존 마감과 같은 배정·행동 시드·시간창이다.

- 공격 시작은 입력 계산 이후 최종 goal이 ATTACK에 실제 진입/재진입하거나 상대 참가자/생명이 바뀐 경우다. 같은 상대·생명에서 목표 선 칸이나 경로만 갱신한 것은 새 공격으로 세지 않는다. 선택됐다가 즉시 안전으로 덮인 공격도 세지 않는다.
- 성공은 그 공격이 입력 후/시뮬레이션 step 전 활성인 동안 선택한 상대·생명이 이 봇의 처치로 기록되는 DEATH다. 다른 상대의 우연한 처치나 공격 종료 후 처치는 제외한다. 시작 당시 생존 역공 여부도 따로 보존한다.
- 종료창에 미완료인 공격은3A1개, 후보3개다. 표의 성공/시작은 이를 포함한 같은120초 창의 비율이며 완결된 공격만의 장기 성공 확률이 아니다. 이 차이가 효율 하락을 단독으로 설명하지도 않는다.

|지표|3A|전술100ms|판정|
|---|---:|---:|---|
|공격 시작|163|179|+9.82%, 7증가/1감소, 증가 신호|
|공격 중 표적 처치|75|73|-2.67%, 3증가/4감소/1동률, 구분 불가|
|표적 처치/공격 시작|46.01%|40.78%|−5.23%p, 3증가/5감소, 구분 불가|
|시작/생존 봇분|0.743|0.814|7증가/1감소, 증가 신호|
|처치/생존 봇분|0.342|0.332|3증가/5감소, 구분 불가|

생존 봇 시간으로도 정규화해 사망이 줄어 활동 시간이 늘어난 영향을 분리했다. 기존7/8 같은 방향 및 모든 leave-one-out 방향 유지 조건을 적용하며 구분 불가는 효과 없음/동등함을 뜻하지 않는다. 새로운 공격 합격 수치를 임의로 만들지 않았다.

|시드|공격 시작3A→후보|표적 처치3A→후보|
|---:|---:|---:|
|4|22→23|10→9|
|19|19→14|10→7|
|73|19→23|7→11|
|11|20→21|12→8|
|31|16→17|8→9|
|47|21→25|8→8|
|101|26→32|8→13|
|137|20→24|12→8|

|성격|공격 시작3A→후보|표적 처치3A→후보|처치/시작3A→후보|
|---|---:|---:|---:|
|선사냥꾼|45→46|24→23|53.33%→50.00%|
|영역탐험가|48→60|19→15|39.58%→25.00%|
|안전지킴이|42→42|19→21|45.24%→50.00%|
|영역도둑|28→31|13→14|46.43%→45.16%|

특히 탐험가의 표적 처치19→15(−21.05%)와 효율39.58%→25.00%를 숨기지 않는다. 처치의 시드별 방향은3증가/4감소/1동률로 구분 불가이고 seed137의5→1을 빼면 나머지 합계14→14다. 기존 시드1의 탐험가 회귀가 자연 대전 전반으로 확산됐다고 단정하기에도, 영향이 없다고 지우기에도 표본이 부족하다. 성격별·시드별 값은CSV에 남겼다.

## 공격 거절 사유 분포

trace 안의 동일 slot/target/interrupt/reason은 한 번 세고, 다른 판단에서 같은 선을 다시 검사한 것은 관측 평가로 다시 센다. SELECTABLE은 거절 사유가 아니다. 표의 비중 분모는 거절 관측만이다. 이는 독립적인 공격 기회 수나 실제 공격 취소 수가 아니다.

|거절 사유|3A 관측 수(거절 비중)|전술 관측 수(거절 비중)|
|---|---:|---:|
|NO_APPROACH|20270 (60.32%)|46862 (64.88%)|
|VICTIM_RETURNS_FIRST|11390 (33.89%)|19688 (27.26%)|
|TRAIL_BUDGET|1770 (5.27%)|5366 (7.43%)|
|STEAL_DIVERSION_LIMIT|78 (0.23%)|211 (0.29%)|
|COUNTER_CUT_FIRST|71 (0.21%)|79 (0.11%)|
|LOW_PRIORITY|17 (0.05%)|16 (0.02%)|
|UNSAFE_RETURN|9 (0.03%)|8 (0.01%)|

후보가 있는 판단은12,760→28,356, 전체 후보 관측은34,051→73,207다. 전술 검사가 추가되어 같은 선의 재검사가 늘었다. 판단당 거절은2.634→2.547, 전체 후보 중 SELECTABLE 비중은1.31%→1.33%다. 전략 동반/전술 단독 층과 성격별 분자·분모도 summary/CSV로 보존한다. 총 거절 수 증가만으로 공격 조건이 강화되었다고 해석하지 않는다. NO_APPROACH 비중 증가와 원인 분해는4단계 후보로 유지하고 이번에 조건을 조정하지 않는다.

## 원래 시드1: 같은 구간의 판단 기록

R22·19칸 스폰·matchSeed115·사람#0/탐험가#1·memorySeed1·identity 없음, 원래 사람 이동 경로와 direct getBotInput을 양쪽에 그대로 썼다. 새 숫자로 바꾼 긍정 fixture가 아니라 원래 입력이다.

|tick|3A|전술 후보|
|---:|---|---|
|17|LAUNCH_NO_SAFE_OWNED_ROUTE → RETURN, 경로 비움|같은 결과. 이 시점의 위치·방향은 같음|
|18|다음 전략t19까지 RETURN 유지|전술 판단에서 자기 땅/빈 경로를 확인하고 전략을 긴급 재개. EXPANSION_SCORE → EXPAND. 최초 조향 입력 차이|
|19|확장 계획 생성|이미 선택한 확장 지속|
|25|표적612 COUNTER_CUT_FIRST|같은 표적/거절 사유|
|31|표적612 거리3, 도착0.7333초 + 여유0.1 < 귀환0.8667초 → SELECTABLE, ATTACK_OPPORTUNITY|표적612 거리4, 도착1.1928초 + 같은 여유0.1 ≥ 같은 귀환0.8667초 → VICTIM_RETURNS_FIRST|
|37|공격 유지, 표적612 SELECTABLE|표적612/570/529 VICTIM_RETURNS_FIRST, RETURN 지속|
|53|22tick 공격 후 실제 선 절단 처치|공격 시작 없음|
|76|앞서 종료|사람 점령1회 후 생존, 공격0tick|

첫 차이는 공격 후보가 생기기 전t18의 긴급 전략 재계획이다. 원래3B 조정자의 '전술에서 자기 땅의 빈 경로가 완료되면 전략 즉시 재개' 경로가 후보에서 작동했고,3A는 정규 전략t19를 기다렸다. 이1tick 조향 차이가 뒤의 접근 위치·방향과 ETA를 바꿨다. t31의 공격 여유0.1초와 상대 귀환0.8667초는 양쪽 동일하지만 도착 ETA가 달라 같은 기존 조건으로 후보가 탈락했다. 즉 회귀의 실행 경로는 **재계획 시각→동선/각도→VICTIM_RETURNS_FIRST**다. 첫 차이 이전의 두 입력·위치가 같은 것도 확인했다. 이를 근거로 안전 검사를 완화하거나 즉시 재계획을 수정하는 실험은 이번에 하지 않았다.

원래 사례에서3A의 거절/선택 관측은 COUNTER_CUT_FIRST1, VICTIM_RETURNS_FIRST3, SELECTABLE2다. 후보는 COUNTER_CUT_FIRST2, VICTIM_RETURNS_FIRST28, SELECTABLE0이다. 후보가 더 오래 살아 있는t54~75와 추가 전술 재검사까지 포함한 수이므로 3→28을 같은 기회28개 상실로 읽지 않는다. 같은 tick의 상세 판단과 좌표·각도는 요약, 전체frame/trace는.local에 보존한다.

## 원래 테스트 보존과 관전 피드백

medium-attack.test.ts의 원래 seed1 조건/실제 절단 assertion을 known regression 이름의 it.fails로 복원했다. skip하거나 원래 입력을 시드3으로 덮어쓰지 않는다. 회귀가 완전히 해결되면 예상 실패가 뜻밖에 통과하여 테스트가 실패하므로 표식을 제거해야 한다. 시드3의 양 출발 역할 테스트는 별도 이름의 긍정 fixture로 유지한다. 공격 audit 집계 테스트4개와 중거리 테스트를 실행해 정상9개 통과·알려진 회귀1개 expected fail을 확인했다. 프로젝트 타입 검사와 변경 audit strict 타입 검사도 통과했다.

사용자는 #1 t1300~2050/t3000~6400, #10 t6000~8500에서 구별이 되는 것 같다고 보고했고, 자주 밀집해 있어 판단이 어렵다는 조건도 남겼다. 직전 안내seed73의 관전 메모로 기록하되 이번 메시지에 seed가 다시 명시되지는 않았다. 이 관전 구간은 사용자 관찰이며, 자동8시드 t1~3600 결과가 뒤 구간 전체를 재생 검증했다는 뜻은 아니다. 성격 구별에 관한 긍정적인 체감 자료로 사용하고 공격 회귀 검사와 별도로 둔다.

## 검증과 다음 판단

읽기 전용 공격 계측의 두 버전 각8시드는 기존 동결 재생과 **궤적·판단 trace·메모리·다음 행동 RNG·director/예약·사망 합계**가 모두 일치했다. 게임 shared 소스 전체도 b23f47b의 동결 후보 SHA256과 같다. 현재 서버/빌드와 공격·안전·확장·예약 조건, master는 변경하지 않았다. 원본16개와 시드1/8시드 trace는.local/bot-phase03b-attack-review에 보존하고 저장소에는 요약/CSV를 남긴다.

이번 근거로 '공격을 전반적으로 거의 안 한다'는 이유로 전술 후보를 버릴 필요는 없어 보인다. 다만 성공 효율 감소와 탐험가의 개별 기회 손실은 실제로 남아 있으므로 '회귀 없음'으로 닫지 않는다. 알려진 회귀를 유지하면서 전술 후보를 채택할지 검토하는 게 합리적이다. 이번 작업에서는 최종 채택·추가 안전/공격 수정·3단계 마감/master 병합을 진행하지 않았다.

- [요약 및 같은 tick 비교](../evidence/bot-phase03b-attack-review/summary.json)
- [8시드 시작·성공](../evidence/bot-phase03b-attack-review/paired-seeds.csv), [성격별·시드별](../evidence/bot-phase03b-attack-review/personality-seeds.csv)
- [16개 원래 시나리오](../evidence/bot-phase03b-attack-review/medium-scenarios.csv)
- [거절 분포](../evidence/bot-phase03b-attack-review/rejection-distribution.csv), [성격별·시드별 거절](../evidence/bot-phase03b-attack-review/rejection-personality-seeds.csv)
- [동일성 및 테스트 검증](../evidence/bot-phase03b-attack-review/validation.json)

재현은 이전 prepare 스크립트로3A/현재 후보 shared 소스를 새 폴더에 동결한 뒤 아래 명령을 각각 실행한다. 기존 raw를 덮어쓰지 않는다.

~~~powershell
node --import tsx scripts/medium-attack-audit.ts --source=../FROZEN/baseline-source --phase01 --phase02 --out=../NEW_ATTACK/medium-baseline.json
node --import tsx scripts/medium-attack-audit.ts --source=../FROZEN/tactical-source --phase01 --phase02 --out=../NEW_ATTACK/medium-tactical.json
node --import tsx scripts/bot-phase03b-attack-audit.ts --source=../FROZEN/baseline-source --out=../NEW_ATTACK/baseline.json
node --import tsx scripts/bot-phase03b-attack-audit.ts --source=../FROZEN/tactical-source --out=../NEW_ATTACK/tactical.json
node --import tsx scripts/bot-phase03b-attack-audit.ts --source=../FROZEN/baseline-source --original-case --out=../NEW_ATTACK/original-baseline.json
node --import tsx scripts/bot-phase03b-attack-audit.ts --source=../FROZEN/tactical-source --original-case --out=../NEW_ATTACK/original-tactical.json
~~~

summary 스크립트는 다른 호출 모드의16개 결과와 원본3A 스크립트 동일성 파일도 검증한다. 동일 프로토콜/출처를 갖추고 실행하며, 다른 기준 소스/시간창을 기존 요약과 섞지 않는다.
