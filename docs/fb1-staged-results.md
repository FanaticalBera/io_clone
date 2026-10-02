# fb1 후속 작업: 출발점 수정 → 사망 진단 → 독립 공격 기회 측정

2026-10-02. 사용자 지정 순서로 진행했다. `fb1.md`는 분석 자료로 참고했고, 이번 작업 범위는 대화에서 명시한 세 단계다. 봇의 ESCAPE interruption, 장기 침범 기억, expansion geometry는 변경하지 않았다. 맵 반경 22도 유지한다.

## 1. 실제 출발점만 빼앗기는 실패를 먼저 재현

정상 HUMAN 두 명을 `createMatch()`로 스폰하고 방향 입력과 `stepMatch()`만 사용했다. 시드 115와 17은 A/B 역할이 반대인 같은 배치다. `setOwner()`, `addTrail()`, 위치 변경으로 최종 상황을 만들지 않았다.

- 실제 마지막 자기 영토: cell **613**, 좌표 **(-14,-3)**.
- 첫 외부 trail: cell **612**, 좌표 **(-15,-3)**.
- 첫 외부 칸에 함께 인접한 다른 자기 영토: cell **571**, 좌표 **(-14,-4)**.
- tick **149**: 상대가 루프를 완성해 613만 가져간다. 571은 아직 피해자의 영토다. 본체의 피해 선 접촉은 **0회**, 점령 영역의 피해 선 중첩도 **0칸**이다.

수정 전에는 `connectedBefore=true`, `candidate=false`, `lostTerritory=true`인데 첫 칸의 다른 이웃 571 때문에 `trailTouchesHome()`이 true였다. `cuts=false`, `markDead()` 미호출, 피해자는 `ALIVE`로 남았다. 이번 실패 원인은 `!candidates.has(p)`가 아니다. **첫 외부 칸의 임의 이웃을 실제 출발점으로 대신 판정한 것**이다.

실제 owned → outside cell 진입 직전에 `trailOriginCellId`를 기록한다. 같은 excursion에서는 교체하지 않고, 기존 `clearTrail()` 경로에서 정상 RETURN/capture, 사망, leave, 종료, respawn 때 초기화한다. 기존 capture 연결 판정에 이 출발점의 소유권을 사용했다. 중복 사망 분기나 pruning을 추가하지 않았다.

| 실제 이동 상황 | 수정 전 | 수정 후 |
|---|---|---|
| 613 상실, 우연히 인접한 571 유지 | ALIVE: 실패 | 같은 capture 처리에서 DEAD_WAIT / TRAIL_CUT / HOME_CAPTURE |
| 613 유지, 571만 상실 | ALIVE | ALIVE, 선 유지, 상대 kill 증가 없음 |

양쪽 역할과 Classic/Hold에서 확인했다. 사망한 경우 DEATH 1회, 상대 kill 1회, 선과 해당 mask bit 전부 제거, respawn 전 위치 정지를 확인했다. 반대 경우에는 실제 RETURN 후 출발점이 초기화되는 것도 확인했다. 서버 Room/GameLoop 방향 입력과 두 브라우저에서도 같은 결과가 나왔다.

이미 서 있던 칸이 점령돼 그 밑에 생기는 선에는 movement 출발점이 없다. 그 경우와 직접 상태를 구성하는 기존 테스트의 null origin 처리에는 기존 첫 칸 인접 판정을 유지했다. 동시 returner 제외, 직접 접촉, simultaneous capture, pruning, 모드와 respawn 규칙은 유지한다. 출발점은 서버 내부 필드이며 공개 snapshot/봇 관찰에 새 정보로 노출하지 않는다.

자료: [수정 전 이동 요약](../evidence/origin-capture-before-summary.json), [수정 후 이동 요약](../evidence/origin-capture-after-summary.json). 회귀 검증: `tests/core/origin-capture.test.ts`, `tests/e2e/movement-capture-cuts.spec.ts`.

## 2. 판정 변경 없이 실제 사망을 여섯 원인으로 분류

`EXISTING_TRAIL_CONTACT`, `PENDING_TRAIL_CONTACT`, `TRAIL_CAPTURE`, `HOME_CAPTURE`, `TERRITORY_LOST`, `WALL_HIT`를 구분한다. 이벤트 시점, 사망 전 owners/trailMasks, pending 목록, 피해 선, 본체 칸, 출발점 소유권, 접촉/점령 중첩/벽 충돌을 opt-in observer로 기록한다. 기존 또는 pending 여부는 동일 resolution의 사망 정리 전 mask에서 고정한다. 한 명의 사망 정리 때문에 다음 피해자의 분류가 달라지지 않는다.

실제 이동 재현 결과:

- **빈 neutral 칸 동시 진입:** tick **19.24939**, cell **612**에 둘이 진입했다. 두 사람 모두 기존 trail이 없고 해당 칸의 기존 mask는 0이었다. pending 두 개를 합친 collision mask에서 서로의 선으로 간주돼 두 명 모두 `PENDING_TRAIL_CONTACT`로 사망했다. 역할 교환에서도 동일했다.
- 이때 본체 중심 거리는 월드 좌표 약 **45.10**, 캐릭터 지름은 **42**였다. 원 그림이 겹치지 않아도 같은 육각 칸을 점유할 수 있다. 기존 선이 이전 화면에 없으므로 갑작스러운 사망으로 보일 수 있다.
- **기존 선 접촉:** 늦게 온 상대가 cell 612의 이미 생긴 선을 밟는다. 피해 본체는 cell 570에 있고 원인은 `EXISTING_TRAIL_CONTACT`다.
- **상대 영토 위의 접촉:** 이동으로 먼저 회합 칸을 점령한 뒤 다시 접근했다. 이 경로에서는 기존 선 접촉이 발생했다. 상대 영토 위라는 이유만으로 pending이라고 분류하지 않는다.
- **가까운 본체, 다른 칸:** 최소 거리 약 51.64이며 existing/pending 접촉이 없어 둘 다 생존했다.
- **영토 안에 남아 있던 피해자 전체 점령:** 실제 enclosing loop의 tick **137** capture에서 소유 칸 0과 `TERRITORY_LOST` 사망을 같은 처리에서 확인했다. 역할 교환도 동일했다.
- **외곽 직진:** 실제 boundary impact로 `WALL_HIT`를 확인했다. 정상 다중 봇 이동의 시드 17, tick 995에서는 피해 선 cell 1159가 점령 영역에 포함돼 `TRAIL_CAPTURE`가 기록됐다.

정상 이동 표본은 시드 4/19/73/115/17/81/32/123, 각각 8 BOT 및 2 HUMAN+6 BOT, 각 3,600 tick(2분), 총 16판이다. HUMAN은 방향 입력으로 반복 루프를 그린다.

| 사망 원인 | 관측 사망 수 |
|---|---:|
| EXISTING_TRAIL_CONTACT | 326 |
| PENDING_TRAIL_CONTACT | 18 |
| HOME_CAPTURE | 14 |
| WALL_HIT | 11 |
| TRAIL_CAPTURE | 1 |
| TERRITORY_LOST | 0 |
| 합계 | 370 |

pending은 사망의 **4.86%**, BOT 349건 중 16건, HUMAN 21건 중 2건이다. 이는 정상 이동 시뮬레이션 표본이며 사용자의 수동 플레이 발생률이 아니다. 중복 사망, 소유 수 불일치, 선/mask 불일치, 사망 후 이동 등의 audit 실패는 없었다. 따라서 pending 접촉이 실제 게임 경로에서 발생한다는 것은 확인했지만, 사용자가 목격한 특정 장면을 확정하지는 않는다. pending 선을 collision mask에 넣는 순서와 사망 규칙은 변경하지 않았다.

`http://127.0.0.1:3003/?debug=1`에서는 실제 사망 화면에 `[원인 · cell 번호 · t 사건 tick]`이 표시된다. 일반 주소는 원인에 맞는 한국어만 보여준다. debug 연습 경기의 `window.__HEXHOLD_DIAGNOSTICS__.get()`은 누적 원인별 수, 최근 사망 16개, 놓친 기회 64개와 독립 평가 수를 복사해 반환한다. 상대 봇의 사망도 수집한다. 온라인에서는 서버가 전달한 사망 원인 표시를 사용하며 이 연습용 getter로 서버 내부 기록을 제공하지 않는다.

자료: [접촉/전체 점령 이동 요약](../evidence/contact-diagnostic-summary.json), [정상 이동 16판 사망 audit 요약](../evidence/death-diagnostic-summary.json), [실제 사망 화면](../evidence/pending-contact-debug.png). 원시 기록은 로컬 `.local/evidence/`에 보관하며 Git에 추가하지 않는다. 생성 방법은 [진단 증거 보관 규칙](diagnostic-evidence.md)을 따른다.

## 3. 행동 정책 밖에서 MISSED_KILL_OPPORTUNITY 측정

`evaluateShadowOpportunities()`는 observation과 navigation만 받는다. goal, memory, personality 확률, RNG를 받지 않는다. 기존 `planAttack()`의 호출 여부, 후보 제한, 성공/실패를 공격 기회의 존재 근거로 사용하지 않는다. 관찰된 선 후보를 평가하고, **그 후 실제로 선택된 최종 goal/target과 비교**한다. ESCAPE 중에도 실행한다. 진단 observer가 없는 일반 경기에서는 이 평가를 수행하지 않는다.

공통 측정 범위는 4칸/접근 2초 이내, 0.2초 여유, 귀환 BFS 10칸 이내, 현재 선+접근+귀환 경로 예산 20칸이다. 봇 자신의 접근과 전체 귀환은 공용 steering을 시뮬레이션한다. 상대의 귀환/역절단은 회전 제약 없이 가장 가까운 칸 경계까지의 거리/속도로 빠른 쪽의 하한을 사용한다. 상대가 즉시 반응해도 여유가 있는 기회를 고르며, 제3자의 관찰된 본체가 귀환 전에 접근할 수 있는 경로는 배제한다. 이는 관찰 상태와 제한된 경로 모델에 따른 보수적인 근거리 지표이며 모든 장거리 공격, 미래 capture나 미관찰 상대를 보장하지 않는다.

후보가 배제되는 이유(`VICTIM_RETURNS_FIRST`, `COUNTER_CUT_FIRST`, `OUT_OF_RANGE`, `UNSAFE_RETURN` 등)와 유리한 후보를 선택하지 않은 이유(`GOAL_ESCAPE_BLOCK`, `GOAL_ATTACK_TARGET_LOCK` 등)를 구분한다. `MISSED_KILL_OPPORTUNITY`는 유리한 후보가 있는데 그 후보를 실제 ATTACK 목표로 선택하지 않은 **판단 시점**이다. 중복 기회와 기존 공격 유지도 포함하므로 고유 처치 가능 수로 해석하지 않는다.

동일 16판의 최종 측정:

| 지표 | 판단 횟수 |
|---|---:|
| 전체 shadow 평가 | 63,216 |
| 유리한 후보가 있는 판단 | 353 |
| MISSED_KILL_OPPORTUNITY | 32 |
| 그중 GOAL_ATTACK_TARGET_LOCK | 28 |
| 그중 GOAL_ESCAPE_BLOCK | 2 |
| 그중 기존 정책 VICTIM_RETURNS_FIRST 거절 | 1 |
| 그중 DANGER_POLICY_BLOCK | 1 |

ESCAPE에서 **1,830회** 독립 평가했고, 유리한 후보가 있는 판단은 11회였다. 그중 계속 ESCAPE를 선택해 놓친 판단이 2회다. 후보 단위로는 OUT_OF_RANGE 192,207회, VICTIM_RETURNS_FIRST 10,952회, COUNTER_CUT_FIRST 694회가 기록됐다. 후보 수와 판단 수는 분모가 다르다. 이 결과만으로 장거리 대응이나 작은 침범 문제를 모두 ESCAPE 탓으로 결론내릴 수 없다.

실제 놓친 장면: 시드 **115**, 정상 8 BOT, tick **3351**, `bot-4`의 life 4.

- 실제 선택은 ESCAPE → ESCAPE, 공격 목표 없음.
- 상대 `bot-0`의 cell **235** 선은 2칸 거리다. 접근 `[266,235]`, 귀환 `[204,174,145]`.
- 접근 **0.2333초**, 상대 최단 귀환 하한 **0.9056초**, 가장 빠른 역절단 하한 **0.4932초**, 전체 귀환 steering 시간 **0.9333초**.
- 이 상태를 실제 이동에서 얻은 뒤 복제한 별도 branch에서 해당 경로로 입력했다. 나머지 본체는 관찰된 steering intent를 유지했다. **tick 3358에 기존 선 접촉 처치, tick 3379에 선 0으로 살아서 귀환**했다. 원래 match의 goal은 ESCAPE 그대로다. 이 branch는 별도 반사실 검증이며 상대 AI의 모든 반응을 재실행한 보장은 아니다.

시드 4/73의 정상 8 BOT 이동 900 tick씩에서는 observer ON/OFF의 모든 방향 입력, 매 tick goal/path/memory, RNG 호출 수, gameplay 상태가 일치했다. 사망 및 respawn을 포함해 진단이 행동에 영향을 주지 않는지 검사했다.

자료: [전체 독립 측정](../evidence/shadow-opportunity-audit.json), [ESCAPE 장면과 실제 이동 branch](../evidence/shadow-escape-witness.json). 구현: `src/shared/bot-opportunity.ts`; 검증: `tests/core/shadow-opportunity.test.ts`.

## 검증 및 다음 범위

최종 core/server **46파일 215검사**, 관련 browser **20검사**, TypeScript client/server/tests와 production build가 통과했다. 새 출발점 케이스는 서버의 정상 방 스폰, 실제 입력/loop/capture 및 두 브라우저로도 확인했다. 기존 직접 접촉, 동시 절단/점령, pruning, held touch respawn, haptics, Classic/Hold 검증을 유지했다.

이번에 수정한 판정은 실제 출발점 추적이다. 나머지는 진단과 측정이다. 사용자 검토 전에는 ESCAPE interruption, 침범 기억 확장, 확장 모양 변경을 진행하지 않는다.
