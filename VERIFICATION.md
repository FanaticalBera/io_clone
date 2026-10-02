# 검증 기록

이 문서는 시간순 검증 이력을 보존합니다. 이전 항목의 240초·거점 총점 규칙은 당시의 검사 결과이며 현재 제품 규칙은 맨 아래 Classic/Hold 기록과 PRD/TECH_SPEC v0.3을 따릅니다.
## T01
Node 24.21.0 (공식 ZIP의 SHA256 확인), npm 11.19.0, Windows PowerShell.
정확한 패키지 버전: package.json/package-lock.json.
실행: npm ci → npm run typecheck → npm run build → npm run test:e2e.
결과: 타입 검사·빌드 통과; Playwright Chromium의 빌드된 서버/웹 시작 화면 1개 통과 (9.3초).
자동 브라우저 시작으로 실제 HTTP /healthz도 확인.
아직 제품 판정·멀티·기기 성능을 확인한 결과가 아님.

패키지 확인: https://registry.npmjs.org (npm view), Node https://nodejs.org/dist/index.json.
Phaser 3.90.0 선택은 TECH_SPEC의 3계열 기준을 유지. 공식 릴리스 https://phaser.io/download/release/v3.90.0.
## T02
공유 config/state/random, 10개 자동 검증과 클라이언트·서버 타입 검사 통과.
## T03
hex/game 생성과 알려진 좌표·연결성·19칸 anchor 검증. 아래 실행 결과로 상태 갱신.
## T03~T13
수정: src/shared/{hex,game,movement,territory,capture,life,engine,spawn,scoring}.ts 및 tests/core.
각 작업 작성 후 npm run typecheck → npm test를 실행했으며 마지막 13개 파일, 55개 테스트 통과.
작은 맵 기대 칸·사건은 수작업으로 명시. tests/core/helpers.ts는 상태 생성만 담당.
AC-01~11: 폐쇄/열림/분리 영역, 상대 소유권, 오래된 선, 절단 전후·동시, 상호 절단, 영토 소멸, 안전 등장·보호, 거점·종료.
기본 7200틱의 한 거점 239점과 종료 시각 복귀 차단 검증은 scoring.test.ts.
동시 점령은 같은 소유권에서 후보 계산 → 시드 우선순위 → 일괄 적용 → 파생 사건.
가상 외곽 칸은 항상 연결되고 장벽이 없으므로 외곽에서 실제 칸으로 넘어오는 seed를 사전 계산해 BFS (전체 가상 링 BFS와 동일한 도달 집합).
부동소수점 기하 기대 시각은 1e-12 허용 오차로 비교; 사건 묶음은 1마이크로초 양자화.
미검증: 실제 브라우저 플레이, 네트워크 판정, 실제 기기 FPS.
## T14~T19
bot.ts 공통 경로 및 네 성격; 각 성격 1,800틱 실제 점령·복귀, 공격 목표·거점 누적 점수 확인.
Phaser 3 GameScene: 기본 맵 9개 청크, 8개 재사용 개체, 선 칸 채움, 보호·BOT·거점·미니맵. evidence/T16-renderer.png.
입력 adapter: 실제 브라우저 키보드→마우스→키보드, 대각 정규화, 해제 후 방향 유지, 입력 빈도, dispose.
연습: 기본 240초 7,200틱 완주 자동 검사; 로드 후 네트워크를 끊은 Chromium에서도 실제 플레이와 3회 메뉴 전환.
UI: 닉네임 NFC/코드 포인트, tutorial skip/reopen, textContent, HUD. evidence/T18-practice.png, T19-menu.png.
66 → 67 코어 자동 검사, 당시 브라우저 4개 통과. 실제 Android/FPS 확인을 주장하지 않음.

## T20~T26
protocol의 1519칸 두 배열 round trip: 4,056 base64 문자 (원문의 4,052는 근사치).
SnapshotGate는 matchId/seq 및 eventId 중복을 검사. 토큰·Set·봇 메모리는 공개 DTO에서 제외.
실제 Socket.IO 세션·crypto 토큰·세대 교체·64개/30초 요청 캐시, 공개·친구 방 논리.
실제 통신: 방 명령, 단일 30Hz 스케줄러, 10Hz volatile 전체 스냅샷, 대기자 채널 제외, WebSocket upgrade/polling.
서버 방향 권한: 다음 틱 적용, latest seq coalescing/gaps, 이전 경기·생명/위조 위치·점수·ID 거부.
두 독립 Chromium 컨텍스트: 다른 토큰/참가자 ID, 동일 친구 matchId, 실제 서버 입력·같은 roster. 공개 1+7/잘못된 코드/leave.
npm run build → npm test (86개) → npm run test:e2e (6개) 통과. evidence/T26-online.png.

## T27
tests/e2e/multiplayer.spec.ts + tests/e2e/server.ts의 비공개 fixture.
최초 실시간 자동 경로 재현은 브라우저 수신·렌더 지연에 따른 목표 진동으로 실패; FAILED를 숨기지 않고 제어 시계로 재현을 안정화.
유효 방향 변경은 rAF만 기다리지 않고 30Hz 상한 내 즉시 sink에 반영하도록 입력 adapter를 보완. 입력 회귀 통과.
최종 검증은 테스트 프로세스에서 시계만 제어하고 실제 HTTP/Socket.IO와 독립 브라우저 두 개를 사용.
A 실제 점령 → 노출 선의 오래된 칸을 B 접촉 → A 사망 → 19칸/lifeId 2 안전 재등장 → 두 결과 일치.
두 컨텍스트의 공통 snapshotSeq에서 tick/owners/trailMasks/전체 참가자 통계가 일치.
tests/e2e/multiplayer.spec.ts 1개 통과 (약 2분). evidence/T27-two-browser.png.
fixture initializer는 NODE_ENV=test에서만 허용하며 일반 index.ts에서 설정할 수 없음. 브라우저 테스트 hooks도 Vite mode=test에서만 존재.
이는 실제 기본 240초 3라운드·실기기 성능 검증을 대체하지 않음.

## T28
서버 감지 +10초 유예, RETURN 조작, 현재 소켓 세대 확인, dead state 복구, 명시적 leave/만료 후 새 BOT identity·0 누적 점수.
정원은 grace/waiting 포함. 빈 방 TTL 60초 및 연결된 유휴 세션 60초 정리.
server/reconnect.test.ts 4개 및 idle.test.ts 통과. 최종 npm run build/typecheck/npm test: 25파일 91개 통과.
T29/30 브라우저 복구·만료 UI 검증 진행 중. T31 이후 아직 완료 아님.

## T29~T32

수정: network/main/input/rooms/app + tests/server/background, tests/e2e/reconnect/lifecycle/mobile.
실제 두 브라우저에서 transport close·10초 유예 만료·새 BOT·현재 사망/새 lifeId 복구 확인. 결과 이벤트를 놓친 연결도 RESULTS의 room:view로 결과 확인. 서버 재시작은 SESSION_EXPIRED, 사용자가 재시도할 때 새 토큰 발급.
background 입력 차단·RETURN·취약성, foreground의 full init/입력 ack 기준 seq 재개. 숨김 연습 멈춤·복귀 누적 시간 리셋. 모바일 실제 에뮬레이트 touch에서 dead zone·해제·cancel·다중 포인터·capture 영역 밖 이동·회전/반응형 통과.
실제 Android 앱 전환·터치 성능은 별도 실기기 항목.

## T33~T35

수정: limits/app/transport/presentation/game-scene/network/bot, server limits/limit-windows/load 및 core presentation 검증.
입력 token bucket 30/s·burst 60, 반복 초과 연결 종료; 방 요청 5/10초, IP 생성 3/분, 코드 실패 10/분, 4KiB, Origin 및 현재 소켓 세대 확인.
과다/잘못된/큰 패킷·금지 Origin을 실제 Socket.IO로 보내 격리된 방 지속·소스/설정 HTTP 404·토큰 비공개를 확인.
표시 예측만 로컬 이동; small error 80ms·life/death 즉시 보정·상대 100ms 보간/100ms 외삽. 불변 owners/statistics 확인.
T27 재실행에서 제어 시계와 실제 브라우저 keepalive의 속도 차이로 입력 limiter가 정당한 연결을 끊는 실패를 발견. 보안 상한 시계를 실제 단조 시간으로 분리하고 경계 fixture는 독립 rateNow 사용. 이후 T27 회귀 통과.
실제 8명 + 사람 2/봇 6의 두 방, 짧은 설정 3라운드: 공통 (matchId,snapshotSeq) 비교·새 맵/입력·결과·TTL·sessions/channels 0. evidence/T35-resources.json.
npm run build → npm test: 30개 파일 98개 통과.

## T36~T37

lockfile clean install 후 typecheck/build/test와 실제 브라우저 10개 회귀 통과(약 3.8분). 이후 production 인터페이스/다중 터치 검증 추가·수정 진행.
첫 npm ci는 실행 중 esbuild.exe의 Windows 파일 잠금 EPERM으로 실패. 이 작업의 로드 완료한 컴파일 보조 프로세스를 종료한 뒤 npm ci 통과(166개 패키지, audit 0).
운영 서버만으로 일반 URL와 비루프백 인터페이스 HTTP/SIO/독립 두 세션 플레이. LAN HTTP에서 crypto.randomUUID/Clipboard의 secure-context 제약을 발견해 getRandomValues 요청 ID 및 수동 링크 공유 fallback으로 수정. 재검증 통과.
운영 JS에 __HEXHOLD_TEST__ 없음. static은 dist/client만, default 같은 origin. Host/Port/Origins/Rooms 환경 변수 안내.
SwiftShader 자동 프레임의 초기 12.05 FPS는 실제 RTX GPU 성능으로 주장하지 않음. 정적 중립 맵을 1회 texture 생성해 재사용하도록 보완 후 같은 자동 조건 13.02 FPS. 증거 evidence/T36-PC-automated.json. 폰/실제 GPU 목표 충족을 이 수치로 대체하지 않음.
테스트 서버 1회 시작 timeout은 실행하지 못한 검증이며 재실행 production/smoke 2개 통과(47.1초).
최종 전체 회귀 결과는 아래 추가 기록으로 갱신 예정.

## T38 실시간 부하·실기기 진행

기본 설정·기본 맵·실제 Socket.IO 10연결·8명 방 + 사람/봇 혼합 방. 각각 실제 240초 × 3라운드 = 총 43,200틱. 약 748.4초 완주.
tests/manual/default-soak.mts는 외부 상태 변경 API 없이 공개 스냅샷으로 움직이는 scripted clients와 TCP proxy의 각 방향 50ms 층을 사용.
전체 틱(봇 의사결정 포함) p95 0.8054ms, backlog 최대 673.1ms, 71,572스냅샷/615,982,475 JSON bytes. 10연결 합계 약 804KiB/s(실행 전체 시간 기준), 평균 스냅샷 약 8.40KiB.
RTT 24표본 중앙 118.40ms·p95 226.06ms. ‘100ms 추가’와 실제 RTT를 구분. clean install/브라우저 회귀가 동시에 실행된 Windows 호스트 조건.
heap 표본은 GC에 따라 약 24~77MB, RSS는 후반 약 221~228MB 범위. byte equality나 완전한 누수 부재를 주장하지 않음. 종료 방/연결/채널 0, 오류 0. 당시 close의 idle 세션은 60초 수명으로 남았으며 이후 close에서 SessionStore도 즉시 비우도록 보완하고 별도 회귀 검증.
evidence/T38-default-soak.json. 최초 짧은 실행은 중단되어 완료 증거로 사용하지 않음. 관측/클라이언트 맵 재사용 보완 후 위 실행 통과.

PC: Windows 10 10.0.19045 / Ryzen 5 5600X / 12 logical cores / 약 16GB / RTX 3070 Ti(WMI 확인).
자동 Chromium 153.0.8010.12는 SwiftShader, DPR 1, 1280×800, 20초 조건.
사용자 제공 폰: **Galaxy S24+ / Android 15**. PC Ethernet + Windows 핫스팟, 192.168.137.1/24 확인.
실기기 서버: 192.168.137.1:3003, HOST를 이 인터페이스로 제한. ?metrics=1은 30초 평균 FPS 표시.
폰 시간 초과를 보고받아 일반 권한 방화벽 추가가 Access denied. 관리자 helper는 hotspot-rule.json에 적용 성공 반환. 폰 접속 경로 추가 진단 중. 실기기 pass로 기록하지 않음.

## AC 추적

| AC | 자동 증거 | 실기기/미검증 |
|---|---|---|
| 01 | capture/edge-capture, multiplayer 실제 점령 | 직접 조작감 진행 |
| 02 | territory/atomic-capture, 두 view 일치 | — |
| 03 | edge-capture/engine | — |
| 04 | chronology/multiplayer 오래된 선 절단 | 100ms 직접 플레이 진행 |
| 05 | chronology/simultaneous | — |
| 06 | simultaneous | — |
| 07 | engine/chronology | — |
| 08 | scoring, HUD/result | 실기기 거점 피드백 진행 |
| 09 | spawn/life/reconnect/multiplayer | — |
| 10 | atomic-capture | — |
| 11 | scoring, 실제 두 결과/RESULTS 복구 | — |
| 12 | rooms/online 공개 1+7 | — |
| 13 | multiplayer 독립 2브라우저, production 실제 인터페이스 | PC+S24 동일 방 진행 |
| 14 | friend-rooms/transport | — |
| 15 | friend-rooms/reconnect | — |
| 16 | sessions/reconnect/lifecycle 실제 단절/복구 | 폰 Wi-Fi/앱 전환 진행 |
| 17 | idle/reconnect/load, 새 BOT·TTL·0채널 | — |
| 18 | practice 기본 7200틱, offline browser/lifecycle | — |
| 19 | load 실제 10소켓, 기본 soak 두 방 × 3라운드 | 직접 플레이 FPS |
| 20 | input/mobile 다중 터치·회전·cancel | S24 실기기 진행 |
| 21 | names/protocol/authority/limits/limit-windows/ui | — |
| 22 | bot/personalities 1800틱 점령·복귀·공격/거점, 실제 플레이 BOT 표기 | 직접 성격/조작감 진행 |

## 인수·남은 검증

T39 문서 준비는 진행했으나 T38 필수 실기기 수용 기준이 끝나기 전 DONE/MVP 완료로 올리지 않음.
폰 터치·회전·앱 전환·10초 이내 복구·두 실제 기기 같은 방, PC 평균 60/S24 평균 30FPS, 100ms RTT 조작감의 직접 검증을 이어갈 것.
공개 HTTPS 운영·APK·후속 기능은 미구현/미검증이며 현 요청 범위 밖.


## 실기기 접속 및 카메라 떨림 수정

PC 핫스팟 192.168.137.1, 사용자 폰 IP 192.168.137.253. 관리자 audit에서 해당 Node에 기존 Public TCP Any 차단 규칙이 있어 좁은 Allow보다 우선하는 것을 확인. 원래 규칙을 .local에 백업하고 TCP 3003만 제외, 나머지 TCP/UDP 차단 유지. remove-hotspot.ps1은 백업 복원과 테스트 Allow 제거를 수행한다.
사용자는 이후 S24+에서 메뉴·게임·친구 방 실행 성공을 확인했다. 모바일 멀티 화면 떨림은 새 10Hz snapshot마다 Phaser startFollow가 scroll을 즉시 초기화하는 원인을 확인했다. 추적 대상 변경 때만 startFollow, 온라인 객체도 Presentation의 보정된 표시 위치를 사용하도록 수정했다.
mobile E2E에 실제 카메라 프레임 이동을 관측하는 회귀를 추가: 수정 전 허용 이동보다 10.52 world units 큰 점프를 검출하여 실패, 수정 후 통과. 허용량은 실제 프레임 경과시간×이동속도+8이며 사망/새 생명 전환은 제외한다. 운영에서는 테스트 render-state hook을 제공하지 않는다.
사용자가 수정 후 폰 떨림 감소 및 평균 약 110 FPS를 보고했다(사용자 관측값, 정확한 Chrome 버전/1% low 미수집). 이어 PC 떨림을 보고하여 강력 새로고침 여부 및 모드 확인 중. PC 떨림 해결 전 실기기 완료 판정하지 않는다.
실제 Windows PC의 IAB에서 활성 연습 HUD·8슬롯·기본 맵·773×892 canvas, 최근 30초 평균 110.6/116.4 FPS를 관측했다. evidence/T38-PC-visible.json. 설치 GPU는 RTX3070Ti지만 실제 backend는 별도로 확인하지 않았으며, 자동 SwiftShader 증거와 구분한다.
## PC 마커·프레임 이동 추가 수정

사용자 관측: S24+는 개선됐고 PC는 가운데 내 캐릭터가 흔들림. 모니터 주사율 자체가 원인이라고 단정하지 않는다.
로컬 연습은 30Hz 확정 위치를 렌더 프레임마다 한 틱 지연 보간. 온라인은 snapshot의 tick을 기반으로 상대적 표시 시계를 고정하고, 오래된 snapshot도 같은 현재 표시 시간으로 비교하여 보정한다. 지연/몰림 간격 [100,245,301,430,509]ms에서도 직선 예측 위치가 뒤로 튀지 않는 전용 검증 통과. 큰 차이·사망·생명 전환의 즉시 보정은 유지한다.
방향 입력 때 과거 이동 전체를 새 방향으로 회전시키던 예측을 수정: 방향이 바뀐 시점의 표시 위치에서 새 방향 이동을 시작한다. ack 이후에도 위치가 연속인 회귀 통과.
카메라는 보간된 캐릭터를 매 렌더 프레임 중심에 추적한다. snapshot/practice publish에서는 객체 위치를 덮어쓰지 않는다. 처음 중심 오차 검증은 10.686 world units로 실패; 두 루프의 중간 위치 갱신을 제거한 뒤 연습/온라인 PC 회귀 통과. 실패를 목표 완화로 통과 처리하지 않았다.
최신 코어·서버 30파일 101검사, typecheck/build 통과. 이전 전체 12개 브라우저 회귀는 통과했으나 이후 중심 고정 수정의 첫 전체 실행은 PC 회귀 1실패/11통과; 수정 후 관련 회귀 및 마지막 전체 결과는 아래 추가 기록으로 갱신한다.
metrics=1에는 실제 clock:ping RTT와 최근 30초 중 가장 느린 1% 프레임의 평균 시간으로 계산한 FPS를 추가했다. 이는 별도 진단 옵션이며 일반 게임 화면/판정에는 적용하지 않는다. 연습 전환 시 RTT 표시를 지운다.
사용자에게 최신 수정 후 PC 마커·FPS/1%/RTT 재확인을 요청한 상태. 실기기 수용 완료는 아직 아니다.
## 2026-10-01 최종 인수 기록 — 이번 수정 후 마무리

사용자는 약 6시간 진행 후 이번 문제를 마무리하고 정리해 달라고 요청했다. 추가 실기기 테스트를 요청하지 않고 미검증을 분리한다.
최종 수정: 자동 중앙 정렬을 제거하고 실제 #field 크기를 ResizeObserver·visualViewport/방향 변경 다음 렌더 프레임에 측정하여 canvas·renderer·camera 크기를 함께 맞춘다. #field는 100dvh 사용. observer/listener/rAF는 scene 종료 때 정리한다.
마지막 npm run build/typecheck, npm test 30파일 101개 통과. 마지막 관련 Playwright camera/mobile/smoke 3개 통과. 연습·온라인의 반복 세로↔가로 및 높이 변화마다 캔버스 x/y=0, CSS 크기=viewport 확인. evidence/T31-mobile-landscape.png, T31-mobile-online.png, T38-PC-camera.json 및 PC 두 화면.
PC 카메라 중심 오차는 약 2.84e-14(연습)/6.36e-14(온라인) world units로 부동소수점 수준. 자동 headless의 약 1.2초 이동 표본이며 실기기 FPS로 대체하지 않는다.
최신 전체 12개 실행은 11통과/PC 회귀 1실패였다. 새 ‘실제 이동’ 조건은 초기 위치에서 경계 밖을 향해 1초 뒤 멈춰 이동량 0을 기록했다. 테스트 경로를 맵 중심 방향으로 수정한 뒤 PC/mobile 2개 및 최종 위 3개 통과. 별도 모바일 연속성 실패는 사망/생명 전환의 의도된 즉시 보정을 구분하도록 lifeState를 관측하고 ALIVE 연속 표본만 검사한다. 목표 오차나 이동 상한을 늘리지 않았다. 모든 실패를 숨기지 않으며 마지막 전체 명령 자체를 12통과로 바꿔 보고하지 않는다.

실기기 관측: 사용자 S24+ Android15 Chrome에서 약 110 FPS, 화면 떨림 개선 보고. PC에서는 이후 ‘싱글 143 131, 멀티144 41, 좋아졌다’ 보고; 싱글 평균143/1%131, 멀티 평균144로 기록하고 두 번째 숫자41의 라벨은 사용자 답변에서 불명확하여 RTT로 단정하지 않는다.
실제 IAB에서는 같은 친구 방 EX6L589A의 PC 검증·베라곰, 2 HUMAN·6 BOT 및 진행 중 공통 순위표를 확인했다. 해당 순간 PC 평균128.2FPS/1%41FPS/RTT3ms(동시 자동 테스트 실행 조건). 공유 PC의 테스트 부하와 낮은 프레임 구간을 구분한다.
사용자는 폰 다른 앱 약5초 후 조작 가능, Wi-Fi 재연결 후 복구를 보고했다. 회전은 처음에 가운데만 캔버스가 남는 현상을 보고하여 위 최종 수정을 적용했다. **최종 회전 수정 후 S24+ 실제 재확인은 미검증**이다. Chrome 정확한 버전·전체 경기 최저 프레임·100ms RTT 직접 플레이 조작감도 미검증이다. 실제 100ms 추가 TCP 지연의 3라운드 자동 부하 기록은 앞 절의 증거로 유지한다.

T01~T37 구현·자동 검증 완료. T38은 부분 검증 후 WAITING_EXTERNAL, T39는 인수 문서 준비 완료이나 T38 전체 수용 의존 때문에 BLOCKED. 전체 MVP 수용 완료나 공개 배포/APK 완료로 주장하지 않는다.
인수 파일: README.md, TASKS.md, VERIFICATION.md, docs 원본, evidence. 핫스팟 서버 192.168.137.1:3003을 테스트용으로 유지하며 현재 열린 탭은 기존 JS이므로 새로고침해야 최신 회전 수정이 적용된다. 방화벽 원복은 관리자 scripts/remove-hotspot.ps1. 기본 실행·빌드·검증 명령은 README에 기록했다.
2026-10-01: 사용자 요청으로 테스트 서버 PID 20988 종료. TCP 3003 수신 없음 확인. 핫스팟 게임 주소는 서버를 다시 실행하기 전까지 접속되지 않음.

## 2026-10-01 UI 중간 수정 — 참고 이미지 분위기 반영

요청한 TASKS/VERIFICATION/README/PRD/TECH_SPEC을 읽고 기존 문서의 작성 당시 지시와 현재 UI 수정 요청을 구분했습니다. 참고 이미지의 단독 색 칸·미니맵 시야 사각형·구슬형 꼬리를 추가하지 않았습니다. 실제 소유권과 선 마스크에 따른 칸만 표시합니다.

- 메뉴: 크림색 바탕, 큰 HEXHOLD 로고, 민트 공개 대전·보라 봇 연습 카드, 닉네임·친구 방 영역, 게임 방법 버튼. 대기·결과·튜토리얼·오류도 같은 밝은 테마.
- 전장: 중립 육각 격자, 진한 소유 영토, 연한 노출 경로(채움 alpha 0.28). 인접한 선 칸 중심을 임의로 잇던 굵은 선 제거. 온라인 미확정 머리 칸은 alpha 0.13으로 확정 경로와 구분.
- 마커: 사용자 후속 요청으로 모든 참가자의 내부 화살표 제거. 원형 색 토큰·흰 테두리·재등장 보호 링·YOU/BOT 이름 표시 유지.
- HUD: 왼쪽 점수와 보유 거점 수, 중앙 타이머, 오른쪽 나가기·순위·미니맵. 작은 화면에서도 상위 3명과 자기 행을 표시. 미니맵은 실제 육각 칸·거점 다이아몬드·자기 원형 위치 표시.

최종 `npm run build`(client/server/tests typecheck 포함) 통과. 최종 관련 Playwright ui/practice/mobile/camera/online 5파일 **6개 통과, 1.3분, exit 0**. 실제 친구 방 두 브라우저·공개 입장·잘못된 코드·오프라인 연습·반복 화면 전환·모바일 터치와 회전·PC 카메라 연속성을 확인했습니다. 이번 UI 변경에서는 코어/서버 규칙을 수정하지 않았고 코어/서버 전체 검사나 실기기 성능을 새로 실행했다고 주장하지 않습니다.

중간 검증 실패도 구분합니다. 기본 runner는 이미 실행 중인 3001 포트 때문에 시작하지 못했습니다. 기존 서버를 재사용한 첫 6개 검사 결과는 모두 통과했으나 Windows 개발 서버 종료 대기가 끝나지 않아 해당 runner를 중단했습니다. 서버를 제외한 임시 runner로 재시도할 때 종료된 5174에 접속하여 2개 CONNECTION_REFUSED가 발생했고 테스트용 Vite를 다시 시작했습니다. 카메라 검사의 무작위 생존 표본 0 및 rAF 예약 시간과 실제 렌더 시각 차이로 인한 이동 상한 초과(1.744/0.059 world units)를 확인했습니다. 생존 가능한 고정 시드 4로 재현하고 실제 위치를 그린 `renderedAt`으로 프레임 간 시간을 측정하도록 검사를 보완했습니다. 중심 오차 0.01, 기존 속도×시간+8 이동 상한, 실제 이동 50 이상 기준을 유지했습니다. 최종 표본은 연습/온라인 모두 중심 오차 약 5.68e-14이며 이동 상한 이내입니다. seed 고정은 검사 컨텍스트의 연습 시드 및 테스트 서버에만 적용되며 운영 난수·게임 판정을 변경하지 않습니다.

자동 Chromium 화면 검사: 1672×941 메뉴/전장과 390×844 메뉴/전장 스크린샷. 1280×800, 844×390, 390×844, 360×800, 320×640에서 브랜드·타이머·나가기·점수·거점·순위·미니맵·조이스틱의 화면 밖 배치/상호 겹침 0, pageerror 0. `evidence/UI-refresh-layouts.json`, `UI-refresh-menu.png`, `UI-refresh-game.png`, `UI-refresh-mobile-menu.png`, `UI-refresh-mobile-game.png`. 실제 S24 회전·100ms 직접 조작감 등 기존 미검증은 그대로 유지합니다.

## 2026-10-01 UI 이후 전체 회귀 및 순위표 수정

사용자의 진행 요청에 따라 전체 자동 회귀와 확인된 표시 오류 수정을 수행했습니다.

- `npm test`: 코어/서버 **30파일 101개 통과, 4.15초, exit 0**. 이번 순위표 수정은 클라이언트 표시만 변경하며 코어/서버 규칙은 변경하지 않았습니다.
- 수정 후 `npm run build`: client/server/tests 타입 검사와 서버·클라이언트 운영 빌드 통과, exit 0.
- 수정 후 `npm run test:e2e`: 전체 **13개 통과, 3.6분, exit 0**. PC 카메라, 입력, 서버 재시작·백그라운드 복귀, 모바일 터치·회전, 실제 두 브라우저 점령·절단·재등장·결과, 친구/공개 방, 오프라인 연습, 운영 정적 제공, 순위표, 재연결, 렌더러, 튜토리얼·닉네임·HUD 회귀를 포함합니다. 테스트 서버 정리까지 정상 종료했습니다.

순위표 오류: 두 참가자가 영토 20·거점 0으로 공동 1위일 때 A가 영토 1을 잃고 거점 점수 1을 얻으면 두 총점은 여전히 20입니다. B의 영토가 더 많아 순위는 1·2가 되어야 하지만, 기존 캐시 키에서 영토 수가 빠져 1·1 표시를 유지했습니다. 같은 스냅샷에서 selfId를 A→B로 변경해도 A 강조가 남았습니다. `src/client/ui.ts`의 캐시 키에 영토·거점 점수·selfId 및 행 표시 정보를 반영했습니다. `tests/e2e/ranking.spec.ts`와 `tests/fixtures/ui.html`의 브라우저 회귀는 수정 전 실제 1·1을 검출해 실패했으며 수정 후 1·2, 총점 20·20, 자기 행 B를 확인해 통과했습니다.

중간 실행: 기존 전체 12개는 개별 검사 모두 통과했지만 Windows 샌드박스에서 개발 서버 종료 정리가 끝나지 않아 runner를 중단했습니다(exit 1). 이것을 정상 완료로 계산하지 않습니다. 최종 13개 명령은 샌드박스 밖에서 실행하여 정상 종료(exit 0)까지 확인했습니다. 서버 재시작·단절 검사 중 Vite의 ECONNRESET/ECONNABORTED proxy 로그가 있었으나 해당 복구 검사는 통과했습니다. 제품 코드나 Playwright 정리 동작을 우회하는 변경은 하지 않았습니다.

운영 검사의 자동 프레임 관측 파일 `evidence/T36-PC-automated.json`은 최신 실행으로 갱신됐습니다. 이는 Chromium 153/SwiftShader, 1280×800, 20초 표본이며 실제 RTX GPU·S24 성능 수용 결과로 해석하지 않습니다. 관련 화면·카메라·멀티플레이 증거는 기존 `evidence/` 경로에 갱신됐습니다.

이번 실행에서 새 실기기 검증이나 기본 두 방×3라운드 soak를 수행하지 않았습니다. 기존 soak 증거는 유지하며, 최종 회전 수정 후 S24 재확인·정확한 Chrome 버전·전체 경기 저프레임·100ms RTT 직접 조작감은 여전히 미검증입니다. T38은 WAITING_EXTERNAL, T39는 BLOCKED를 유지합니다. 추가 기기 검증을 사용자에게 요청하지 않으며 전체 MVP 수용 완료나 공개 배포/APK 완료로 표시하지 않습니다.

## 2026-10-01 사용자 S24 세로 화면 보고

사용자가 S24에서 세로 화면으로 플레이했으며 UI가 겹쳐 복잡하다고 보고했습니다. 실제 기기의 확인된 미해결 문제로 기록합니다. 어떤 요소가 겹쳤는지, 해당 브라우저 viewport·빌드와 발생 원인은 아직 확인하지 않았습니다. 기존 모바일 에뮬레이션에서 겹침 0을 기록한 결과로 이 보고를 해결됐다고 처리하지 않습니다.

사용자 요청에 따라 세로 HUD 수정은 마지막으로 유예하고 이번에는 모바일 레이아웃을 변경하지 않았습니다. T31을 NEEDS_FIX로 다시 열었습니다. T38 전체 수용과 T39 완료는 계속 미완료이며 추가 기기 테스트를 요청하지 않습니다. 앞의 T01~T37 완료 기록은 이 새 문제 보고 이전의 구현·자동 검증 결과입니다.

## 2026-10-01 사용자 발견 문제 1~3 — 영토·벽·처치/사망

사용자 첨부 사진의 주황색 고립 영토 잔존, 벽에 부딪쳐도 죽지 않는 동작, 처치/사망 효과 부족을 우선 처리했습니다. 기존 PRD/TECH_SPEC의 ‘분리 영토 유지’·‘벽에서 정지’는 이번 사용자 요청으로 변경했으며 v0.2 문서에 반영했습니다. 원본 작업 계획 docs/TASKS.original.md는 작성 당시 기록으로 보존합니다.

1. 동시 점령의 모든 소유권 이전이 완료된 뒤 영토를 잃은 참가자의 6방향 연결 성분을 검사합니다. 가장 큰 연결 영역을 남기며 동률은 가장 낮은 cellId로 결정하고 작은 고립 영역은 중립화합니다. setOwner를 통해 칸 수를 함께 갱신하므로 영토 점수·거점 소유권·미니맵·전장이 같은 상태를 사용합니다. 이미 누적한 거점 점수는 유지됩니다.
2. 기하 추적에서 실제 외곽 충돌 시각 boundaryT를 반환하고 엔진의 시간 순 사건에 넣었습니다. WALL_HIT은 보호 중에도 적용하며 이후 이동을 폐기하고 영토·선 정리 및 기존 3초 재등장 대기를 적용합니다. 벽 사망에는 처치자를 부여하지 않습니다. 같은 시각의 선 절단은 기존 유효 절단 처리와 제거 횟수를 유지하며, 정확한 라운드 종료 순간에는 종료를 우선합니다. 충돌 위치는 시간 양자화 오차와 별개로 실제 경계 직전 위치를 기록합니다.
3. DEATH 사건에 사망 위치·lifeId·선 절단 처치자 정보를 담았습니다. 효과는 확정 사건에만 반응하며 사망 위치에서 충격파·파편을 표시합니다. 자기 처치는 민트색 화면 반응·처치 안내, 자기 사망은 붉은 반응·원인 안내를 표시합니다. 동시 상호 절단은 제거·사망 횟수를 모두 반영하면서 자기 사망 안내를 우선합니다. 중복 사건·최초/재연결 상태는 과거 효과를 재생하지 않습니다. 임시 효과는 최대 24개·650ms로 제한하고 만료·경기 변경·scene 종료 때 정리합니다. 효과 때문에 판정이나 카메라 위치를 멈추지 않으며 이번에는 사운드를 추가하지 않았습니다.

재현 및 중간 실패:

- 새 reported-rules 검사 5개 중 수정 전 3개가 실패했습니다. 작은 영역의 owner가 2로 남고 벽에서 ALIVE였음을 확인했습니다. 수정 후 연결 정리·동률·벽 탈락·회피·종료 경계 조건이 통과했습니다.
- 첫 전체 코어 실행은 사망 위치의 마이크로초 양자화 차이와 과거 비치명 벽에 기대던 239회 거점 점수 fixture 때문에 2개 실패했습니다. 실제 충돌 위치를 보존하고 거점 안에서 방향을 번갈아 이동하는 fixture로 변경했습니다. 239회 지급·최종 점수 241·결과 동결 조건은 유지했습니다.
- 추가한 거점/사건 순서 fixture의 첫 실행은 작은 맵에 고정 거점이 없는 조건과, 자기 영토에 서 있어 선이 먼저 마감되는 조건으로 2개 실패했습니다. 기본 반경 22의 거점을 사용하고 실제 노출 상태로 배치해 고립 거점 중립화·누적 점수 보존 및 벽/절단의 전후 순서를 검증했습니다.

최종 검증:

- `npm run build`: client/server/tests 타입 검사와 운영 빌드 통과, exit 0.
- `npm test`: **32파일 112개 통과, 3.66초, exit 0**. 새 reported-rules 7개·combat-events 4개 및 기존 점령·동시 사건·점수·봇·프로토콜·실제 소켓 서버 회귀 포함.
- `npm run test:e2e`: **전체 15개 통과, 3.7분, exit 0**, Windows 서버 정리까지 정상 종료. 새 combat 2개는 공유 엔진과 실제 wire 직렬화/수신을 사용하는 제어된 브라우저 fixture입니다. 고립 조각 제거와 표시 점수·처치/벽 사망·효과 중복 방지·만료 정리·재동기화 기준점·상호 절단을 확인했습니다. 기존 multiplayer의 실제 두 브라우저 대전에도 사망자와 처치자 양쪽 효과 및 확정 위치/처치자 메타데이터 검증을 추가해 통과했습니다. 카메라·모바일 입력/회전·재연결·운영 정적 제공 등 기존 전체 회귀도 통과했습니다.

증거: evidence/reported-combat.json, reported-territory-split.png, reported-kill-impact.png, reported-wall-impact.png, reported-mutual-impact.png. 이미지 검토 시 제어된 fixture의 정지된 경기에서 자기 이동 예측이 계속 진행해 효과가 화면 밖으로 나가는 것을 확인하고 fixture에서 표시 위치만 고정했습니다. 효과 이미지는 실제 첫 렌더 프레임을 캡처하는 동안만 테스트 렌더 루프를 멈춘 뒤 재개합니다. 운영의 이동·효과 시간·카메라 동작을 변경하거나 테스트 목표를 완화하지 않았습니다.

봇이 너무 단순하다는 사용자 의견은 다음 개선 항목으로 기록했으며 행동·밸런스는 이번에 변경하지 않았습니다. S24 세로 UI 수정 유예도 유지합니다. 이번 규칙 변경 후 기본 두 방×240초×3라운드 soak 및 실기기/100ms 직접 조작감은 새로 검증하지 않았습니다. 기존 soak는 변경 전 규칙의 부하 증거로 구분하며 최신 규칙의 전체 수용 증거로 대체하지 않습니다. T31 NEEDS_FIX, T38 WAITING_EXTERNAL, T39 BLOCKED를 유지합니다.

## 2026-10-01 Classic/Hold 모드 개편

현재 요구는 Classic 100% 완전 점령과 Hold 목표 점유율 연속 유지입니다. 기존 240초·거점 총점 검사는 legacy helper 회귀로 분리하고, 두 모드의 승패에는 사용하지 않습니다. S24 세로 HUD의 전체 겹침 문제와 봇의 행동 품질은 이번 완료 범위에서 제외합니다.

변경 영향 분석·구현:

- `shared/modes`, `model/state/game`: 안정 id·동결 설정·중앙 기본값·모드 상태·승리 원인. 공유 평가 코어를 온라인 서버와 로컬 연습에서 사용합니다.
- `engine/life/spawn/scoring`: 모든 같은 시각 파생 사건 처리 후 승리, 틱 내부 Hold 상실/재달성, 정확한 만료 시각 예약, 사망·이탈 즉시 유지 상태 삭제, 종료 단일 적용, 무제한 재등장, 영토/처치 순위.
- `legacy-scoring`, `bot`, `game-scene`: 시간제·거점 점수 함수와 위치 데이터 보존, 두 모드의 거점 지급·봇 목표·전장/미니맵 표시 배제.
- `rooms/app/loop/protocol`: 공개 큐 모드 분리, 친구 방 생성 시 고정, protocol v2, 전체 상태·결과·결과 이벤트 손실 복구·다음 판 설정 유지. 클라이언트는 mode id만 생성/공개 입장에 제출하며 설정·승리·Hold 시간을 제출할 수 없습니다.
- `ui/main/practice/network/style`: 동일 메뉴의 좌우 버튼·키보드·드래그·스와이프, 초기 Classic, 로비 읽기 전용 정보, 점유율·처치·결과 승자, 서버 Hold 유지자/카운트다운. 처치 행 추가가 PC 순위표 높이를 늘려 미니맵을 덮지 않도록 행 간격을 조정했습니다.

검증 결과:

- `npm run typecheck`: client/server/tests 통과, exit 0.
- `npm run build`: 타입 검사와 서버·클라이언트 운영 빌드 통과, exit 0. Phaser 포함 JS 약 1.314MB/gzip 357.49KB의 기존 번들 크기 경고는 남아 있습니다.
- `npm test`: **34파일 128개**, exit 0. 기존 규칙·소켓 테스트를 유지하며 core/modes 13개 및 server/modes 3개를 추가했습니다.
- `npm run test:e2e`: **전체 18개 통과, 4.3분, exit 0**. 최종 빌드 완료 후 Windows 샌드박스 밖에서 순차 실행했고 서버 종료 정리까지 정상 완료했습니다. 기존 15개와 새 modes 3개를 포함합니다.

핵심 검증 내용:

1. Classic 100% 미만의 무제한 진행, 100% 도달 즉시 종료, 같은 시각 절단·벽 사망 우선, 7,200틱 이후에도 재등장·점령 가능, 결과 동결·FINISH 중복 방지.
2. Hold 미달 시 미시작, 달성 시작, 상실·사망·이탈 취소, 재달성 전체 기간 재시작, 한 틱 안의 하락/회복, 정확한 연속 유지 완료, 여러 유지자·배열 순서 변경에도 일관된 승자, 완료 직후 다음 벽 사건 미처리.
3. 실제 Socket.IO 공개 Classic/Hold 큐 격리·경기 시작, 친구 코드 참가의 서버 모드, 변경 요청 거부, 유효 설정/잘못된 설정 검증, 전체 스냅샷의 Hold 상태, 결과 이벤트 손실 복구, 같은 모드 다음 판.
4. 브라우저 좌우 버튼·키보드·마우스 드래그·실제 touch event 스와이프/세로 스크롤, Hold 연습, 실제 서버 카운트다운 취소·재시작, 닫힌 transport의 결과 복구·다음 판, PC 순위표와 미니맵 간격.

중간 실패·수정:

- 종전 4분 종료·재등장 차단·프로토콜 버전에 기대던 테스트를 현재 요구로 갱신했습니다. 과거 거점 239회 지급 검사는 legacy 함수에 대해 보존했습니다.
- 마이크로초로 반올림한 Hold 예약 시간이 정확한 만료보다 앞서면 완료를 놓치는 경계 fixture가 실패했습니다. 예약 키와 정확한 만료 시각을 함께 보존해 수정했습니다.
- 점유율은 소수점 한 자리 내림이므로 3/1519칸은 0.1%입니다. 브라우저 검사의 0.2% 기대값을 수정했습니다.
- 연습 카메라 검사는 30Hz 고정 틱의 위치 양자화 오차를 허용하도록 검사 기준을 명시했고, 모바일 카메라는 사망 타이밍에 좌우되지 않도록 고정 시드·실제 렌더 시각을 사용했습니다. 카메라 제품 코드는 변경하지 않았습니다.
- 중간 회귀 실행과 빌드 갱신이 겹쳐 운영 페이지가 일시적으로 Cannot GET /로 실패했습니다. 이후 빌드 완료와 전체 회귀를 순차 실행했습니다.
- 복구 테스트에서 연결 상실 후 실제 RETURN 이동이 추가 영토를 점령해 최종 점유율이 시작값 50.0%에서 달라졌습니다. 고정값 대신 서버의 최종 칸 수와 복구된 표시를 비교하도록 수정했습니다.

브라우저의 단절/서버 재시작 검사 중 proxy ECONNRESET/ECONNABORTED 로그는 예상되는 연결 종료입니다. 최종 종료 상태는 별도로 기록합니다. 자동 모바일 에뮬레이션을 S24 실기기 문제 해결로 해석하지 않습니다.

증거: `evidence/modes-menu-hold.png`, `modes-menu-touch.png`, `modes-hold-countdown.png`, `modes-hold-results.png` 및 기존 카메라·조작·멀티·운영 증거.

3라운드 자원 정리·브라우저 결과 테스트의 종료 소유권은 테스트 fixture로 준비하고 실제 공유 엔진이 승리를 판정합니다. 실제 게임 입력으로 Classic 100%를 자연 완주한 시간이 검증된 것은 아닙니다. 기존 점령/절단/재등장 두 브라우저 검사는 실제 방향 입력으로 수행합니다. 수동 soak는 무제한 Classic의 10분 부하 측정으로 바꿨으며 이번 작업에서는 다시 실행하지 않았습니다. 새 모드 장기 밸런스·100% 자연 완주·실기기·100ms 직접 조작감은 미검증입니다. T31 NEEDS_FIX, T38 WAITING_EXTERNAL, T39 BLOCKED를 유지합니다.

## 2026-10-01 환경설정·모바일 조작 선택·처치 진동

추가 모드를 만들지 않고 기존 Classic/Hold의 기능을 다듬었습니다. 영향은 client/settings·haptics 신규 모듈, input 제스처 관리, UI/settings dialog·style, main 연결, GameScene/CombatEffects의 새 확정 처치 콜백, practice의 사용자 pause/문서 숨김 처리입니다. 서버·공유 판정·프로토콜은 변경하지 않았습니다.

최종 검증:

- `npm run build`: client/server/tests 타입 검사와 운영 빌드 통과, exit 0. JS 1,320.62KB/gzip 359.30KB, 기존 Phaser 번들 크기 경고 유지.
- `npm test`: **35파일 132개 통과, 3.38초, exit 0**. 저장/복구/손상·차단 저장소/구독 해제 및 진동의 옵션·지원·가시성·activation·거절/예외·취소 4개 추가. 기존 128개 유지.
- 새 settings 브라우저 검사 별도 실행: **3개 통과, 32.8초, exit 0**.
- 최종 `npx playwright test`: **전체 22개 통과, 5.3분, exit 0**. Windows 샌드박스 밖에서 최종 빌드 이후 순차 실행했고 테스트 서버 종료 정리까지 완료했습니다. 기존 18개에 settings 3개·입력 수명 1개 추가.

브라우저 검증 내용:

1. 환경설정의 조작 방식·진동 옵션이 새로고침 후 유지되고 PC에서는 진동 테스트가 비활성화됨.
2. 실제 서버에서 테스트용 100% 소유권을 준비한 뒤 엔진이 FULL_CAPTURE를 확정하여 `브로 승리!`·`100.0%` 결과 팝업을 표시함. 운영에 강제 승리 버튼을 추가하지 않음.
3. CDP 실제 touch event로 최초 터치 기준 방향·8px dead zone·보조 터치 무시·손 떼기·취소·마지막 방향 유지 확인. 봇 연습과 실제 친구 방 서버의 이동 방향을 확인함.
4. 설정 중 입력 비활성화와 연습 tick 정지, visibilitychange 후에도 정지 유지, 조이스틱/드래그 전환과 기존 조이스틱·PC 입력 회귀 통과.
5. 비활성화/다시 활성화·회전·방식 변경 후 기존 손가락 이동은 방향을 바꾸지 않으며 dispose 이후 송신/리스너가 동작하지 않음.
6. 모바일 브라우저에서 navigator.vibrate를 기록 함수로 대체하여 수동 시험·새 확정 처치 각각 1회 요청, 반복 snapshot·전체 reset·자기 벽 사망·옵션 끄기·미지원 API에서 처치 진동 요청 없음 확인. 실제 공유 엔진·wire snapshot·CombatEffects 중복 제거를 사용함.
7. 기존 실제 두 브라우저 점령/절단/사망/재등장/결과·공개/친구 방·복구·서버 재시작·운영 정적 제공·모바일 회전·렌더·UI 검사 유지.

중간 발견·수정:

- 첫 진동 브라우저 fixture는 대체 함수의 navigator.vibrate 속성을 읽기 전용으로 만들어 Phaser의 API 정규화 초기화에서 실패·타임아웃했습니다. 테스트 속성에 writable:true를 지정한 뒤 통과했습니다. 제품 API를 대체하거나 브라우저 제한을 우회하지 않습니다.
- 연습의 기존 visibility handler가 설정 중 pause를 화면 복귀 때 덮어쓸 수 있어 사용자 pause와 document.hidden을 함께 검사하도록 수정하고 브라우저 회귀를 추가했습니다.
- 설정을 열 때 지원 상태를 다시 읽어 미지원 상태가 즉시 테스트 버튼/설명에 반영되도록 했습니다.

증거: `evidence/classic-victory-popup.png`, `evidence/mobile-settings.png`. 이미지도 직접 확인했습니다. 100% 화면은 제어된 소유권 fixture의 실제 서버 판정이며 자연 완주/밸런스 증거가 아닙니다. 진동 검사는 API 요청과 중복 억제 검증이며 S24 하드웨어 진동을 검증한 것은 아닙니다. [Navigator.vibrate 문서](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)에 따라 지원·사용자 activation·무음/DND·하드웨어에 의해 실제 진동이 없을 수 있습니다. 승리 파티클과 사운드는 이번 범위에 추가하지 않았습니다. S24 세로 HUD 전면 수정과 T31/T38/T39 상태는 유지합니다.

## 2026-10-01 꼬리 연결 영토 소멸·전장 축소·미세 조작 안정화

최종 사용자 정정은 ‘꼬리를 덮는 점령’에 한정되지 않고, 상대의 노출된 꼬리가 연결돼 있던 자기 영토를 빼앗아 연결이 없어진 상황입니다. 이전 코드에는 직접 중심 칸 접촉과 영토 수 0 탈락만 있었고, 가장 큰 영토가 다른 곳에 남으면 꼬리 연결 단절을 놓쳤습니다.

구현:

- shared/engine에서 점령 전 노출 중인 비복귀자의 선과 자기 영토의 6방향 인접 연결을 기록합니다. 전체 소유권 이전·가장 큰 영역 정리 후 영토를 잃은 참가자의 연결이 없어지면 절단 목록에 넣습니다. 직접 연결 영토 점령과 다리 점령 때문에 연결 영역이 중립화되는 두 경우 모두 적용합니다. 선이 남은 자기 영토와 연결돼 있다면 살아남습니다.
- 같은 점령 묶음의 최종 winning cell이 노출된 선을 덮는 접촉도 선 마감 전에 수집합니다. 모든 이전·정리·CAPTURE가 끝난 뒤 TRAIL_CUT을 한 번 적용하고 처치자를 시드 우선순위로 하나만 정합니다. 상대 꼬리/영토 정리·3초 재등장·효과/진동·Hold 취소는 기존 경로를 재사용합니다. 본체 칸 점령만으로는 죽이지 않습니다. 새 필드나 프로토콜 변경 없이 서버와 연습이 같은 규칙을 사용합니다.
- client/controls에서 zoom 0.50(PC/가로)/0.45(폭 600px 미만), 드래그 24 CSS px·조이스틱 중앙 반경 25%·마우스 마커 주변 18px·각도 2도 기준을 관리합니다. 작은 움직임은 마지막 방향을 유지하고 큰 입력에 회전 지연을 추가하지 않습니다. 방향 키가 눌린 동안 포인터가 방향을 덮어쓰지 않습니다.
- 카메라의 fitting·draw에서 같은 zoom을 쓰고 이름 라벨 크기를 보완합니다. 실제 이동 속도/판정/맵과 HUD·미니맵 크기는 그대로입니다.

재현·중간 실패:

1. 최초 새 점령 선 검사 6개 중 5개는 수정 전 상대가 ALIVE로 남으며 실패했습니다. 점령 절단 적용 후 통과했습니다.
2. 사용자 정정 후 추가한 실제 연결 소멸 검사는 Classic/Hold의 고립 연결 영역 제거 및 연결 영토 직접 점령 3개가 ALIVE로 남으며 실패했습니다. 다른 곳에 3칸의 영토가 남고 꼬리 칸은 점령하지 않은 fixture로 재현했습니다. 연결 단절 판정 추가 후 통과했고 연결이 남으면 생존하는 반대 조건도 통과했습니다.
3. 첫 브라우저 검사의 처치·사망·효과는 맞았지만, 반복 snapshot 뒤의 presentation view에서 이미 소비된 사건을 다시 기대한 assertion이 실패했습니다. SnapshotGate의 중복 제거 계약에 맞춰 raw 수신 history·최종 eventId·효과 1회·중복 view의 사건 부재를 함께 검사했습니다.
4. 터치 검사는 CDP touchMove 반환 직후 coalesced pointer 이벤트가 아직 반영되지 않은 상태를 읽어 실패했습니다. 브라우저 이벤트 전달 후 작은 이동의 유지와 의미 있는 회전을 검증하게 바꿨습니다. 제품 입력에 지연을 추가하거나 각도/거리 기대값을 완화하지 않았습니다.

최종 검증:

- `npm run build`: client/server/tests 타입 검사 및 운영 빌드 통과, exit 0. JS 1,321.74KB/gzip 359.59KB, 기존 Phaser 크기 경고 유지.
- `npm test`: **36파일 143개 통과, 3.94초, exit 0**. 기존 132개와 capture-cuts 11개. 두 모드·참가자 순서·실제 연결 단절·연결 유지·다중 선·동시 claim 우선순위·한 피해자 한 번·죽는 공격자의 유효 처치·Hold 취소를 포함합니다.
- 새 capture-cuts 브라우저 최종 개별 실행: **4개 통과, 1.0분, exit 0**. enclosed/home/pruned 3개 모두 실제 Socket.IO 서버와 두 독립 브라우저에서 동일 소유권·참가자 상태·처치 1회·탈락·확정 효과 1회·반복 수신 중복 억제를 확인했습니다. 마지막 1개는 전장 축소·세로/가로 회전과 마커 주변 마우스 무시를 확인합니다.
- 최종 `npx playwright test`: **전체 27개 통과, 6.3분, exit 0**, Windows 샌드박스 밖에서 최종 빌드 이후 실행·서버 종료 정리 완료. 이전 22개와 capture-cuts 4개·미세 드래그/각도 1개를 포함합니다. 키보드/마우스 우선순위는 기존 PC 입력 검사에 추가했습니다. 실제 두 브라우저의 점령/절단/재등장/결과, 복구, 운영 정적 제공, 카메라·모바일 회전/조작, 환경설정·진동·UI 전체 회귀가 유지됐습니다.

증거: `evidence/capture-enclosed-trail-kill.png`, `capture-home-trail-kill.png`, `capture-pruned-trail-kill.png`, `field-scale-desktop.png`, `field-scale-mobile.png`, `field-scale-before.png`, `field-scale-after.png`, 기존 `T38-PC-camera.json`. 이미지도 직접 확인했습니다. capture 검사는 제어된 서버 소유권/선 fixture를 만든 뒤 실제 엔진 틱과 소켓 판정을 사용하며 자연 플레이 완주 증거는 아닙니다. before/after는 연습 회귀 화면이고 촬영 틱과 진행 상태가 완전히 동일하지 않습니다. 축소/입력 검사는 자동 브라우저의 행동 검증이며 실기기 조작감 평가는 별도입니다. S24 세로 HUD 전면 수정, 실제 진동·새 규칙 장기 밸런스·100ms 직접 조작감은 미검증으로 남기고 T31/T38/T39 상태를 유지합니다.

## 2026-10-01 APK 기반 드래그 회전 조정

- 정적 분석: Unity 2017.1.2f1, `Settings.OldMove=false`, `Game.Move` 로컬 회전 6rad/s, `Game.CheckSwipe`의 수락 후 `startPos` 갱신 확인. DLL을 실행하지 않았고 APK를 플레이한 증거는 아닙니다. `docs/sixio-controls-comparison.md`와 `evidence/sixio-original-turn-il.txt`에 근거를 기록했습니다.
- 수정: 화면 드래그 목표 방향을 프레임마다 회전 한도에 맞춰 변경하고 기존 30Hz 입력 경로로 전달합니다. 스와이프 수락 후 기준점을 갱신하며, 손을 떼어도 마지막 목표로 회전을 완료합니다. reset은 진행 중인 회전을 취소합니다.
- `npm run build` 및 최종 `npm run typecheck`: 통과. 운영 빌드의 기존 Phaser 번들 크기 경고 유지.
- 관련 단위 테스트: controls/presentation/practice 3파일 9개 통과. 30/60/120Hz 회전 시간·최단 회전·단위 벡터·기존 예측/연습 검증.
- 관련 브라우저 테스트: camera/input/settings의 총 8개가 최종 실행에서 모두 통과. 7개 통과 후 이전 즉시 방향 변경을 기대하던 settings 검사를 새 회전 완료 계약으로 수정했고, 해당 검사와 미완료 회전 중단 회귀 2개를 다시 실행해 통과했습니다.
- 실제 연습/Socket.IO 친구 방의 드래그 회전: 중간 방향·최종 시뮬레이션 방향·카메라 연속성·캐릭터 중심 추적 확인. `evidence/drag-turn-camera.json`의 practice 28프레임·online 26프레임, 중심 오차 0. 이전 PC 직진 연속성도 통과했습니다. 자동 브라우저 샘플이며 실기기 FPS/체감 인수 증거는 아닙니다.
- 기존 폰 서버 `http://192.168.137.1:3003/`: HTTP 200 및 새 운영 JS `index-ymE3f0Ob.js` 제공 확인. 기존 탭을 새로고침하면 수정이 반영됩니다.

원본의 이동 속도는 Unity world units이므로 우리 cells/sec와 직접 비교하지 않았습니다. 속도·zoom·camera follow·조이스틱/마우스/키보드는 유지했습니다. 원본과 완전히 같은 조작감이나 어지러움 해소를 확정하지 않으며 S24 실기기 평가는 필요합니다.

## 2026-10-01 원본과 다르다는 사용자 보고 후 재수정

앞선 APK 기반 시도는 사용자 실기기 인수에 실패했습니다. 회전 한도를 입력 어댑터에서 점진적으로 송신한 구현은 원본의 로컬 프레임 이동과 같지 않았고, 속도 피드백도 반영하지 않았습니다.

- 공유 기본 속도: 6→4.2칸/초(30% 감소), 연습·서버·예측이 경기 config를 사용합니다.
- 입력: dragTarget/지연 회전 제거. 한 제스처 동안 최초 기준점을 유지하며 32px dead zone·8도 각도 필터 적용. 허용한 방향을 직접 송신하며 손을 떼도 추가 회전 없이 그 방향으로 이동합니다.
- 속도 변경 검사 중 드러난 기하 수치 경계: 정확히 한 스텝 뒤 외곽에 닿는 경로가 부동소수점 오차로 t=1을 아주 조금 넘는 경우를 기존 HEX_EPS 이내에서 처리하도록 수정했습니다. 벽 탈락·사건 순서 회귀를 포함한 전체 core/server 검사 통과.
- `npm run build`: 타입/운영 빌드 통과. `npm test`: 37파일 **145개 통과**, exit 0. 예측 테스트의 이동 거리 기대값도 확정 config에서 계산합니다.
- camera/input/mobile/settings: 관련 브라우저 **9개 assertion 통과**. 고정 기준점의 작은 복귀가 반전으로 변하지 않는 조건, 직접 목표 방향 적용·손 뗀 뒤 방향 유지, 4.2속도의 연습/Socket.IO 경기·카메라 연속성, 입력 수명·모바일 회전·설정 회귀를 확인했습니다.
- `evidence/drag-direct-camera.json`: practice/online 각각 28프레임, 마지막 방향이 전 샘플에서 유지됨. 카메라 중심 오차 최대 약 1.14e-13. 자동 브라우저 행동 검증으로 실기기 조작감 증거는 아닙니다.
- 실제 폰 서버 `192.168.137.1:3003`: 프로토콜 2로 임시 친구 방 생성/시작 후 snapshot의 `moveCellsPerSecond=4.2` 확인, 검사 후 room:leave·disconnect 완료. HTTP 페이지에서 새 `index-CxyjzOfz.js` 제공 확인.

원본 실행·동등한 체감·어지러움 개선은 확인하지 않았습니다. 이번 수정은 사용자 피드백에 따라 첫 시도를 되돌리고 속도·민감도를 낮춘 조정입니다.

브라우저 runner는 위 9개 ok 출력 후 Windows webServer 종료 단계에서 반환하지 않아 Ctrl+C로 종료했습니다. 브라우저 assertion 성공과 runner의 정상 종료는 구분합니다. 운영 빌드·145개 단위/서버 검사 및 실제 폰 서버 속도 확인은 각각 정상 종료했습니다.

## 2026-10-01 이동 보고서 — 실제 방향과 목표 분리

- 보고서 핵심 채택: targetDirection을 participant/snapshot에 추가하고 direction은 실제 방향으로 유지. shared/movement.ts의 rotateDirectionTowards/stepSteering을 서버와 Presentation이 같이 사용합니다. 6rad/s, 30Hz에서 90도 8tick·180도 16tick이며 속도는 4.2칸/초입니다.
- 입력은 목표를 즉시 발행하고 서버는 마지막 목표로 계속 회전합니다. 화면 예측은 미확인 입력을 fixed tick 시작에 시간순으로 재실행하고 ack 후 제거합니다. 회전 도중 입력 변경이 과거 표시 이동을 소급 변경하지 않도록 했습니다. 재연결은 snapshot 목표를 유지하고 재등장에서는 이전 life의 입력을 제거합니다.
- 기존 봇의 지점 도착 반경은 회전 반경에 맞춰 조정해 지점 주변 공전을 방지했습니다. 실제 seeded 점령/성격·4분 연습·서버 권한/충돌/벽/모드 회귀를 유지합니다.
- 최종 `npm run build`: 타입·서버·클라이언트 빌드 성공, exit 0. `npm test`: **38파일 153개 통과**, exit 0.
- 브라우저 입력 3개 통과. 최종 camera/mobile/settings/reconnect **7개 통과, 1.2분, exit 0**. Vite는 테스트 세션에서 별도 실행해 이전 Windows webServer 종료 정체를 피했고 Playwright runner도 정상 종료했습니다.
- 첫 새 drag 검사는 터치 주입·poll 이후에 측정을 시작해 회전 마지막 부분만 담으면서 중간 방향 개수 assertion이 실패했습니다. 터치 주입 전에 측정을 시작하도록 수정했고 두 차례 camera 2개 모두 정상 통과했습니다. 회전 속도나 통과 조건은 완화하지 않았습니다.
- `evidence/drag-steering-camera.json`: 최종 practice 41프레임/online 42프레임. 실제 방향이 중간 각도를 거쳐 목표에 도달하고, 마지막 목표는 손 뗀 뒤에도 유지됩니다. 카메라 중심 오차 최대 약 1.14e-13, 직진/회전 중 displacement bound 통과. 이는 headless Chromium 자동 검증입니다.
- protocol v3로 이전 클라이언트와 혼용을 거부합니다. 새 버전은 탭 새로고침이 필요합니다.
- 기존 PC 3001·폰 3003 서버는 접속자/방 0인 상태를 확인한 뒤 새 운영 빌드로 재시작했습니다. 폰 `http://192.168.137.1:3003/`는 HTTP 200, `index-B_3o3K4g.js`를 제공합니다. 실제 Socket.IO 임시 방에서 protocol 3·4.2칸/초·6rad/s 및 90도 입력 후 중간 실제 방향을 확인했습니다. seq 1 ack 시 초기 (-0.5,0.8660) → 목표 (-0.8660,-0.5), 실제 (-0.9017,0.4324)로 즉시 목표가 되지 않았습니다. 검사 후 room:leave·disconnect 완료(빈 방은 기존 60초 TTL 정리 대상).

보고서의 반대 입력 차단은 APK의 네 방향 버튼에서 확인했습니다. 드래그까지 차단한다는 근거는 부족하므로 이번 구현은 모든 장치에서 반대 목표를 받아 점진 회전합니다. 작은 각도 흔들림은 6rad/s 제한만으로 없어지지 않아 기존 입력 필터를 유지했습니다. 세부 판단은 `docs/steering-model.md`입니다. 실기기 편안함·Six.io 동등성은 사용자 플레이로 확인해야 하며 기존 인수 미완료 상태를 유지합니다.

## 2026-10-01 U턴 반경·의도하지 않은 큰 회전 피드백

- 공유 회전 속도 6→9rad/s, 직진 속도 4.2칸/초 유지. 실제 엔진에서 같은 시작 위치/방향과 180도 목표를 비교했습니다. 폭은 77.498→51.633 world units(1.398→0.932칸), 약 33.4% 감소. 16→11tick(533→367ms). 모든 tick의 이동 거리가 기존 속도와 같은 것도 검사했습니다. `evidence/u-turn-radius-comparison.json`에는 전체 경로를 기록했습니다.
- 드래그는 최초 변위 32px로 활성화하고 이후 최근 32px 경로의 순변위 방향을 사용합니다. 순변위 16px 미만/각도 8도 미만은 유지합니다. U자 마지막 왼쪽 구간에서 기존 시작점 벡터는 오른쪽 아래를 가리키지만 새 입력은 왼쪽을 잡는 재현 검사, 15px 되돌림 유지·25px 의도 반전, 정지 잡음·이상 좌표·이벤트 밀도에 따른 8도 이내 방향 일치 검사를 통과했습니다.
- 최종 `npm run build`: 전체 타입 검사/서버/클라이언트 운영 빌드 성공, exit 0. `npm test`: **38파일 158개 통과**, exit 0. 기본 회전 값 변경 후 봇 점령·개성·연습·예측 replay/서버 권한·기존 판정 회귀 통과.
- `camera/input/mobile/settings`: **10개 통과, 1.2분, exit 0**. 새 연속 U자 터치를 연습/실제 Socket.IO 경기 양쪽에 주입하고 마지막 목표와 실제 방향 일치, release 유지, 중간 방향, 카메라 중심 및 displacement bound를 검사했습니다. 기존 키/마우스 우선·모바일 회전·입력 수명·설정·승리·진동 회귀도 통과했습니다.
- `evidence/u-turn-drag-camera.json`: practice 84프레임/online 79프레임, 중심 오차 최대 약 1.14e-13. 손가락 경로와 입력/서버 방향/카메라 기록을 포함합니다. headless Chromium 자동 검사이며 실기기 편안함 인수는 아닙니다.
- PC 3001·폰 3003은 방/접속자 0을 확인하고 새 빌드로 재시작했습니다. 폰 페이지는 `index-B2Yu2mG_.js`를 제공합니다. Node WebSocket 검사 클라이언트는 EACCES/timeout으로 접속에 실패했지만, 권한이 있는 PowerShell의 HTTP와 실제 Socket.IO polling 세션으로 protocol 3·4.2칸/초·9rad/s 및 seq 1의 중간 회전을 확인했습니다. 서버/방화벽 설정은 이 진단 때문에 추가 변경하지 않았습니다. 임시 방 leave·Engine.IO close 완료. `evidence/u-turn-live-server.json`에 실제 응답을 기록했습니다.

9rad/s와 최근 경로 방식은 이번 피드백을 반영한 테스트 값입니다. 실제 휴대폰에서 의도한 U턴 폭과 편안함은 사용자 확인이 필요합니다.

## 2026-10-01 PC는 좋지만 모바일 조작감이 되돌아갔다는 피드백

최근 경로 드래그 시도는 사용자 모바일 인수 FAILED입니다. PC에는 회전 속도 9rad/s 조정이 적용됐고 모바일 화면 드래그에는 목표 방향 해석도 추가로 바뀌었습니다. 예를 들어 최초 터치의 오른쪽으로 80px 이동 후 25px 돌아오면, 여전히 오른쪽 55px에 있는데도 최근 경로는 왼쪽을 목표로 잡을 수 있습니다. 이는 서버의 회전 모델을 되돌린 것이 아니라 모바일 입력 목표가 달라지는 문제입니다.

- 최근 경로 DragSteering/16px 순변위 기준을 제거하고 보고서 반영 당시의 최초 터치 고정 기준점·32px/8도 필터를 복원했습니다. 회전 9rad/s, 직진 4.2칸/초, 실제/목표 분리 및 공용 서버/예측 모델은 유지했습니다. 조이스틱/PC 입력도 유지합니다.
- 빌드·전체 타입 검사 성공, `npm test` **38파일 154개 통과**, exit 0. 폐기한 최근 경로 클래스의 계약 검사 4개는 제거했고 기존 공유 이동/서버 검사 및 U턴 반경 비교는 유지했습니다.
- camera/input/mobile/settings **10개 통과, 1.3분, exit 0**. 실제 pointer 이벤트에서 25px 같은 쪽 되돌림 후 목표 유지, 최초 기준점의 반대쪽으로 의도 이동 시 반전 목표 수락, 연습/실제 온라인 중간 회전·카메라 연속성·입력 수명·설정 회귀를 확인했습니다. U자 검사 기대값은 최근 경로 접선이 아닌 최초 기준점 변위 계약으로 수정했습니다.
- `evidence/mobile-fixed-origin-camera.json`에 연습·온라인의 실제 손가락 경로와 입력/목표/실제 방향/카메라를 기록했습니다. 이전 `u-turn-drag-camera.json`은 거절된 최근 경로 시도의 증거로 남깁니다.
- 폰 주소 `http://192.168.137.1:3003/` HTTP 200, 새 `index-Ba2PVHM_.js` 제공 확인. 이번 변경은 클라이언트 입력 복원이므로 실행 중인 경기 서버를 재시작하지 않았습니다. 기존 탭 새로고침이 필요합니다.

자동 검사는 고정 기준점 계약과 공유 회전 모델을 확인한 것이며 모바일 편안함/PC와 같은 체감은 사용자 재확인이 필요합니다.

## 2026-10-01 고정 기준점 복원도 모바일 인수 실패 — 긴 드래그 후 회전 입력 축소

사용자는 화면 드래그에서 방향이 늦게 잡히고, 의도보다 회전이 커지거나 끌려가며 때로 묵직하다고 보고했습니다. 앞선 고정 기준점 복원도 실기기 인수 FAILED로 기록합니다. PC는 좋다는 피드백에 따라 공용 회전 9rad/s·직진 4.2칸/초는 유지했습니다.

- 재현된 입력 문제: 최초 터치점 기준으로 직진 40px 후 수직 45px 이동은 48.37도 목표지만, 직진 400px 후 동일 이동은 6.42도로 축소돼 기존 8도 필터에 무시됩니다. 길게 드래그할수록 방향 전환에 더 큰 손 움직임이 필요합니다. 이것이 모든 실기기 증상의 유일한 원인이라고 확정하지는 않습니다.
- `SwipeSteering`: 기준점에서 유효한 32px 이상 변위마다 스와이프 방향을 읽고 기준점을 갱신합니다. 현재와 같은 방향/8도 미만 목표 변화에도 기준점을 갱신해 긴 직진 후 감도가 축소되지 않게 합니다. 32px 미만 이동은 기준점을 유지하고 25px 되돌림은 목표를 유지합니다. 최근 경로 평균·16px 순변위·입력 단계 회전은 넣지 않았습니다. PC/조이스틱·서버·예측·카메라 수치는 유지합니다.
- APK의 `Game.CheckSwipe`가 목표 수락 뒤 `startPos`를 현재 좌표로 갱신하는 동작을 참고했습니다. APK를 실행해 체감을 비교한 것은 아니며 원본의 Unity 거리 기준과 현재 CSS px 기준은 다릅니다.
- `npm run build` 및 최종 타입 검사 성공, exit 0. `npm test`: **38파일 159개 통과**, exit 0. 새 검사 5개는 긴 직진 후 동일 회전 입력, 짧은 되돌림/충분한 반전, 작은 이벤트 누적, 비정상 좌표/잡음, 연속 U자 마지막 구간을 검증합니다.
- 관련 브라우저 **11개 최종 통과**: 입력 4개·camera 3개·mobile 1개·settings 3개. 11개 실행에서 10개 통과 후 U자 검사만 수정·재실행해 1개 통과, 두 runner 모두 정상 종료했습니다. 입력 비교는 실제 CDP touch를 이용해 직진 40/80/160/240/400px 뒤 동일 45px 수직 스와이프가 PC 키 입력과 같은 목표를 요청함을 확인했습니다. 연습/실제 Socket.IO 경기에서 U자 마지막 반대 방향 목표, 그 목표까지 실제 회전, release 유지, 일정 이동 속도 범위와 카메라 중심을 검사했습니다.
- 중간 검사 실패 구분: 샌드박스의 테스트 서버 포트 3002 접근은 EACCES로 실패해 승인된 환경에서 재실행했습니다. 입력 비교는 CDP 반환 직후 pointer 이벤트 반영 전 읽어서 실패했고 이벤트 전달/목표를 poll하도록 수정했습니다. U자 최종 방향은 8도 필터 때문에 정확한 180도가 아닌 약 4.7도 차이의 목표로 유지됐습니다. 기존 필터에 맞춰 의도 반대 방향에서 8도 이내 목표인지, 실제 방향이 그 수락된 목표에 정확히 도달하는지를 따로 검증했습니다. 제품 필터/회전/속도는 이 실패 때문에 바꾸지 않았습니다.
- 증거: `evidence/mobile-swipe-input-comparison.json`, `evidence/mobile-swipe-camera.json`. 이전 `mobile-fixed-origin-camera.json`은 실패한 고정 기준점 시도의 증거로 남겼습니다. 자동 브라우저 결과는 실기기 편안함 인수와 구분합니다.
- 폰 `http://192.168.137.1:3003/` HTTP 200, 새 `/assets/index-BVpQwI8F.js` 제공 확인. 이번 변경은 클라이언트 입력만 바꿨으므로 실행 중인 경기 서버를 재시작하지 않았습니다. 기존 폰 탭을 새로고침하면 적용됩니다.

고정 기준점의 감도 감소는 재현·수정됐지만, 실제 폰에서 편안해졌는지와 Six.io와의 체감 동등성은 아직 확인되지 않았습니다.

## 2026-10-02 master 기준 모바일 입력 분리

기준: `io_clone` origin `FanaticalBera/io_clone`, 로컬 `master`의 `33fd73c` (작업 시작 시 clean). 앞선 PC-pointer-derived touch도 사용자 실기기 인수 FAILED다. 사용자는 손을 뗐다 다른 위치에서 다시 돌리려 할 때 누른 위치에 따라 아래/오른쪽으로 임의 이동하는 느낌을 보고했고 작업 중단을 요청했다. 그 실패를 수용된 모델로 취급하지 않는다.

코드 확인 결과 touch down/move가 `pointAt → GameScene.pointerDirection → mouse 2° filter`를 타며 캐릭터→손가락 절대 위치를 목표로 만들었다. Joystick도 `setPointerDirection`으로 mouse 필터를 공유했다. 실제 이동 경로는 입력 목표 → 연습 setDirection/온라인 sendDirection → engine의 targetDirection → stepSteering이며, 온라인 Presentation도 같은 stepSteering으로 미확인 입력을 재실행한다.

구현:

- 화면 스와이프의 상태는 `{id,anchor}` 하나다. primary touch down은 anchor만 저장한다. move의 current-anchor가 28 CSS px 이상이면 정규화한 목표를 즉시 setDirection으로 보내고 anchor=current로 갱신한다. 같은 방향의 스와이프도 anchor를 갱신한다. 거리 미달과 비정상 좌표는 목표/anchor를 유지한다.
- Swipe는 scene.pointerDirection 또는 mouse 각도 필터를 호출하지 않는다. 입력 단계 RotateTowards·시간 보간·recent path·각도 필터를 추가하지 않았다. release/cancel/lost capture/resize/blur/disable/control-mode 변경은 gesture를 지우고 마지막 목표를 유지한다. 보조 touch는 gesture를 탈취하거나 중간에 primary로 승격하지 못한다.
- `TOUCH_SWIPE_THRESHOLD_PX=28`: ±3px 미세 노이즈의 두 점 차이와 15~25px 짧은 되돌림을 막으며 이전 32px보다 발동 거리를 줄인 초기값. 이것 하나가 screen swipe의 튜닝 파라미터다.
- Joystick의 radial 25%는 유지하고 별도 `JOYSTICK_ANGLE_DEAD_ZONE=6°`를 사용한다. 대표적 thumb offset 45px에서 1~3px 노이즈(약 1.3~3.8°)를 유지하고 의미 있는 목표는 즉시 발행한다. PC mouse 2°·keyboard와 packet 송신 30Hz/keepalive 10Hz는 유지했다.
- `git diff`로 shared movement/config/engine, server, client presentation/main/game-scene에 변경이 없는 것을 확인했다. 속도 4.2칸/초·회전 9rad/s·fixed 30Hz·카메라·prediction/reconciliation·판정은 master 그대로다.

파일 목록:

- 제품: `src/client/input.ts`, `src/client/controls.ts`, `src/client/ui.ts`(조작 설명).
- 테스트: `tests/core/controls.test.ts`(신규), `tests/fixtures/input.html`, `tests/e2e/input.spec.ts`, `tests/e2e/mobile.spec.ts`, `tests/e2e/camera.spec.ts`, `tests/e2e/settings.spec.ts`.
- 문서: `README.md`, `docs/PRD.md`, `docs/TECH_SPEC.md`, `docs/sixio-controls-comparison.md`, `docs/steering-model.md`, `TASKS.md`, `VERIFICATION.md`.
- 운영 클라이언트 빌드: `dist/client/index.html` 및 새 `index-CuIQ7-l-.js` (이전 JS 대체). 새 증거는 아래 목록이며 과거 증거 파일은 master 원본으로 보존했다. 테스트 캐시는 작업 변경에서 제외했다.

검증 명령과 결과 (Node 24.21.0, Windows):

- `npm run build`: client/server/tests 타입 검사 및 운영 빌드 성공, exit 0. 기존 Phaser chunk 크기 경고 유지.
- `npm test`: **38파일 156개 통과**, exit 0. 신규 helper 4개는 거리 경계/정규화·화면 위치 독립성·mouse angle 필터 미적용·비정상 좌표/떨림을 검사한다. 기존 공용 회전·예측·서버·봇 검사는 유지했다.
- 최종 `npm run typecheck`: 성공, exit 0.
- `playwright test --config .local/steering-check.config.ts`: 전체 **33개 중 31개 통과**, exit 1. Windows webServer 종료 문제를 피하기 위해 Vite를 별도 테스트 세션에서 실행했다. 새 모바일 관련 **14개는 모두 통과** (input 6, camera 3, mobile 2, settings 3). 점령/절단/재연결/모드/오프라인 연습/PC/UI 회귀도 통과했다.
- 전체 검사 실패 1: `multiplayer.spec.ts`의 T27은 `Waypoint did not complete`. `git archive HEAD`에서 client/shared를 별도 디렉터리에 추출하고 그 master 클라이언트를 5174에서 서비스해 동일한 원본 테스트를 재실행했다. **수정 전 master에서도 동일 위치/오류로 실패**, exit 1. 해당 시나리오는 한 번 목표를 요청한 뒤 waypoint 도달을 기다린다. 모바일 수정으로 새로 생긴 회귀가 아닌 기존 실패로 남기며 테스트/공용 movement를 변경하지 않았다. trace는 `.local/master-baseline-test-results/`에 보존했다.
- 전체 검사 실패 2: 운영 LAN 검사 T36은 `172.30.208.1:3001 ECONNREFUSED`. 기존 서버의 수신 주소는 127.0.0.1이었다. 기존 서버를 건드리지 않고 해당 로컬 인터페이스에 테스트 전용 서버를 띄워 `playwright test tests/e2e/production.spec.ts --config .local/steering-check.config.ts --output .local/production-test-results` 재실행: **1개 통과, 43.2초, exit 0**. 테스트 서버는 종료했다. 최종 개별 실행 합계는 **32/33 통과, master에서도 재현되는 1개 실패**다. 모두 통과했다고 표시하지 않는다.

브라우저 검증은 touch down 위치와 목표 분리, 오른쪽/위쪽/반대 목표, 긴 같은 방향 입력의 anchor 갱신, 25px 되돌림 유지, release 유지, secondary touch, cancel/lost capture/resize/blur/disable/mode/dispose 수명, mouse mapper 미호출, PC/joystick filter 독립성을 포함한다. noisy rightward 경로는 30개 위치에 ±1~3px를 섞었고 초기 유지 구간을 포함해 목표 방향 run 5개, 정지 후 작은 떨림에서는 추가 목표 변경 0개였다. 거리 기준만 쓰므로 유효 스와이프 끝점의 각도 노이즈는 기하 범위 내에서 남는다.

중간 실패는 조건 완화로 덮지 않았다. 기존 initial heading 비교의 0/-0는 벡터 차이가 정확히 0인지로 비교했다. Joystick cancel은 native move가 전달된 후 확정된 위쪽 목표를 확인하고 취소해 release 보존을 검사했다. thumb 노이즈 검사를 경기 테스트에 붙였을 때 봇 탈락으로 joystick이 숨겨져 layout 준비가 실패하므로 별도의 실제 DOM joystick fixture로 분리했다. 제품 이동·시간 보간·판정·목표 기대값을 이 실패 때문에 조정하지 않았다.

새 증거:

- `evidence/mobile-swipe-distance-2026-10-02.json`: 직진 40/160/400px 후 동일 45px 수직 목표.
- `evidence/mobile-swipe-noise-2026-10-02.json`: raw path 샘플별 목표와 목표 run 수.
- `evidence/mobile-swipe-turn-2026-10-02.json`: 연습/온라인 90도 목표·중간 실제 회전.
- `evidence/mobile-swipe-camera-2026-10-02.json`: 연속 U자 경로, 연습 99프레임/온라인 97프레임, 카메라 중심 오차 최대 약 1.14e-13 및 기존 displacement bound.
- `evidence/mobile-swipe-settings-2026-10-02.png`: 바뀐 화면 드래그 안내.
- `evidence/mobile-swipe-verification-2026-10-02.json`: 기준/파라미터/검사 결과 요약.

**실기기 체감 수용은 미완료**다. 실제 기기의 입력 빈도·엄지 이동 거리·방향 전환 의도·U턴 반경·끌림/묵직함·어지러움과 joystick radial boundary 근처 노이즈는 자동 검사로 편안함을 확정할 수 없다. 충분한 반대 스와이프는 같은 화면 쪽에서도 반대 목표를 요청하는 정책이므로 실기기 수용에 포함해야 한다. 우선 screen swipe 거리 28px 하나만 조정 가능한 구조를 제공했고, Six.io 동등성이나 멀미 해소를 선언하지 않는다.

## 2026-10-02 AI·가로 UI·넓은 시야 검증

- `npm run build`: 최종 타입/서버/클라이언트 빌드 exit 0. JS `index-dHYPPRas.js`, CSS `index-Czs9M17x.css`.
- `npx vitest run --maxWorkers=4`: 38파일 **168개 통과**, 11.8초, exit 0. 실제 시뮬레이션 확장/벽 회피 3시드, 도주 유지, 공격 목표 소멸 귀환, waypoint 조기 제거, 점령 예상 면적 회귀 포함.
- `playwright test --config .local/steering-check.config.ts tests/e2e/landscape.spec.ts`: **1개 통과**, 25.5초, exit 0. 가로 시작 메뉴 4크기(640×320 포함), HUD 겹침 없음, 순위/미니맵 기본 닫힘·상호 배제·Escape·재시작 초기화, 세로/가로 안내, 미지원 fullscreen에서도 게임 유지 검사.
- 최종 `playwright test --config .local/steering-check.config.ts tests/e2e/ui.spec.ts tests/e2e/mobile.spec.ts tests/e2e/settings.spec.ts tests/e2e/online.spec.ts tests/e2e/modes.spec.ts`: **11개 통과**, 2.2분, exit 0. 기존 입력, 조이스틱, 설정 일시정지/저장/진동, 실제 온라인 방, Classic/Hold 및 결과 회귀.
- 추가 실행: camera 3개, capture-cuts 4개, ranking 1개의 assertions 통과. camera/capture 실행의 기본 webServer runner는 Windows teardown에서 종료되지 않아 Ctrl+C로 종료했다. 해당 실행을 runner exit 0으로 기록하지 않는다. 최종 UI 관련 검사는 기존 별도 서버 config로 정상 종료했다.

중간 실패: 브라우저 검사와 기본 38-worker vitest를 동시에 실행해 practice 20초 및 새 bot simulation 15초 타임아웃이 발생했다. 검증을 분리하고 4 workers로 재실행해 모두 통과했다. timeout 기대값이나 게임 규칙은 완화하지 않았다. 새로운 landscape 검사에서는 fullscreen 미지원 안내가 다음 경기 갱신에서 숨겨져 닫기 버튼을 클릭하지 못했다. 안내를 5초 유지하도록 제품 코드를 고친 뒤 같은 검사를 통과했다.

봇 비교: `node node_modules/tsx/dist/cli.mjs scripts/bot-audit.ts`, 30Hz 각 3600tick, 시드 4/19/73, 8봇. 이전/최종 데이터는 `evidence/bot-ai-comparison.json`. 같은 sample에서 점령 칸 누계 +18.5%, 벽 사망 15→0, 전체 사망 76→46. 재점령을 포함하는 누계이며 사람 상대 승률과 실제 폰에서의 체감은 미검증이다. 새 화면 증거는 `evidence/landscape-menu.png`, `evidence/landscape-game.png`에 보존했다. 기존 검사에서 덮어쓴 과거 evidence와 테스트 산출물은 원상 복원해 과거 기록을 보존했다.

최신 운영 서버는 0.0.0.0:3003에서 hidden process로 실행했다. `http://127.0.0.1:3003/healthz` HTTP 200 및 최신 JS/CSS 제공을 확인했다. 현재 핫스팟 인터페이스 192.168.137.1은 꺼져 있어 폰 접속을 확인하지 않았다. 네트워크/방화벽 설정은 변경하지 않았다. 실제 기기 인수는 OPEN이며 기존 T27 waypoint의 master 재현 실패 상태도 이 작업에서 해결했다고 기록하지 않는다.

## 2026-10-02 실제 이동의 출발 연결 절단·공격 기회 후속 검증

정상 스폰(createMatch, 초기 19칸)·direction input·stepMatch로 재현했다. seed 115(A 피해자), seed 17(B 피해자) 모두 tick 172의 실제 RETURN/capture에서 출발 연결이 사라졌다. 직접 body→trail 접촉과 capture의 피해 trail 중첩 없이, 잔여 9칸 옆의 후속 trail 인접 때문에 변경 전 ALIVE/trail 15칸이 남았다. connectedBefore=true, candidates.has(victim)=false, lostTerritory=true, 기존 touchesHomeAfter=true, cuts=false, markDead 미호출이었다. synthetic만 통과한 기존 판정의 false positive를 확인하고 첫 외부 선 칸의 연결만 검사하도록 수정했다.

- `npm run build`: Node 24.21.0, client/server/tests 타입 및 운영 빌드 성공, exit 0. 최종 JS `index-Ciy2huK_.js`, CSS `index-Czs9M17x.css`. 기존 Phaser chunk 크기 경고는 유지한다.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **40파일 180개 통과**, 9.27초, exit 0. 새 실제 이동 절단 4개는 내부에서 두 역할을 모두 실행하며 Classic/Hold, 출발 연결 유지 생존, 전체 영토 소멸 사망을 포함한다. 사망/처치 정확히 1회, masks/trail 제거, 같은 capture tick의 death, respawn 전 정지와 소유권 배열/count 일치를 확인했다. 새 무입력 HUMAN 공격 회귀 8개도 포함한다.
- `playwright test --config .local/steering-check.config.ts tests/e2e/movement-capture-cuts.spec.ts tests/e2e/capture-cuts.spec.ts tests/e2e/reconnect.spec.ts tests/e2e/modes.spec.ts`: 첫 실행 7/10 통과. 기존 synthetic 절단 4개, Classic/공개 큐 모드 2개, 재연결 1개가 통과했다.
- 이어 `playwright test --config .local/steering-check.config.ts tests/e2e/movement-capture-cuts.spec.ts tests/e2e/modes.spec.ts --grep 'real room movement|server Hold'`: **3개 통과**, 55.2초, exit 0. 실제 온라인 인간 A/B 양방향과 Hold 재실행이 통과했다. 최종 개별 실행 합계는 관련 **10/10**이며 전체 브라우저를 새로 완주했다는 뜻은 아니다.

중간 실패 구분: 첫 온라인 이동 fixture는 2슬롯 config와 서버의 일반 8명 roster가 맞지 않아 Invalid participants였다. 서버 제품 규칙을 바꾸지 않고 일반 8명 정상 스폰을 사용한 뒤 무관한 봇만 정상 leaveParticipant lifecycle로 퇴장시켰다. 두 HUMAN의 ownership/trail/position은 직접 조작하지 않았다. Hold 첫 실패는 실행 중 diagnostics 소스 변경으로 Vite가 페이지를 새로고침해 메뉴로 복귀한 것이며 소스 변경 없이 동일 검사를 다시 통과했다. 최종 빌드 재실행의 전역 Node 22는 sandbox EPERM으로 실패하여 프로젝트 Node 24와 승인된 실행에서 빌드·전체 검사를 완료했다.

온라인 회귀는 방향 입력을 실제 Room.inputs에 넣고 GameLoop.pump로 전진한다. 서버만 이동·trail·RETURN/capture·death를 계산하며 양쪽 브라우저에서 사망/처치 UI와 snapshot을 검사한다. screenshots `evidence/movement-home-cut-A.png`, `movement-home-cut-B.png`; 재현 전/후 journal·진단은 `movement-home-cut-before.json`, `movement-home-cut-after.json`. claimedTrailCells 빈 배열은 최종 core/e2e observer assertions로 별도 확인했다. `scripts/movement-capture-audit.ts`로 최종 진단을 재출력할 수 있다.

AI 비교는 공유 연결 수정 후/공격 판단 변경 전과 변경 후를 구분했다. `scripts/idle-human-audit.ts`, seed 4/19/73/115/17/81/32/123, 정상 1 HUMAN+7 BOT, HUMAN 입력 0회. 최초 사망이 변경 전 5 TRAIL_CUT·3 WALL_HIT에서 변경 후 8 TRAIL_CUT로 바뀌었다. `evidence/idle-human-ai-before.json`, `idle-human-ai-after.json` 참조. HUMAN 자동 벽 회피나 이동 물리 변경은 없으며 관찰 거리 안에서 공격 가능성을 평가한다. 모든 배치에서 무조건 처치한다는 결과로 일반화하지 않는다.

최종 운영 갱신: 동일 프로젝트 Node와 dist/server/server/index.js로 실행된 기존 3003 두 프로세스의 경로를 확인한 뒤 서버 하나(PID 27692, 0.0.0.0:3003)로 재시작했다. localhost health/root HTTP 200, 최신 JS 링크 제공 확인. 테스트 Vite 5173/5174는 종료했다. 네트워크/방화벽은 변경하지 않았고 실기기 재인수는 OPEN이다.

## 2026-10-02 짧은 선 전술·침범 기억·부활 터치·사망 진동

맵은 사용자 선택으로 반경 22(1,519칸)를 유지했다. 공용 이동·조향·판정·3초 respawn 규칙은 그대로다. 변경된 봇 판단과 클라이언트 입력/피드백은 docs/bot-ai-landscape.md의 마지막 두 절에 기록했다.

- 최종 `npm run build`: Node 24.21.0, client/server/tests 타입 및 운영 빌드 성공, exit 0. JS `index-B3da_jGf.js`, CSS `index-Dyjnoj8K.css`. Phaser chunk 크기 경고는 기존대로다.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **41파일 190개 통과**, 9.34초, exit 0. 짧은 선과 안전한 RETURN 중 공격, 유리한 counter-cut/불리한 counter-cut 거절, 상대 귀환 우선 시 거절, 반복 손실 누적/감쇠, 작은 확장, 진행 중인 큰 확장 중단, seed별 경로 다양성/재현, 사망 진동 설정 검사를 추가했다. 기존 실제 movement 연결 절단·동시 점령·영토 정리·life·respawn 검사도 유지했다.
- `playwright test --config .local/steering-check.config.ts tests/e2e/input.spec.ts tests/e2e/settings.spec.ts tests/e2e/mobile.spec.ts tests/e2e/respawn-touch.spec.ts tests/e2e/movement-capture-cuts.spec.ts tests/e2e/modes.spec.ts`: **20개 통과**, 1.9분, exit 0. 추가한 마지막 봇의 진행 중 확장 중단 이후 `mobile.spec.ts settings.spec.ts --grep 'real emulated touch|mobile swipe displacement'`의 모바일 연습/온라인 관련 **2개 재검사 통과**, 21.5초, exit 0. 전 브라우저 스위트 완주와 구분한다.

새 respawn 검사는 실제 방의 8명 정상 스폰을 사용하고 무관한 봇만 정상 leave lifecycle로 퇴장시킨다. 실제 CDP primary touch를 유지한 채 HUMAN의 실제 직진→WALL_HIT→3초 대기→tryRespawns를 진행한다. 위치/영토/trail을 death/respawn 상태로 직접 수정하지 않는다. 각 drag/trackpad/joystick에서 DEAD_WAIT 중 input 송신이 멈추고, 최신 손 위치를 기준으로 같은 포인터가 lifeId 2의 서버 입력까지 전달되며 실제 위치가 움직이는지 확인했다. death vibration `[90,40,120]` 정확히 한 번과 대기 중 손을 뗐을 때 capture가 살아나지 않는 것도 확인했다. 증거는 `evidence/respawn-held-drag.png`, `respawn-held-trackpad.png`, `respawn-held-joystick.png`다.

중간 실패: 첫 respawn fixture의 navigator.vibrate mock을 writable:false로 정의해 Phaser가 API alias를 지정하는 과정에서 TypeError가 나고 앱 로드가 멈췄다. 브라우저 14개 중 기존 11개는 통과하고 새 3개는 timeout이었다. mock을 실제 API처럼 writable:true로 고쳤고 3개 개별 실행 및 위 최종 20개에서 통과했다. 제품 코드를 이 로드 실패 때문에 바꾸지 않았다. 짧은 선 counter-cut/침범 테스트 초기 위치 두 사례는 실제로 상대가 먼저 절단하거나 새로 점령한 가까운 땅으로 돌아올 수 있는 불리한 배치여서 예상 ATTACK이 잘못됐다. 유리한 배치와 불리한 배치를 분리해 검증했다.

전술 구현 중 무입력 seed 4가 WALL_HIT로 끝나는 회귀도 재현했다. 봇이 인간의 정면 진행 경로에 접근 선을 깔고 뒤늦게 ESCAPE하는 것이 원인이었다. 짧은 칸 진입 도달 시간 예상과 관찰된 본체의 1초 예상 경로를 피하는 공격 접근으로 수정한 뒤 기존 8개 무입력 회귀를 모두 통과했다. 초기 8봇 검사의 마지막 한 시점에 6명 이상이 19칸보다 큰 영토를 가진다는 기대는 새 전투/재등장에 의존했다. 경기 전체에서 실제로 19칸 이상 확장에 성공한 고유 참가자 수를 확인하도록 변경했고 벽 사망 0·점령 누계 2500 이상 검사는 유지했다.

최종 audit: `scripts/idle-human-audit.ts`, 8시드 모두 첫 HUMAN 사망 TRAIL_CUT(73~240tick). `scripts/bot-audit.ts`, 3시드 8봇 3600tick씩: 점령 누계 3761/3804/3610, 벽 사망 모두 0, 전체 사망 21/14/9. `evidence/idle-human-ai-tactics.json`, `bot-tactics-simulation.json`에 보존한다. 이전 AI 비교 자료는 당시 변경의 기록으로 유지하며 전체 승률/모든 배치의 완벽 공격/실기기 편안함을 의미하지 않는다.

운영 반영: 이전 프로젝트 서버 PID 27692의 실행 파일·절대 script 경로를 확인하고 새 hidden process PID 28772, 0.0.0.0:3003으로 재시작했다. localhost health/root HTTP 200 및 최종 JS 링크 제공을 확인했다. 기존 탭 새로고침이 필요하다. 테스트 Vite는 종료했다. git restore는 기존 index.lock과 실행 중인 다른 Git 때문에 중단됐으며 그 프로세스나 잠금은 변경하지 않았다. Git의 HEAD blob을 읽어 이번 검사에서 덮어쓴 과거 evidence·debug/cache·tracked test-results 21개의 파일 바이트를 복원했다. 새 증거는 별도 파일로 유지한다. 네트워크/방화벽은 변경하지 않았다.

## 2026-10-02 애매한 사망 조사·중간 반경 공격 후속 검증

사용자가 본 실제 플레이의 기록은 확보되지 않았다. 정상 스폰과 실제 movement/stepMatch로 8시드 각각 8봇 및 2인간+6봇을 3,600tick씩 실행한 16경기에서 사망 370회를 조사했다. 선/mask·소유권/count, 절단 위치/점령 교차/출발 연결, 벽 교차점, 중복 사망 및 대기 중 이동을 검사해 조건 위반은 0회였다. 직접 선 접촉 344회(막 생성되는 현재 칸 18회 포함), 출발 연결 상실 14회, 점령한 선 절단 1회, 인간 경로의 벽 충돌 11회다. 사용자 장면에 오류가 없다고 단정하거나 규칙 자체를 독립적으로 검증했다는 결과로 확대하지 않는다. death 원인 metadata와 UI 설명을 추가했으며 기존 판정 분기/동시 처리/kill 우선순위는 유지했다.

봇은 정상 인간의 중간 루프에서 최단 즉시 귀환을 전제로 공격을 거절하는 실패를 실제로 재현했다. 관찰된 방향에 따른 최대 0.5초 예상, 귀환 중인 상대의 보수적 기준 유지, 4칸/1.25초의 기회와 안전 우회, home 인접 침범, 상대별 후보를 적용했다. `medium-attack-before.json`/`after.json` 및 `scripts/medium-attack-audit.ts` 참조. 새 movement 회귀는 네 성향과 두 역할의 짧은 루프, 방어형의 중간 반경 루프에서 실제 ATTACK와 직접 절단을 확인한다. 상대의 미래 입력을 읽거나 맵을 넓히지 않았다.

- `npm run build`: Node 24.21.0, client/server/tests 타입 및 운영 빌드 성공, exit 0. JS `index-BZw5UUjH.js`, CSS `index-Dyjnoj8K.css`. 기존 Phaser chunk 경고 유지.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **43파일 201개 통과**, 9.88초, exit 0. 실제 이동의 사망 원인 대조 4개, snapshot/context 수명·범위 검증, 중간 루프 공격 5개를 추가했다. 기존 동시 점령, pruning, Classic/Hold, 직접 선 접촉, 역할 반전, 죽은 위치 정지/respawn, 불리한 공격 거절 및 8개 무입력 인간 회귀를 유지했다.
- `playwright test --config .local/steering-check.config.ts tests/e2e/movement-capture-cuts.spec.ts tests/e2e/capture-cuts.spec.ts tests/e2e/combat.spec.ts tests/e2e/settings.spec.ts tests/e2e/respawn-touch.spec.ts --grep 'real room movement|captured trail|mutual confirmed|confirmed kills|held primary|respawn'`: 최종 **10개 통과**, 1.9분, exit 0. 두 실제 온라인 인간 역할의 HOME_CAPTURE 설명, 점령/출발 연결/pruning synthetic UI, 직접 상호 절단, 진동 중복 방지, held drag/trackpad/joystick을 확인했다. 전 브라우저 스위트 완주와 구분한다.

중간 검사에서는 기존 joystick fixture가 lifeId 2의 아무 방향 패킷을 기다린 뒤 즉시 위쪽 입력을 검사해 초기 스폰 방향을 읽었다. 클라이언트의 held 방향은 이미 위쪽이었지만 서버에는 두 번째 패킷이 아직 도착하지 않았다. 같은 poll에서 새 생명과 실제 위쪽 방향 모두를 기다리게 수정하고 세 조작 방식 3개 개별 실행(13.7초), 위 최종 10개 실행에서 통과했다. 이 실패 때문에 제품 입력/이동을 바꾸지 않았다. 새 context 수명 검사의 첫 작성은 raw match.events가 다음 emit까지 보존된다는 점을 놓쳤고, 실제 배포 경로인 buildView의 이벤트 만료를 검사하도록 바로잡았다.

자료: `evidence/death-cause-audit.json`, `death-cause-home-A.png`, `death-cause-home-B.png`, `death-cause-enclosed.png`, `death-cause-home.png`, `death-cause-pruned.png`, `death-cause-contact.png`. 이전 시점의 증거 파일은 보존했다. 최신 서버는 이전 PID 28772의 Node/script 절대 경로를 확인한 뒤 hidden PID 26544, 0.0.0.0:3003으로 갱신했다. localhost health/root HTTP 200, 최신 JS 제공, 오류 로그 비어 있음 확인. 탭 새로고침이 필요하며 실제 S24의 새 판단/설명 체감 인수는 OPEN이다.
