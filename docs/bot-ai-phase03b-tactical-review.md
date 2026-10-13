2026-10-13 후속: [공격 회귀 검토](bot-ai-phase03b-attack-review.md)를 완료했다. 원래seed1 테스트를 알려진 회귀로 복원하고 seed3는 별도 긍정 테스트로 유지한다. 아래는 관전 후보를 준비한 당시의 기록이며, shared 동작과 비용+6.66%는 그대로다. 최종 채택은 검토 대기다.

# 3B 전술100ms 단독 관전 후보와 교차 비용 측정

2026-10-13 · codex/bot-ai-phase01 · 3A 기준5b714ea · master960f678 유지

사용자 검토대로 전술100ms 단독을 관전 후보로 준비했다. 전략은 기존6tick/200ms 및 slot%6 위상을 유지한다. 개인별 전략 주기·위상은 비활성 정의로 보존하고 HUD는 실제200ms 고정과 개인별 전략 OFF를 표시한다. 근접 B안은 구현하지 않는다. 3C 종료·집요함 자동 제외·3D 계측 완료 결정을 유지한다. **최종 채택과 master 병합은 사용자 관전 확인 후다.**

## 코드와 동일성

스케줄 전용 RNG의 세 번 추첨 순서를 보존해 전술 위상이 앞선 분리 실험과 같다. 개인별 전략용 추첨 결과는 현재 전략 주기/위상으로 사용하지 않는다. 행동·특성·예약 RNG와 안전·공격·후보 점수는 변경하지 않았다. 자기 땅 안 일반 이동은 전략 때 전술 정보를 갱신하며, 노출 선 또는 ATTACK/RETURN/ESCAPE/REPOSITION에서100ms 전술 판단을 수행한다. 기존 안전 완료/무효 경로 후 긴급 재계획은 유지한다.

새 관전 후보의8시드 재생은 이전 전술 단독 갈래와 궤적·trace·메모리·다음 행동 RNG·예약/director·보유·성격별 지표·안전 중단·전환 집계까지 모두 일치했다. 벽 사망0이다. 비용의 기준은 진단 hook을 덧붙인 소스가 아니라 **실제3A 5b714ea shared 소스**다. 보존한3A 재생 기준도 실제3A와8시드 해시·RNG·예약·보유 일치를 재확인했다. 3A와 전술 단독의 행동이 서로 같다는 뜻은 아니다.

## 같은 세션 비용

4·19·73·11·31·47·101·137, R56·14봇·spawnRadius1·safeRespawn·30Hz·3600tick. 하나의Node 프로세스에서 두 갈래를 각 시드 안에서 교차 실행했다. round+seed 순서에 따라 먼저 실행하는 갈래를 번갈아 바꿨다. 두 갈래 seed19 전체 재생을 각각 한 번 예열하고 버린 뒤3회×8시드×2갈래=48표본을 보존했다. getBotInputs+stepMatch만 측정하며 HUD·observer·audit는 껐다. 원본 소스 SHA256을 측정 전후 검증했고 실제 관전 소스와도 일치한다.

|전체8시드 round 비용, ms/tick|3A|전술100ms만|
|---|---:|---:|
|1회차|3.012|3.213|
|2회차|3.036|3.214|
|3회차|2.973|3.152|
|세 round 중앙값|3.012|3.213|

전체 비용 변화는 **+6.66%**, 재검토 기준+20% 안다. 전체 대표값은 각 round의8시드 elapsed 합/(3600×8)의3회 중앙값이다. 아래 시드별 값은 각 시드/갈래3회 중앙값이며 전체 대표값을 단순 평균한 값과 구별한다.

|시드|3A ms/tick|전술만 ms/tick|변화|
|---:|---:|---:|---:|
|4|3.046|3.238|+6.29%|
|19|2.869|3.050|+6.31%|
|73|3.236|3.320|+2.60%|
|11|2.815|3.168|+12.54%|
|31|3.187|3.276|+2.81%|
|47|2.937|2.936|-0.02%|
|101|3.030|3.225|+6.44%|
|137|2.958|3.289|+11.18%|

시드별 비용은 증가7, 감소1, 동률0다. 기존7/8 동일 방향 및 모든 leave-one-out 방향 유지 기준으로 **비용 증가 방향 신호**다. timing 자체는 실행 환경의 영향을 받으며 구분 불가를 효과 없음/동등함으로 해석하지 않는다. 모든48표본 및 시작·종료 시각/CPU 시간은CSV에 남겼다. 외부Vitest/Playwright 겹침 대기0회, 겹침 표본 제외0회다. 값이 크다는 이유로 표본을 버리지 않았다. 과거 비용이나 seed11의58ms 표본을 이번 비용에 섞지 않았다.

## 관전 전에 기억할 수치

게임 행동은 이전 전술 단독 갈래와 정확히 같으므로 [분리 실험](bot-ai-phase03b-separation.md)의 수치와 방향 판정을 유지한다. 보유2972.28→3149.42(+5.96%,6/8 증가로 구분 불가), 사망90→80, 되찾기3193→3233이다. 영역도둑 탈취 비중24.08%→23.36%는 유지에 가깝지만 탐험가–도둑TV0.1776→0.1134는 줄었다(6/8 감소로 방향 구분 불가). 성격 차이까지 통과했다고 단정하지 않는다.

## 관전 방법과 볼 점

관전 전용test 빌드를 별도 산출물로 만들었다. 기존 빌드/dist 및 master 작업은 교체하지 않는다. 주소는 http://127.0.0.1:5180/?debug=1&spectate=1&experimentSeed=73 이며 닉네임을 입력하고 연습 시작을 누르면 사람 없는14봇 관전이다. HUD 제목이 BOT AI · 3B 후보 (전술 100ms), 주기 표시가 전략200ms 고정/개인별 전략 OFF인지 확인한다. URL만 바꿔 개인별 전략을 활성화할 수 없다.

우선 두 성격씩 본다. 모두 볼 필요는 없다.

- seed73: #1 눈꽃(탐험가), #3 골목길(탐험가), #5 달빛수프(도둑), #9 물결(탐험가), #10 산책중(도둑), #11 비오는창가(도둑).
- seed101: #1 비오는창가(탐험가), #3 낮잠시간(도둑), #4 파란연필(탐험가), #5 달팽이집(도둑), #6 물결(도둑), #10 동그라미(탐험가).

1. seed73에서 #1 눈꽃(탐험가)과 #10 산책중(도둑)을 우선 비교한다. 둘이 서로 붙어 있지 않은 장면에서도 도둑은 상대 국경/탈취를, 탐험가는 중립 확장을 상대적으로 더 고르는지 본다. 피해 대응 D가0인 평상시도 함께 본다. 탐험가가 상대 땅을 한 번 먹었다는 이유만으로 실패로 판정하지 않는다.
2. seed101에서도 탐험가#1 또는#4와 도둑#3 또는#5를 비교한다. 탐험가–도둑TV가0.211→0.279인 시드지만 총 사망10→14인 악화 사례도 있다. 통계만으로 보기 좋은 시드라고 단정하지 않는다.
3. 차이가 작아 보이면 seed19 또는47을 짧게 추가로 본다. 전술만의TV가 각각0.050/0.032로 작아서 성격 수렴을 확인하는 반례다. 중립 땅과 상대 국경 중 어느 쪽도 가능한 상황에서 선택한 계획의 탈취/중립 칸과 실제 점령을 본다.
4. 안전지킴이는 위험 귀환 뒤 정상 확장이 재개되는지만 짧게 확인한다. 선사냥꾼의 DANGER 중단23→45 원인과 NO_APPROACH 거절 분해는 이번 관전 후보에서 조정하지 않고4단계 후보로 남긴다. 새 장면은 seed·슬롯·대략 tick 구간으로 기록하면 된다. 주기 변경으로 과거 전체3B의 같은 tick 장면이 그대로 재현된다고 가정하지 않는다.

## 검증과 남은 결정

클라이언트/서버/테스트 타입 검사와 production 클라이언트·서버·관전test 빌드가 통과했다. PC HUD E2E9개가 통과했으며 실제200ms/slot 위상·개인별 전략OFF·14봇 부활·사람 없는 관전·귀환/피해 색상·production HUD 비노출을 확인했다. 전체Vitest674개 실행에서673개 통과/주기 변경용 EXPAND 전방 출발 fixture1개가 실패했다. 기존3A에서도 쓰던 EXPAND 전방 출발 시드1은 전술 단독에서 공격 기회를 놓쳤다. 이 기존 기회 손실 사례를 별도 비교 기록으로 보존하고4단계 공격 선택지 분석 후보에 포함한다. 동일 배치·사람 입력·실제 선 절단/선 길이/점령0/처치자 조건을 유지하고 양 출발 역할을 같은 시드3으로 고정했다. 관련 공격·스케줄10개를 재실행해 모두 통과했다. 게임의 공격·안전 조건은 완화하지 않았다. 최초 실패 로그와 시드 탐색/재실행 로그도.local에 보존한다.

[4단계 후보 기록](bot-ai-phase04-candidates.md)은 보유 성장, PERIMETER_GUARD 계획 취소, NO_APPROACH 분해 및 선사냥꾼 위험 중단 원인이다. 이번 작업에서 이 행동을 변경하지 않았다. master에는 반영하지 않았으며, 관전에서 탐험가·도둑 구별을 확인한 뒤3B 최종 채택/3단계 마감을 결정한다.


기존 시드1의 반례는 [별도 비교 기록](../evidence/bot-phase03b-tactical-review/medium-original-case.json)에 남겼다. R22/spawnRadius2, matchSeed115, 인간#0/탐험가#1, memorySeed1 및 동일 사람 루프에서3A는 공격22tick/선 절단1회(사람t53 사망), 전술 단독은 공격0tick/사람 점령1회(t76 생존)였다. 시드3의 긍정 fixture는 현재 주기의 공격 능력을 검증하는 별도 사례이며, 원래 시드1의 기회 손실이 해결됐다는 증거가 아니다. 이 반례를4단계 공격 선택지 분석에 보존한다. 최종 관전 채택 때도 참고한다.

## 증거와 재현

- [비용·행동 요약](../evidence/bot-phase03b-tactical-review/summary.json)
- [시드별 비용](../evidence/bot-phase03b-tactical-review/cost-seeds.csv), [48개 전체 비용 표본](../evidence/bot-phase03b-tactical-review/cost-samples.csv)
- [동일성·검증](../evidence/bot-phase03b-tactical-review/validation.json), [고정 프로토콜·소스 해시](../evidence/bot-phase03b-tactical-review/protocol.json)
- 원본: .local/bot-phase03b-tactical-review. 기존 분리 보고서/원본은 보존한다.

새 출력 디렉터리에서 prepare-bot-phase03b-tactical-review.ts로 actual3A/현재 전술 후보의 소스를 동결한다. 그 두 소스에 대해 동일8시드 audit을 각각 실행해 baseline.json/tactical.json을 만든 뒤 closeout-performance를 한 번 실행한다. 기존 출력 폴더를 덮어쓰지 않는다.

재현 명령(기존 원본을 덮어쓰지 않는 새 출력 폴더 사용):

```powershell
node --import tsx scripts/prepare-bot-phase03b-tactical-review.ts --out=../NEW_TACTICAL_REVIEW
node --import tsx scripts/bot-phase025-audit.ts --source=../NEW_TACTICAL_REVIEW/baseline-source --holding --equivalence-proof --cadence-proof --transition-audit --phase03-baseline --safety-stops --seeds=4,19,73,11,31,47,101,137 --ticks=3600 --out=../NEW_TACTICAL_REVIEW/baseline.json
node --import tsx scripts/bot-phase025-audit.ts --source=../NEW_TACTICAL_REVIEW/tactical-source --holding --equivalence-proof --cadence-proof --transition-audit --phase03-baseline --safety-stops --seeds=4,19,73,11,31,47,101,137 --ticks=3600 --out=../NEW_TACTICAL_REVIEW/tactical.json
node --import tsx scripts/bot-phase025-closeout-performance.ts --local=../NEW_TACTICAL_REVIEW --protocol=../NEW_TACTICAL_REVIEW/protocol.json
```

동결 prepare 스크립트도 strict 타입 검사·실제 소스 manifest 비교·기존 출력 보호 거절을 확인했다. 5180의 실제 동결 관전 빌드에 별도 브라우저로 접속해 seed73/14봇/200ms 슬롯 전략/개인별 전략OFF/HUD 표시/런타임 오류0을 확인했다.
