# 진단 증거 보관

`evidence/`에는 집계, 원인별 대표 사례, 재현 시드, 판정 결과만 커밋한다.
전체 맵의 owners/trailMasks 스냅샷과 매 프레임 journal은 `.local/evidence/`에 보관한다.
`.local/`, `artifacts/`, `tmp/`는 Git ignore 대상이다.

진단 스크립트는 기본으로 요약을 출력하고, `--raw`를 지정한 경우에만 원본을 출력한다.
PowerShell 예시:

```powershell
npx tsx scripts/death-audit.ts | Out-File -Encoding utf8 evidence/death-diagnostic-summary.json
npx tsx scripts/contact-diagnostic-audit.ts | Out-File -Encoding utf8 evidence/contact-diagnostic-summary.json
npx tsx scripts/origin-capture-audit.ts | Out-File -Encoding utf8 evidence/origin-capture-after-summary.json
New-Item -ItemType Directory -Force .local/evidence
npx tsx scripts/death-audit.ts --raw | Out-File -Encoding utf8 .local/evidence/death-diagnostic-v2.json
```

수정 전 origin 요약은 당시 실행 결과를 보존한 자료이므로 현재 코드 실행 결과로 덮어쓰지 않는다.
사망 요약은 모든 판의 원인별 수와 실패 목록을 보존하고, 원인마다 대표 사건 하나를 남긴다.
접촉 및 origin 요약은 시나리오별 결과와 사건 정보를 남기고 전체 맵 스냅샷과 frame journal을 제외한다.

기존 원본을 제거하는 새 커밋을 만들어도 과거 커밋의 원본은 Git 이력에 남는다.
또한 `.gitignore`는 이미 추적 중인 파일을 자동으로 해제하지 않는다.
이미 추적 중인 `node_modules/`와 기존 `.local/` 파일의 추적 해제, 과거 이력 재작성은 별도의 정리 범위다.
