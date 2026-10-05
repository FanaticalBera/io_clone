# 가까운 절단 기회 누락 수정 — 2026-10-05

사용자가 무입력 전진 중 대부분 벽에 닿기 전에 죽는다고 정정한 뒤, 이번 수정의 범위를 **안전한 근접 절단을 무시하고 확장을 계속하는 행동**으로 좁혔다. 무입력 HUMAN의 자동 전진/벽 사망 규칙과 스폰·점령·사망 규칙은 변경하지 않았다.

## 확인한 실패

연습/서버와 동일한 `seed ^ (slot * 2654435761)` memory seed를 사용하여 정상 1 HUMAN + 7 BOT 스폰으로 재현했다. HUMAN에게 입력을 보내지 않았고 위치·영토·선·BOT goal을 주입하지 않았다.

seed 78 / slot 4(SEEK_POINT), tick 78:

- HUMAN의 노출된 trail cell 745까지 3칸.
- 공용 조향 시뮬레이션의 절단 ETA 약 0.87초, 절단 후 home 도달까지 합계 1.5초.
- 상대의 가장 빠른 귀환 하한 약 2.00초, 역절단 하한 약 1.77초.
- 독립 평가는 `CLEAR_KILL_OPPORTUNITY`였지만 행동 선택은 `STEAL_DIVERSION_LIMIT`으로 거부하고 EXPAND를 유지했다.

Phase 3의 도둑형 제한은 계획에서 벗어난 2칸 초과 공격을 일괄적으로 장거리 diversion처럼 거부했다. 기존 ETA·귀환·counter 검사를 통과한 3칸의 짧은 기회도 막힌 것이 실제 원인이다. 이 정상 이동 사례를 먼저 테스트로 추가하여 `EXPAND !== ATTACK` 실패를 확인한 뒤 수정했다.

## 변경

기존 거부 조건에 해당한 도둑형 candidate에서만 예외를 평가한다. 기존 opportunity 조건에 더해 approach ≤3칸, home 경로 ≤3칸, 공용 조향으로 cut+return ≤2초이며 독립 보수 평가가 `CLEAR_KILL_OPPORTUNITY`여야 한다. 상대 귀환·자기 기존/새 선의 역절단·제3자에 의한 귀환 위험이 있으면 예외를 허용하지 않는다.

관찰 trace가 켜져 있는지와 관계없이 별도로 평가하므로 debug 모드 유무로 정책이 바뀌지 않는다. 공격 확률·전역 탐색 범위·장거리 추격 허용은 확대하지 않았다. ATTACK의 안전 조건, 기존 목표 commitment, ESCAPE commitment는 유지했다.

수정 후 같은 실제 이동에서 tick 78에 ATTACK, tick 103에 해당 HUMAN을 `EXISTING_TRAIL_CONTACT`로 처치, tick 123에 같은 life로 생존 귀환했다. regression은 해당 killer의 DEATH event 1회, 실제 처치, home 도달, 자신의 trail set/mask 제거까지 확인한다. 공개 observation으로 3칸의 안전한 기회와 제3자가 위협하는 동일 diversion을 구분하는 검사도 추가했다.

## 결과와 한계

| 정상 무입력 경기 128개 seed(1~128) | Phase 2 | 수정 전 Phase 3 | 이번 수정 후 |
|---|---:|---:|---:|
| 벽 이전 trail-cut 사망 | 125 | 122 | 122 |
| 벽 사망 | 3 | 6 | 6 |

벽까지 방치되는 비율의 작은 회귀는 넓힌 표본에서 확인됐지만 이번 근접 수정으로 없어졌다고 주장하지 않는다. 사용자의 정정에 따라 이를 모든 경기에서 반드시 처치하는 정책으로 바꾸지 않았다. 대부분의 무입력 전진은 이미 봇에게 절단되고 있다.

같은 128경기에서 가까운 HUMAN 선에 대한 도둑형의 독립 clear 관측은 49→53 decision frame, clear인데 `STEAL_DIVERSION_LIMIT`으로 거부한 관측은 **5→0 frame**이었다. 이는 프레임 수이며 독립 전투 5회라는 뜻은 아니다. 해당 seed는 78/85/121이었다. 다른 후보를 공격 중인 상황과 ESCAPE commitment로 놓치는 상황은 별도 원인이며 이번 수정으로 모두 해결됐다고 주장하지 않는다.

기존 extended 8-seed bot-feel 및 16경기 death-audit 수치는 이번 작은 예외로 변하지 않았다. 도둑형 공격 29회/표적 처치 19회/탈취 3,409칸을 유지했다. death-audit 사망 270회, 상태 무결성 실패 0건, extended BOT 벽 사망 0회다. 새로운 HUMAN 근접 재현을 기존 8개 seed만으로 검증할 수 없음을 확인했다.

전체 Vitest **59개 파일 / 281개 테스트 통과**, 클라이언트·서버·테스트 타입 검사와 production build 통과. 기존 Vite 번들 크기 경고는 남는다. 원시 비교 자료와 수정 전 소스 복사본은 ignored `.local/idle-review/`에 보관한다. 실제 사람이 같은 경기를 플레이하며 체감을 비교한 것은 아니다.

성능은 observer 없는 8봇 seed 19, 각 1,800 tick을 수정 전후 교대로 실행했다. 각각 첫 배치를 제외한 3배치 평균 tick 비용의 중앙값은 **0.705→0.695 ms**였다. 별도 최종 실행은 0.791 ms였으므로 실행 편차가 크며 속도 개선을 주장하지 않는다. 이 표본에서 작은 안전성 재평가가 유의한 성능 회귀를 만든다는 근거는 관측하지 못했다. 다중 방 전체 부하 측정은 아니다.

재현:

```text
node node_modules/vitest/vitest.mjs run tests/core/bot-close-intercept.test.ts tests/core/bot-kill-window.test.ts --maxWorkers=2
node --import tsx scripts/idle-human-audit.ts
node --import tsx scripts/idle-human-audit.ts --sweep
node --import tsx scripts/bot-feel-audit.ts --extended
node --import tsx scripts/death-audit.ts
```
