# Reward & Player Profile V1 결과

2026-10-06. 사용자 승인한 3가지 보완을 포함해 구현했다. 게임 상태·서버·프로토콜·RunResult는 변경하지 않았다. Practice와 온라인 모두 같은 클라이언트 보상 서비스를 사용한다.

## 보상과 통계

- Run 종료 결과를 관측하면 지급을 처리한다. 결과창 표시나 다시 하기 클릭은 지급 조건이 아니다.
- 시작 영토보다 최고 영토가 커졌거나 처치가 있는 Run에 기본 5 Coins와 점유율 보상을 지급한다. 기본 시작 7칸 그대로 무처치 종료한 Run은 0 Coins다. 이런 Run도 통계에는 한 번 기록한다.
- 총 보상 = 기본 5 + floor(최고 점유율 × 2) + 3 × min(처치, 10) + Classic 클리어 100. FULL_CAPTURE_LOSS에는 클리어 보너스가 없다.
- 점유율은 서버/로컬 엔진의 RunResult 값을 사용한다. 누적 획득량·생존 시간은 Coins를 늘리지 않는다.
- runsPlayed, classicClears, 실제 totalKills(보상 상한과 별개), bestTerritoryPercent, longestRunSeconds를 저장한다. 최장 시간은 durationTicks / simulationHz로 정규화한다.

| 최고 점유율 | 처치 | 종료 | Coins |
| --- | --- | --- | --- |
| 2.1% | 0 | DEATH | 9 |
| 18.7% | 3 | DEATH | 51 |
| 46.2% | 8 | DEATH | 121 |
| 100% | 12 | FULL_CAPTURE_WIN | 335 |
| 100% | 12 | FULL_CAPTURE_LOSS | 235 |

## 저장과 중복 방지

- IndexedDB의 hexhold.player-profile / meta / profile에 버전 1 문서를 저장한다. Coins·통계·지급 기록은 하나의 readwrite 트랜잭션으로 갱신하며 commit 후에만 지급 완료를 표시한다.
- 최근 상세 기록은 256개다. 별도 월드/참가자 ledger의 observedLifeId와 paidLifeId로 상세 기록에서 빠진 과거 Run의 재지급도 막는다. 같은 월드의 다음 lifeId는 새 Run으로 지급한다.
- ALIVE Run을 관측했을 때만 지급 자격을 등록한다. 종료 결과만으로 미등록·폐기된 월드를 새로 등록하지 않는다. 이미 저장한 최근 결과는 재접속 시 지급 내역을 복원한다.
- 월드 ledger는 32개, 월드당 참가자는 최대 16명이다. 폐기된 월드만 제거하며 활성 지급 기록을 공간 확보 목적으로 지우지 않는다. 활성 ledger만으로 32개가 찬 경우 저장 실패로 처리한다.
- 탭의 소유 식별자는 sessionStorage로 새로고침 동안 유지한다. 메뉴/새 월드 이동은 기존 월드를 닫고, 같은 탭의 새 월드 등록은 이전 월드를 정리한다.
- 다른 탭의 지급도 IndexedDB가 순서대로 처리한다. BroadcastChannel은 저장된 잔액 변경을 UI에 전달한다.
- 저장 실패는 성공으로 표시하지 않는다. 결과창에 저장 실패/저장 재시도를 표시하며 게임 재시도는 가능하다. 저장소 접근 복구 또는 일시적 write 실패 복구 뒤 저장 재시도가 가능하다.
- 잘못된 버전·음수·비정상 스키마·문자열 레코드는 제한된 단일 corrupt-backup에 보관하고 빈 프로필로 복구한다. 읽을 수 없는 손상 기록의 잔액·지급 이력을 추측해서 재구성하지 않는다.
- 프로필은 해당 브라우저와 origin에 저장한다. 저장 데이터 삭제나 다른 주소/브라우저 사용은 별도 프로필이다. XP·레벨·상점·광고·서버 경제는 추가하지 않았다.

## UI와 영토 생성 효과

결과창은 기존 점유율·시간·처치 옆에 +N Coins와 보유 잔액을 표시한다. 메뉴에는 작은 잔액만 추가했다. 전체 프로필 페이지나 긴 보상 상세 표는 넣지 않았다.

이미 적용 승인된 Capture Pulse는 운영과 개발 모두 기본 ON이다. URL 옵션이 없어도 중립 셀 획득과 상대 영토 탈취에 기존 Pulse가 적용된다. development/test에서 experimentCaptureEffect=none으로만 끌 수 있다. 기존 pulse/bloom 링크는 같은 Pulse를 사용한다. 이번 변경은 효과의 기본 활성화 설정이며 렌더러·전파 방식·영토 판정은 변경하지 않았다.

## 검증

- npm test: 68개 파일 / 340개 테스트 통과. 신규 보상 단위 테스트 14개 포함. 실제 엔진 Run 두 번에 보상을 적용해도 MatchState가 변경되지 않는 검사를 포함한다. 기존 게임/서버 회귀 테스트도 통과했다.
- npm run build: 클라이언트·서버·테스트 타입 검사 및 운영 빌드 통과. 기존 Phaser 번들 크기 경고는 남아 있다.
- npm run test:run: 11개 검증 대상으로 Classic-only, 오프라인 Practice, 가로/세로 화면, 같은 월드 재시도, 클리어 후 새 월드, 보상/저장/재접속을 확인했다. 전체 실행은 10개 통과 후 마지막 온라인 테스트가 60초 제한에 걸렸다. 온라인 테스트 단독 재실행은 통과했다(19.0초).
- 마지막 저장 복구 보완 후 reward.spec.ts 4개 전체 재실행 통과(48.6초). 실제 서로 다른 탭의 동시 지급, 새로고침 지속성, 256개 상세 내역 이후 dedup, 손상 복구, quota 실패 전체 롤백, 복구 후 재지급, 저장소 접근 복구 후 UI 저장 재시도를 확인했다.
- 온라인 실제 Socket.IO 연결 종료/재접속: 동일 Run의 +14 Coins 유지, 누적 잔액 14와 runsPlayed 1 유지, 같은 월드 lifeId 2 재시도 확인.
- 844×390 / 640×320에서 결과 정보·Coins·두 버튼이 화면 안에 있고 문서 세로 스크롤이 없는 것을 확인했다. 스크린샷도 직접 확인했다.
- 운영 빌드 http://127.0.0.1:3001/에서 옵션 없이 CAPTURE_PULSE / 16 참가자 / 페이지 오류 없음 확인.
- PC에서 모바일 LAN 주소 http://192.168.137.1:3003/로 접속: HTTP 200, CAPTURE_PULSE / 16 참가자 / 페이지 오류 없음 확인. WebSocket CONNECTED 및 protocolVersion 5 session:ready 확인. 핫스팟 재활성화 직후 주소 변경 오류가 있어 HTTP 준비 확인 후 재검증했다.

로컬 원본 로그: .local/reward-full-tests.json, .local/reward-build-final.log, .local/reward-browser-final.log, .local/reward-online-confirmed.log, .local/reward-retry-confirmed.log.

## 화면

![Run 종료 보상](../evidence/reward-death-landscape.png)

![Classic 클리어 보상](../evidence/reward-clear-landscape.png)

## MANUAL REQUIRED

실제 휴대폰의 터치 조작, 앱 전환/백그라운드 복귀, 브라우저를 완전히 닫았다 연 뒤의 저장 지속성, 기기별 Coins 글자 크기와 Pulse 체감은 수동 확인이 필요하다. PC의 모바일 화면 에뮬레이션과 LAN 접속 검증을 실제 휴대폰 테스트로 간주하지 않았다. 이 작업에서 새 장시간 성능 벤치마크는 수행하지 않았다.
