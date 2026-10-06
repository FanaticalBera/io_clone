# BOT 통합 실험안 정식 적용 — 2026-10-06

사용자가 원본/통합 실험안 비교 후 통합안을 적용하도록 승인했다. master 3047e4a에 experiment/bot-fairness-performance의 f2dd37d 실행 변경과 회귀 테스트를 적용했다. 근접 비교실/장기 관전 및 대량 비교 trace는 실험 worktree에 그대로 둔다. 원본 기준 commit 3047e4a도 비교에 계속 사용할 수 있다.

## 적용 내용

- Practice와 서버 GameLoop 기본값은 combined: 상대의 미적용 targetDirection 대신 실제 direction 기반 예측, slot별 6tick/200ms 일반 판단 위상, 판단 사이 가까운 steering 관측, 관측한 head forecast의 동일 tick 공유, 맵별 movement normals WeakMap cache.
- 첫 생명/리스폰의 첫 판단과 경계 긴급 회복은 즉시 수행. 일반 주기는 그대로이며 첫 위상 정렬과 긴급 전환에서는 한 간격이 짧아질 수 있다.
- 자신의 조향 입력은 그대로 사용하고 상대 HUMAN/BOT의 미적용 입력을 공정 관측에 복사하거나 읽지 않는다. 서버의 HUMAN returnOnly fallback은 기존 주기/seed/호출 경로를 유지한다.
- owner/slot/판정/이동 기하/AI personality/planExpansion flood fill 및 범위/Classic/R56/16/7칸 spawn 변경 없음. Reward/RunResult/Profile/Inventory/Marker Color/마커 크기·외형 코드 변경 없음.
- 비교 옵션은 tests와 dev/test URL에서만 명시적으로 고를 수 있다. production에서는 별도 옵션 없이 combined. 일반 3003 게임 주소도 기본으로 combined.

## 검증

- 전체 75파일/430개 테스트 통과, 실패 0. 기존 실험 회귀 14개와 정식 기본값 계약 2개 포함. 후자는 숨은 입력 throwing getter와 default vs explicit combined R56/16 입력/상태/memory/RNG 일치를 확인한다.
- npm run build: client/server/tests 타입 검사와 서버·클라이언트 빌드 통과. 기존 Phaser bundle 크기 경고만 남아 있다.
- 실제 LAN 3003 웹에서 추가 variant 옵션 없이 844×390 / 640×320 / 568×320: 16 avatars, 기본 공정 관측, 6개 위상 분포 [2,3,3,3,2,2], 문서 overflow/page error 0, 메뉴 복귀 확인. 별도 테스트 scene으로 기본 BOT 계약을 읽기 검사했고 실제 Practice는 정상 UI로 시작했다. 게임 규칙을 바꾸는 production 우회 코드는 추가하지 않았다.
- 기존 3003 Vite PID 9884 유지. compiled dist를 실행하던 3001 backend는 활성 경기 0을 확인한 뒤 새 빌드로 재시작(PID 13020). 3003/healthz 및 LAN socket handshake 200 확인. 기존 3004 비교 서버 PID 17876 유지.
- 선택한 브라우저 regression 12항목: Basic Ring/Target(개발·production), 48px IMAGE/닉네임, 16색 구매·장착·복원/실제 territory·trail tint/slot15, 기존 IMAGE 재질, offline Practice, single-player same-world retry/Clear, online 보상·reconnect·retry 확인. 첫 실행 11개 통과, Run fixture 1개는 Phaser.create 전 즉시 사망시키던 준비 경합으로 null getter 오류. tests/e2e/run.spec.ts에 실제 WAVE_COLLAPSE renderer 준비 대기를 추가하고 active=0 단정은 유지했으며 해당 1개 재실행 통과(11.8초). 게임/효과 코드를 변경하거나 실패를 0으로 coalesce하지 않았다.

## 성능과 행동 판단의 범위

기존 실험 계측을 근거로 채택했다. 캐시 단독을 포함해 모든 조건에서 평균 CPU가 낮아진 것은 아니다. 당시 combined는 원본 대비 평균 BOT 시간 약 +11%, p99 약 -13.5%, 최대 약 -22%; R56 DEFEND 평균 영토 약 -16.1%, 일부 EXPAND 생존 저하가 있었다. 이번 적용에서 이 위험을 숨기기 위해 성향/난이도/판단 빈도를 조정하지 않았다. 사용자의 비교 체감과 공정성·ATTACK 유지·부하 집중 완화를 이유로 통합안을 선택했으며, 이번 smoke 검증은 CPU benchmark 재측정이 아니다.

## 영토 감소 대응 — 논의만, 미구현

현재 rememberIncursions는 자기 근처 관측 범위에서 다른 owner로 바뀐 기존 home을 기억한다. 실제 ATTACK 대상은 관측한 trail과 안전 귀환/거리/ETA 조건이 있어야 한다. 전체 자기 territoryCount의 지속 감소만으로 별도의 경계 태세를 시작하지 않는다. 따라서 큰 영토의 반대편을 반복 탈취당해도 확장을 계속할 수 있다.

후속 실험 후보는 자기 영토 손실의 짧은 급감과 수십 초의 반복 손실을 감지해 일시적으로 확장·귀환·순찰 우선순위를 조정하는 것이다. 증가/감소를 단순 최종 크기 하나로 상쇄하면 확장 중 탈취 피해가 가려지므로, 실제로 확인 가능한 손실 측정 정의부터 정해야 한다. 공격자의 먼 위치나 숨은 입력을 알려주는 전역 추격 신호로 사용하지 않는다. 가까운 실제 관측과 안전한 귀환 조건을 유지하고, 성향별 반응 강도를 달리하며 진정 후 기존 행동으로 복귀한다. tiny loss 반복으로 영원히 방어에 묶이지 않게 하한과 해제 조건이 필요하다. 이번 master 적용에 이 정책은 포함하지 않았다.

파일: src/shared/bot.ts, bot-experiment.ts, movement.ts; src/client/practice.ts, main.ts; src/server/loop.ts; 관련 BOT core 회귀 및 shadow fixture, tests/e2e/run.spec.ts. 기존 추적 dist도 새 build로 갱신해 npm start/compiled backend에 적용된다. 검증 요약은 evidence/bot-adoption.json.
