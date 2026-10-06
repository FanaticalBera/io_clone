# Profile / Stats V1 구현 결과

검증일: 2026-10-06. 현재 소스의 실제 영속 데이터만 사용했다. 새 성장/경제 시스템이나 플레이 기록 저장 구조를 추가하지 않았다.

## 1. 저장 구조와 사용한 필드

IndexedDB: `hexhold.player-profile` / version 1 / `meta` store / `profile` key. 기존 `PlayerProfileV1` 및 validation/migration을 확인했다.

| 실제 필드 | 프로필 표시 |
| --- | --- |
| `coins` | 현재 Coins, 메뉴와 같은 잔액 |
| `stats.runsPlayed` | 총 플레이 |
| `stats.totalKills` | 총 킬 |
| `stats.bestTerritoryPercent` | 최고 점유율 |
| `stats.classicClears` | Classic 100% 완주 |
| `stats.longestRunSeconds` | 최장 생존 시간 |
| `inventory.ownedMarkerIds` | 보유 Marker / 현재 Catalog Marker 수 |
| `inventory.ownedMarkerColorIds` | 보유 Marker Color / 현재 Catalog Color 수 |
| `inventory.equippedMarkerId` | Catalog 실제 이름 및 Marker 미리보기 |
| `inventory.equippedMarkerColorId` | Catalog 실제 색상 이름 및 미리보기 색상 |

총 플레이는 시작 버튼 누른 횟수가 아니라 기존 보상 정산 경로에서 영속 저장된 완료 Run 수다. 0 Coins 정산도 포함된다. 저장하지 못한 Run 및 도중 종료는 재구성하지 않는다. Classic 완주는 `FULL_CAPTURE_WIN` 정산 시에만 누적되는 필드를 표시한다.

현재 Catalog는 Marker 15개(Basic 4 + IMAGE 11), Marker Color 5개다. 수치는 UI 상수가 아니라 Catalog에서 계산한다. 보유 수는 중복 ID를 제거한 뒤 현재 Catalog와 교집합을 구하므로 삭제/미등록 ID로 분모보다 커지지 않는다. 원본 Inventory는 수정하지 않는다. 장착 ID를 찾지 못하면 화면에서만 기본 Marker/Color로 대체한다.

## 2. 화면과 갱신

메뉴의 기존 상점 버튼 옆에 프로필 버튼을 추가했다. 독립 dialog의 닫기 버튼 및 Escape로 돌아간다. 메뉴 이외의 게임 화면에서는 열지 않는다. Collection과 누적 통계를 한 화면에 배치했고 닫기/상태 영역은 고정했다. 길어진 내용은 프로필 내부에서만 스크롤할 수 있다.

Shop의 `markerPreview`를 그대로 호출한다. Basic은 SVG, IMAGE는 기존 Base tint + 고정 Detail 합성 Canvas를 사용하며 Marker Color를 적용한다. Shop과 동일한 대표 슬롯 색상(0x16cdb1)의 얇은 링을 유지한다. 프로필에 새로운 참가자 슬롯/네트워크 정보를 만들지 않았다.

메인의 기존 `applyProfile` 및 BroadcastChannel 갱신 경로에 연결했다. 구매/장착/보상 직후, 다른 탭의 정상 저장 후에도 열린 화면이 갱신된다. 늦게 완료되는 조회가 더 최근 갱신을 덮어쓰지 않도록 요청/갱신 번호를 확인한다.

## 3. 현재 데이터로 표시 불가능하여 제외

- Recent Runs: `processedRuns`는 최대 256개의 보상 영수증이다. runId와 기본/점유율/킬/완주/총 Coins만 저장하며 Run의 정확한 점유율, 킬, 시간, 날짜, 종료 사유를 보관하지 않는다. 코인 계산에는 반올림/상한이 있어 RunResult를 역산하지 않았다.
- `worlds`는 최대 32개의 중복 지급 방지 ledger이며 플레이 이력으로 사용하지 않았다.
- 평균 점유율, 평균 생존 시간, 총 플레이 시간, 총 점령 Cell, 최고 연속 승리, 승률: 필요한 원본 또는 누적 필드가 없어 제외했다.
- XP, Level, 랭크, 시즌, 업적, 미션, 온라인 계정/동기화: 이번 범위에서 제외했다.

## 4. 데이터 안정성과 schema

**저장 schema 및 DB version 변경 없음.** 기존 migration, validation, reward formula, 3% eligibility, kill reward/cap, RunResult, runId/world dedup, 구매/장착, Inventory, same-world Retry, BOT/HUMAN, Classic 및 R56/16은 변경하지 않았다.

프로필 화면용 `ProfileStore.readForDisplay()`는 별도 readonly snapshot 조회다. 기존 `read()`의 초기화/수리 저장 경로를 호출하지 않는다. 없는 DB의 upgrade를 취소하여 DB 생성도 하지 않으며, 없는 프로필은 화면용 기본값만 반환한다. legacy Inventory 보정은 메모리에서만 실행한다. 손상된 기본 데이터는 오류로 처리하고 저장값을 초기화하거나 백업/덮어쓰지 않는다. 완료/실패/timeout 뒤 연결을 닫는다.

Storage 오류는 dialog 내부의 읽기 불가 메시지와 다시 읽기로 처리한다. 닫기는 계속 사용할 수 있으며 표시용 0 Coins로 잔액을 대체하지 않는다. 게임/Shop의 기존 저장 처리에는 손대지 않았다.

## 5. 추가/수정 파일

추가:
- `src/client/profile-view-model.ts`: 저장값 → 순수 화면 모델
- `src/client/profile-snapshot.ts`: 저장을 수행하지 않는 조회
- `src/client/profile-ui.ts`: 프로필 dialog
- `tests/core/profile-view-model.test.ts`
- `tests/e2e/profile.spec.ts`
- `docs/profile-v1-results.md`
- `evidence/profile-v1-*.png`

수정:
- `src/client/profile-store.ts`: readForDisplay 메서드 추가
- `src/client/main.ts`: 생성 및 기존 갱신 경로 연결
- `src/client/ui.ts`: 메뉴 버튼
- `src/client/style.css`: 프로필 전용 반응형 스타일
- `playwright.run.config.ts`: 프로필 테스트 등록
- 기존 build 출력 갱신

이번 작업 이전의 Marker 크기 비교/테스트 지급 변경은 그대로 보존했다.

## 6. 테스트 결과

- 전체 Core: 72 files / 384 tests 통과. 신규 화면 모델 Unit 4개 포함.
- Browser: 프로필 7개 + 기존 landscape 메뉴/HUD 회귀 1개, 총 8개 통과. IMAGE를 최소 크기(568×320)로 추가 확인하고 다른 탭 pageerror 수집을 강화한 뒤 관련 2개를 재실행하여 통과.
- 프로필 브라우저 테스트 page error 0. 다른 탭의 페이지 오류도 수집한다.
- 타입 검사(client/server/tests) 및 production build 통과. 기존 Phaser 번들 크기 경고 외 오류 없음.
- 실제 LAN 주소 http://192.168.137.1:3003/에서 프로필 열기/표시/문서 overflow 없음/page error 0 확인. 정상 개발 실행에서 test-mode 게임 hook 없음 확인.
- 같은 LAN 주소의 실제 Socket.IO session:ready 연결 정상(protocol 5).
- git diff --check 통과.

검증 내용:
- Unit: 저장 필드 매핑, 기본값/전체 보유, Catalog 교집합/중복/사라진 ID, 읽기 전용 변환 및 허구 이력 미생성
- Browser: 신규 프로필, 실제 사망/Classic 정산 경로, 메뉴 Coins 일치, 구매/Basic 및 IMAGE 장착/합성 일치, 새로고침, 다른 탭 BroadcastChannel, Storage 실패/재시도/닫기, 없는 DB/legacy/손상 데이터 조회 시 쓰기 없음
- 실제 게임 판정 테스트는 기존 test-mode hook 및 shared engine 함수를 사용했다. 이번 기능을 위한 Production 게임 우회 코드는 추가하지 않았다.

## 7. 모바일 가로 확인

844×390 / 640×320 / 568×320에서 주요 통계, Collection 및 닫기를 확인했다. 문서/dialog의 불필요한 세로 스크롤이 없고 V1 내용은 내부 스크롤도 필요 없이 들어간다. 큰 영속 정수 표시도 568×320에서 확인했다.

스크린샷:
- [844×390](../evidence/profile-v1-new-844x390.png)
- [640×320](../evidence/profile-v1-new-640x320.png)
- [568×320](../evidence/profile-v1-new-568x320.png)
- [IMAGE 장착 · 568×320](../evidence/profile-v1-equipped.png)
- [실제 LAN 게임 · 568×320](../evidence/profile-v1-lan-568x320.png)

자동 브라우저 검증은 Chromium의 모바일 viewport/touch 환경이다. 실제 휴대폰 Chrome의 최종 육안 확인은 사용자가 같은 LAN의 게임을 열어 확인할 수 있다.

## 8. Profile V2 후보 (제안만)

별도 Run 기록 및 저장 범위/보관 한도를 먼저 정하면 최근 플레이와 승률/총 플레이 시간을 정확히 추가할 수 있다. 그 이후 프로필 배지/업적/시즌 기록을 별도 요구사항으로 검토할 수 있다. 이번에는 구현하지 않았다.
