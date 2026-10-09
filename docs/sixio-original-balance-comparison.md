# Six.io 1.1.8 APK와 현재 플레이테스트의 난이도 차이

분석일: 2026-10-09. 사용자가 제공한 APK의 `Assembly-CSharp.dll` 메타데이터와 IL을 정적으로 읽었다. 원본을 기기에서 실행하거나 실제 난이도를 측정한 결과는 아니다. 이번 작업에서는 게임 규칙, AI, Production 및 플레이테스트 서버를 변경하지 않았고 추가 headless simulation도 실행하지 않았다.

## 핵심 판단

원본은 14명이라는 인원 외에도 **공격 역할 제한, HUMAN 주변 스폰 제외, 초반 공격 유예**를 함께 사용한다. 현재 구현은 다른 정책으로 만든 게임이므로 인원과 재스폰 거리만 조정해 원본 체감을 재현할 수 있다고 보기는 어렵다. 특히 현재의 모든 성격이 조건에 따라 Trail 공격에 참여하며, 상대 귀환 시간과 반격 시간을 계산한다. 이것이 HUMAN의 실제 사망 원인이라는 결론은 아직 내릴 수 없다.

## APK에서 확인한 동작

| 항목 | Six.io APK | 현재 B HUMAN 플레이테스트 |
|---|---|---|
| 참가자 | 기본 HUMAN 1 + BOT 13 | HUMAN 1 + BOT 13 |
| 맵 | 100×100 배열, 점유율 분모 10,000 | R56, playable 9,577 |
| 기본 시작 영토 | 중심 ±1의 배열 좌표 3×3 = 9칸 | hex R1 = 7칸 |
| 의도적인 공격·강탈 역할 | BOT ID 2~14 중 짝수 7개만 IsAttacker와 IsThief 활성화 | 성격 4 EXPAND / 3 ATTACK / 3 DEFEND / 3 SEEK_POINT. 모든 성격에 공격 후보 평가 경로 존재 |
| 초반 공격 유예 | GamesPlayed < 6 AND CurrentScore < 3이면 CheckAttack 생략 | 이에 해당하는 HUMAN 진행도 기반 공격 유예 없음 |
| 공격 대상 선택 | HUMAN의 노출 Tail을 검사하고 범위 안에서 가장 가까운 좌표 선택 | 모든 관측 상대의 Trail을 평가, 접근·귀환 경로 및 귀환/반격 시간 비교 |
| 강탈 대상 선택 | HUMAN 영토에서 RandomPointInBase로 한 점을 뽑아 범위 확인 | 여러 확장 후보의 실제 포획량과 stolen cells를 점수화 |
| BOT 스폰 기본 조건 | 중심 ±3의 7×7 배열 영역에 살아 있는 owner 영토나 노출 Tail이 있으면 제외 | 기존 7칸 core 조건 + B의 core→전체 owned territory hex 거리 >=2 |
| HUMAN 주변 추가 스폰 제외 | HUMAN 영토는 중심 ±4, HUMAN Tail은 중심 ±9 배열 영역에서 별도 검사 | owner 종류를 구분하지 않고 전체 territory distance 우선 ranking. HUMAN Tail 전용 추가 제외 없음 |
| BOT 재등장 | Move 호출의 frameCounter가 120 이상인 검사 시점에 죽은 BOT들을 StartPlayer로 재시도 | 각 BOT 사망 후 3초, 실패 시 1초 retry |
| 사망 영토 | Die에서 해당 owner 영토를 모두 neutral로 변경 | 사망 영토 모두 neutral |
| 승리 | CurrentScore >=100이면 승리 UI | Classic 100% |

원본은 시각적으로 hex 타일을 사용하지만 로직에 2차원 배열 좌표와 4방향 탐색이 등장한다. 위 ±3/4/9를 우리 코드의 hex radius나 core 경계 거리로 그대로 치환하면 안 된다. 원본 스폰은 무작위 후보를 먼저 시도한 뒤 좌표 순서로 탐색하며, territory에서 가장 먼 후보를 전역 ranking하는 B 방식과 다르다. HUMAN 최초 입장 시점에는 HUMAN이 살아 있지 않아 해당 추가 보호 검사가 통과할 수 있다. 따라서 위 HUMAN 보호가 모든 최초 BOT 배치에도 적용된다는 뜻은 아니다.

120프레임은 초 단위의 사망 후 지연이 아니다. `frameCounter`의 이전 값이 120 이상이면 재등장 검사를 한다. FPS, 사망 시점 및 빈 공간에 따라 실제 대기 시간이 달라지므로 이를 고정 2초/4초 respawn으로 해석하지 않는다.

역할 제한은 **계획된 공격·강탈의 제한**이다. 비공격 BOT도 이동 중 우연히 Trail을 자를 수 있고 확장 경로가 다른 영토를 포함할 수 있다. 원본이 HUMAN만 보호하거나 공격하지 않는 게임이라는 해석도 틀리다. 의도적인 공격·강탈 대상은 오히려 LocalPlayer로 명시되어 있다.

## 공격 정책의 중요한 차이

현재 `planAttack()`의 `ordinary`에는 성격별 확률이 적용된다. 그러나 `reward`와 `opportunity` 같은 별도 조건으로 확률 검사를 통과하지 않아도 공격 후보가 남을 수 있다. 따라서 EXPAND의 attack=0.08만 낮춰도 기회 공격이 같은 비율로 줄어든다고 보장할 수 없다. `getBotInput()`은 확장·강탈뿐 아니라 제한된 RETURN 상태에서도 짧은 공격으로 경로를 바꿀 수 있다.

원본은 공격·강탈·도주 상태에서는 새로운 CheckAttack/CheckStealFromLocal을 시작하지 않는다. 도주를 먼저 평가하고, 담당 BOT만 공격을 검사하며, 공격을 시작하지 않았다면 강탈을 검사한다. 현재도 위험 회피와 상태 유지가 있지만 원본과 같은 역할 제한은 없다. 원본의 CheckAttack 경로에서 우리 구현의 ETA, victim return forecast, counter-cut score에 대응하는 계산은 확인되지 않았다.

## 충돌 및 포획 판정도 완전히 같지 않다

HUMAN이 관련된 원본 Trail 접촉은 인접 3×3 배열의 TailEdge 세 점과 head 위치의 거리가 0.75 미만인지 확인한다. BOT 대 BOT은 같은 배열 좌표의 Tail 존재 여부를 사용한다. 현재는 연속 이동의 hex cell 진입 시점마다 해당 cell의 Trail mask를 검사한다. 두 단위와 표현이 달라 수치만으로 어느 쪽이 더 관대하다고 확정할 수 없다.

현재 `applySimultaneousCaptures()`는 포획 영역과 적 Trail의 겹침을 `TRAIL_CAPTURE`로, 출발 영토 연결 상실을 `HOME_CAPTURE`로 별도 사망 처리한다. 원본의 `TailToMap/FillArea/Rebounds`에서는 같은 독립적인 즉시 사망 검사가 확인되지 않았다. `FillArea`에는 칠하는 기존 owner 영토의 좌표에 그 owner head가 있을 때 Die를 호출하는 경로가 있고, `Rebounds`에는 영토 정리 후 보유량 0이면 Die를 호출하는 경로가 있다. 원본이 해당 상황에서 무조건 살아남는다고 일반화할 수는 없지만, 현재 사망 판정과의 동등성은 성립하지 않는다.

## 최근 실제 HUMAN 로그와 연결

최신 `respawn-play-territory-aware-seed-1-tick-6461.json`의 세 번째 생명은 최고 10.4%, 생존 140.04초였다. Capture Gain 1,249, enemy capture Loss 330, disconnected Loss 23, 사망 소실 903칸이다. 직접 강탈 330칸 중 BOT respawn 후 30초 이내 강탈은 47칸이다. 17개 성공 BOT respawn의 territory 거리는 모두 11~24칸이며, 평균 ALIVE는 13.76이었다.

이 기록은 B의 인접 재스폰 제거가 작동하며, 나머지 강탈과 생존 압력이 남아 있음을 보여준다. 사망 원인/가해자가 현재 export에 없어 그 압력을 Trail hunting이나 특정 사망 규칙의 탓으로 확정할 수는 없다. 실제 HUMAN Baseline 대조 로그도 없어 B의 실제 개선 폭은 알 수 없다.

## 추천하는 다음 단계

1. 기존 HUMAN Run 로그에 이미 존재하는 deathContext.cause와 killerId만 연결해 실제 종료 원인을 확인한다. 새 대규모 계측은 필요 없다.
2. 다음 AI 실험을 한다면 **비공격 역할의 공격 참여 조건**을 첫 후보로 둔다. 영역 확장/방어 역할이 멀리 있는 Trail을 기회 공격하는 범위를 제한하는 단일 변경을 비교한다. 공격 성격 비율, steal weight, respawn, 이동 및 사망 규칙을 동시에 바꾸지 않는다.
3. 로그에서 HOME_CAPTURE/TRAIL_CAPTURE가 주요 사망이면 원본과 사망 판정 차이를 먼저 검토한다. 직접 Trail 접촉이 주요 사망이면 역할 제한 가설을 먼저 검토한다.

원본 HUMAN 전용 스폰 보호는 이전에 합의한 owner 공정성 정책과 다르므로 자동 복사할 항목으로 추천하지 않는다. 원본의 초반 진행도 보호 역시 별도의 제품 규칙 선택이다. 이번에는 분석과 제안만 남긴다.

## 재검증 자료

- 입력 APK: `C:/Users/Home Bsw/Downloads/Telegram Desktop/Six.io 1.1.8.apk`
- APK SHA-256: `725D424475D738173093DE6AE812A8B2715438A0523B09E34186926F6F785DE1`
- IL 추출기: `.local/apk-analysis/inspect-all-il.ps1`
- 관련 원본 IL: `.local/apk-analysis/balance-evidence-il.txt`
- 전체 Game/Player/Bot/Settings IL: `.local/apk-analysis/gameplay-il.txt`
- 핵심 위치: StartPlayer IL_0200–IL_0245 (역할), ChangePlace IL_04C2–IL_0591 (호출 제한/초반 보호), IsFarFromLocal IL_0000–IL_00EF (HUMAN 주변), GetPosition IL_0043–IL_0067 및 후속 탐색 (스폰), CheckAttack IL_0075–IL_00E1 (대상 점수), Move IL_018D–IL_01AF (생성 주기), Die IL_01CA–IL_01CC (영토 제거).
- 비교 대상: `src/shared/bot.ts`, `config.ts`, `engine.ts`, `life.ts` 및 B worktree의 `spawn.ts`, `territory-aware-respawn.ts`. master와 B의 bot.ts SHA-256이 동일하다. engine.ts의 차이는 소유권/정리 계측에 원인과 eventTick을 전달하는 두 호출뿐이며, 비교한 사망 판정 로직은 동일하다.
