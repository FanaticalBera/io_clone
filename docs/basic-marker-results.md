# Basic Ring / Target 정식 적용

사용자가 승인한 대비 개선안을 Ring / Target의 기본 도형으로 적용했다. 개발/test/production에 공통이며 URL 옵션이 필요 없다. 과거 `experimentBasicContrast=0/1` URL도 새 기본 디자인을 표시한다.

- Ring: 빈 중앙 유지, 밝은 테두리 + 어두운 경계 + 선택 색상. 본체 외경 48 world units.
- Target: 내부 작은 원을 제거하고, 테두리를 두른 바깥 원 / 십자선 / 중앙 점 사용. 십자선 전체 폭 48 world units.
- 참가자 식별 링은 기존 반경 25.5와 Player Color를 유지한다.
- HUMAN / BOT 게임 렌더링, 상점, 프로필 미리보기가 `markerArt`와 `basic-marker-art.ts` 도형을 공유한다.
- Default / Hex / IMAGE 디자인과 IMAGE 크기 48, 닉네임, 카메라 줌은 변경하지 않았다.
- 프로필/구매/Coins/저장 schema, collision, capture, trail, slot, BOT AI 변경 없음.
- 실험 플래그와 Scene/UI의 실험 옵션 전달 경로는 제거했다.

검증: 전체 Core/server 74개 파일 · 412개 테스트 통과. client/server/test 타입 검사와 production build 통과.

[게임 열기](http://192.168.137.1:3003/)

변경 파일: `src/client/basic-marker-art.ts`, `src/client/marker-art.ts`, `tests/core/basic-marker.test.ts`, `tests/e2e/basic-marker.spec.ts`, `playwright.run.config.ts`, 빌드 산출물. 승인 전 기록과 비교 스크린샷은 별도로 보존했다.

브라우저 최종 결과: 일반 URL / 과거 테스트 옵션 URL / production 기본 적용 3개 케이스 모두 통과. 844×390, 640×320, 568×320 모바일 touch / DPR 3 에뮬레이션에서 실제 자기 영토 중앙의 Ring / Target과 상점·프로필 도형을 확인했다. page error 0, 문서 세로 overflow 없음. 실제 휴대폰 평가는 사용자가 승인한 테스트 디자인을 그대로 적용하는 방식으로 진행했다.
