# 이동 보고서 반영 — 2026-10-01

보고서의 핵심인 입력 목표와 실제 방향 분리, 서버·예측의 공용 회전 모델을 채택했다.
이후 U턴 반경 피드백으로 6→9rad/s로 조정했다. 최근 경로 기반 드래그 시도와
그 뒤의 고정 기준점 복원 및 스와이프 기준점 갱신 모두 모바일 체감 인수에 실패했다.
사용자가 PC 마우스는 좋고 봇 연습의 화면 드래그는 나쁘다고 확인했다. 이후
마우스와 동일한 절대 위치 터치 방식도 실기기에서 거절됐다. 2026-10-02 master
33fd73c 기준으로 모바일 입력만 다시 분리했다. touch displacement는 목표만
만들고 공용 회전 모델은 유지한다. Six.io와 동일한 체감으로 수용된 것은 아니다.
이전 입력 단계 회전은 authoritative 상태에 목표를 남기지 않고 클라이언트가
중간 방향을 패킷으로 계속 보내는 방식이어서 같은 구조가 아니었다.

## 구현

- `Participant.direction`: 실제 진행 방향. `targetDirection`: 마지막 입력 목표.
  null은 입력이 아직 없거나 새로 등장해서 현재 방향을 유지한다는 뜻이다.
- `rotateDirectionTowards`: 최단 회전, 단위 벡터, overshoot 방지, 0/비정상 벡터 보호.
  정확한 180도에서는 양의 회전 방향을 선택한다. 손가락을 놓아도 목표는 유지한다.
- `stepSteering`: 매 tick 회전 후 기존 `traceMovement`로 이동.
  서버 충돌·선·점령 이벤트도 이 실제 경로에서 계산한다.
- `Presentation`: snapshot의 실제·목표 방향에서 30Hz로 같은 함수를 재실행.
  미확인 입력 seq를 시간순으로 적용하고 ack된 입력은 제거한다. 입력 직전 이미
  표시한 선분을 소급 회전시키지 않도록 다음 tick 시작에 새 목표를 적용한다.
  네트워크 입력 수신 시각 차이는 기존 80ms 위치 보정으로 맞춘다.
- 입력은 목표를 바로 채택한다. 실제 회전은 입력 장치 종류나 pointer 이벤트
  빈도와 독립적이다. 연습과 봇도 같은 simulation을 사용한다.
- 봇은 회전 반경 + 한 tick 이동 거리 안에서 다음 경로 지점을 향하게 해,
  즉시 회전을 전제로 하던 지점 주변 공전을 방지한다.
- 속도 4.2칸/초, 회전 9rad/s. 30Hz에서 90도 6tick(0.200초),
  180도 11tick(0.367초). 이전 6rad/s보다 U턴 폭이 약 33% 작다.
  카메라·배율·맵·조작 UI·판정 규칙은 유지했다.
- 화면 드래그는 primary touch down에서 {pointerId,anchor}만 저장한다. move의
  current-anchor 길이가 28 CSS px 이상이면 정규화한 목표를 바로 발행하고
  anchor를 current로 갱신한다. 같은 방향에서도 anchor를 갱신해 긴 직진 후
  같은 크기의 수직 스와이프 감도가 약해지지 않게 한다. 거리 미달은 목표/anchor를
  유지한다. pointerup·cancel·lost capture·resize·blur·disable·mode 변경은 gesture만
  지우고 마지막 목표를 유지한다. 보조 touch는 새 주 gesture가 되지 못한다.
- Screen swipe는 GameScene.pointerDirection·mouse 2도 필터를 사용하지 않는다.
  입력 계층 회전·보간·recent path·각도 필터도 없다. PC mouse/keyboard, 공용
  movement·서버·Presentation·camera follow 및 packet 빈도는 master와 동일하다.
- Joystick radial dead zone 25%는 유지하고 별도 6도 deadband를 적용한다.
  accepted thumb heading은 즉시 목표로 발행한다. PC mouse는 기존 2도다.
- protocol v3: 목표를 snapshot에 포함하고 이전 클라이언트와 혼용을 거부한다.

## 보고서에서 구분할 부분

APK의 기본 `OldMove=false`, 플레이어 `RotateTowards(...,6*deltaTime,0)`는
정적 분석으로 확인했다. 반대 방향 차단은 네 방향 버튼 함수에서 확인했다.
드래그에도 동일한 차단을 적용한다고 단정하지 않고, 모든 장치에서 반대 목표를
받되 즉시 반전하지 않는 정책으로 통일했다. 원본의 이동·회전 갱신 순서는
HEXHOLD와 완전히 같지 않으며, world scale·거리 기준·각도 필터도 다르다.

보고서의 작은 조이스틱 흔들림 예시는 회전 제한만으로 완전히 해결되지 않는다.
기존 6rad/s, 30Hz면 tick당 약 11.46도, 현재 9rad/s면 약 17.19도이므로
2~5도 목표 변화는 한 tick에 도달할 수 있다.
Screen swipe의 파라미터는 TOUCH_SWIPE_THRESHOLD_PX=28 하나다. ±3px 노이즈의
두 점 차이(최대 약 8.5px)와 15~25px 짧은 되돌림을 거르면서 이전 32px보다
발동 거리를 줄인 초기값이다. CSS px이므로 zoom/DPR와 독립적이다.
Joystick 6도는 대표적인 45px thumb offset에서 1~3px 노이즈(약 1.3~3.8도)를
거르는 초기값이다. radial dead zone 직후에는 같은 위치 노이즈가 더 큰 각도가
되므로 실기기 수용이 필요하다. 두 값은 controls.ts에서 독립적으로 조정한다.

거리 기준만으로 유효 스와이프 끝점의 모든 각도 노이즈가 없어지지는 않는다.
28px 이상 이동에는 끝점 노이즈가 목표에 일부 남으며 테스트는 그 기하 범위와
목표 갱신 횟수를 확인한다. 지속적인 노이즈를 없앴다고 주장하지 않는다.

## 검증

- 코드/실제 Socket.IO 서버 테스트 156개 통과. 새 helper 검사 4개와 기존 공용
  회전·예측·서버·봇 판정 검사를 포함한다. 최종 명령/결과는 VERIFICATION.md에 기록한다.
- 회전 속도·최단 회전·반전·일정 속도·입력 해제 후 전진 검증.
- 연속 목표 변경과 지연 snapshot에서 서버/예측 위치 일치, mid-tick 입력의
  표시 위치 연속성, life/reset 후 오래된 목표 제거 검증.
- 절대 위치를 정답으로 가정하던 모바일 검사는 새 UX로 교체했다. touch down의
  목표 유지/zero mouse mapper 호출, 오른쪽·위쪽·반대 목표, 25px 되돌림 유지,
  40/160/400px 직진 뒤 45px 수직 입력, ±1~3px 노이즈, release·보조 touch·입력
  수명을 검사한다. 연습/온라인에는 같은 입력과 U자 경로를 주입해 확정 목표와
  중간 실제 방향·일정 속도·camera bound를 확인한다. joystick/mouse 필터 독립성도
  검사한다. `evidence/mobile-swipe-*-2026-10-02.json`에 현재 증거를 남기며 과거
  실패 증거는 유지한다.
  기존 반경 증거는 `evidence/u-turn-radius-comparison.json`,
  세부 결과는 `VERIFICATION.md`.

자동 검증은 실제 휴대폰의 편안함이나 Six.io와 동일한 체감을 증명하지 않는다.
9rad/s는 PC에서 좋다는 사용자 피드백에 따라 유지했다. 새 모바일 스와이프 체감은
실기기에서 다시 확인해야 한다.
