# 판매용 Marker 후보와 적용 방향 · 승인 전 설계

이 문서는 **승인 당시 설계 기록**이다. 아래 분석은 적용 전 코드를 기준으로 한다. 사용자의 상점 적용 요청 후 11개 연결을 진행했으며 현재 상태와 검증은 integration-results.md에 기록한다. 승인 당시에는 게임 렌더러, 실제 Catalog, Shop/Inventory/Profile, 가격 및 보상 규칙에는 변경을 적용하지 않았다. 시안은 docs/marker-design-v1에만 저장했고 운영 Asset 디렉터리에는 넣지 않았다.

## 현재 구현 분석

- src/client/player-marker.ts의 IMAGE 경로는 단일 이미지에 setDisplaySize(42,42)와 setTint(bodyColor)를 적용한다. 따라서 원본의 눈·윤곽·흰 반사·금속색도 함께 tint된다. 단색 문양에는 충분하지만 이번 다색 캐릭터에는 부적합하다.
- src/client/marker-art.ts는 Basic의 기하학과 로컬 슬롯 링을 만든다. Default/Ring/Hex/Target은 그대로 유지하는 것이 맞다.
- src/client/catalog.ts는 안정적인 상품 ID와 renderType/assetKey를 가진다. 구매·장착은 ID를 저장하므로 외형 교체를 위해 경제나 프로필 구조를 바꿀 이유가 없다.
- src/client/shop-ui.ts의 미리보기는 현재 markerPreview의 SVG 경로다. IMAGE용 미리보기도 승인 후 같은 Base/Detail 정의를 쓰게 확장해야 하며 구매·장착 로직은 그대로 둔다.
- src/client/game-scene.ts는 로컬 selfId에만 MarkerAppearance를 적용하고 나머지는 기본 외형으로 그린다. 이 범위를 유지한다.

## 실측 크기와 판정

2026-10-06 테스트 브라우저에서 현재 게임의 R56/16 Practice를 실행하고 844×390, DPR 3을 측정했다.

| 항목 | 현재 값 |
| --- | --- |
| gameplayZoom | 0.38 |
| IMAGE 전체 프레임 | 42×42 world units → 15.96×15.96 CSS px |
| Default 흰 stroke 포함 | 47 world units → 17.86 CSS px |
| 슬롯 링 radius / stroke | 25.5 / 2 world units |
| 슬롯 링 바깥 지름 | 53 world units → 20.14 CSS px |
| 링 선 두께 | 0.76 CSS px |
| 캔버스 backing | 2532×1170 |
| 600 CSS px 미만 코드 배율 | 0.35 → IMAGE 프레임 14.7 CSS px |

DPR 3은 선명도를 높이며 CSS 상의 크기를 늘리지 않는다. 640×320 가로 화면도 현재 코드에서는 0.38배다. 큰 시안에 보이는 홈·눈 반짝임·금속 면이 작은 화면에서도 전부 읽힐 것이라고 기대하면 안 된다.

게임 판정은 Marker PNG의 모양이나 원형 hitbox를 쓰지 않는다. 머리 위치와 cell 진입·trail 상태를 사용한다. radius 21은 **기존 표시 본체의 기준**이며 물리 충돌 반경이라고 설명하지 않는다. 새 외형은 이 표시 범위 안에 짧은 귀·왕관·포드를 담아 판정 범위가 커 보이지 않게 한다. 외부 날개, 긴 꼬리, 떠다니는 후광은 넣지 않는다.

## 공통 디자인 규칙

서로 다른 앱 아이콘보다 **작은 플레이어 캐릭터 제품군**으로 보이게 한다. 같은 굵은 윤곽·큰 얼굴 면·두 단계 정도의 음영을 공유하고, 카테고리와 각 상품은 외곽 형태와 큰 구조로 구분한다.

- 본체의 넓은 재질 부분을 Marker Color 영역으로 확보한다. 눈/바이저, 큰 밝은 면, 금속 등은 고정색이다.
- 한두 개의 핵심 특징과 실루엣을 먼저 읽히게 한다. 16px 기준으로 1px 미만으로 줄어드는 장식은 최종 제작에서 삭제하거나 합친다.
- Coral 한 색으로 12개를 비교했다. 색이 달라서 구분되는 착시를 피하고 외형을 평가한다.
- 슬롯 색상은 외부 링에서 계속 표시한다. Special의 내부 대각선 띠는 소재 장식이고 원형 슬롯 링과 구분한다.
- 작은 화면의 역할은 캐릭터 종류를 빠르게 구분하는 것이다. 세밀한 표정·재질의 매력은 상점 확대 미리보기에서 보완한다. 마커를 무리하게 키워서 디테일을 살리지 않는다.

## 현재 후보 11개

사용자가 달 같이 생긴 후보를 제외 대상으로 지정하여 F3 초승달 정령(moon)을 제외했다. F2 꼬마 유령(ghost)은 유지하며 Fantasy는 현재 F1/F2 두 후보다. 대체 디자인은 아직 만들지 않았다. 제외 기록은 excluded-candidates.json에 보존하고 실제 비교 목록과 현재 시트에서는 제거했다.

| 코드 | 카테고리 / ID | 이름 | 작은 화면에서 구분되는 특징 | 최종 제작 때 정리할 부분 |
| --- | --- | --- | --- | --- |
| C1 | CUTE / cat | 말랑냥 | 짧은 삼각 귀와 넓은 얼굴 | 입·코 한 덩어리, 콧수염 없음 |
| C2 | CUTE / chick | 콩병아리 | 물방울 머리·짧은 볏·큰 부리 | 볼 반짝임과 얇은 눈썹 줄이기 |
| C3 | CUTE / slime | 젤리팡 | 낮고 넓은 돔·한쪽 방울 돌기 | 눈 반짝임 통합, 작은 입 생략 가능 |
| F1 | FANTASY / crystal | 루미 크리스탈 | 위아래 꼭짓점·큰 보석 면·눈창 | 큰 면 3개 이하, 작은 굴절선 없음 |
| F2 | FANTASY / ghost | 꼬마 유령 | 후드와 세 갈래 밑단 | 후드 말림 단순화, 얼굴 면 확대 |
| T1 | TECH / core | 캡슐 코어 | 각진 하우징과 넓은 검은 바이저 | 작은 환기 홈·측면 장식 통합 |
| T2 | TECH / radar | 접시 레이더 | 수평 접시와 위쪽 돔 | 작은 하단 램프 통합 |
| T3 | TECH / drone | 포켓 드론 | 짧은 네 방향 포드 | 포드 간 틈 최소화, 중심 코어 크게 |
| S1 | SPECIAL / orbit | 궤도 정령 | 원형 코어를 가로지르는 대각선 띠 | 팔·발·리벳 제거한 draft02 사용 |
| S2 | SPECIAL / crown | 왕관 수호자 | 왕관 세 끝과 방패형 얼굴 | 측면 갑옷 제거한 draft02 사용, 끝 길이 추가 점검 |
| S3 | SPECIAL / ember | 불씨 정령 | 한쪽으로 휘는 불꽃 끝 | 팔·발·잔불 제거한 draft02 사용 |

첫 대표 방향으로 **C1 / F1 / T1 / S1**을 추천한다. 나머지도 각 카테고리의 확장 후보로 유지한다. T3는 16px에서 중심이 작아지므로 특히 정리가 필요하다. 생성된 이미지를 그대로 최종 판매 Asset으로 쓰는 것은 추천하지 않는다.

cat / slime / crystal / core / orbit는 기존 placeholder ID를 유지할 수 있다. 기존 구매/보유/장착을 유지한 채 시각 정의만 교체한다. 나머지 ID는 새 상품으로 추가하면 된다. 이번에는 실제 Catalog에 새 상품을 등록하거나 기존 상품을 교체하지 않았다.

## 최소 렌더러 확장안

복잡한 shader, 실시간 색상 추출 mask, cell GameObject, animation 시스템은 필요하지 않다. 선택한 마커에 정렬된 투명 PNG 두 장을 사용한다.

1. **Base:** 흰색/중성 회색 명암의 본체 재질. 기존 Marker Color를 이 레이어에만 tint한다.
2. **Detail:** 눈·입·고정 윤곽·큰 밝은 면·금속 디테일을 담은 RGBA. tint하지 않는다.
3. **Slot Ring:** 현재 Graphics의 radius 25.5 / stroke 2를 두 이미지 위에 유지한다.

Catalog의 기존 renderType: IMAGE와 assetKey를 Base로 재사용하고, **선택적 detailAssetKey 하나**를 더하는 방식이 가장 작다. detail이 없으면 기존 IMAGE 동작을 유지한다. Base/Detail은 같은 프레임 크기·origin·정렬을 쓰고 PlayerMarker에서 같은 위치와 크기로 재사용한다. 생명·영토·trail·충돌·네트워크는 이미지 정보를 읽지 않는다.

Shop 미리보기는 같은 asset 정의를 Canvas로 합성한다. Base의 RGB에 선택 색상의 RGB를 곱하되 원래 alpha와 회색 명암을 보존하고 Detail은 그 위에 원본 색상으로 그린다. 색상/외형 변경 때 계산해 캐시하고 매 프레임 처리하지 않는다. 단순 CSS alpha mask로 채우면 회색 명암이 사라져 Phaser tint와 달라지므로 그 방식은 피한다. 현재 SVG Basic 미리보기는 그대로 둔다. PNG 프레임과 asset metadata를 공유하며 새로운 GPU shader나 저장 구조는 필요하지 않다.

최종 원본은 충분히 큰 해상도로 제작하되, 256×256 정도의 정렬된 Base/Detail로 내보내는 방향이 적절하다. 완성 프레임 안의 색칠 영역을 기존 42×42 표시 영역에 맞춰 정규화해야 한다. 현재 생성 PNG의 여백을 그대로 setDisplaySize(42,42)로 줄이면 본체가 더 작아지므로 그대로 연결하지 않는다. 새로운 renderer 크기나 상품별 scale을 무작정 늘리지 않는다.

선택된 로컬 마커에만 두 Image를 쓰므로 기존 대비 Image 하나가 추가된다. 매 프레임 새 texture나 mask를 만들지 않고 외형 변경 때만 갱신한다. 수십 개 전체 상품을 매치에서 미리 켜놓지 않는다. 40개 확장 시 atlas/lazy loading은 실제 측정 뒤 필요할 때 검토한다.

이 레이어 분리와 미리보기 확장은 **제안**이며 아직 코드에 적용하거나 Base/Detail 최종 Asset을 제작하지 않았다.

## 비교 자료와 검증

- preview.html: 활성 11개 후보, 카테고리 선택, 실제 크기 배율, 슬롯 0/3/4/15, 실루엣/본체 제한 표시.
- overview.png 및 카테고리별 comparison.png: 확대 모습과 실제 크기 비교.
- silhouettes.png: 색과 얼굴을 제거한 외곽 형태 비교.
- current-game-844x390.png: 현재 게임의 실제 마커 화면.
- board-844x390.png / game-size-example.png: 실제 게임 캡처와 시안을 겹친 **승인용 비교 화면**. 렌더러에 연결된 실행 화면이 아니다.
- runtime-measurements.json: 실제 게임 배율·DPR·R56/16 실측.
- preview-measurements.json: 활성 11개 PNG 투명도와 정규화 후 본체 크기.
- color-direction.json / color-direction.png: 본체만 Violet로 바꾸고 눈·밝은 면·슬롯 링을 유지하는 색상 방향 시안. 별도 생성한 PNG이며 레이어 renderer 검증은 아니다.
- generation-prompts.json / refinement-prompts.json: built-in imagegen으로 생성한 원래 프롬프트와 세 후보 정리 프롬프트.

비교 페이지는 PNG를 수정하지 않고 브라우저에서 투명 영역을 조사해 중심과 외곽을 구한 뒤 radius 21 표시 기준에 맞춰 그린다. 이는 최종 exporter의 정규화를 미리 시뮬레이션한 것이며 현재 단일 IMAGE 경로가 이미 이런 처리를 한다는 뜻이 아니다. 원본을 그대로 넣을 때보다 최종 목표 크기에 가까운 비교다.

844×390 및 640×320 비교에서 실제 작은 canvas는 CSS 40×40으로 유지되고 그 안의 본체는 최대 약 16px, 링은 약 20px다. UI가 작은 canvas를 다시 확대/축소하지 않는 것을 자동 검사했다. 568 폭 선택은 코드의 0.35배를 반영하며 실제 해당 기기의 물리 화면 검사는 아니다. 활성 11개 후보와 색상 변형 시안 모두 실제 alpha 채널을 가지고 있고 pageerror 0을 확인했다.

제품 코드 변경이 없으므로 기존 전체 테스트/build를 다시 돌리지는 않았다. 이번 검증은 실제 화면 배율과 승인용 비교 페이지를 대상으로 한다. 기존 저장 데이터와 실제 가격·상품·장착 상태에는 손대지 않았다.

## 승인 뒤 작업 순서

사용자가 카테고리 방향과 후보를 확인하면 해당 후보의 미세 디테일 정리 → Base/Detail 제작 → 공통 프레임 정규화 → 최소 renderer/Shop 미리보기 연결 → 모든 Marker Color와 슬롯 15 배경·저장 복원·기존 Basic 회귀 확인 순서로 진행한다. 최종 가격, XP/Level, 봇/닉네임 랜덤화는 별도 범위다.

현재 단계는 여기에서 멈춘다. 사용자 디자인 확인 전 최종 Asset 적용은 진행하지 않는다.
