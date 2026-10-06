# Player Color System V2 — 2026-10-06

목표: 구매한 색상이 내 Marker, Territory, Trail, 식별 요소에서 함께 보이고, 같은 Match의 BOT은 내 색상 및 서로의 색상을 중복 사용하지 않도록 했다. 마지막 추가 요청에 따라 BOT Marker의 매치별 랜덤 외형도 포함했다.

## 1. 기존 Slot Color 구조

기존 GameScene의 COLORS[slot]은 마커 링/보호 표시, 영토, 트레일, 예측 트레일, 미니맵, 지점, Combat/Collapse/Capture 효과, 순위표를 직접 색칠했다. 장착 Marker Color는 로컬 마커 Base에만 적용됐다. Participant.slot 및 owner=slot+1 / trail bit는 판정 식별자이며 색상 값과 별개다.

## 2. 새 구조

player-colors.ts의 SLOT_COLORS는 기존 16개 기본 RGB를 고정 배열로 보존한다. participantRenderColors는 Participant를 읽어 slot → 화면 RGB 매핑을 새로 만든다. GameScene은 이 매핑을 사용하고 게임 state는 수정하지 않는다. 기존 COLORS export는 기본 배열 호환 별칭으로 유지했다.

slot 선택/누락/없는 Catalog ID 또는 로컬 참가자가 없는 메뉴 미리보기는 기존 배정을 그대로 쓴다. 커스텀 선택만 로컬 HUMAN 색상을 우선 예약한다. 색 변경 시 동일 ownership/trail board라도 전체 chunk와 캐시 미니맵 색상을 무효화하여 즉시 다시 칠한다. 이벤트 reset을 색 변경에 사용하지 않아 효과 dedup을 건드리지 않는다. 기본 무료 색상은 여전히 slot ID이며 Practice slot 0에서는 Mint와 같은 기본 RGB다.

## 3. Color 목록과 RGB

16개의 고정 Player Color + 무료 슬롯 기본 선택, Catalog 17개. 기존 RGB/ID를 변경하지 않았다. 색상은 모두 임시 30 Coins, slot만 무료다. 가까운 색상들을 무리하게 16개 hue로 나누는 대신 밝기 차이와 Brown/Slate 계열을 포함했다. 현재 밝은 hex 배경의 .92 Territory / .28 Trail 및 밝은 grayscale Base에 적용했다.

| ID | 이름 | Hex | RGB | 상태 |
| --- | --- | --- | --- | --- |
| coral | Coral | #FF7084 | 255, 112, 132 | 기존 보존 |
| violet | Violet | #A180F4 | 161, 128, 244 | 기존 보존 |
| cyan | Cyan | #59BFD8 | 89, 191, 216 | 기존 보존 |
| gold | Gold | #FFB43B | 255, 180, 59 | 기존 보존 |
| red | Red | #C83F4B | 200, 63, 75 | 추가 |
| orange | Orange | #E87325 | 232, 115, 37 | 추가 |
| lime | Lime | #B5CE50 | 181, 206, 80 | 추가 |
| green | Green | #36843F | 54, 132, 63 | 추가 |
| mint | Mint | #16CDB1 | 22, 205, 177 | 추가 |
| teal | Teal | #147F84 | 20, 127, 132 | 추가 |
| sky | Sky | #359AFF | 53, 154, 255 | 추가 |
| blue | Blue | #254BC8 | 37, 75, 200 | 추가 |
| pink | Pink | #DC57BD | 220, 87, 189 | 추가 |
| plum | Plum | #763782 | 118, 55, 130 | 추가 |
| brown | Brown | #9B644D | 155, 100, 77 | 추가 |
| slate | Slate | #52687C | 82, 104, 124 | 추가 |

## 4. HUMAN 예약

Catalog의 equippedMarkerColorId를 조회해 로컬 HUMAN의 slot에 해당 RGB를 예약한다. 선택 색상이 기존 다른 슬롯 RGB와 같더라도 HUMAN이 우선이다. slot / Participant ID / owners / trailMasks를 수정하지 않는다. slot 15의 로컬 HUMAN도 지원한다.

## 5. BOT 색과 마커

Practice의 1 HUMAN + 15 BOT에서는 선택 색을 사용 중 집합에 먼저 넣고 나머지 고정색 15개를 BOT slot 순으로 배정한다. 정확한 RGB 중복이 없다. 무료 slot 선택은 기존 고유 Slot Color 16개를 쓴다. 색 배정은 난수를 사용하지 않는다.

BOT Marker는 현재 확정 Catalog 15종(Basic 4 + IMAGE 11)을 matchId에서 얻은 전용 hash/xorshift로 셔플하여 slot에 배정한다. Practice의 15 BOT에는 서로 다른 마커 15종이 나타난다. 새 matchId에서는 새 순서, 동일 월드 retry/respawn/reconnect에서는 같은 외형을 유지한다. 마커 순서는 장착 색상/마커 변경과 무관하다. Match seed, AI random, personality/target, global Math.random을 소비하지 않는다. BOT Inventory/Coins/Profile은 만들거나 변경하지 않는다.

## 6. Inventory schema

변경 없음. DB version 1, equippedMarkerColorId / ownedMarkerColorIds 및 marker-color ProductKind를 계속 사용한다. 추가 DB migration 없음. 기존 Profile/Stats 기능을 확장하지 않았다. 공통 용어 표시만 Player Color로 맞췄고 Catalog 수는 기존 계산 구조로 자동 반영된다.

## 7. 기존 구매 데이터 보존

coral/violet/cyan/gold의 ID, RGB 및 가격을 유지했다. 기존 owned IDs와 장착 IDs가 현재 Catalog에서도 유효하므로 기존 validation/migration이 해당 값들을 그대로 유지한다. Coins, stats, processedRuns/world ledger, 기존 Marker 구매 상태를 초기화하지 않는다. 경제 저장/구매/장착 구현도 변경하지 않았다.

## 8. IMAGE tint와 재료 검토

Phaser의 Base setTint(Player Color) + Detail clearTint를 유지한다. thin identification ring 및 protected shield도 resolved Player Color로 표시한다. BOT IMAGE도 동일 렌더러를 사용하지만 bodyColor는 해당 BOT의 배정색이다. 로컬 장착 외형을 다른 HUMAN에게 적용하지 않는다. Shop/프로필은 기존 markerPreview 합성 함수를 재사용하고 링도 preview Color로 표시한다. Marker 이미지 자체는 교체/생성하지 않았다.

Base alpha × (1 - Detail alpha)를 노출 tint 영역으로, 합성 alpha 대비 비율을 측정했다. 아래는 파일 재료 기준 수치이며 실제 작은 화면의 주관적 가독성 점수는 아니다.

| 마커 ID | 노출 Base 비율 | 노출 Base 평균 밝기 /255 |
| --- | --- | --- |
| cat | 69.2% | 249 |
| chick | 51.3% | 244 |
| slime | 60.9% | 247 |
| crystal | 47.4% | 243 |
| ghost | 51.2% | 239 |
| core | 36.6% | 237 |
| radar | 42.7% | 236 |
| drone | 39.2% | 235 |
| orbit | 34.2% | 244 |
| crown | 40.8% | 246 |
| ember | 44.5% | 249 |

평균 밝기 235~249로 Base가 지나치게 어두운 문제는 발견하지 않았다. 개별 개선 우선 후보는 orbit(34.2%), core(36.6%), drone(39.2%)이다. 고정 장식/기계 Detail이 넓어 작은 크기에서 색 변경이 덜 느껴질 수 있으므로 향후 주 본체 Base 영역을 넓히거나 고정 Detail 면적을 줄이는 시안을 검토할 수 있다. 이번 작업에서는 재료를 바꾸지 않았다.

## 9. Territory / Trail / effects

영토 fill .92, trail fill .28 및 outline, online predicted head cell, 미니맵 영토/나 표시, 보호 표시, control-point 색, leaderboard border 및 관련 효과에 같은 slot render mapping을 전달한다. alpha, grayscale shading 및 effect의 white mix 때문에 화면 최종 픽셀은 원 RGB와 다르지만 모두 같은 선택 원색을 사용한다. Capture Pulse의 현재 active 색도 새 매핑으로 갱신한다. 영토 collapse와 상대 사망 burst는 생성 당시 해당 참가자의 화면 색을 사용한다. 내 사망 burst 및 경고 flash의 기존 붉은 의미색은 유지한다.

Chunk redraw는 색상 변경/기존 reset 시만 전체 수행하고 일반 board 변경은 기존 dirty chunk 방식이다. 컬러 cosmetic은 authoritative/presented 게임 state를 수정하지 않는다. Capture/trail/death/ownership/spawn/BOT AI, RunResult, 보상(3% 기준/킬 cap), retry, R56/16 규칙은 그대로다.

## 10. 온라인 범위와 제한

현재 Participant/WireSnapshot에 구매 Color/Marker 필드가 없음을 확인했다. 이번 작업에서 protocol/server/payload를 확장하지 않았다.

- 내 화면의 로컬 HUMAN은 구매 Color/Marker를 사용한다.
- 다른 참가자들의 충돌하지 않는 기본 슬롯 색상을 먼저 전부 예약한 뒤 내 색과 충돌한 참가자만 남는 색으로 치환한다. 연쇄 색 변경을 막는다.
- 내 화면의 모든 참가자 색상은 정확히 중복되지 않는다. 원격 HUMAN의 Marker는 기존 Default 외형이다. BOT 외형은 matchId 기반 로컬 presentation이다.
- 다른 사용자는 자신의 화면의 슬롯/로컬 매핑을 사용하므로 내 구매 Color/Marker가 다른 사용자 화면에 전달되지는 않는다. 상대방이 구매한 Color도 읽을 수 없다. 온라인 cosmetic 동기화는 별도 후속 범위다.

## 11. 테스트 결과

- 전체 Core/서버: 73 files / 407 tests 통과(신규 23개 포함).
- 브라우저 검증 범위 총 40개 최종 통과, 여러 실행의 합산이다. 기존 메뉴/마커/크기/구매/저장/프로필/보상/Run/practice + 신규 Player Color 34개 범위에서 처음 31개 통과 후, 렌더러 준비 완료를 기다리는 fixture 보완 및 관측 클라이언트 색상 기대값 수정 후 신규 mobile touch/DPR 3의 4개와 실제 온라인 2개를 재실행하여 통과했다. 나머지 6개는 R48/R56/R64, R56 practice/실제 온라인/production 검증이며 모두 통과했다.
- Player Color 4개에서 page error 0. 다른 탭 오류도 수집했다.
- 타입 검사 및 production build 통과(기존 큰 Phaser bundle 경고 외 오류 없음).
- 실제 LAN 게임: http://192.168.137.1:3003/ 에서 상점 17개 swatch, 1 HUMAN + 15 BOT, 9577 cells, 문서 overflow 없음, page error 0, test-mode hook 없음 확인. Socket.IO session:ready 정상(protocol 5).
- 실제 게임 규칙/경제/저장 원본 및 Marker PNG에 이번 작업의 변경 없음.

대형 맵 자동화 측정(PC Chromium, 실제 휴대폰 측정 아님):

| 반경 / 16명 | Culling FPS | 전체 렌더 FPS | Culling p95 frame(ms) | Ground / Territory chunk |
| --- | --- | --- | --- | --- |
| R48 | 24.5 | 25.6 | 50.0 | 40 / 40 |
| R56 | 22.1 | 21.5 | 50.1 | 51 / 51 |
| R64 | 21.4 | 21.0 | 50.1 | 65 / 65 |

카메라 이동 중 chunk/texture/avatar 수가 일정했다. 기존 Marker switching 검사에서도 22 marker textures, 로컬 IMAGE 포함 24 image objects가 유지됐다. 이 FPS는 자동화 환경에서 측정된 수치이며 실기기 속도 또는 60 FPS 보장이 아니다. [측정 요약](../evidence/player-color-v2-performance.json)을 함께 보관했다.

신규 Core 23개: 16개 색 각각의 HUMAN 예약/15 BOT 중복 방지, 기존 RGB/가격/기본 호환, slot 15, online 충돌 및 나머지 슬롯 유지, 기존 구매/통계 보존, 전용 cosmetic 셔플, cosmetic 변경을 넣은 paired AI replay의 board/participant/memory 및 다음 RNG 값 일치.

신규 Browser 4개: 16개 상품 UI 구매/장착/새로고침, 실제 Graphics fill 명령(.92/.28) + 마커 Base tint/Detail white + shield 검증, ownership/trail/tick/ID 불변, Capture/Death 효과 색상, 같은 월드 retry와 새 매치 재배정, online slot 15 / wire 필드 불변, IMAGE 11종 재료 감사. 테스트용 seed/판정 fixture는 기존 test-mode hook 및 shared engine 함수만 사용하며 Production에 게임 우회를 추가하지 않았다.

## 12. 모바일 화면

844×390, 640×320, 568×320에서 Color 상점(17개 swatch/name/가격/보유/장착 상태/내부 목록 스크롤/고정 닫기)과 실제 Violet gameplay를 확인했다. 문서 불필요 세로 스크롤이 없고 주요 조작 요소가 잘리지 않는다. 다양한 BOT 외형의 실제 게임 카메라 화면도 저장했다.

검증은 Chromium 모바일 viewport/touch 환경 및 데스크톱 자동화이며, 실제 휴대폰 Chrome 하드웨어 검증은 사용자가 LAN 주소로 플레이하여 최종 확인해야 한다.

화면 및 재료:
- [상점 844×390](../evidence/player-color-v2-shop-844x390.png), [640×320](../evidence/player-color-v2-shop-640x320.png), [568×320](../evidence/player-color-v2-shop-568x320.png)
- [게임 844×390](../evidence/player-color-v2-game-844x390.png), [640×320](../evidence/player-color-v2-game-640x320.png), [568×320](../evidence/player-color-v2-game-568x320.png)
- [BOT 말랑냥](../evidence/player-color-v2-bot-cat.png), [BOT 캡슐 코어](../evidence/player-color-v2-bot-core.png), [BOT 궤도 정령](../evidence/player-color-v2-bot-orbit.png)
- [IMAGE 재료 수치](../evidence/player-color-v2-material-audit.json)
- [실제 LAN 상점](../evidence/player-color-v2-lan-shop.png), [실제 LAN 게임](../evidence/player-color-v2-lan-game.png)

## 변경 파일

추가: src/client/player-colors.ts, src/client/bot-cosmetics.ts, tests/core/player-colors.test.ts, tests/e2e/player-color.spec.ts, docs/player-color-v2-results.md 및 전용 evidence.

수정: catalog.ts, game-scene.ts, marker-art.ts, player-marker.ts, ui.ts, main.ts, shop-ui.ts, style.css, profile-ui.ts(용어만), playwright.run.config.ts, 기존 shop/profile/marker-design/marker-size E2E의 V1 색/기본 BOT 가정 및 Catalog 총수. production client build 출력 갱신. territory-capture-effects.ts에서 active Capture 색도 갱신했다. marker-preview-image.ts는 수정 없이 재사용했다. tests/e2e/large-world.spec.ts와 tests/e2e/large-world-production.mjs에서 기존 production 테스트의 오래된 R22/8 기대값을 현재 DEFAULT_CONFIG의 R56/16에 맞춰 수정하고 다른 실험값(클라이언트 R48/8, 서버 R64/8)이 기본값을 덮어쓰지 않는지 검사한다.

기존 Profile V1/Marker 크기 비교/테스트 지급 등 이번 작업 이전 변경을 보존했다. XP/Level/업적/닉네임/사운드/최종 가격/새 Marker 제작은 진행하지 않았다.
