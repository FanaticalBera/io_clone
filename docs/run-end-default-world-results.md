# Run 종료 및 기본 월드 변경 — 2026-10-05

사용자가 동의한 보완사항과 후속 결정을 반영했다. 문서의 Retry 설명보다 이후 지시를 우선하여, 사망 후 다시 하기는 기존 월드의 다른 위치에서 새 Run을 시작한다. 싱글플레이를 본게임으로 취급한다.

## 기본값 및 생명 상태

- src/shared/config.ts: R56 / 최대 16슬롯 / 시작·재등장 반경 1(7칸).
- 싱글플레이: 1 HUMAN + 15 BOT. 온라인 사람 정원은 8명, 나머지 슬롯을 BOT으로 채운다.
- 기존 보호 시간 2초, 안전 거리 3칸을 유지한다.
- HUMAN 사망은 ELIMINATED, 자동 재등장 없음. BOT은 DEAD_WAIT 후 기존 3초 재등장.
- Classic만 제공한다. 100% FULL_CAPTURE, 기존 production WAVE_COLLAPSE 600ms와 development CapturePulse 설정을 유지한다.

## Run lifecycle 및 결과

HUMAN이 ALIVE가 되는 시점에 Run을 시작한다. 카운트다운은 포함하지 않는다. runId는 matchId / participantId / lifeId로 구분하고, 같은 월드의 재시작에서도 lifeId와 runId가 바뀐다. 싱글플레이의 새 월드 ID는 HTTP 모바일에서도 제공되는 crypto.getRandomValues로 생성한다.

RunResult에는 runId, matchId, participantId, lifeId, endReason, startedAtTick, endedAtTick, durationTicks, simulationHz, mapCellCount, kills, bestTerritoryCells, bestTerritoryPercent를 기록한다. 생존 시간은 시뮬레이션 tick 기준이고, 이번 Run 처치는 누적 처치에서 시작 당시 값을 뺀 값이다. Coins / XP / 보상 지급은 추가하지 않았다.

DEATH / FULL_CAPTURE_WIN / FULL_CAPTURE_LOSS를 구분한다. 먼저 확정된 결과를 이후 월드 종료로 덮어쓰지 않는다. 동일 사건의 동시 선 절단·연쇄 사망과 처치 집계가 끝난 뒤 결과를 확정하여, 서로 죽인 경우 각자의 마지막 처치를 포함한다.

최고 영토는 클라이언트 snapshot에서 추측하지 않는다. 공용 simulation engine이 확정 상태와 점령·고립 정리 직후의 territoryCount를 추적한다. 서버 없이 싱글플레이에서도 같은 코드가 동작한다. 점유율 표시는 기존 소수점 한 자리 내림 규칙을 따른다.

## 싱글플레이 흐름

사망 즉시 시뮬레이션을 멈추고 입력을 차단한다. 렌더링은 계속하여 기존 Wave를 끝낸 뒤 약 700ms에 결과를 표시한다.

다시 하기: 기존 board, BOT identity 및 다른 참가자 영토를 보존하고 이전 재등장 구역과 겹치지 않는 다른 안전한 7칸을 찾는다. Run 기록은 새로 시작한다. 안전한 공간이 없으면 SPAWN_BLOCKED 상태에서 월드를 다시 진행하며 공간을 기다린다.

100% 종료 뒤 다시 하기: 종료된 월드는 다시 진행하지 않고 새 월드를 만든다. 메인 메뉴는 세션과 입력을 정리한다.

## 온라인 흐름 및 재연결

한 HUMAN 사망으로 전체 match가 멈추지 않는다. 다른 참가자는 계속 진행한다. RunResult는 현재 participant 상태와 개인 room view에 남겨 사건 목록이 만료되어도 복구할 수 있다.

run:retry는 현재 matchId / runId 및 종료 상태를 검사한다. 명령 캐시와 상태 검사를 함께 사용하여 중복 요청·이전 Run 재시작을 방지한다. 진행 중이면 같은 월드에서 재등장하고, 전체 월드가 끝났으면 사용자가 명시적으로 참가한 뒤 다음 월드의 카운트다운을 시작한다. 결과 화면은 다음 로비 업데이트로 자동 폐쇄하지 않는다.

연결을 복구하기 전에는 다시 하기 버튼을 비활성화한다. 참가자 전원의 Run이 끝난 채 기본 60초 동안 재시작되지 않은 방은 membership / board / BOT / input / Socket.IO room 채널을 정리한다.

생명 상태와 Run wire 정보가 바뀌어 PROTOCOL_VERSION을 5로 올렸다. 기존 protocol 4 클라이언트는 새로고침이 필요하다.

## 결과 UI 및 화면 증거

최고 점유율 / 플레이 시간 / 이번 Run 처치, 다시 하기 / 메인 메뉴 두 버튼을 표시한다. 가로 844×390과 640×320에서 주요 내용과 44px 이상의 버튼이 화면 안에 들어가며 세로 스크롤이 발생하지 않는다. 좁은 메뉴에서 싱글플레이 제목이 줄바꿈되어 메뉴가 넘치는 문제도 수정했다.

- [DEATH 화면](../evidence/run-end-death-landscape.png)
- [CLASSIC CLEAR 화면](../evidence/run-end-clear-landscape.png)

화면은 실제 Phaser 클라이언트의 모바일 브라우저 에뮬레이션이다. DEATH는 외곽으로 이동하는 준비 상태를 통해 실제 엔진이 판정했다. CLEAR는 소유권을 준비한 뒤 실제 엔진의 FULL_CAPTURE 판정을 거친 fixture 화면이며 자연 플레이 완주의 증거는 아니다.

## 추가 검토: 봇 공격과 귀환 판정

사용자의 후속 피드백에 따라 봇 공격 빈도·성향은 변경하지 않았다. 확장형도 근거리 절단이 가능하지만 노출된 선, 예상 도착/귀환 시간, 자신의 위험, 현재 경로에 따라 기회를 선택한다. 상대 머리가 가까이 지나가는 것 자체는 공격 성공 조건이 아니다. 기존 idle-human / close-intercept / medium-attack 회귀 검사를 유지했다.

귀환은 마커 중심이 현재 소유한 육각 셀 경계를 넘을 때 즉시 처리된다. 원 가장자리가 겹치는 동안에는 아직 이전 셀에 있다. 반경 21 world units는 가로 확대 0.38에서 약 8 CSS px이며, 직선 진행에서 가장자리와 중심의 진입 시점은 약 90ms 차이가 날 수 있다.

경계 직전에는 캡처하지 않고 중심이 넘는 다음 tick에 정확히 한 번 캡처되는 테스트를 추가했다. 기존 판정을 앞당기거나 gameplay collision 크기를 바꾸지 않았다. 싱글플레이 마커는 1tick 보간, 온라인 자기 마커는 예측 및 80ms 보정을 사용한다. 온라인에서 중심이 들어온 듯 보이는 순간과 authoritative board 확인의 일시적 차이는 가능하며, 재현되지 않은 지연 버그로 단정하지 않는다.

## 검증

- typecheck / production build PASS.
- 전체 Vitest: 67개 파일, 326개 테스트 PASS.
- 새로운 Run core/server 검사: 기본값, slot 15 BOT 재등장, HUMAN 자동 재등장 금지, 같은 월드 재시작, 안전 구역 대기, 최고 영토, 마지막 상호 처치, 첫 종료 보존, 100% 구분, snapshot 이후 복구, 중복·오래된 재시작 요청, 유휴 방·채널 정리.
- 기존 R22/8/19칸의 위치·해시 회귀는 tests/baseline.ts에 이전 설정을 명시하여 유지했다. 실제 새 기본값은 별도 Run 테스트에서 검증한다. 해시에는 추가된 비게임플레이 run 메타데이터를 제외하여 기존 BOT 궤적 일치도 확인한다.
- Playwright 대상 7개 통과: 모바일 가로 메뉴/HUD, 오프라인 전환, 사망 후 같은 월드 재시작, 종료 후 새 월드, 결과 복구 및 온라인 재시작을 Playwright로 검증한다.
- 실제 제공 주소 http://192.168.137.1:3003에서 HTTP, protocol 5 WebSocket handshake, 1 HUMAN + 15 BOT 싱글플레이 시작을 확인했다. insecure context에서 crypto.randomUUID가 없는 조건도 확인했다.
- 새 장시간 성능 audit은 하지 않았다.

## MANUAL REQUIRED

실제 Android에서 7칸 시작/재등장 조작감, Wave 이후 결과 타이밍, 확대 상태의 귀환 체감과 네트워크 지연이 있는 복귀를 확인해야 한다. 브라우저 에뮬레이션과 PC에서 모바일 주소를 실행한 검증은 실제 기기의 터치·무선 지연 검증을 대신하지 않는다.
## 후속 접속 주소 수정

마지막 안내에서 experimentCaptureEffect=pulse를 빠뜨려 생성 효과가 NONE으로 보이는 주소를 제공했다. 효과 소스와 기존 활성화 규칙은 변경하지 않았다. 생성 효과를 포함한 모바일 비교 주소는 http://192.168.137.1:3003/?experimentCaptureEffect=pulse 이다.