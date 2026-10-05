# Territory death effects V1 — 2026-10-05

> 이후 사용자 최종 선택으로 사망 효과의 운영 기본값은 WAVE_COLLAPSE로 변경했다. 이 문서의 NONE은 최초 비교 단계의 기록이다. 현재 변경은 [Capture V1 결과](capture-effect-v1-results.md)를 참고한다.

기준 HEAD `2634de2` (맵 관련 업데이트), 작업 시작 시 tracked 변경 없음. effect.md와 사용자가 승인한 보완사항을 [최종 사양](territory-death-effects-plan.md)에 반영했다. 원본 첨부 파일은 수정하지 않았다.

**세 안을 개발 화면과 실제 R56/16 practice에서 비교할 수 있다. Production default는 NONE이다.** 사용자 시각 비교 전에는 운영 효과를 활성화하지 않는다. Android 실제 성능/미관 승인은 아직 하지 않았다.

## 기존 경로와 상태 분리

기존 GameScene.setView → drawView는 authoritative owners/trails로 territory Graphics를 다시 그리고 lastOwners/lastTrails를 덮어썼다. CombatEffects는 별도로 확인된 DEATH event를 재생했다. 새 효과는 lastOwners가 덮어써지기 직전에 이전/현재 owner 차이를 읽어 별도의 순수 모델로 전달한다.

TerritoryEffectModel은 원점·대상·지연·eventId 중복 방지를, TerritoryEffects는 청크 Graphics pool·카메라 culling·수명 정리를 맡는다. 실제 owners, Uint16 trailMasks, participant, event는 수정하지 않는다. shared engine/life/territory/capture/spawn/movement와 server/protocol 소스 변경은 0이다. 실제 markDead의 즉시 중립화를 fixture와 단위 검사에서 확인했다.

V1은 마지막으로 client가 확인한 victim owner → 다음 확인 상태의 neutral 변화만 표현한다. 정확한 서버 사망 직전 영토를 보장하지 않는다. snapshot 사이 capture/prune/neutralization으로 누락되거나 다른 중립화가 포함될 수 있다. 확인하지 못한 territory를 재구성하지 않고 payload를 확대하지 않았다. DEATH가 없는 단순 owner 변화에는 효과를 만들지 않는다.

## 현재 gameplay 정보 우선

| 층 | Depth |
|---|---|
| Ground | 0 |
| Death collapse overlay | 0.5 |
| Current territory / trail | 1 |
| Predicted trail | 3 |
| Player | 5 |
| 기존 CombatEffects | 8 이상 |

계층 분리와 함께 current owner=0 AND trailMasks=0인 칸만 그린다. 새 영토나 선이 확인된 칸은 해당 효과에서 영구 취소하며 다시 중립이 되어도 부활시키지 않는다. 이전 victim → attacker transfer와 이전 다른 owner → neutral 변화는 포함하지 않는다. 현재 미니맵·순위는 실제 상태를 따른다. 미니맵의 기존 250ms 갱신 주기는 유지하며 overlay를 넣지 않았다.

## 머리 위치 / 전파 원점

CombatEffects 파일은 변경하지 않았다. 기존 burst/label/flash는 event.position(피해자 머리 위치)을 계속 사용한다. Collapse는 유효한 deathContext.cellId(절단/trigger cell) → 유효한 event.position의 worldCell → 같은 lifeId의 마지막 known victim cell 순서로 fallback한다. 원점이 영토 밖이어도 작동하며 정보가 없으면 생략한다. 새 origin pulse/전체 화면 flash/camera shake/particle/sound는 추가하지 않았다.

브라우저 fixture의 victim 머리는 (24,0), collapse trigger는 영토에 포함되지 않는 (0,0)이다. 두 위치가 다른 상태에서 Combat burst는 머리 위치, wave origin은 trigger cell인 것을 확인했다.

## 세 안과 duration

| 안 | 방식 | 최대 duration |
|---|---|---|
| WAVE_COLLAPSE | hex-distance / max distance로 지연 정규화, 전파 420ms + cell fade 180ms | 600ms |
| POWER_DOWN | 전체 100ms 밝기 pulse + cell ID 기반 deterministic 0–100ms stagger + fade 340ms | 440ms |
| EDGE_CRUMBLE | 알려진 붕괴 cell 집합의 경계에서 BFS, 전파 460ms + fade 180ms | 640ms |

Wave/Edge는 각 cell이 잠깐 밝아지고 alpha가 내려가며 scale 1 → 0.88로 작아진다. Power는 전체 밝기 pulse 후 색을 낮은 채도의 회색 쪽으로 이동시키면서 alpha를 낮춘다. 같은 cell set/원점에는 같은 pattern이 나온다. RNG나 칸별 Tween을 사용하지 않는다. Edge 경계는 V1에서 확인 가능한 붕괴 집합의 외부·구멍·비대칭을 따른다.

## 배치, 예산, 수명

R56 enabled scene은 map 초기화 때 기존 16-cell axial chunk당 Graphics 하나, 총 51개를 만든다. effect마다 GameObject를 만들지 않고 여러 효과가 같은 pool을 공유한다. world-sized texture와 effect texture는 없다. 카메라 이동이나 청크 경계 진입에서 resource를 새로 만들지 않는다. 카메라 + 1청크 margin 내 affected cells만 그리며 target을 chunk별로 미리 index한다.

전파/BFS는 시작 시 한 번 계산한다. DEATH batch가 있을 때만 이전 board를 한 번 순회하고 render tick에서는 전체 9,577칸을 검사하지 않는다. redraw는 약 30Hz로 제한하되 새 snapshot은 반영한다. 색은 호출자 metadata로 전달하고 효과에는 eventId/slot/color/origin/time/style 및 affected cell/delay/cancel flag만 저장한다. MatchView 전체 복사본을 저장하지 않는다.

활성 territory 효과 최대 4개. 초과하면 가장 오래된 territory 효과를 끝낸다. 기존 CombatEffects는 모든 DEATH를 계속 처리한다. 2개 동시 사망과 6개 사망의 상한/순서 검사를 통과했다. effect particle/Emitter 0, Tween 0, Timer 0. slot 15(owner 16)도 같은 경로와 palette를 사용한다.

효과 종료 시 active list와 Graphics 명령을 비우고 숨긴다. 51개 pool은 enabled scene에서 재사용한다. NONE 전환/map 교체/scene 종료 때 파괴한다. NONE은 Graphics pool 0개이며 accept/update에서 board scan 없이 반환한다. 두 lifecycle 이벤트의 destroy는 중복 호출에 안전하다.

CombatEvents와 동일한 확인된 eventId cursor를 사용한다. 초기 입장, match 변경, practice/scene reset, reconnect reset에서 과거 사망을 재생하지 않는다. 오래된 snapshot/만료된 event도 무시한다.

## AUTOMATED 성능 조건

Windows / Node 24.21.0 / headless Chromium 1280×720. Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36. Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver); MAX_TEXTURE_SIZE=8192. **Software GPU 결과이며 실제 Android 또는 물리 PC GPU 결과가 아니다.**

R56/16의 controlled fixture에서 50/250/1,000칸, 동일한 구멍/비대칭/외부 origin을 사용했다. 각 3.4초 window는 최초 사망 + 800ms 간격 4회 replay다. overview camera로 전체 대상이 보이도록 프레이밍했다. 일반 게임의 camera framing과 다르다. frame 시간은 idle 간격도 포함한다. 다른 simulation audit와 병렬 실행하지 않았다.

prepare는 batch 모델 준비 비용 5표본, update는 render update JavaScript 시간, redraw는 counter가 변경된 프레임의 마지막 실제 Graphics 명령 생성 시간이다. 계측/관찰 비용과 browser scheduling 변동이 있다. GPU tessellation/draw 전체는 JS 비용에 포함되지 않으며 전체 frame 시간에 반영된다.

| 안 / cells | Frame mean / p95 / p99(ms) | >50ms / frames | Update mean / p95 / p99(ms) | Redraw mean / p95 / p99(ms) | Prepare mean / max(ms) | Peak drawn cells / chunks |
|---|---|---|---|---|---|---|
| WAVE_COLLAPSE/50 | 32.85 / 33.50 / 50.00 | 1 / 104 | 0.04 / 0.20 / 0.20 | 0.09 / 0.20 / 0.30 | 0.22 / 0.30 | 50 / 1 |
| WAVE_COLLAPSE/250 | 36.92 / 50.10 / 66.70 | 5 / 93 | 0.10 / 0.40 / 0.60 | 0.14 / 0.40 / 0.60 | 0.22 / 0.40 | 250 / 6 |
| WAVE_COLLAPSE/1000 | 44.96 / 50.10 / 66.70 | 8 / 76 | 0.25 / 0.70 / 1.30 | 0.36 / 0.80 / 1.30 | 0.06 / 0.20 | 1000 / 9 |
| POWER_DOWN/50 | 32.85 / 33.50 / 50.10 | 2 / 104 | 0.05 / 0.20 / 0.30 | 0.10 / 0.20 / 0.30 | 0.20 / 0.30 | 50 / 1 |
| POWER_DOWN/250 | 36.52 / 50.00 / 50.10 | 3 / 94 | 0.10 / 0.40 / 0.70 | 0.19 / 0.40 / 0.70 | 0.26 / 0.60 | 250 / 6 |
| POWER_DOWN/1000 | 43.80 / 50.10 / 66.60 | 16 / 78 | 0.24 / 0.90 / 1.70 | 0.52 / 1.00 / 1.70 | 0.12 / 0.20 | 1000 / 9 |
| EDGE_CRUMBLE/50 | 32.70 / 33.50 / 50.00 | 1 / 105 | 0.04 / 0.20 / 0.20 | 0.07 / 0.20 / 0.30 | 0.24 / 0.30 | 50 / 1 |
| EDGE_CRUMBLE/250 | 36.35 / 50.10 / 66.70 | 6 / 94 | 0.09 / 0.40 / 0.60 | 0.13 / 0.40 / 0.60 | 0.34 / 0.60 | 250 / 6 |
| EDGE_CRUMBLE/1000 | 44.02 / 66.70 / 66.70 | 11 / 78 | 0.22 / 0.60 / 0.90 | 0.30 / 0.70 / 0.90 | 0.64 / 0.90 | 1000 / 9 |

모든 경우 allocated effect Graphics는 51개, effect texture/particles/tweens/timers는 0이다. 1,000칸에서도 시작 CPU가 이번 표본에서 큰 spike를 만들지 않아 Edge를 후보에서 제외하지 않았다. 셋 중 하나의 모바일 성능 우위를 확정한 결과는 아니다. Software GPU에서는 큰 장면의 frame 시간이 증가했으며 Android FPS·발열·가독성은 직접 비교해야 한다.

| 안 / cells | Heap before / after(MiB) |
|---|---|
| WAVE_COLLAPSE/50 | 68.86 / 68.86 |
| WAVE_COLLAPSE/250 | 68.86 / 68.86 |
| WAVE_COLLAPSE/1000 | 68.86 / 68.86 |
| POWER_DOWN/50 | 68.86 / 68.86 |
| POWER_DOWN/250 | 68.86 / 68.86 |
| POWER_DOWN/1000 | 68.86 / 68.86 |
| EDGE_CRUMBLE/50 | 68.86 / 68.86 |
| EDGE_CRUMBLE/250 | 68.86 / 68.86 |
| EDGE_CRUMBLE/1000 | 68.86 / 68.86 |

performance.memory는 거칠게 반올림된 Chrome 값이며 GC를 강제하지 않았다. 표의 같은 값은 정밀한 heap leak 부재의 증명이 아니다. resource 수·pool 안정성 검사를 별도로 사용한다.

## 각 안 100회 완료 replay

| 안 | Objects before / after | 전체 Graphics | Effect pool / active 종료 | Listeners | Timers / Tween / Emitter | Heap before / after(MiB) |
|---|---|---|---|---|---|---|
| WAVE_COLLAPSE | 177 / 177 | 106 / 106 | 51 / 0 | 53 / 53 | 0 / 0 / 0 | 73.05 / 73.05 |
| POWER_DOWN | 177 / 177 | 106 / 106 | 51 / 0 | 53 / 53 | 0 / 0 / 0 | 73.05 / 73.05 |
| EDGE_CRUMBLE | 177 / 177 | 106 / 106 | 51 / 0 | 53 / 53 | 0 / 0 / 0 | 73.05 / 73.05 |

각 안의 100회 중 10회는 동시 사망도 포함했다. 같은 완료 상태끼리 비교해 objects/Graphics/listeners/timers/tweens/emitters/textures가 증가하지 않았고 visible effect Graphics와 active effects는 0이다. 각 effect 끝에는 명령을 비우고 pool을 재사용한다. destroy 후 pool과 active도 0이다. 실제 duration의 100회 실시간 장기 soak를 한 것은 아니며 fixture에서 각 cycle을 끝까지 진행시킨 allocation/lifecycle 검사다.

## 실제 R56/16 practice stress

| 안 | 강제 confirmed death slots | 직후 active / cells | camera 이동 중 pool |
|---|---|---|---|
| WAVE_COLLAPSE | 3,8,15 | 3 / 99 | 51 |
| POWER_DOWN | 3,8,15 | 3 / 99 | 51 |
| EDGE_CRUMBLE | 3,8,15 | 3 / 99 | 51 |

일반 PracticeSession 1 HUMAN + 15 BOT을 90tick 이상 진행하고 shared markDead로 slot 3/8/15의 confirmed death를 의도적으로 주입한 뒤 일반 simulation을 재개했다. territory update/BOT simulation/카메라 이동과 효과가 겹친다. 사람이 실제로 동시에 세 상대를 처치한 기록이라고 해석하지 않는다. console/page errors 0. 게임 state 변경을 위한 접근은 test mode hook 및 fixture에만 있다. development 사용자 practice는 자연 gameplay를 그대로 사용한다.

## 검사 결과

| Check | 결과 |
|---|---|
| 전체 Vitest | 64 files / 322 tests PASS |
| 신규 territory browser | 13개 고유 검사 PASS (최종 12개 + 모바일 레이아웃 검사) |
| 기존 browser 회귀 (네 실행의 고유 검사) | 64 PASS / 1 SKIP / 0 FAIL |
| TypeScript client/server/tests + production build | PASS |
| Source scope | client presentation + test/fixture/docs만; shared/server/protocol 변경 0 |
| Production | NONE; wave/power/edge query 무시, development fixture 요청 404 |
| Android 실기기 / 최종 미관 | MANUAL REQUIRED |

기존 browser 회귀는 기존 설정을 가져와 live 개발 서버를 재사용하고 테스트 서버 cwd를 프로젝트 root로 지정하고 기존 map-experiment 검사가 요구하는 별도 production 서버 3004를 추가한 임시 config로 실행했다. 최초 실행은 23개 통과 후 3004 미실행으로 중단됐고, 준비를 바로잡아 43개를 검사했다. 그 실행의 21개 통과 뒤 5312 전용 proxy가 필요한 항목에서 중단돼 남은 13개 및 전용 절단 8개를 따로 실행했다. 중복된 map-experiment 1개를 제외한 고유 검사 합계는 65개다. 이어서 5312 전용 서버를 사용하는 pruned-home-head 검사는 전용 Vite proxy로 분리했다. 원본 네 JSON의 spec ID로 최신 결과를 합산했다. T36은 사용 가능한 private IPv4 인터페이스가 없어 원래 조건에 따라 SKIP되었다. trace는 off, worker는 1이다. 기존 test assertion은 수정하지 않았다. 최초 fixture 실행의 inactive participant trail 및 서로 다른 단계의 texture 비교를 수정했다. 초기 메뉴 준비 timeout 1회도 있었고 원인을 확정하지 않았으며 최종 전체 12개 재실행은 통과했다. Vite의 기존 >500kB bundle 경고는 유지한다.

## Screenshot sequence — Medium 250

각 sequence는 같은 seed/cells/원점/overview의 0, 200, 400, 700ms다. 시간 고정은 fixture wrapper로만 수행하고 production code clock을 바꾸지 않았다.

### WAVE_COLLAPSE

| 0ms | 200ms | 400ms | End 700ms |
|---|---|---|---|
| ![WAVE_COLLAPSE-0.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/WAVE_COLLAPSE-0.png>) | ![WAVE_COLLAPSE-200.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/WAVE_COLLAPSE-200.png>) | ![WAVE_COLLAPSE-400.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/WAVE_COLLAPSE-400.png>) | ![WAVE_COLLAPSE-700.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/WAVE_COLLAPSE-700.png>) |

### POWER_DOWN

| 0ms | 200ms | 400ms | End 700ms |
|---|---|---|---|
| ![POWER_DOWN-0.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/POWER_DOWN-0.png>) | ![POWER_DOWN-200.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/POWER_DOWN-200.png>) | ![POWER_DOWN-400.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/POWER_DOWN-400.png>) | ![POWER_DOWN-700.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/POWER_DOWN-700.png>) |

### EDGE_CRUMBLE

| 0ms | 200ms | 400ms | End 700ms |
|---|---|---|---|
| ![EDGE_CRUMBLE-0.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/EDGE_CRUMBLE-0.png>) | ![EDGE_CRUMBLE-200.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/EDGE_CRUMBLE-200.png>) | ![EDGE_CRUMBLE-400.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/EDGE_CRUMBLE-400.png>) | ![EDGE_CRUMBLE-700.png](<C:/Users/Home Bsw/Desktop/sixio_clone/.local/territory-effects/EDGE_CRUMBLE-700.png>) |

## 모바일 수동 비교

[PC 핫스팟의 비교 화면](http://192.168.137.1:3003/tests/fixtures/territory-effects.html). 393×852 / 852×393 자동 viewport에서 선택 버튼·Replay·field·footer·minimap이 화면 안에 있는 것을 검사했다. 실제 S24 성능 검사를 대신하지 않는다. 휴대폰을 PC 핫스팟에 연결해 연다. Small / Medium / Large를 고르고 Wave / Power Down / Edge Crumble 또는 다시 재생을 누른다. 페이지 아래 링크는 실제 R56/16 봇 연습으로 이어진다.

- [Wave practice](http://192.168.137.1:3003/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentTerritoryEffect=wave&metrics=1)
- [Power practice](http://192.168.137.1:3003/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentTerritoryEffect=power&metrics=1)
- [Edge practice](http://192.168.137.1:3003/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentTerritoryEffect=edge&metrics=1)

링크에서 봇 연습을 누른다. 프레임 정보는 metrics=1로 확인할 수 있다. Wave의 파괴 전파가 지나치게 느리거나 규칙적인지, Power가 심심한지, Edge의 안쪽 붕괴가 읽기 좋은지 비교한다. 실제 전투/새 trail/큰 점령 직후/동시 사망/카메라 이동/발열도 확인한다. 저장소에는 effect 선택을 기록하지 않는다. Online 맵/인원은 서버 config를 따른다.

실제 핫스팟 development 포트 3003에서도 393×852 headless 브라우저로 fixture 재생과 Wave R56/16 1 HUMAN · 15 BOT 연습 실행을 확인했다. page errors 0, test mode hook 없음. 기존 첫 실행 튜토리얼은 완료한 상태로 검증했다. 확인 스크립트의 처음 두 대기는 초기 fixture가 자동 사망을 재생한다고 잘못 가정하거나 첫 실행 튜토리얼을 완료하지 않아 timeout되었으며, 상태 준비를 바로잡은 최종 실행은 통과했다. 물리 휴대폰 연결/FPS의 증명은 아니다.

Production은 사용자 최종 선택 전까지 NONE을 유지한다. 모바일 실기기 성능을 이 자동 결과만으로 승인하지 않는다.

## 재현

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$PWD\node_modules\.bin;$env:PATH"
npm run test:territory-effects
npm test
npm run build
```

모바일 development 실행은 기존 게임 서버(3001)를 켠 상태에서 node node_modules/vite/bin/vite.js --host 192.168.137.1 --port 3003 --strictPort를 사용한다. 기존 hotspot 3003 방화벽 범위를 따른다. fixture와 live practice는 이 development 포트에서 제공하며 production dist에는 fixture가 없다.

Raw JSON, validation, Medium screenshot 12장 + viewport screenshot 2장, regression/unit reports는 ignored .local/territory-effects/에 보관했다. 회귀검사가 갱신한 기존 evidence 60개는 HEAD 원본으로 복구했고 이번 출력은 .local/territory-effects/legacy-evidence/에 보관했다.
