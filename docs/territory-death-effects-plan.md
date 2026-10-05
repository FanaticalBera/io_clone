# Territory death effects V1 — 승인 반영 사양

기준: 2026-10-05 HEAD 2634de2 (맵 관련 업데이트). Downloads/effect.md를 검토한 뒤 사용자가 승인한 네 보완사항을 우선 반영한다. 원본 첨부 파일은 수정하지 않는다.

## 현재 gameplay 우선

Ground(0) < Death Territory Collapse Overlay(0.5) < Current Territory / Trail(1) < Predicted trail(3) < Player(5) / Combat(8 이상).

계층 분리와 별개로 overlay 대상 칸은 현재 owner=0 AND trailMasks=0일 때만 그린다. 새 영토 또는 선이 확인된 칸은 그 효과에서 영구 제외하며 다시 중립이 되더라도 과거 overlay를 부활시키지 않는다. 실제 owners/trails, minimap, 순위는 실제 상태를 따른다. 사망·점령·중립화·respawn 판정과 서버 protocol/payload는 바꾸지 않는다.

## 사망 위치와 전파 원점

기존 CombatEffects burst/label/flash는 event.position(피해자 머리의 사망 위치)을 계속 사용한다. 영토 전파는 유효한 deathContext.cellId(절단/사망 trigger cell), event.position의 유효한 worldCell, 같은 lifeId의 이전에 확인된 victim cell 순서로 원점을 고른다. 어느 정보도 유효하지 않으면 연출을 생략한다. 전파 원점이 영토 밖이어도 정상이다. 새 origin pulse는 추가하지 않는다.

## V1의 정보 한계

대상은 마지막으로 client가 확인한 victim owner가 다음 확인 상태에서 neutral로 바뀐 부분이다. lastOwners는 서버의 정확한 사망 직전 board가 아니다. snapshot 사이 capture/prune/neutralization 때문에 누락되거나 별도 중립화가 포함될 수 있다. 누락된 칸을 추측/재구성하지 않고 death event에 전체 cell 목록을 넣지 않는다. 확인된 DEATH만 사용하며 단순 owner 변경은 사망으로 간주하지 않는다.

## 비교안과 기본값

| 환경 / 안 | 동작 |
|---|---|
| Production | NONE. 모든 experimentTerritoryEffect 옵션 무시 |
| Development/Test Wave | hex-distance 전파 최대 420ms + cell fade 180ms = 최대 600ms |
| Development/Test Power | 전체 밝기 pulse 100ms, deterministic stagger 0–100ms + fade 340ms = 최대 440ms |
| Development/Test Edge | 알려진 붕괴 cell 집합의 boundary BFS 최대 460ms + fade 180ms = 최대 640ms |

Wave/Edge는 짧게 밝아지고 alpha 감소와 scale 1 → 0.88을 적용한다. Power는 밝기 pulse 후 채도/alpha를 낮춘다. 임의의 animation random, 화면 전체의 새 flash, 새 camera shake, sound, cosmetic/capture-transfer 시스템은 추가하지 않는다. 최종 채택은 사용자 시각 비교 후 결정한다.

## 구현과 예산

TerritoryEffectModel은 순수 presentation 데이터/원점/전파/deduplication을 맡고 TerritoryEffects는 scene 렌더링/lifecycle을 맡는다. 호출자가 색을 전달한다. effect마다 MatchView를 복사하지 않는다.

활성 효과 상한은 4개다. 초과하면 가장 오래된 영토 효과를 끝내며 기존 CombatEffects는 모든 DEATH에 대해 기존대로 동작한다. effect당 particle 0, Tween 0, Timer 0. cell별 GameObject/Emitter/Tween/Timer 금지.

enabled map 초기화 때 청크마다 Graphics 하나를 미리 만들고 재사용한다(R56 51개). camera + 1청크 margin 안의 affected chunk/cell만 그린다. 전파/BFS는 시작 시 한 번 계산한다. render tick에서 전체 9,577칸을 재검사하지 않는다. redraw는 약 30Hz로 제한하며 새로운 snapshot을 반영할 때 갱신할 수 있다. NONE은 pool을 만들지 않고 board scan 없이 돌아온다. world-sized texture나 chunk 경계 진입에 따른 새 resource 생성 금지.

종료 시 활성 목록과 Graphics 명령을 비운다. pool은 enabled scene에서 재사용하며 NONE 전환/map 교체/scene 종료 때 해제한다. eventId로 중복 재생을 막고 initial/reconnect/reset/match 변경에서는 과거 효과를 재생하지 않는다.

## 비교 및 검증

tests/fixtures/territory-effects.html: 동일 R56/16, seed 4, slot 15, 구멍/비대칭을 포함한 같은 cell 집합과 외부 trigger origin. Small 50 / Medium 250 / Large 1,000, Wave / Power / Edge, Replay 제공. Production에는 fixture/UI를 제공하지 않는다.

실제 practice는 experimentMapRadius=56&experimentSlots=16&experimentSeed=4와 experimentTerritoryEffect=wave|power|edge로 비교한다. browser storage에 저장하지 않는다. 기존 PC 핫스팟 주소 192.168.137.1:3003에서 fixture와 practice를 사용한다.

확인 항목: 즉시 gameplay neutralization, owner/trail filtering 및 영구 취소, origin/head 분리, slot 15, 동시 사망, reset/reconnect/eventId deduplication, disabled baseline, 큰 territory, 청크 경계, 각 안 100회 완료 재생 후 objects/Graphics/emitters/timers/tweens/listeners/textures, 실제 PracticeSession stress, 50/250/1,000칸 frame mean/p95/p99/>50ms 및 prepare/update/실제 redraw cost/heap.

각 안 Medium의 0/200/400/700ms screenshot sequence와 docs/territory-death-effects-results.md를 남긴다. 자동 headless 결과와 실제 Android 성능/조작감/미관 판단을 구분한다. 모바일 검증 없이 production 최종안을 활성화하지 않는다.