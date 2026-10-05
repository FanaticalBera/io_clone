# Capture feedback V1 — 플레이 피드백 반영 (2026-10-05)

사용자 GIF 피드백으로 기존 Bloom을 변경했다. 이전 구현의 “새 칸별 boundary 전파·확대·탈색”을 제거하고 **Capture Pulse: 새 영역 전체의 짧은 동시 강조 + 외곽선 240ms**로 바꿨다. 중립 점령과 상대 영토 탈취 모두 동일하게 적용한다.

영토의 정상 player color는 점령 즉시 표시한다. 전체 fill 강조는 100ms만 약하게 주고, capturer 색 기반 진한 외곽선과 밝은 가는 중심선을 240ms 안에 없앤다. 내부 육각선은 새로 강조하지 않는다. 축소/확대나 cell 전파 지연은 없다.

기존 enemy → self 검출 조건은 이미 있었다. 원래 효과가 얇은 영역에서 실제로는 약 120ms만 약하게 보일 수 있어 무효처럼 느껴질 여지가 있었다. 이전 코드가 중립만 허용했다는 원인으로 확정하지 않는다. 이번에는 실제 점령 엔진의 탈취 사례와 화면 drawing을 따로 검증했다.

## 상대가 생존해도 고립 영토 Wave

이전 Wave는 확정 DEATH에만 재생됐다. 이제 확정 CAPTURE batch에서 같은 생명의 생존 상대에 대해 **확인된 상대 owner → capturer owner 탈취**와 **상대 owner → neutral 변화**가 함께 관측되면, 중립화된 부분을 기존 Wave로 연출한다. 원점은 관측된 탈취 칸 중 소멸 영역에 인접한 칸을 우선한다. 직접 탈취한 칸에는 과거 색 overlay를 얹지 않고 새 소유자 색/Capture 외곽선을 즉시 표시한다.

V1은 마지막 확인 상태의 근사다. 정확한 서버 사망/점령/고립 정리 목록을 재구성하지 않는다. 관측된 탈취가 없거나 확정 capture가 없으면 임의의 owner → neutral 변화를 Wave로 만들지 않는다. 떠난 participant와 새 생명은 대상으로 삼지 않는다. death와 capture가 같은 batch에 있으면 피해자 collapse를 중복 생성하지 않으며 death 효과에 budget 우선권을 둔다.

기존 확정 DEATH의 deathContext 원점/600ms Wave와 event.position의 머리 CombatEffects는 유지한다. shared/server/protocol/capture/spawn/AI 판정 코드는 변경하지 않았다.

## 현재 정보 및 수명

Ground 0 < collapse .5 < 현재 Territory/Trail 1 < Capture 2 < Predicted Trail 3 < Player 5 < Combat 8+. Collapse는 owner=0 AND trailMasks=0, Capture는 해당 capturer owner AND trailMasks=0일 때만 표시하며 한번 취소된 칸은 부활하지 않는다. Capture 외곽선은 인접한 현재 trail의 경계도 건너뛴다. init/reset/reconnect/match change는 과거 기록 재생 없이 기준 상태를 갱신한다. lifeId가 바뀐 participant의 Capture도 생략한다.

기존 청크/Graphics pool을 재사용한다. R56 각 pool 51개, 각 active effect 상한 4개, render full-board scan 없음, camera + 1chunk margin, 약 30Hz redraw. cell별 GameObject/Tween/Timer/Emitter 및 effect texture/particle/sound/popup/shake 없음. Capture의 같은 participant 새 효과는 이전 것을 종료한다. Collapse loss는 기존 death pool을 공유한다.

## 확인 결과

- 전체 Vitest: 65 files / 336 tests PASS. 마지막 외곽선 강도 조정 후 Capture/Death 대상 28개도 PASS.
- 선택 browser 고유 6개 PASS: 기존 Death/layer/reset, production 기본값, 모바일 세로·가로 배치, 실제 R56/16 practice, Capture 재생, 실제 적 영토 탈취 + 생존 상대의 고립 정리.
- 최종 TypeScript client/server/tests + production build PASS. 기존 큰 bundle 경고 유지.

기존 shared applySimultaneousCaptures에 테스트용 귀환/trail/연결 다리·두 영역을 준비한 사례다. 자연 플레이로 얻은 기록은 아니다. 상대 slot 15가 생존한 채 neutral 14 / stolen 5칸에 Capture가 생성되고 고립 63칸에 Wave가 생성됐다. 실제 outline 30변과 collapse drawing 62칸을 확인했다. Combat death burst 0.

종료 active/visible effects 0. 같은 완료 단계에서 objects 228 → 228, Graphics 157 → 157, texture 21 → 21, page errors 0. 중복, 상태 취소, history reset, death/capture batch 중복 제외를 검사했다. 대규모 benchmark/100회 soak/전체 browser 회귀는 재실행하지 않았다.

검사 중 cell 순서를 chunk 순서와 같다고 가정한 assertion을 집합 비교로 바로잡았다. 새 fixture 버튼 때문에 모바일 가로 하단이 넘친 것은 body/field flex 배치로 고친 뒤 배치 검사를 통과했다. 마지막 TypeScript 추론 오류는 Cell 타입을 명시한 뒤 최종 빌드를 통과했다.

## 실행

Production: Wave(사망 및 위 조건의 고립 영토 소멸) ON, Capture Pulse ON. 사용자 적용 승인에 따라 Capture도 별도 URL 옵션 없이 기본 활성화한다. development/test의 experimentCaptureEffect=none으로만 비활성 비교가 가능하다. 기존 pulse/bloom 링크도 같은 Pulse 효과로 동작한다.

[R56/16 Capture Pulse + Wave 봇 연습](http://192.168.137.1:3003/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentCaptureEffect=pulse&metrics=1). PC 핫스팟 연결 후 봇 연습을 누른다.

[탈취·고립 영토 재현 화면](http://192.168.137.1:3003/tests/fixtures/territory-effects.html). “상대 영토 탈취 재생”을 누르면 사망 없이 두 효과를 동시에 확인할 수 있다. 기존 “Capture Pulse 재생”도 유지한다.

마지막 확인 시 PC의 192.168.137.1 IPv4 주소가 사라져 실제 hotspot 접속은 TIMEOUT되었다. 개발 Vite는 여전히 3003에서 실행 중이며 game server 3001도 실행 중이다. 핫스팟 주소를 다시 활성화한 뒤 휴대폰에서 확인해야 한다. 자동 검사와 screenshot은 test-mode headless browser 결과이며 실제 Android 성능/미관의 승인은 아니다.

Raw JSON/logs와 screenshot은 .local/capture-revision/, 단일 Pulse screenshot은 .local/capture-effects/capture-bloom-phone.png에 있다. 이번 검사로 갱신된 기존 evidence는 HEAD로 복구했고 local에 이번 출력을 보관했다. 기존 최초 결과 문서는 .local/capture-revision/prior-results.md에 보관했다.
