# Marker 상점 적용 V1 · 2026-10-06

사용자가 시안의 상점 적용과 테스트 마커 1개 지급을 요청하여 승인한 11개를 실제 Catalog, 상점과 PlayerMarker에 연결했다. 달 모양 moon은 제외하고 꼬마 유령 ghost는 유지한다. 기존 원본 시안과 생성 프롬프트는 보존한다.

## 적용 상품

- CUTE: 말랑냥 cat, 콩병아리 chick, 젤리팡 slime
- FANTASY: 루미 크리스탈 crystal, 꼬마 유령 ghost
- TECH: 캡슐 코어 core, 접시 레이더 radar, 포켓 드론 drone
- SPECIAL: 궤도 정령 orbit, 왕관 수호자 crown, 불씨 정령 ember
- BASIC: Default / Ring / Hex / Target의 기존 코드 렌더링 유지

기존 placeholder의 cat / slime / crystal / core / orbit ID를 유지하므로 구매 기록과 장착 상태가 새 외형으로 이어진다. DB 버전, PlayerProfile 및 Inventory schema는 변경하지 않았다. 기존 상품 가격은 유지하며 신규 이미지 상품도 같은 테스트 가격 50 Coins를 사용한다. 가격은 Catalog의 SHOP_PRICES.imageMarker 한 곳에서 조정할 수 있다.

## 렌더링

각 상품은 동일 위치의 256×256 투명 PNG 두 장을 사용한다. Base는 grayscale 음영을 가진 본체이며 Marker Color로만 tint한다. Detail은 눈·윤곽·밝은 면·금속/장식을 원래 색으로 유지한다. Slot Color 식별 링은 기존 Graphics로 두 이미지 위에 그린다.

승인된 Coral 원본의 본체 색상 영역을 내보내기 단계에서 분리했다. 새로운 외형을 다시 생성하거나 별도의 추가 디자인을 만들지 않았다. scripts/export-marker-materials.cjs는 원본 alpha 경계 중심과 최대 반경을 측정하여 두 레이어를 같은 변환으로 정렬하고, 반경 21 world units 이내에 담는다. Coral 영역 판별은 이번 시안 팔레트용 내보내기 규칙이며 실제 플레이 중 픽셀 판별은 없다. 향후 다른 팔레트의 디자인에는 분리된 제작 레이어를 제공하거나 해당 내보내기 규칙을 조정해야 한다.

실제 PlayerMarker는 Base Image 한 개와 Detail Image 한 개를 재사용한다. 외형/색상이 바뀔 때만 texture와 tint를 갱신하며 frame마다 이미지·Canvas·GameObject를 생성하지 않는다. 상점 Canvas도 동일 Base multiply와 Detail 합성을 사용한다. 원본 이미지 로드 캐시는 22개, 색상 합성 캐시는 최대 32개로 제한했다.

총 PNG 22개 / 780,177 bytes. 첫 로딩에 Phaser가 한 번 preload하며 RGBA texture 크기 기준 약 5.5 MiB이다. 844×390에서 프레임은 15.96 CSS px, 슬롯 링 바깥 지름은 20.14 CSS px이다. 568×320에서는 프레임 14.7 CSS px이다. 프레임 안의 실제 실루엣은 상품별로 더 작다. 게임 충돌 판정 크기와 위치는 변경하지 않았다.

본체 Marker Color만 사용자 화면의 자기 마커에 적용한다. 모든 상대 참가자의 외형과 영토/트레일 색상, Slot Color 식별은 기존 규칙을 따른다. 프로토콜이나 네트워크 외형 공유는 추가하지 않았다.

## 테스트 마커 지급

개발 서버에서 다음 주소를 열면 말랑냥 한 개를 무료 보유 처리하고 즉시 장착한다.

[말랑냥 무료 지급 및 장착](http://192.168.137.1:3003/?testMarkerGift=cat&experimentSeed=4)

기존 Coins, 통계, processedRuns/worlds ledger, 보유한 다른 상품과 Marker Color 장착은 유지한다. 이미 말랑냥을 보유했어도 Coins를 차감하지 않고 중복 보유 ID를 추가하지 않는다. 보유 추가와 장착은 기존 IndexedDB readwrite transaction 안에서 함께 저장하며 성공 전 UI에 적용하지 않는다. 쓰기 실패하면 전체 변경이 취소되고 주소 파라미터를 남겨 새로고침 재시도를 제공한다. 저장 성공 후 지급 파라미터만 URL에서 제거한다.

지급 링크는 import.meta.env.DEV에서 cat에만 허용된다. Production에서 해당 파라미터는 보유·장착에 영향을 주지 않는다. 다른 상품이나 Coins 지급용 경로는 없다. 기본 게임 주소를 방문하는 사람에게 자동 지급하지 않는다. 로컬 저장이므로 실제 휴대폰 브라우저에서는 위 링크를 직접 열어야 그 기기의 기존 프로필에 지급된다. 자동화 테스트 브라우저의 저장소와 사용자 기기의 저장소는 별개다.

## 검증

- npm test: 70파일 / 377개 통과. 기존 372개 및 신규 Catalog·에셋·기존 구매 복원·지급 보존·개발 환경 제한·slot 15 단위 검사 포함.
- npm run build: 클라이언트/서버/테스트 타입 검사와 production 빌드 통과. 기존 Phaser 번들 크기 경고 유지.
- 브라우저 22개 검사 항목 모두 확인. 첫 전체 실행은 18/22 통과했다. 신규 연속 구매 검사는 시간 제한 60초, 소재 검사는 원본의 거의 불투명한 alpha를 완전 불투명으로만 셌던 조건 때문에 실패했다. 검사 시간을 조정하고 실제 고정 Detail 영역을 검사하여 재실행 후 두 항목 통과.
- 재실행에서는 기존 두 클라이언트 외형 비공유 검사도 통과했다. 기존 온라인 재시도 검사는 정지한 simulation fixture가 3초 넘게 새 snapshot을 보내지 않아 클라이언트 watchdog이 재시도를 막는 문제를 확인했다. fixture에서 현재 상태를 500ms마다 발행하고 simulation은 계속 정지시킨 뒤 재실행하여 통과했다. 제품의 watchdog, 연결 코드, retry 규칙은 변경하지 않았다. 22개가 한 번의 전체 실행에서 모두 통과했다고 기록하지 않는다.
- 신규 브라우저 검사는 무료 지급 및 재방문/새로고침, 저장 실패 rollback, 동시 지급, 11개 모두 실제 구매·장착, 보유 복원, 22회 외형 전환, 자기 색상/고정 Detail/상대 기본 외형을 확인했다. 반복 전환 후 texture 목록과 avatar/image 객체 수가 유지된다.
- 844×390 / 640×320 / 568×320 터치 브라우저에서 상점의 닫기·잔액·미리보기·구매/장착 버튼이 화면에 들어오며 전체 문서 스크롤이 생기지 않는다. 상품 목록은 내부 스크롤한다.
- 11개 Base의 grayscale 음영과 alpha, 고정 Detail의 색상 보존, slot 15 링 색상을 픽셀로 검사했다.
- 실제 production 빌드에서 지급 링크 비활성, 기본 1개 보유 및 이미지 상품 11개 미리보기 로드를 확인했다: production-claim-check.json.
- 실제 모바일 접속 주소에서 844×390 터치 브라우저로 무료 말랑냥 보유·장착·새로고침 복원, Coins 0 유지 및 pageerror 0을 확인했다: mobile-claim-check.json.
- 모바일 주소 HTTP 200, 실제 WebSocket/session:ready protocol 5를 확인했다. 기존 서버 3001과 모바일 개발 서버 3003은 유지한다. 테스트용 임시 production preview만 종료한다. 모바일 핫스팟은 접속 기기 없이 5분이 지나면 자동 종료되는 설정이 켜져 있어 이를 해제하고 HTTP 200 및 WebSocket 연결을 다시 확인했다. 원래 설정은 .local/marker-hotspot-timeout-baseline.json에 기록했으며 SSID/암호 구성은 변경하지 않았다.

실제 휴대폰의 물리 터치, 장시간 FPS와 사용자가 느끼는 작은 크기의 가독성은 자동화 브라우저 검증과 구분한다. 이번 작업에서 실제 기기의 장시간 성능을 측정했다고 주장하지 않는다.

RunResult, 보상 공식과 3% 자격/20킬 제한, IndexedDB 구조, runId 중복 방지, same-world retry, BOT/HUMAN 판정, R56/16, XP/Level 및 닉네임/봇 외형 랜덤화는 변경하지 않았다. 기존 evidence 파일은 원본으로 복원하고 이번 마커 화면 자료만 추가한다.

## 실제 화면

- [상점 가로 화면](../../evidence/marker-v1-shop-landscape.png)
- [말랑냥 실제 플레이 844×390](../../evidence/marker-v1-cat-gameplay-844x390.png)
- [말랑냥 실제 플레이 568×320](../../evidence/marker-v1-cat-gameplay-568x320.png)
- [모바일 주소의 무료 지급/장착 상점](../../evidence/marker-v1-free-cat-mobile-address.png)
