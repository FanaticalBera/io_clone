# 모바일 렌더링 선명도 — 2026-10-04

모바일은 서버 영상을 받는 방식이 아니라 Phaser 캔버스를 직접 그린다. 기존 캔버스는 CSS 크기와 backing 크기가 같아서 고밀도 화면에서 늘려 표시됐다.

`renderPixelRatio`가 devicePixelRatio를 최대 3배로 반영한다. 추가 배율은 약 400만 픽셀 예산으로 제한하며 기본 1배 아래로 내려가지 않는다. Phaser 3의 실제 캔버스 크기를 늘리고 CSS 표시 크기는 유지한다. 카메라 zoom에 배율을 곱하고 마우스 좌표를 backing 좌표로 변환해 전장 범위·캐릭터 크기·18 CSS px dead zone을 유지한다. 닉네임·전투 문구의 Text resolution과 미니맵 backing 크기도 조정한다. 모바일 600 CSS px 기준의 배율·글자 크기는 실제 화면 너비를 사용한다.

자동 검증에서 CSS 844×390, DPR 3은 실제 2532×1170으로 렌더링됐다. DPR 1·2·2.625·3의 세로/가로 화면, 좌표 변환·dead zone·카메라 중앙·보이는 세계 너비·전투 문구 위치·글자 해상도를 검사했다. 실제 CDP 터치로 연습·온라인 조이스틱과 화면 드래그, 회전, 미니맵, DPR 변경을 검사했다. 극단적인 DPR 4/1920×1080에서는 추가 배율이 픽셀 예산으로 제한됐다.

검증 자료: `evidence/mobile-resolution.json`, `mobile-resolution-before.png`, `mobile-resolution-after.png`. before 이미지는 수정된 렌더러의 1배 출력으로 기존 해상도 조건을 재현한 고정 게임 fixture이고, after는 같은 fixture의 3배 출력이다. 자연 플레이나 실기기 인수 증거가 아니다.

`npm run build` 및 최종 `npm run typecheck` 통과. 관련 브라우저 검사 13개를 여러 실행에서 확인했다. 최종 mobile/resolution 실행에서 5개 모두 개별 PASS를 출력했으며, Windows의 webServer 종료 대기가 끝나지 않아 모든 테스트 완료 후 해당 실행만 Ctrl+C로 정리했다. 따라서 전체 러너 exit 0이나 전체 브라우저 스위트 완주로 기록하지 않는다. 초기 실패는 기존 2배 이하 기대값, 과도하게 엄격한 Float32/분수 배율 좌표 오차, 짧은 CPU 렌더링 표본이었다. 모바일 입력 검사는 시드를 고정하고 이벤트 결과를 poll하며, 카메라 표본은 2.5초로 늘렸고 연속 이동의 허용 오차와 최소 표본 요구는 유지했다.

자동 Chromium은 SwiftShader CPU 렌더러다. 실제 S24에서 새로고침 후 전장·닉네임 선명도와 `?metrics=1`의 FPS, 몇 분 플레이한 뒤 발열을 재확인해야 한다. 실제 폰의 결과가 나오기 전에는 성능 인수 완료로 표시하지 않는다.
