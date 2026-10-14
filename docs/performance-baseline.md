# HEXHOLD 성능 기준선 (성능 PRD 단계 0)

- PRD: [PERFORMANCE-PRD.md](PERFORMANCE-PRD.md) v0.4.2
- 기준 코드: `cb15860`(봇 동결) + 단계 0 계측. 계측만 추가했고 게임·봇 동작은 바꾸지 않았다(아래 궤적 동일성 확인).
- 상태: **PC 기준선 완료, 실기기(S24+, S20+) 측정 대기.** 측정용 APK(`npm run build:apk:perf` → `assembleDebug`)는 최적화 전 코드로 빌드해 두었다.

## 1. 측정 도구 (단계 0 산출물)

| 도구 | 용도 |
| --- | --- |
| `?metrics=1` 계측기 (`src/client/frame-meter.ts`) | Phaser 렌더 횟수·간격, step/render CPU, 프레임 밖 그룹(sim·recv·net), 구간별 leaf, 초당 JS 시간. 오버레이와 `window.__HEXHOLD_PERF__` |
| 측정 모드 `?perf=autoplay` (`perfSeed`, `perfRounds`, `perfRoundSeconds`, `perfFollow`, `perfColor`) | 14봇 관전 + 봇 따라가기 카메라, 디버그 수집기 없음, `matchId=perf-<seed>-<판>` 고정, 설정 고정. dev/test 또는 `apk-perf` 빌드에서만 켜짐 |
| `apk-perf` 빌드 모드 | 배포 APK와 같은 구성(번들 폰트, 오프라인 폰트 처리) + 측정 기능 |
| `scripts/perf/run-autoplay.mts` | PC(Playwright Chromium) 또는 폰(CDP + adb)에서 측정 모드 실행, 30초마다 표본·배터리 온도·열 상태 기록 |
| `scripts/perf/adb-forward.mts` | 폰 WebView DevTools 소켓 포워딩 |
| `scripts/perf/tick-cost.mts` | Node 틱 비용. 봇 동결 비용 규약(8시드 × 3라운드, AB/BA, 워밍업 제외, 겹침 제외) + p95/max |
| `scripts/perf/tick-profile.mts` | 느린 틱 목록, 판단 수별 비용, `--cpu-prof`와 함께 함수별 비용 |
| `scripts/perf/trajectory-equivalence.mts` | 행동 동일성 검증(확장 해시, 30틱 체크포인트, 이벤트·봇 메모리 포함) |

### 1.1 궤적 동일성 기준선

- `evidence/perf-trajectory-baseline/baseline-cb15860.json`: 깨끗한 `cb15860` 체크아웃에서 새 도구로 생성. bots14·practice × 8시드 × 3,600틱.
- **도구 자체 검증:** 기존 항목만 해시한 값(legacy)이 봇 동결 증거(`.local/bot-freeze-final/nickname-trajectories.json`) 8시드 모두와 **일치**.

## 2. Node 틱 비용 (PC, `evidence/perf-baseline/tick-cost-bots14.json`)

Node 24.21, 14봇, 120초 × 8시드 × 3라운드, 겹침 제외 0행.

| 팔 | 평균 ms/tick (라운드 중앙값) | 시드 중앙값 p95 | 시드 중앙값 max | 봇 비중 |
| --- | --- | --- | --- | --- |
| 동결 `cb15860` | **3.377** | **19.4ms** | **217ms** | 93% |
| 현재(계측 추가) | 3.374 | 19.3ms | 220ms | 93% |

- 평균은 봇 동결 공식값 3.37ms와 같다(도구 검증). 계측 추가의 차이는 −1.45%(잡음 범위).
- **분포가 크게 치우쳐 있다.** p95가 평균의 약 6배다. seed 137 분석(`tick-profile`): 10ms 이상 틱이 3,600틱 중 521개(14%)이고, 전체 시간의 **75%**를 차지한다. 최대 214ms는 1틱째(14봇 첫 판단 동시 발생, 1회성). 그 밖에 40~77ms 틱이 반복된다.
- 한 틱에 판단하는 봇 수와 비용의 상관은 약하다(2봇 p95 19.1ms, 3봇 19.3ms, 4봇 19.0ms). 판단 1회 비용 자체가 크다(C3의 (b)).

### 2.1 CPU 프로파일 (seed 137, `--cpu-prof`)

| 함수 | self 비중 |
| --- | --- |
| `plannedCapture` (bot-strategy.ts) | **61.2%** |
| `shortestPath` (bot-navigation.ts) | 8.0% |
| `captureCandidates` (capture.ts, 엔진 점령) | 5.0% |
| `resolveAtTime` (engine.ts) | 2.3% |
| GC | 1.0% |

- `plannedCapture`는 후보 경로마다 **맵 전체(약 9,600칸) flood fill**을 새로 한다. 판단마다 후보 수십 개를 평가하므로 판단 틱이 무거워진다.
- GC는 1%뿐이다. B1(할당) 가설보다 **계산량 자체**가 원인이다. C2는 할당 제거보다 이 함수의 계산량을 줄이는 쪽(결과 동일)으로 범위를 조정한다.

## 3. PC 브라우저 (`evidence/perf-baseline/pc-chromium-r1.json`)

Headless Chromium 153(Windows), 측정용 빌드(`apk-perf`), 832×384 CSS px @ DPR 2.81(S24+와 같은 크기), seed 137, 봇 0번 따라가기. headless는 GPU 대신 소프트웨어 렌더링을 쓸 수 있으므로 **참고용**이다. 판정은 실기기로 한다.

초당 JS 시간(ms/s, 60초 구간 평균):

| 구간 | 렌더/s | render | step | sim (봇) | recv (draw) | 합계 |
| --- | --- | --- | --- | --- | --- | --- |
| 0–60초 | 58.8 | 141.5 | 8.0 | 96.2 (82.9) | 17.7 (14.0) | **263** |
| 180–240초 | 59.5 | 320.5 | 6.8 | 109.8 (98.6) | 17.3 (13.9) | **454** |
| 300–360초 | 59.8 | 301.6 | 6.7 | 108.4 (96.4) | 17.4 (14.1) | **434** |

프레임:

| 구간 | 간격 p50 | 간격 p95 | 간격 max | 1% low | 프레임 CPU p95 |
| --- | --- | --- | --- | --- | --- |
| 30–60초 | 16.3ms | **30.7ms** | 55.7ms | 23.8fps | 3.5ms |
| 210–240초 | 16.4ms | **31.2ms** | 55.6ms | 23.0fps | 7.5ms |

해석(가설, 실기기로 확인 필요):

- **render가 판 진행에 따라 2배 이상 커진다**(141 → 320ms/s). 땅이 늘수록 영토 Graphics 재삼각분해 비용이 커진다는 R1과 맞는다.
- **프레임 간격 p95 31ms는 Phaser 프레임 작업과 무관하다.** 0–60초 구간은 프레임 CPU p95가 3.5ms인데도 간격 p95가 31ms다. 연습 루프(별도 rAF)의 봇 판단 틱(p95 19ms)이 프레임을 밀어내는 것으로 보인다. 사용자가 말한 "버벅임"(S2)의 유력한 원인이다.
- Phaser `update` 내부 leaf(이펙트, 마커, 미니맵, 벽)는 모두 2ms/s 이하다. 단계 2의 G3(벽·예측선), G6(HUD)는 이득이 작을 가능성이 높다(Gate 0의 "생략" 후보).

## 4. Gate 0 판단 (잠정, 실기기 측정 후 확정)

| 원인 후보 | PC 근거 | 판단 |
| --- | --- | --- |
| R1 영토 Graphics | render 141 → 320ms/s | 유지(단계 2a 실험) |
| R3 프레임 상한 없음 | PC 60Hz라 미확인 | 실기기에서 확인 |
| B0/B1 봇 틱 비용 | sim ~100ms/s, 틱 p95 19ms, `plannedCapture` 61% | **우선** — 행동 동일 최적화 가능 |
| R5 매 프레임 작업(벽·예측선) | 0.2ms/s 이하 | 생략 후보 |
| H1 HUD | recv.hud 2.8ms/s | 생략 후보 |
| R6·R7 이펙트·마커 | 각 1~2ms/s | 실기기 확인 후 판단 |

단계 2/3 순서(Gate 0 규칙): PC에서는 시뮬레이션을 뺀 step·render가 시뮬레이션보다 크지만(후반 약 310 vs 110ms/s), **프레임 끊김의 직접 원인은 시뮬레이션 스파이크**다. 그래서 단계 1 뒤에 단계 3의 C1~C2(`plannedCapture` 결과 동일 최적화)를 단계 2보다 먼저 하는 것을 잠정 결정으로 둔다. 실기기 비중으로 확정한다.

## 5. 남은 측정

- [ ] S24+: 시나리오 A(3판 × 240초), B(설정창), D(메뉴 5분), A′(수동 1판)
- [ ] S20+: 같은 시나리오
- [ ] LAN C-real(방장 S24+)
- 측정 조건(2.1)과 기기 정보(모델, Android, WebView, 빌드 커밋)는 결과 JSON에 함께 기록한다.
