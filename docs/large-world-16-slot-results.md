# Large world / 16 slot migration — 2026-10-05

## 검토 및 baseline inventory

Baseline HEAD: `041b11e` (Bot Phase 3). 작업 시작 시 tracked 변경 없음.
문서의 인프라 확장은 타당하다. 기본 R22/8, Classic/Hold 종료 조건,
이동·점령·사망·respawn 규칙, Bot Phase 3 정책과 관찰 범위를 보존한다.
R56을 production 기본값으로 확정하지 않는다.

| 위치 | 8인 가정 | 변경 범위 |
|---|---|---|
| shared/config.ts | maxSlots <= 8, protocol 3 | 최대 16, protocol 4; 기본 8 유지 |
| shared/model.ts, state.ts | trailMasks Uint8Array | Uint16Array; owners Uint8Array 유지 |
| shared/territory.ts | owner <= 8 | match.config.maxSlots 기준 |
| shared/engine.ts, life.ts, territory.ts | 1 << slot | 검증된 16-bit helper; 판정 순서 유지 |
| shared/protocol.ts | participant/hold <= 8, trail byte encoding | config capacity, 명시적 LE uint16 encoding |
| shared/hex.ts, game.ts | 시작 anchor 8개 | <=8 기존 경로, >8 deterministic farthest placement |
| client/practice.ts | 1H + 7B | configured maxSlots 기준 bot fill |
| server/rooms.ts, app.ts | human room 8, match bot fill 8 | human 정원 8 별도 상수; match capacity 분리 |
| client/game-scene.ts | trail cache byte, loop 8, palette 8 | Uint16 cache, capacity loop, 16색 |
| client/game-scene.ts | world ground texture 1장, dirty chunk마다 전체 scan | 초기 static ground chunks, chunk cell index |
| client/game-scene.ts | minimap 250ms마다 전체 polygon 재생성 | 측정 후 persistent indexed canvas 검토 |
| client/ui.ts, combat-effects.ts | palette 공유, ranking 참가자 loop | palette 확장으로 대응, 실제 브라우저 검증 |
| shared/map-experiment.ts, client/main.ts, server/index.ts | radius 실험만 지원 | development/test participant override 추가 |

visited/blocked arrays, crypto byte arrays, room code 길이, personality 순환,
기존 8봇 audit와 fixture의 숫자 8은 slot capacity migration 대상이 아니다.



## 구현 판단

trailMasks는 논리 상태·공개 view·렌더 캐시 모두 Uint16Array다. owner는 Uint8Array(0=중립, 1–16=owner)를 유지한다. slotBit/hasTrail은 0–15만 받는다. 판정의 동시성·순서·movement·AI 정책은 유지한다. Protocol은 실제 baseline 3에서 정확히 다음인 4로 올렸다. trail 한 칸을 unsigned 16-bit little-endian 두 byte로 만든 뒤 canonical base64로 인코딩한다. `0x8001 → 01 80 → AYA=`. 이전 protocol은 handshake/snapshot에서 거부한다.

8인 이하는 기존 scaled anchor와 shuffle을 그대로 사용한다. 그보다 많으면 완전한 spawn region·control point 제외 조건을 만족하는 center를 seed로 정렬하고 farthest-point 방식으로 선택한다. 최소 거리는 2×spawnRadius보다 크게 제한한다. random retry 없이 후보를 한 번 순회하며 tie는 seeded order로 결정한다. 초기 heading은 중앙 방향이고 정확히 중앙인 새 anchor에만 유효한 (1,0) fallback을 적용한다. 10/12/14/16인을 지원한다.

human room 정원은 별도 상수 8이다. 작은 configured match capacity에서는 room 정원도 그 이하로 제한한다. Practice와 server의 BOT fill은 config.maxSlots 기준이다. 기존 replacement BOT 경로는 같은 slot을 보존한다. palette는 처음 8색을 보존하며 16개의 deterministic 색을 제공한다. 순위에는 스크롤을 추가한다.

바닥은 초기화 때 만든 Blitter chunks와 **공유 60×68 hex texture 하나**를 사용한다. world-sized texture도, chunk별로 큰 texture를 모두 보관하는 구조도 필요 없다. R56의 9,577개 quad/Bob과 51개 chunk를 미리 만든다. 카메라에서는 1 axial chunk 여유를 두고 visibility만 바꾼다. territory/trail Graphics는 chunk cell index를 사용한다. 미니맵은 persistent canvas + cached Path2D + owner 변화/이웃 칸 갱신이며 기존 표시 기능을 유지한다.

R56/16 CPU sampling에서 확장 계획의 plannedCapture flood가 가장 큰 비용으로 확인돼 visited/blocked/queue buffer와 외곽 seed index만 재사용했다. full-map flood, neighbor order, 결과 cell 순서는 그대로다. shortestPath, movement, capture engine, FSM, traits, personality tuning, observation range, respawn selector, network architecture는 바꾸지 않았다.

## AUTOMATED — 회귀 및 정확성

Node 24.21.0 / Windows. R22/8, seed 4/19/73/115 각각 1,800 tick의 **매 tick** owners·논리 trail·participant states/sets·events·bot memory/path/goal hash가 migration 및 buffer 최적화 후 모두 baseline과 동일하다. wire 문자열은 비교하지 않았다.

| Seed | R22/8 SHA-256 |
|---|---|
| 4 | `fbdbbe329a44573934dc26b4e0713f71efc1188feeaf1a19e270268eadb1960d` |
| 19 | `81962aa1f55e7730e8a29ba3e5a19b2e7c07c41ce0ef3fec1fc2d6df89f46aa5` |
| 73 | `d7aedc268bc8c9bc72470472863ba71b1e78f6c0460546455ea93c2136bfae5f` |
| 115 | `a756151a936328ad6762e177109953f2f3e8a182a074ba7f52b70cf202c1fa66` |

R56/14·16 네 seed의 최적화 후 20분 audit에서 처음 5분 checkpoint hash가 최적화 전 screening hash와 **8/8 일치**했다. 여기에는 매초 board·participants·goal/path·events가 들어간다. global flood의 원래 구현을 독립 oracle로 남겨 R22/R56, 저/고슬롯, 변경된 owner/path의 반복 입력 결과와 순서도 검증한다.

신규 검사는 slot 15의 실제 이동/선 생성/절단/clear/owner 16 capture/prune/neutralize/respawn, 0x8001 혼합 mask, 저·고슬롯 동시 contact/capture, 16인 Hold rows/events와 malformed snapshot, seed 결정론, 관찰 범위 밖 head/trail 비노출을 포함한다. 기존 game rule/BOT tests는 유지한다. Uint16 경계 0000/0001/00FF/0100/8000/8001/FFFF roundtrip, 명시적 byte order, noncanonical base64, byte 길이·count·slot 중복·slot 범위·config mask 범위를 검사한다. Uint16을 넘는 수는 이 wire 표현에 들어갈 수 없으며 encoder는 Uint16Array만 받는다.

## 초기 배치

수치는 네 seed 평균 또는 범위다. 큰 맵 4후보 × 4seed의 초기 배치 검사에서 각 participant는 ALIVE·19칸·고유 slot/ID, overlap/out-of-map/invalid zone/control-point overlap은 모두 0이다. R64는 upper candidate이며 그 이상으로 확장하지 않았다.

| 후보 | Cells | 최소 쌍 거리 범위 | 평균 쌍 거리 | 초기 owner / neutral |
|---|---|---|---|---|
| 22/8 | 1519 | 5.00–5.00 | 25.50 | 152 / 1367 |
| 48/14 | 7057 | 20.00–22.00 | 50.40 | 266 / 6791 |
| 56/14 | 9577 | 23.00–27.00 | 60.74 | 266 / 9311 |
| 56/16 | 9577 | 22.00–25.00 | 59.83 | 304 / 9273 |
| 64/16 | 12481 | 26.00–26.00 | 68.95 | 304 / 12177 |

## 5분 screening

seed 4/19/73/115, 각 후보 4 BOT-only 경기. 5분은 측정 window이고 Classic/Hold 시간 제한이 아니다. production과 같은 seed^(slot×2654435761) memory 초기화를 사용한다. contact는 EXISTING/PENDING_TRAIL_CONTACT death의 eventTick 기준이며 kill에는 다른 원인도 포함한다. 한 HUMAN의 체감 대리 실험으로 보지 않는다.

| 후보 | 첫 contact 평균 / 범위(s) | 첫 kill 평균(s) | Deaths / min | Kills / min | 평균 ALIVE | 마지막 leader % / occupied % | 평균 exposed trail |
|---|---|---|---|---|---|---|---|
| 22/8 | 6.10 / 1.50–10.29 | 6.10 | 8.75 | 8.75 | 7.57 | 14.04 / 45.41 | 3.03 |
| 48/14 | 27.83 / 18.76–47.51 | 27.83 | 7.25 | 7.25 | 13.64 | 9.59 / 49.01 | 4.26 |
| 56/14 | 38.84 / 28.61–51.39 | 38.84 | 5.85 | 5.85 | 13.71 | 7.66 / 40.48 | 4.46 |
| 56/16 | 32.17 / 24.70–37.99 | 32.17 | 5.65 | 5.65 | 15.72 | 8.15 / 53.16 | 4.22 |
| 64/16 | 53.74 / 36.44–82.46 | 53.74 | 4.30 | 4.30 | 15.79 | 8.23 / 49.27 | 4.41 |

## 20분 audit — R56/14 및 R56/16

screening에서 목표 크기에 맞고 전투/확장 모두 관측된 R56/14·16을 장기 후보로 골랐다. 각 후보 네 seed, 20분 36,000 tick. 시간 제한/완전 점령 강제 fixture는 없다. 총 8개 audit의 BOT wall deaths·무결성 오류·SPAWN_BLOCKED는 0이다. 20분 안에 Classic 승리가 나왔다고 주장하지 않는다.

| 참가자 | Seed | Deaths / kills | 마지막 leader % | Occupied % / neutral % | 평균 ALIVE | Spawn 성공 / 시도 | 최종 valid centers |
|---|---|---|---|---|---|---|---|
| 14 | 4 | 121 / 121 | 13.22 | 45.02 / 54.98 | 13.70 | 121 / 121 | 2909 |
| 14 | 19 | 108 / 108 | 9.12 | 44.37 / 55.63 | 13.73 | 107 / 107 | 2853 |
| 14 | 73 | 112 / 112 | 4.46 | 38.34 / 61.66 | 13.72 | 112 / 112 | 3675 |
| 14 | 115 | 97 / 97 | 9.11 | 55.78 / 44.22 | 13.76 | 97 / 97 | 1874 |
| 16 | 4 | 131 / 131 | 9.07 | 51.33 / 48.67 | 15.67 | 131 / 131 | 1970 |
| 16 | 19 | 138 / 137 | 7.14 | 45.05 / 54.95 | 15.65 | 138 / 138 | 2748 |
| 16 | 73 | 142 / 142 | 6.08 | 46.81 / 53.19 | 15.64 | 142 / 142 | 2759 |
| 16 | 115 | 149 / 148 | 9.77 | 41.77 / 58.23 | 15.63 | 148 / 148 | 3029 |

마지막 점유율과 leader 수치는 단조 증가하지 않는다. 사망·탈취·prune가 기존 규칙대로 계속 일어나므로 5분보다 20분 값이 낮을 수도 있다. BOT-only 표본에서는 종료/후반 지배가 보장되지 않았다. 큰 맵의 빈 공간 체감과 Classic 마무리 노동 여부는 HUMAN 실기기 확인이 필요하다.

## 성격별 screening 통계

각 행은 4 seed의 경기당 평균이다. 14인 성격 배정은 EXPAND/ATTACK 각 4개, DEFEND/SEEK_POINT 각 3개이며 16인에서는 각 4개다. attack는 ATTACK goal 진입 횟수이고 공격 후보 수나 kill 성공률이 아니다. stolen cells는 한 step 전후 살아남은 owner transfer로 측정하므로 동시 transfer 후 사망·neutralize된 탈취량까지 모두 포함한 값은 아니다.

| 후보 | 성격 | Capture 횟수 / 칸 | Death / kill | Stolen cells | ATTACK 진입 |
|---|---|---|---|---|---|
| 48/14 | EXPAND | 354.75 / 7528.75 | 11.50 / 10.75 | 1922.75 | 16.00 |
| 48/14 | ATTACK | 476.50 / 5556.75 | 10.25 / 9.75 | 1675.50 | 20.50 |
| 48/14 | DEFEND | 398.75 / 4277.75 | 4.75 / 9.00 | 1344.25 | 11.00 |
| 48/14 | SEEK_POINT | 331.50 / 4250.00 | 9.75 / 6.75 | 1947.25 | 6.75 |
| 56/14 | EXPAND | 330.50 / 8064.75 | 10.50 / 9.50 | 1576.25 | 13.75 |
| 56/14 | ATTACK | 466.25 / 5723.50 | 7.25 / 8.50 | 1550.00 | 19.00 |
| 56/14 | DEFEND | 392.50 / 4391.75 | 4.25 / 5.50 | 1107.50 | 7.50 |
| 56/14 | SEEK_POINT | 313.00 / 4634.25 | 7.25 / 5.75 | 2059.25 | 5.50 |
| 56/16 | EXPAND | 367.25 / 7632.00 | 7.50 / 8.50 | 1856.00 | 14.50 |
| 56/16 | ATTACK | 474.25 / 5800.00 | 6.00 / 7.50 | 2022.50 | 16.25 |
| 56/16 | DEFEND | 526.25 / 5890.00 | 4.75 / 6.25 | 1909.50 | 6.00 |
| 56/16 | SEEK_POINT | 420.25 / 6048.25 | 10.00 / 6.00 | 3175.75 | 6.50 |
| 64/16 | EXPAND | 336.25 / 8555.75 | 7.75 / 7.50 | 1815.25 | 12.25 |
| 64/16 | ATTACK | 457.00 / 5857.25 | 4.00 / 5.00 | 1634.75 | 11.25 |
| 64/16 | DEFEND | 520.50 / 6176.25 | 2.00 / 6.00 | 2009.50 | 8.00 |
| 64/16 | SEEK_POINT | 406.25 / 6103.50 | 7.75 / 3.00 | 2979.50 | 4.00 |

## Simulation 성능

최종 구현의 observer-free simulation을 seed 19, 1,800 tick으로 각 후보에서 V8 CPU sampling했다. timing은 observation/input/step 전체의 per-tick 시간이며 map 생성은 제외한다. sampling/warmup/OS scheduling 변동이 포함된 이 PC 한 표본이다. 30Hz budget은 33.33ms이며 높은 p99/max와 모바일 CPU는 별도 확인 대상이다. 다중 방 수용량 보장은 아니다.

| 후보 | Mean / median tick ms | p95 / p99 ms | Max ms |
|---|---|---|---|
| 22/8 | 0.57 / 0.22 | 2.50 / 4.23 | 34.62 |
| 48/14 | 2.06 / 0.36 | 11.14 / 18.60 | 154.37 |
| 56/14 | 3.03 / 0.30 | 18.86 / 34.45 | 252.97 |
| 56/16 | 3.33 / 0.36 | 18.35 / 34.05 | 297.07 |
| 64/16 | 4.49 / 0.32 | 25.50 / 48.18 | 380.17 |

20분 audit에는 opt-in spawn observer와 계측이 있다. benchmark-only 데이터이고 production에 profiler/observer를 설치하지 않는다. 아래는 각 seed별 실제 decision와 15초 간격 spawn-space scan 표본이다. sampled scan은 실제 respawn 호출 latency 전체의 분포를 대체하지 않는다. capture resolution은 CPU profile의 inclusive sampling으로 별도 기록한다.

| 인원 / seed | Tick median / p95 / p99 | Decision mean / p95(ms) | Sampled spawn mean / p95 / max(ms) | Spawn calls/s |
|---|---|---|---|---|
| 14/4 | 0.50 / 14.20 / 24.33 | 1.21 / 9.69 | 5.79 / 7.85 / 138.54 | 0.10 |
| 14/19 | 0.46 / 14.32 / 22.22 | 0.98 / 9.95 | 4.82 / 6.88 / 21.34 | 0.09 |
| 14/73 | 0.40 / 17.78 / 27.50 | 1.19 / 12.32 | 4.05 / 6.56 / 23.87 | 0.09 |
| 14/115 | 0.37 / 15.84 / 23.84 | 1.05 / 11.26 | 3.97 / 6.37 / 23.97 | 0.08 |
| 16/4 | 0.45 / 17.05 / 26.47 | 1.11 / 11.70 | 3.60 / 5.07 / 15.85 | 0.11 |
| 16/19 | 0.44 / 17.28 / 27.20 | 1.13 / 12.02 | 3.54 / 4.79 / 18.74 | 0.12 |
| 16/73 | 0.46 / 17.10 / 26.85 | 1.11 / 11.85 | 3.60 / 5.52 / 17.47 | 0.12 |
| 16/115 | 0.45 / 17.21 / 26.80 | 1.11 / 11.72 | 3.43 / 4.61 / 16.93 | 0.12 |

R56/16 final CPU sample의 함수별 inclusive ms(서로 포함 관계라 합산 금지):

| 함수 | Self ms | Inclusive ms |
|---|---|---|
| observeBot | 57.42 | 78.19 |
| rememberIncursions | 189.17 | 196.05 |
| shortestPath | 196.43 | 203.15 |
| returnPath | 1.15 | 44.06 |
| planExpansion | 53.06 | 4862.42 |
| plannedCapture | 4657.89 | 4657.95 |
| planAttack | 6.44 | 73.75 |
| pruneDisconnectedTerritory | 4.87 | 4.87 |
| captureCandidates | 227.96 | 227.96 |
| inspectSpawnSpace | 5.27 | 20.22 |
| applySimultaneousCaptures | 28.26 | 262.72 |

0 표본은 이 window에서 관측되지 않았다는 뜻이며 비용이 없다는 증명이 아니다. initial scan/cold caches와 GC는 별도 스파이크가 있을 수 있다. Respawn/BFS/FSM 정책 교체는 하지 않았다.

## Snapshot 비용

각 screening에서 매초 한 번 실제 pack/unpack한 JSON UTF-8 payload byte의 네 seed 평균이다. p95는 seed별 p95의 평균이며 pooled p95는 아니다. 대역폭은 configured 10Hz 기준 payload 추정이며 Socket.IO·TCP·TLS·polling overhead를 제외한다. 이름/matchId/self fields가 다른 실제 온라인 payload는 다소 다르다. delta/binary/compression 재설계는 하지 않았다.

| 후보 | 평균 / p95 bytes | KiB/s/client | 2 client outbound KiB/s | 8 client outbound KiB/s |
|---|---|---|---|---|
| 22/8 | 11338.77 / 11673.75 | 110.73 | 221.46 | 885.84 |
| 48/14 | 36631.72 / 37049.25 | 357.73 | 715.46 | 2861.85 |
| 56/14 | 46680.91 / 47072.00 | 455.87 | 911.74 | 3646.95 |
| 56/16 | 47771.28 / 48203.75 | 466.52 | 933.03 | 3732.13 |
| 64/16 | 59354.98 / 59752.25 | 579.64 | 1159.28 | 4637.11 |

R56/16 full snapshots는 수백 KiB/s/client 규모다. 두 데스크톱 browser 동기화 성공은 확인했지만 Android 이동통신 latency/데이터 사용의 적합성을 확정한 결과는 아니다. 실제 문제가 확인되면 후속 network 최적화를 판단한다.

## Renderer — AUTOMATED

데스크톱 headless Chromium 153.0.8010.12, 1280×720, Phaser 실제 scene과 wire roundtrip fixture. Renderer capability는 ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), MAX_TEXTURE_SIZE=8192다. **SwiftShader software GPU 측정이며 물리 PC/Android GPU 결과가 아니다.** 각 맵에서 8개 camera 위치로 chunk 경계를 가로질러 이동했다. ground chunk·territory chunk·texture·ground quad 수가 initialization 이후 일정했고 scene errors는 0이다. slot 0/7/8/15 territory/trail/avatar screenshots와 slot 15 death effect, 16 result/ranking rows를 검사했다. controlled 500-cell owner delta는 renderer stress이며 게임 capture 통계가 아니다.

| 맵 | Chunk / ground quads | 초기 map / ground(ms) | Culling FPS / all visible FPS | Culling p95 / p99 frame(ms) | >50ms frames | Mini cold / warm(ms) | 500 cell redraw(ms) | Heap MiB |
|---|---|---|---|---|---|---|---|---|
| 48 | 40 / 7057 | 32.50 / 5.00 | 22.54 / 23.21 | 50.10 / 66.60 | 9 / 68 | 32.30 / 0.24 | 0.90 | 73.05 |
| 56 | 51 / 9577 | 38.00 / 7.90 | 21.10 / 20.88 | 50.10 / 66.70 | 12 / 64 | 37.80 / 0.20 | 1.90 | 77.63 |
| 64 | 65 / 12481 | 41.70 / 7.60 | 19.67 / 19.34 | 66.70 / 66.70 | 12 / 60 | 40.60 / 0.41 | 1.20 | 73.05 |

바닥 texture는 모든 후보에서 60×68 하나(16,320 RGBA bytes 상당)다. 전체 GPU memory는 label/framebuffer/Phaser buffers 등을 포함하므로 이 수치로 대체하지 않는다. all-visible과 margin culling을 모두 실측했고 현재는 margin culling을 사용한다. frame-time 표본은 3초의 controlled scene이며 실제 밀집 전투·모바일 GPU 성능 또는 부드러움의 승인 기준은 아니다.

| 맵 | Camera boundary mean / p95 / max frame(ms) |
|---|---|
| 48 | 48.76 / 66.60 / 66.70 |
| 56 | 49.18 / 50.10 / 66.60 |
| 64 | 51.03 / 66.70 / 66.70 |

## Online / practice / production

R56/16의 real Socket.IO Hold room: 2 HUMAN + 14 BOT, 두 독립 browser의 공통 snapshot 22개에서 matchId/tick/owners/decoded Uint16 trails/participant states가 일치했다. 실제 온라인 JSON 평균 47900.05 / p95 48228 bytes, 10Hz payload 추정 467.77 KiB/s/client다. high slot 15 포함, console/page errors 0. 1 HUMAN + 15 BOT practice에서 16 avatars/rows, camera follow, minimap을 확인했다. production client와 server는 실험 URL/환경 변수를 무시하고 R22/8을 유지한다.

대형월드 Playwright는 별도 config/`npm run test:large-world`로 실행하며 기존 `test:e2e`의 baseline suite는 기존 config를 사용한다. 중간 fixture 오류(잘못된 export/선 위치, 미니맵 미개방)를 수정했고, 최초 online 검사에서 countdown보다 짧았던 5초 대기를 15초로 맞췄다. Windows sandbox 내 테스트 서버 teardown 제한은 권한을 받아 해결했다. 최종 PASS 결과만 완료 상태로 취급한다.

선택한 기존 browser 회귀 9개 중 multiplayer waypoint 입력 도우미는 수정 전 HEAD 041b11e에서도 같은 실패가 재현됐다. 목적지를 향해 매 tick 조향하도록 도우미를 수정했다. 이동·점령·절단·사망·respawn·두 browser 상태 일치·결과 assertion은 유지한다. 작업 중 Windows 블루스크린/재부팅으로 마지막 검사 실행이 끊겼으며, 그 실행은 성공으로 계산하지 않고 다시 검증했다. 블루스크린 원인은 조사/확정하지 않았다.

재부팅 후 trace 기록을 켠 multiplayer 실행은 180초 timeout 및 trace zip 오류로 실패했다. trace를 끈 재실행은 같은 assertion과 제한으로 39.6초에 통과했다. 진단 console 출력은 제거했고 정식 config의 trace 설정은 변경하지 않았다. 기록 비용 또는 손상 파일이 timeout 원인이라고 확정하지 않는다.

## 최종 checks

| Check | 결과 |
|---|---|
| Vitest 전체 | PASS — 63 files / 308 tests (최종 재실행) |
| TypeScript client/server/tests | PASS — npm run build 내 typecheck |
| Production build | PASS — 기존 >500kB bundle 경고 유지 |
| 대형월드 Playwright | PASS — 6/6 (R48/56/64 렌더, 1H15B, 2H14B, production 기본값) |
| 선택한 기존 Playwright 회귀 | PASS — 9 checks: 최초 8개 + baseline waypoint 도우미 수정 후 multiplayer 1개; 전체 기존 E2E suite를 실행한 것은 아님 |
| Multiplayer 최종 실행 | PASS — --trace off, 39.6s; trace를 켠 실행의 timeout/zip 오류는 별도 기록 |
| R22/8 baseline equivalence | PASS — seed 4/19/73/115, 각 1800tick 매 tick hash 동일 |
| R56 장기 equivalence | PASS — 8/8 최적화 전 5분 checkpoint hash 동일 |
| 5분 screening | COMPLETE — 5후보 × 4seed / 20경기 |
| 20분 audit | COMPLETE — R56/14·16 × 4seed / 8경기; wall death/무결성 오류/SPAWN_BLOCKED 0 |
| Android 실기기 / HUMAN 재미 | MANUAL REQUIRED — 기본 R22/8 유지 |

## Development / Android 수동 비교

운영 기본값은 R22/8이다. 다음은 개발에서만 적용되며 브라우저 저장소에 radius/인원을 저장하지 않는다.

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$env:PATH"
$env:MAP_EXPERIMENT_RADIUS = "56"
$env:MAP_EXPERIMENT_SLOTS = "16"
$env:MAP_EXPERIMENT_SEED = "4"
npm run dev
```

- [R56/14 practice](http://localhost:5173/?experimentMapRadius=56&experimentSlots=14&experimentSeed=4)
- [R56/16 practice](http://localhost:5173/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4)
- [R48/14](http://localhost:5173/?experimentMapRadius=48&experimentSlots=14&experimentSeed=4)
- [R64/16](http://localhost:5173/?experimentMapRadius=64&experimentSlots=16&experimentSeed=4)

Android에서는 기존 LAN/hotspot 허용 방식으로 PC 주소의 :5173에 접속한다. Online은 서버의 capacity 설정을 따르며 practice URL의 인원 설정이 방 capacity를 바꾸지는 않는다. R56/14 online 비교 시 MAP_EXPERIMENT_SLOTS를 14로 바꾸고 개발 서버를 재시작한다. production UI에는 실험 설정을 추가하지 않았다.

## MANUAL MOBILE REQUIRED

- R56/14와 /16에서 첫 만남까지의 시간·확장 공간·중반 국경/탈취·후반 Classic 마무리가 재미있는지 비교.
- 시작 로딩, chunk 경계 이동, 빠른 회전, 큰 점령 직후, 여러 trail/14–16인 밀집 전투, minimap 가독성.
- 실제 FPS/메모리/발열/배터리, foreground/background 복귀.
- 실제 Android 온라인 latency/대역폭/재연결.

자동 결과로 모바일 성능을 승인하거나 R56/16을 최종 default로 정하지 않는다. R48/14는 밀도 높은 비교 후보이고 R64/16은 넓은 비교 후보다. 현재는 R56/14·16을 실기기로 비교할 기반이 갖춰졌다.

## 재현 및 raw evidence

```text
node --import tsx scripts/large-world-audit.ts --output .local/large-world/screening.json
node --import tsx scripts/large-world-audit.ts --cases 56/14,56/16 --minutes 20 --output .local/large-world/long-audit.json
node --import tsx scripts/large-world-audit.ts --profile --seeds 19 --output .local/large-world/final-profile.json
npm run test:large-world
npm test
npm run build
```

4 seed×5 screening 후보, 4 seed×2 장기 후보, 함수 profile, browser JSON/screenshots는 ignored `.local/large-world/`에 있다. 기존 map-size/initial-spawn 문서와 기존 audit 자료는 보존했다. raw trace를 소스 diff에 넣지 않는다.
