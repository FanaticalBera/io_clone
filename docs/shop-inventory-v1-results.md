# Shop / Inventory V1 구현과 검증

## 구현 범위

메뉴의 **상점** 버튼에서 마커·Marker Color 상품을 구매하고, 보유 상품을 확인하고, 각각 하나씩 장착한다. 구매는 장착과 별도 행동이다. 이미 보유한 상품은 재구매할 수 없고 Coins 부족 시 구매 버튼이 비활성화된다. 저장이 완료된 뒤에만 잔액·보유·장착 상태를 표시한다.

Basic 마커는 Phaser Graphics로 그린 Default / Ring / Hex / Target이다. 게임 판정은 외형과 분리되어 있으며 마커의 크기·모양은 이동, 충돌, 귀환 판정에 영향을 주지 않는다. 상점 미리보기는 같은 기하학 정의를 SVG로 그린다. 임시 상품은 글자와 원으로 표시하고 카드에 **임시 디자인**을 명시한다.

색상은 **Marker Color**다. 장착 색상은 내 마커 본체에만 적용하고, 얇은 외곽 식별 링은 현재 슬롯 색상을 사용한다. 기본 무료 색상인 '슬롯 기본'은 현재 슬롯 색상을 따라간다. 영토·트레일·미니맵·전투 효과는 기존 슬롯 색상 그대로다. 온라인에서도 내 화면의 내 마커에만 적용하며 다른 클라이언트에 구매·장착 정보를 전송하지 않는다.

## Catalog와 렌더링

상품 정의와 가격은 src/client/catalog.ts에 있다. SHOP_PRICES만 수정하면 다음 테스트 가격을 변경할 수 있다.

| 종류 | 상품 | 테스트 가격 |
| --- | --- | ---: |
| BASIC | Default | 무료·기본 보유 |
| BASIC | Ring | 40 Coins |
| BASIC | Hex | 60 Coins |
| BASIC | Target | 80 Coins |
| CUTE | Cat, Slime | 각각 50 Coins |
| FANTASY | Crystal | 50 Coins |
| TECH | Core | 50 Coins |
| SPECIAL | Orbit | 50 Coins |
| Marker Color | 슬롯 기본 | 무료·기본 보유 |
| Marker Color | Coral, Violet, Cyan, Gold | 각각 30 Coins |

BASIC 외 상품은 구매·장착 흐름을 검증하는 placeholder다. 최종 디자인과 경제 밸런스가 아니다. 저장은 상품의 안정적인 ID를 사용한다. 이후 Catalog의 renderType/assetKey와 렌더링 또는 텍스처 등록을 교체할 수 있으며 구매·장착·보유 코드를 변경할 필요가 없다.

marker-art.ts는 외형 정의, player-marker.ts는 Phaser 표시, inventory.ts는 보유·구매·장착 규칙, shop-ui.ts는 메뉴 상점 화면을 맡는다. 게임 규칙 및 네트워크 프로토콜과 분리했다. Basic에는 별도 이미지 Asset이 없다. 마커 하나당 Graphics를 재사용하며 동일 외형은 다시 그리지 않는다.

## 기존 프로필 보존과 원자적 저장

IndexedDB의 기존 DB hexhold.player-profile, DB version 1, meta store, profile key와 프로필 root version: 1을 유지한다. 유효한 기존 문서는 그대로 복제한 뒤 다음 **inventory 필드만** 추가한다.

- version: 1
- ownedMarkerIds
- ownedMarkerColorIds
- equippedMarkerId
- equippedMarkerColorId

기존 Coins·통계·processedRuns·worlds ledger와 추가 데이터는 그대로 유지한다. 예전 보상 클라이언트도 root version 1을 읽을 수 있다. 장착 ID가 알 수 없거나 미보유 상품을 가리키면 해당 장착 필드만 기본 ID로 복구한다. 반대쪽 정상 장착과 보유 목록은 유지한다. Catalog에 잠시 없는 유효한 보유 ID도 삭제하지 않는다.

신규 저장은 기존 ProfileStore의 단일 readwrite transaction에서 현재 DB 잔액·보유를 읽고 계산한다. 구매 시 잔액 차감과 보유 추가를 같이 저장한다. 같은 상품을 두 탭에서 동시에 구매해도 한번만 차감된다. 보상 지급과 구매·장착도 같은 store의 transaction으로 직렬화된다. transaction abort 또는 쓰기 예외 시 원본 문서와 UI 잔액·장착이 유지되고 다시 시도할 수 있다. 마이그레이션 쓰기 실패도 기존 문서를 보존한다. 저장소를 읽을 수 없으면 구매·장착을 막고 **저장 다시 읽기**를 제공한다.

기존 코인/ledger 자체가 유효하지 않은 문서에 대한 기존 백업·복구 정책은 유지한다. Inventory 오류 때문에 유효한 기존 지갑을 초기화하지 않는다.

## 모바일 가로 UI

844×390과 640×320의 터치 브라우저에서 닫기, Coins, 종류 탭, 보유 필터, 미리보기, 구매·장착 버튼과 상태 표시가 화면 안에 있는지 검사했다. 전체 문서와 dialog는 세로 스크롤되지 않고 상품 목록만 내부 스크롤된다. 기존 메뉴·경기 UI의 구조는 유지하며 메뉴에 상점 진입 버튼만 추가했다.

## 검증

- npm test: **69파일 / 372개 통과**. 신규 상점 단위 테스트 19개 포함.
- npm run build: 클라이언트·서버·테스트 타입 검사 및 운영 빌드 통과. 기존 Phaser 단일 번들 크기 경고는 남아 있다.
- npm run test:run: 18개 중 첫 전체 실행은 16개 통과, 온라인 연결 관련 2개 실패(5.2분). 실패한 기존 온라인 재연결·신규 외형 공유 검사를 별도로 재실행해 **2개 모두 통과(57.1초)**했다. 따라서 기존 11개와 신규 상점 7개 시나리오를 모두 검증했다. 전체 실행을 한번에 18개 통과했다고 기록하지 않는다.
- 신규 브라우저 테스트는 개별 실행에서 7개 모두 통과했다. 두 클라이언트 온라인 검증의 초기 5초 대기는 정상 handshake/방 생성이 완료되기 전에 끝났으므로 요청 기록을 확인하고 15초로 맞췄다. 제품 연결 코드는 바꾸지 않았다.
- 기존 server/shared, reward, practice, network, reward-service **37파일 SHA-256 동일**. 보상 자격 3%와 20킬 제한, RunResult, 중복 지급, 재등장/BOT 규칙은 변경하지 않았다.

신규 검증은 실제 IndexedDB에서 기존 프로필 복원, Coins 부족, 중복 구매, 구매·장착 저장 실패, 마이그레이션 저장 실패, 새로고침 복원, 잘못된 장착 필드 복구, 저장소 접근 차단/복구, 탭 간 동시 구매 및 보상 지급을 확인한다. Practice R56/16에서는 본체의 장착 색상과 슬롯 식별 링, 모든 BOT의 기본 외형을 검사한다. 두 실제 온라인 클라이언트에서는 내 장착 외형이 다른 클라이언트에 공유되지 않으며 서버 participant에 Inventory가 없는 것을 확인한다.

모바일 접속 주소 http://192.168.137.1:3003에서 HTTP 200, healthz 정상, 실제 WebSocket/session:ready protocol 5 연결을 확인했다. 이 LAN origin에서도 844×390 터치 브라우저로 상점 열기·Basic 4종·Coins 부족·기본 장착 복원·16명 Practice를 확인했고 pageerror는 0이었다. 현재 핫스팟 기기 1대가 연결된 상태에서 서버를 켜두었다. 실제 휴대폰의 물리 터치와 색상 가독성은 자동화 브라우저 검사와 구분한다. 실기기 최종 느낌은 후속 사용자 확인이 필요하다. XP/Level, 최종 이미지, 애니메이션, 업적/미션, 클라우드 계정, 광고/결제는 구현하지 않았다.

## 화면 자료

- [Basic 구매·장착 가로 화면](../evidence/shop-v1-basic-landscape.png)
- [Marker Color 가로 화면](../evidence/shop-v1-color-landscape.png)
- [Placeholder 카테고리](../evidence/shop-v1-placeholder-landscape.png)
- [장착 외형이 적용된 Practice](../evidence/shop-v1-equipped-gameplay.png)
- [내 화면에만 장착 외형이 적용된 온라인](../evidence/shop-v1-local-only-online.png)
- [실제 모바일 접속 주소의 상점 화면](../evidence/shop-v1-mobile-address.png)
