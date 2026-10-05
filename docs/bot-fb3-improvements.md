# BOT Phase 3 검토·실험 결과 — 2026-10-05

피드백의 핵심 방향은 적용했다. 확장형은 위험에 따라 확장안을 축소하고 면적을 남기는 조기 귀환을 선택한다. 공격형은 짧고 시간 여유가 있는 절단을 우대하며, 도둑형은 긴 처치 추격보다 탈취 경로를 유지한다. 개선 비용도 확인됐다. 혼합 경기의 평균 점령 크기는 줄었고 공격형의 실제 처치 수는 감소했다. 전체 전투력이 좋아졌거나 인간이 느끼는 공격 반응 문제가 해결됐다고 단정하지 않는다.

## 적용·보류 판단

- 기존 FSM, 공용 조향/이동, BFS, 점령/사망/리스폰 규칙과 관찰 범위는 유지한다. 기본 맵 R22, 속도·회전·참가자 수·승리 조건을 변경하지 않았다.
- 새 기하 helper는 방향과 길이만 생성한다. 후보는 최대 6개 출발 경계 × 6방향, **36개**다. 각 도형마다 36개를 추가로 생성하지 않는다. 후보를 먼저 검증하고 기존 면적/탈취/위험/회전/경로 점수로 비교한다.
- RHOMBUS, WIDE, DEEP, ASYMMETRIC, HOOK, NATURAL을 채택했다. WIDE/DEEP는 같은 평행사변형의 비율 변형이며, 같은 둘레에서 더 빠른 도형이라고 취급하지 않는다. ASYMMETRIC/HOOK/NATURAL은 bounded BFS로 집에 닫히는 경우만 인정한다. DEFEND와 혼잡한 공간은 기존 RHOMBUS/BEVEL/NATURAL 생성 방식을 유지한다.
- 반복한 shape에는 작은 점수 감점 1.5만 준다. 강제 순환, random walk, 방향 jitter를 넣지 않았다. personality/traits의 가중치와 판단 RNG는 유지한다.
- prey memory와 도둑형 soft cooldown은 보류했다. 현재 표본에서 연속 큰 탈취가 48→40회였으므로 별도 억제 근거가 부족하다. 숨겨진 머리·선 위치를 기억하거나 조회하지 않는다.

## 비교 방법과 기준 분포

committed Phase 2 소스로 기준 결과를 다시 실행했다. 확장 trace만 추가한 복사본을 `.local/fb3-phase2/`에서 별도로 실행하여 계측 전후의 기존 capture/death/attack 수치가 같음을 확인했다. 새 정책은 원본 작업공간에서 실행했다. Classic R22, seed **4/19/73/115/17/81/32/123**, seed당 8봇·3,600 tick(2분), 성격별 16개 표본이다.

기준 candidate의 사각형은 `[d,L], [d+1,W], [d+3,L], [d+4,W]`였다. BEVEL은 여기에 짧은 두 변을 더하고 NATURAL은 세 변 뒤 BFS로 닫는다. 방향·크기·bevel을 바꿔도 기본적인 평행사변형 계열이 반복되는 구조였다.

| 성격 | 생성 RHOMBUS / BEVEL / NATURAL | 통과 RHOMBUS / BEVEL / NATURAL | 선택 RHOMBUS / BEVEL / NATURAL | 선택 중 사각형·bevel 계열 |
|---|---|---|---|---:|
| EXPAND | 16,098 / 6,983 / 5,503 | 9,256 / 4,429 / 3,307 | 355 / 240 / 188 | 76.0% |
| ATTACK | 15,280 / 9,267 / 7,421 | 8,503 / 6,506 / 4,646 | 314 / 328 / 239 | 72.9% |
| DEFEND | 24,820 / 13,676 / 11,040 | 12,806 / 8,566 / 5,845 | 541 / 480 / 347 | 74.6% |
| SEEK_POINT | 16,673 / 7,590 / 6,193 | 9,465 / 5,450 / 4,055 | 367 / 286 / 180 | 78.4% |

이 수치는 **선택된 계획의 분포**다. 집에 먼저 닿거나 RETURN/ESCAPE/ATTACK으로 경로가 바뀌므로 완성된 땅이 그 도형과 같다는 뜻은 아니다. 감사는 원래 경로와 실제 cell 진입 순서, 방향 전환, 실제 점령 크기·탈취량을 따로 기록한다. 경로가 정확히 일치한 closure는 기준 EXPAND 62/610, ATTACK 79/676, DEFEND 106/839, SEEK_POINT 60/659다. 따라서 candidate label만으로 실제 화면의 도형 다양성을 증명할 수 없다.

## 형태와 확장 안전성

새 정책의 선택 횟수:

| 성격 | RHOMBUS | WIDE | DEEP | ASYMMETRIC | HOOK | NATURAL | BEVEL |
|---|---:|---:|---:|---:|---:|---:|---:|
| EXPAND | 527 | 84 | 62 | 40 | 100 | 156 | 0 |
| ATTACK | 526 | 111 | 73 | 81 | 123 | 162 | 0 |
| DEFEND | 474 | 0 | 0 | 0 | 0 | 352 | 451 |
| SEEK_POINT | 431 | 53 | 77 | 52 | 113 | 167 | 0 |

크기 비율을 달리한 WIDE/DEEP까지 사각형 계열로 묶으면 EXPAND 69.5%, ATTACK 66.0%, SEEK_POINT 62.8%다. 혼잡한 상황의 작은 RHOMBUS가 여전히 많다. 모든 봇이 항상 서로 다른 모양을 만든다는 주장은 하지 않는다.

EXPAND의 조용한 공간 기본 5×4 및 면적 가중치 1.25는 유지했다. 관찰된 적이 출발 경계에 비해 계획 둘레 가까이 있으면 길이·폭을 한 단계 낮추고, 노출 경로 길이/속도와 경로에 대한 적 거리/속도의 차이를 위험 점수에 반영한다. 이는 ETA의 근사이며 상대의 미래 입력을 예측한 보장이 아니다. 기존 근접 2칸 거부, 혼잡 시 6칸 budget, trail limit과 최대 전체 경로 24칸을 유지했다. 선택된 down-scaled 계획은 190회였다.

실행 중 적이 기존 선에 5칸 이내로 접근하면서 출발 시 평가보다 2칸 이상 위험해지거나, trail budget에 가까워지거나, 기존 expansion pressure 조건에 걸리면 짧은 closure를 검토한다. 기존 선을 되짚지 않는 home 경로, 상대 몸통과 2칸 초과 거리, 최소 3칸 경로 단축, trail budget, 선 자체보다 큰 점령 면적이 모두 필요하다. 통과 시 RETURN에 들어간다. 급박한 danger의 ESCAPE와 확실한 counterstrike가 우선이며, 조기 귀환 후 계획을 다시 늘리지 않는다.

조기 closure **31회**, 그 뒤 같은 life로 실제 점령 **28회**, 사망 **3회**였다. 이 역시 생존 보장은 아니다. seed 4 / slot 4에서 정상 스폰 후 실제 이동으로 선을 만든 뒤 **tick 222에 RETURN**, **tick 243에 생존 점령**하는 regression을 추가했다. `setOwner()`/`addTrail()`나 위치 수정으로 이 상황을 만들지 않았다. 점령 때 trail set과 해당 mask bit 제거도 검증한다.

| EXPAND 지표 | Phase 2 | Phase 3 |
|---|---:|---:|
| 확장 계획 선택 / 실제 노출 시작 | 783 / 675 | 969 / 764 |
| 추적한 확장 episode의 실제 closure | 610 | 723 |
| 확장 episode의 노출 중 사망 | 59 | 32 |
| 전체 점령 event / 총 점령량 | 689 / 7,732 | 800 / 7,883 |
| 전체 평균 점령 크기 | 11.22 | 9.85 |
| 확장 episode closure 평균 점령 크기 | 10.65 | 9.60 |
| 평균 trail 길이(생존 tick 가중) | 4.17 | 3.63 |
| 추적 excursion의 노출 시간 합계 | 984.2초 | 1,037.6초 |
| 전체 노출 중 사망 / 전체 사망 | 69 / 70 | 34 / 34 |
| 전체 점령 횟수 / 전체 사망 | 9.84 | 23.53 |

계획 선택에는 밖으로 나가기 전에 다시 선택하거나 취소한 안도 들어간다. 미완료·취소를 closure나 death로 세지 않는다. 확장 episode가 아닌 공격 등에서 일어난 점령/사망 때문에 episode 수치와 전체 수치는 다르다. 생존 시간이 늘어 노출 시간 합계도 증가했으며, 이를 위험이 증가했다는 지표 하나로 해석하지 않는다.

별도의 무위협 1봇 seed 73 / 1,200 tick에서 EXPAND의 점령 10→10회, 평균 24.3→26.7칸, 최대 58→58칸, 사망 0→0회였다. 조용할 때 큰 확장은 남았지만 이는 한 seed의 제한된 확인이다. 혼합 경기 평균 크기 감소는 안전성/짧은 closure의 실제 비용이다.

## 공격형과 도둑형

ATTACK의 9칸 탐색 범위·확률·기존 목표 commitment는 유지했다. 새 공격의 ETA 여유는 4칸 이상 0.25초, 6칸 이상 0.4초로 강화한다. 짧은 기회와 큰 귀환 ETA 우위에 점수를 추가하고 긴 approach는 감점한다. 다른 관찰 상대가 새로 노출될 approach/return 선을 먼저 위협할 수 있는 경우 `UNSAFE_RETURN`으로 거부한다. 기존 목표를 매번 다시 골라 jitter를 만드는 정책은 넣지 않았다.

SEEK_POINT는 새 공격을 최대 4칸으로 제한하고, 가까운 2칸 기회·탈취 경로의 다음 6개 waypoint 주변 1칸 기회·가까운 자기 영역 방어만 허용한다. 여기에 기존 ETA/귀환/trail/counter 검사가 계속 적용된다. 탈취 가중치 3과 trait는 그대로다. 거부 사유는 `STEAL_DIVERSION_LIMIT`이다.

| 지표 | ATTACK 전→후 | SEEK_POINT 전→후 |
|---|---:|---:|
| 공격 시도 | 111→74 | 110→29 |
| 실제 표적 처치 | 43→37 | 56→19 |
| 성공률 | 38.7%→50.0% | 50.9%→65.5% |
| TARGET_RETURNED | 50→29 | 35→4 |
| 공격 종료 후 같은 life 생존 귀환 | 98→69 | 100→26 |
| 공격 중 사망 | 2→2 | 2→1 |
| 전체 kills | 49→42 | 65→25 |
| 평균 공격 시작 hex 거리 | 5.97→4.89 | 4.97→2.41 |
| 적 영역 탈취 칸 | 2,189→2,190 | 3,155→3,409 |
| 큰 연속 탈취 | 40→30 | 48→40 |

큰 연속 탈취는 동일 봇이 **12칸 이상 탈취 후 15초 이내 또 12칸 이상 탈취**한 횟수다. 숫자가 커도 자동으로 snowball을 뜻하지 않는다. `returnedAlive`는 성공한 공격에 한정되지 않은 기존 지표다. 공격형은 시도 대비 성공률은 올랐지만 총 처치는 줄었다. 짧은 창 선호와 역할 분리는 확인됐으나 “인간의 약점을 훨씬 잘 처벌한다”는 체감은 수동 검증이 필요하다.

## DEFEND, 규칙 및 회귀

DEFEND의 생성/공격/위험/조향 정책은 바꾸지 않았다. 격리된 seed 73의 900 tick 전 과정을 Phase 2 소스와 비교한 movement/capture hash가 동일했다. 혼합 경기에서는 상대들의 행동이 달라져 점령 948→966, 평균 크기 7.87→7.33, kills 38→35, 사망 21→31로 변했다. 정책 유지가 혼합 경기 결과 유지까지 뜻하지 않는다.

- 3-seed bot-audit: 점령 1,203→1,275회, 점령량 11,146→10,661칸, 사망 74→62회, BOT 벽 사망 0→0회.
- 8-seed extended audit에서도 BOT 벽 사망 0회.
- medium-attack audit 16개: 전후 모두 자동 인간 역할의 trail-cut 사망을 유지했다.
- death-audit 16경기: 사망 354→270회, 무결성 실패 0→0건. PENDING_TRAIL_CONTACT 23→31회. 전체 벽 사망 4→10회는 자동 HUMAN 역할에서 발생했다. BOT 벽 사망은 0회다.
- 새 검증: shape 비율/경로 인접성/맵 경계/닫힘/면적/budget/seed 결정론·선택 다양성, 정상 이동 기반 조기 closure, DEFEND 기준 trajectory, observer 유무 동일 실제 결과, 짧은 창 우대·도둑형 긴 추격 거부·제3자 귀환 위협 거부.
- 기존 공격·전술·personality·trait·steering·결과 귀속·kill 후 귀환·spawn 안전성·capture/death 테스트를 유지했다. 정책 변경으로 obsolete gameplay hash를 갱신했다. ESCAPE witness는 seed 5 / tick 229, 실제 cut tick 240으로 바꿨으며 기존 cut-and-alive-return 조건을 유지했다.
- 전체 Vitest **58개 파일 / 279개 테스트**, 클라이언트·서버·테스트 TypeScript 검사 및 production build 통과. 기존 Vite 큰 번들 경고는 남는다.

## 성능과 확인 범위

observer 없는 8봇 seed 19, 1,800 tick ×4회에서 첫 회를 제외한 tick 평균의 중앙값: 기준 **0.679 ms**, 최종 단독 실행 **0.579 ms**. 최종의 앞선 반복은 **0.675 ms**였다. 실행 편차가 커 개선율로 주장하지 않는다. 이 로컬 표본에서 뚜렷한 tick 비용 증가를 관측하지 못했으며 다중 방 전체 부하 보장은 아니다.

원시 자료는 ignored `.local/fb3/`에 보관한다. `verified-baseline-feel.json`, `verified-final-feel.json`에는 실제 expansion/attack episode를, `baseline-*`/`final-*`에는 기존 audits를, `quiescent-final-performance.json`에는 단독 성능 측정을 저장했다. 대형 raw JSON이나 테스트가 갱신한 T35 resource 자료를 이번 소스 변경에 포함하지 않는다.

재현 명령(Node 24):

```text
node --import tsx scripts/bot-feel-audit.ts --extended
node --import tsx scripts/bot-audit.ts
node --import tsx scripts/medium-attack-audit.ts
node --import tsx scripts/death-audit.ts
node --import tsx scripts/bot-performance.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=2
npm run build
```

자동 실험은 R22/8개 seed의 결과이며 다른 맵·시간·인간 상대에 일반화하지 않는다. 브라우저에서 사람이 플레이한 체감은 아직 검증하지 않았다. 남은 확인은 큰 확장 중 자연스러운 조기 귀환, 실제 완성된 땅의 다이아몬드 반복 감소, 인간의 짧은 노출에 대한 공격 반응, 도둑형의 영토 압박 유지다. 이를 확인한 뒤 공격형의 총 처치 감소와 수비형의 혼합 경기 사망 증가를 다음 판단에 반영한다.
