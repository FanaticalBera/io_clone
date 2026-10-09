# BOT 중립 3겹 재스폰 자동 검사

브랜치: `codex/bot-respawn-neutral-buffer`. 기준 코드: master `795faf9`.
별도 작업 공간에서 구현·검증한 뒤, 사용자의 후속 적용 요청에 따라 Practice와 온라인 경기의 기본 동작으로 활성화하여 master에 통합한다. 최초 개발 단계에서는 개발용 옵션으로만 활성화했다.

## 구현

Practice와 공개·친구방 온라인 경기에서 사망한 BOT의 mid-match respawn에 기본 적용한다. 모든 소유자 ID를 동일하게 취급하여 지급 전 7칸 core에서 기존 owned territory까지의 최소 hex 거리를 4 이상으로 요구한다. 실제 지급은 7칸이며 바깥 3겹은 중립으로 남는다.

3겹은 playable cell이어야 한다. 중심 R4 영역의 61칸 중 맵 밖 `-1`이 하나라도 있으면 후보에서 제외한다. 이는 맵 밖을 중립으로 세어 가장자리에서 조건을 완화하지 않기 위한 선택이다. R56에서 이 가장자리 검사로 1,308개 center가 제외된다. 추가 영역에는 별도의 Trail 거리 점수나 영토 지급을 적용하지 않는다.

기존 core의 neutral / Trail / control point / reserved 검사와 core에서 다른 ALIVE head·Trail·예약 영역까지의 최소 거리 3을 유지한다. 후보 순서는 **기존 bestSafety 최대 → 동률이면 owned territory 거리 최대 → 동률이면 기존 spawnOrder**다. 이전 B의 territory-first ranking과 달리, 영토가 멀다는 이유로 안전도가 더 낮은 후보를 선택하지 않는다. 새로운 가중치나 복합 점수는 없다.

유효 후보가 없으면 기존 `SPAWN_BLOCKED` 경로로 이동하고 1초 후 다시 시도한다. 최초 사망 대기는 기존 3초다. 강제 fallback이나 점유율별 population cap은 없다. 최초 Match 배치, 신규 대체 BOT 첫 배치, HUMAN Retry는 기존 baseline을 사용한다.

## 인위적 점유율 검사

R56 / 9,577 cells / 14 participant slots. 아래는 AI 경기나 실제 HUMAN 플레이 결과가 아닌 기하학적 fixture다. 중앙에서 가까운 셀부터 채운 집중형과 7개 중심에서 가까운 셀부터 채운 분산형을 구성했다. 분산형의 섬은 점유율 증가에 따라 합쳐질 수 있다.

HUMAN/BOT 두 owner의 셀을 번갈아 배정했고 두 owner의 head는 소유 영토 안에 두었다. 사망한 slot 13 BOT 하나를 대상으로 하며 나머지 BOT은 fixture에서 비활성 상태다. 이 표에는 Trail이나 추가 reserved 영역이 없다. 해당 안전 규칙은 별도의 회귀 테스트에서 확인했다. 점유 셀 수는 반올림하여 요청 비율과 최대 0.005%p 차이가 있다.

| 점유율 | 집중형 기존 후보 | 집중형 새 후보 | 분산형 기존 후보 | 분산형 새 후보 | 새 규칙 결과 |
|---|---:|---:|---:|---:|---|
| 20% | 7,155 | 5,698 | 6,883 | 4,510 | 부활 |
| 40% | 5,175 | 3,526 | 4,998 | 3,121 | 부활 |
| 60% | 3,212 | 1,419 | 3,191 | 1,371 | 부활 |
| 80% | 1,253 | 0 | 1,253 | 0 | SPAWN_BLOCKED |
| 95% | 0 | 0 | 0 | 0 | SPAWN_BLOCKED |

모든 새 후보는 독립적인 full R4 neutral 영역 열거와 일치했다. 각 fixture에서 실제 selector로 선택하여 성공한 respawn은 지급 전 core가 전부 중립이고 core→owned 거리가 4 이상이며 지급량이 정확히 7칸이었다. 후보 0일 때 소유권을 변경하지 않고 차단됐다.

80%·95%의 차단은 위 배치의 결과이며 일반적인 점유율 임계값이 아니다. 별도 95% fixture에서 전체 owned 셀 수 9,098을 유지하면서 중앙에 완전한 R4 중립 공간을 만들면 후보 **1개**, core→owned 거리 **4**, 실제 지급 **7칸**으로 정상 부활했다.

## 회귀 검증

핵심·연결 테스트 24개와 기존 spawn / initial spawn / life / run / Practice / config / large-world / server room / reconnect / transport 회귀 테스트 88개가 통과했다. 브라우저 테스트 5개를 합쳐 총 117개가 통과했다. client / server / tests TypeScript 검사와 Production client / server 빌드가 성공했다.

- 3초 대기 전에는 부활을 시도하지 않는다. R3 중립 구멍에서는 차단되며, 1초 재시도 시점 이전에는 다시 시도하지 않는다. 이후 R4 공간을 열면 다음 시점에 정상 부활한다.
- HUMAN 소유 셀과 BOT 소유 셀의 후보 판정이 동일하다. 같은 tick에서 먼저 부활한 BOT의 새 영토도 다음 BOT의 거리 검사에 포함된다.
- 기존 head / Trail / reserved / control point / neutral core 조건과 safety 우선 ranking을 확인했다.
- 초기 상태 및 HUMAN Retry 이후 전체 상태가 baseline과 동일하다. 명시적 개발용 baseline의 spawn 결과도 동일하며 기존 trajectory hash 회귀 테스트가 통과했다.
- 실제 개발용 Practice에서 baseline은 R3 공간에 부활하고 territory-safe는 차단된 뒤 R4 공간에서 회복한다. 두 모드 모두 1 HUMAN + BOT 13, R56, Classic, 지급 7칸, 대기 3초, 재시도 1초다.
- Production Practice는 개발용 baseline override 또는 잘못된 respawnMode query를 무시하고 새 규칙을 기본 적용한다. 직접 생성자에 baseline 옵션을 전달해도 Production에서는 새 규칙을 사용한다.
- 실제 공개·친구방 RoomManager의 초기 전체 상태는 baseline createMatch 결과와 동일하다. HUMAN Retry와 접속 종료에 따른 대체 BOT 첫 spawn은 기존 경로를 유지하고, 사망한 BOT에게만 새 규칙이 활성화된다. 온라인 차단 후 회복과 Trail 안전성도 검증했다.

## Production과 직접 플레이

새 동작은 Development / Production Practice와 온라인 경기의 기본 규칙이다. 기존 baseline 비교는 Development/Test Practice의 `respawnMode=baseline`에서만 가능하다. Production은 이 override를 무시한다. AI, personality, 이동, capture, death, 단절, 승리 조건, 보상, UI와 기본 참가자 수는 수정하지 않았다.

이 작업 공간의 개발 서버에서 다음 주소를 열고 **클래식 → Practice**를 선택한다.

- 기본 새 규칙: `http://127.0.0.1:5320/?experimentSeed=1`
- 명시적 새 규칙(동일 동작): `http://127.0.0.1:5320/?respawnMode=territory-safe&experimentSeed=1`
- 기존 규칙: `http://127.0.0.1:5320/?respawnMode=baseline&experimentSeed=1`

새 규칙은 이전 B의 `territory-aware` 옵션과 구분하여 `territory-safe`를 사용한다. 모드 전환은 다른 주소를 열고 새 Practice를 시작하면 된다. 기본 총원은 14명이다. `experimentSeed`는 초기 seed를 지정하지만 실제 입력과 이후 플레이를 동일하게 만드는 기능은 아니다.

서버가 종료되면 이 브랜치 작업 공간에서 `npm run dev:client -- --host 127.0.0.1 --port 5320 --strictPort`로 재시작할 수 있다.

직접 확인할 항목은 BOT이 기존 영토에서 3겹을 띄우고 재등장하는지, 영토 유지가 쉬워지는지, 후반 공간 부족으로 전장이 지나치게 비는지, HUMAN Retry가 익숙한 기존 동작인지다. 자동 검사는 이 규칙의 정확성을 확인했으며 실제 플레이 체감 개선은 아직 판단하지 않았다.

Raw 결과: `evidence/safe-bot-respawn-fixtures.json`.
재현: `npx tsx scripts/safe-bot-respawn-validation.ts`, `npx vitest run tests/core/safe-bot-respawn.test.ts`.
브라우저 검사: `npx vite build --outDir .local/safe-respawn-client-build` 후 `npx playwright test --config playwright.safe-respawn.config.ts`.

추가 seed 시뮬레이션, 장시간 성능 분석, BOT AI 변경이나 다른 밸런스 변경은 수행하지 않았다. 기본 활성화와 master 통합은 사용자의 후속 요청으로 진행했다. 추적 중인 dist 배포 파일도 현재 master 소스 기준으로 다시 빌드했다. 기존 배포 파일이 오래된 상태여서 이전 master의 참가자 수·표현 변경도 생성물에 함께 반영되며, 해당 기능의 소스는 이번 작업에서 변경하지 않았다. 원격 배포나 실행 중인 서버 재시작은 별도다.
