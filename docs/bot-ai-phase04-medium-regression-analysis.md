# 4단계 첫 작업 — 중거리 공격 회귀 원인 분석

2026-10-13 · 분석만 완료 · 공격·안전 수정은 미구현

**최초 손실은6c307e3(출발 안전 추가)다.** 직전fafca32는16/16이고6c307e3부터12/16이다. 네 사례 모두 t4에서 예측 겹침으로 확장 출발이 차단되며 동선이 바뀐다. t37에는 기존 공격 도착 ETA 조건을 통과하지 못한다. REPOSITION이나 전술100ms 도입이16→12 최초 손실의 원인은 아니다.

## 동결 소스와 같은16개

0384f9a부터c84fc7a까지 ancestry 경로의19커밋을 모두 검사했다. 행동 변경뿐 아니라 중간 문서·계측 커밋도 포함하여 최초 손실 전후의 빈틈을 없앴다. 각각 `git archive`로 커밋의 shared 소스를 동결하고 하나의 동일한 audit 스크립트로 실행했다. 소스 선택 외에 코드·스폰·사람 입력·봇 시드를 수정하지 않았다.

R22·spawnRadius2(19칸)·matchSeed115·memorySeed7·사람#0/봇#1, 성격4개×원래 경로4개, identity+실제 예약 디렉터를 사용한다. DEATH의 처치자가 봇이고 EXISTING_TRAIL_CONTACT/PENDING_TRAIL_CONTACT일 때만 실제 선 절단 성공이다. HOME_CAPTURE는 제외한다. 원래memorySeed1 기대 실패는 별도 사례다.

|동결 커밋|성공|실패 ID|
|---|---:|---|
|0384f9a|16/16|없음|
|8485fe2|16/16|없음|
|afad5b3|16/16|없음|
|989b1a8|16/16|없음|
|02c4e18|16/16|없음|
|65034bd|16/16|없음|
|e78d495|16/16|없음|
|b819897|16/16|없음|
|ddb240d (REPOSITION)|16/16|없음|
|be57388|16/16|없음|
|cbcc9c7|16/16|없음|
|e4e2f08 (위험 역공)|16/16|없음|
|c1f2df1|16/16|없음|
|fafca32 (직전 부모)|16/16|없음|
|**6c307e3 (출발 안전)**|**12/16**|**5·6·13·14**|
|71dd161|12/16|5·6·13·14|
|abfeedd (재배치 시작 검사)|12/16|5·6·13·14|
|99cf951 (검사 순서 최적화)|12/16|5·6·13·14|
|c84fc7a|12/16|5·6·13·14|

ID5·6은 선사냥꾼 경로1·2, ID13·14는 영역도둑 경로1·2다. 후속3A는12/16, 승인된 전술100ms는13/16이며 ID13만 회복했다. [전체19×16 결과CSV](../evidence/bot-phase04-medium-history/scenarios.csv), [커밋별 집계](../evidence/bot-phase04-medium-history/commits.csv), [동결 출처 해시](../evidence/bot-phase04-medium-history/sources.json)를 남겼다. audit 스크립트 동결 SHA256은 `e32ad256797560a235f27676ac79853afbfc6796358ab5b1e873c134959f81d0`이다.

## 최초 판단 차이와 뒤의 공격 기회 손실

네 사례 모두 t0~3의 조향과 상태가 같고, **첫 차이는 t4**다. 출발 안전이 첫 외부 칸700을 검사한다. 사전 필터7칸 안에 관측된 사람 머리1개가 있으며 검사를 건너뛰지 않는다. 봇의 예상 노출 시작은0.3990초, 상대의 현재 방향을 그대로 유지한 예측은0.6477~0.6870초에 칸700을 통과한다. `PREDICTED_OVERLAP`으로 확장을 막고 RETURN·자기 땅 경로744로 전환한다. 부모는 기존 EXPAND를 계속한다.

|t37, 같은 표적612|fafca32|6c307e3|
|---|---|---|
|봇 머리 칸|699|790|
|표적까지 거리|2칸|5칸|
|도착 ETA|0.5000초|1.3346초|
|상대 귀환 ETA, 경로1 / 경로2|1.0000 / 0.7333초|같음|
|공격 여유|0.1초|선사냥꾼0.25초, 영역도둑0.1초|
|후보 판단|SELECTABLE → ATTACK|VICTIM_RETURNS_FIRST|
|공격 상태 tick 수|15|0|
|사람 결과|t52 봇의 실제 선 절단으로 사망|경로1 t81 / 경로2 t76 생존|

출발 안전은 확장·탈취의 첫 외부 칸에 적용하며 ATTACK을 직접 차단하는 검사가 아니다. 초기 확장 동선을 바꿔 훗날 공격 접근 거리·각도를 불리하게 만든 간접 경로다. 선사냥꾼의 여유0.25는 변경된 거리에 따른 기존 판정이며 새로운 공격 임계값이 아니다. 실패를 공격 확률이나 원한 가산점 부족으로 설명할 근거도 이 사례에서는 없다.

## 예측과 실제 이동 검증

상대는 실제로 방향을 튼다. t4부터1초 동안, 부모/자식 네 사례의 **매 tick 실제 이동 선분240개**를 동결 movement의 칸 진입 계산으로 재구성했다. 각 선분의 끝 위치·칸이 원래 재생과 일치함을 검증했고, 프레임 사이에 잠깐 통과한 칸도 포함했다. **칸700 실제 방문은 모두0**이다. 경로1은573→572→613→612→611→569, 경로2는573→572→613→612→570→529를 지난다.

따라서 이 고정 입력에서 t4의 직진 예측 겹침은 실현되지 않았다. 그러나 미래 방향 전환은 봇이 t4에 알 수 없는 정보다. 이는 사후 원인 분석이지 미래 입력을 판단에 주자는 제안이 아니다. 네 고정 장면의 보수적 차단을 확인한 것이며, 자연 대전 전체의 차단 오류율이나 출발 안전이 불필요하다는 결론은 낼 수 없다. 기존8시드 보유·사망 검토로 출발 안전 유지가 승인된 결정도 그대로다.

[최초 차이·ETA·예측/실제 구간 요약](../evidence/bot-phase04-medium-history/summary.json)에 네 사례를 모두 기록했다. 전체 소스·19개 원본audit·부모/최초 손실의 frame·선분 검증은 `.local/bot-phase04-medium-history`에 보존하고 큰JSON을 저장소에 추가하지 않는다.

## 완료 범위와 다음 단계

최초 커밋 특정과 원인 분석을 완료했다. 출발 안전 제거·예측 완화·공격 ETA 조정·추가 가산점은 이번 작업에서 하지 않았다. 4단계의 실제 수정안은 이 근거를 검토한 뒤 별도 승인 대상이다. 앞으로 모든 단계 합격 보고에 같은16개 결과·기준 대비 새 손실/회복·알려진 실패를 필수로 넣는다.

재현은 기존 원본을 보존할 새 출력 폴더를 지정한다.

```powershell
node --import tsx scripts/bot-phase04-medium-history.ts --out=../NEW_MEDIUM_HISTORY
node --import tsx scripts/medium-attack-audit.ts --source=../NEW_MEDIUM_HISTORY/fafca32/source --phase01 --phase02 --frames --out=../NEW_MEDIUM_HISTORY/parent-frames.json
node --import tsx scripts/medium-attack-audit.ts --source=../NEW_MEDIUM_HISTORY/6c307e3/source --phase01 --phase02 --frames --out=../NEW_MEDIUM_HISTORY/first-break-frames.json
node --import tsx scripts/summarize-bot-phase04-medium-history.ts --raw=../NEW_MEDIUM_HISTORY --out=../NEW_MEDIUM_SUMMARY
```

새 실행은 현재 audit 스크립트를 출력 폴더에 동결한다. 선택적frames 추가 전의 역사 실행과는 스크립트 해시가 달라질 수 있으므로 자신의 동결본/해시를 함께 보존한다. 기본audit 결과를 바꾸지 않았음은 최종3단계의 원본JSON 동일성으로 별도 확인했다.
