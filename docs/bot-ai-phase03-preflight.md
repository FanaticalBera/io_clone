# 2.5단계 마감·master 통합 검증

2026-10-12 · `codex/bot-ai-phase01`

사용자 관전 승인을 받아 2.5단계를 마감했다. 3단계 전에 master의 LAN 친구 대전·마커 변경을 실험 브랜치로 합쳤다. 병합 커밋 `ddda67b`의 부모는 `fba4106`과 `960f678`이다. 기본 작업 폴더의 master는 `960f678` 그대로 유지했다. 3단계 AI 변경은 구현하지 않았으며 [수치·구조 제안서](bot-ai-phase03-proposal.md)에 승인할 값을 정리했다.

## 병합 내용

master가 온라인·LAN의 방 관리와 tick 루프를 shared로 분리한 구조를 유지하면서, 기존 실험 브랜치의 성격·특성 배정과 RNG seed, 교체 봇 기억, 디렉터의 판단·추격 예약을 공유 모듈에 반영했다. 서버 어댑터는 master의 얇은 어댑터 구조를 유지한다. 클라이언트의 LAN 모드·호스트 pause/resume과 관전 HUD 선택·종료 처리를 함께 보존했다. 새 의존성은 실험용 독립 node_modules에 설치하여 기본 폴더/다른 작업의 의존성을 변경하지 않았다.

## 검증

- 고정 8시드 4·19·73·11·31·47·101·137, R56, 14봇, spawnRadius=1, classic, safeRespawn, combined, 30Hz, 3600tick audit에서 c84fc7a 기준의 궤적·판단 trace·메모리·다음 행동 RNG와 예약 통계가 8/8 일치했다. 보유·성장·성격별 값·사망·출발 안전·재배치 통계도 같다.
- 위 audit은 공유 게임/봇 엔진 재생이다. 추가로 실제 서버/LAN 공유 RoomLoop를 디렉터 직접 실행과 비교했다. 사람 foreground/background 두 경우에 각각 90tick의 공개 상태, 최종 기억과 다음 RNG가 일치했다.
- client/server/tests 타입 검사 및 audit 스크립트 별도 타입 검사 통과.
- 전체 Vitest 92파일·644개 통과. 그 뒤 추가한 공유 루프 동등성 테스트를 포함한 해당 파일 4개와 회수 정의 테스트 2개를 별도 재확인했다. 최종 테스트 수는 645개이며 전체 645개를 다시 실행했다고 주장하지 않는다.
- 재부팅 후 PC 관전 HUD Playwright 9개 모두 통과. 일반 연습·14봇 관전·부활 지속·선택 카메라·피해 표시·계획 실제 회수·주황색 재배치·출발 차단, 배포 모드의 디버그 비활성화를 검증했다.
- 서버 TypeScript 빌드, 웹 배포 번들, APK 모드 웹 번들 빌드 통과. 네이티브 Android APK·기기 검증은 이번에 수행하지 않았다.

LAN background 자리 인계 테스트는 수동 서버 시계와 실제 클라이언트 heartbeat 시계가 달라 호스트 연결이 먼저 닫히는 실패가 있었다. 테스트에서 양쪽 heartbeat를 진행하고 경기 이동과 30초 만료 검증을 분리했다. 30초에는 사람이 남고 그 이후 같은 슬롯이 BOT으로 교체되며 방이 유지되는 조건은 강화하여 확인했다. 게임의 방 종료·사망·자리 인계 규칙을 바꾸지 않았다.

Windows가 5312를 TCP 제외 범위로 예약하여 브라우저 테스트 preview만 임시 설정의 5183으로 실행했다. 테스트 내용은 변경하지 않았다. 현재 브랜치의 원본 설정은 그대로이며 다른 실행 중인 서버를 종료하지 않았다.

## 3단계 기준값 추가

전체 사망 90회 = EXISTING_TRAIL_CONTACT 78 + PENDING_TRAIL_CONTACT 7 + HOME_CAPTURE 5, 벽 사망 0. 기존 되찾기 3193칸은 그대로 유지한다. 중립화된 피해 구역의 실제 회수는 exact-transfer·동일 생명·60초 원장으로 별도 1121칸이다. 기존 되찾기와 정의가 달라 단순 합산하지 않는다.

PERIMETER_GUARD는 동작을 바꾸지 않고 4단계 후보로 관측했다. 통지 1499 bot-tick, 선택 확장 중단 1113계획, 그중 예상 D가 있는 계획 41개다. 중단 후 작은 폐쇄·회수가 가능하므로 이를 회수 실패 횟수로 해석하지 않는다. 각 시드와 봇별 값·정의를 별도 보존했다. 보조 observer를 켠 측정도 궤적·판단·메모리·다음 RNG·보유·성격 지표가 8/8 동일했다.

## 자료

- [병합 해시 검증](../evidence/bot-phase03-preflight/merge-equivalence.json)
- [기준값·정의·시드별 보유 및 사망 원인](../evidence/bot-phase03-preflight/baseline.json)
- [봇별 보조 지표 112행](../evidence/bot-phase03-preflight/baseline-bots.csv)
- [검증 요약](../evidence/bot-phase03-preflight/validation.json)

원본 audit·검사 로그·검증한 빌드는 기본 저장소 `.local/bot-phase03-preflight/`에 보존한다. 테스트가 덮어쓴 T35 보고서와 빌드 산출물은 이번 소스 변경에 넣지 않는다. 통합 검증을 통과했으므로 2.5단계의 master 반영을 검토할 수 있다. 이번 작업은 master → 실험 브랜치 통합까지 완료했으며 반대 방향 병합은 수행하지 않았다.
