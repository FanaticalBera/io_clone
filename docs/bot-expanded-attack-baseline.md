# 확장 공격 audit 기준 — 근거리7배치·먼 배치1개

2026-10-13 · 기준 측정 완료 · AI 변경/개선 비교 아님

사용자가 승인한 기존 R22 스폰 유지 조건으로 배치를 바꿨다. 초기 거리5칸4배치,12칸3배치,17칸1배치다. **실제 선 절단155/1,024 = 15.14%**, 근거리만 보면155/896 =17.30%다. 기존16개는 **13/16**, 실패ID5·6·14와 별도known seed1도 그대로다. 확장 수치는 첫 기준이며 개선/퇴보나 새로운 합격 한도를 뜻하지 않는다.

## 결과를 보기 전 선정한 규칙

R22·2인 createMatch는 고정8개 스폰을 섞는다. 가능한 초기 거리는5·12·17·22·29·34칸이고 matchSeed로7·9칸을 만들 수 없다. 이를 알리고 사용자는5·12칸 중심의 기존 스폰을 승인했다. 맵/인원을 바꾸거나 수동 위치를 주입하지 않았다.

0~4095의 matchSeed를 오름차순으로 훑어 각 서로 다른 **사람/봇 순서가 있는 스폰 쌍**의 최초 seed를 후보로 기록했다. 전체56쌍을 발견했고 각각 실제 createMatch로 확인했다. 선정은5칸4쌍 전부,12칸4쌍 중 최소seed 순서의 앞3개,17칸 이상 중 가장 짧은 거리/최소seed 순서1개다. 그 결과13·17·44·115 /6·11·16 /2를 고정했다.12칸의 미선정 후보50도 후보 목록에 남겼다.

공격 결과 전에 [프로토콜](../evidence/bot-expanded-attack-baseline/protocol.json)을 쓰고 동결했다.1,024개 사례ID·source SHA256·전체 후보 목록·선정 규칙을 보존했으며 결과를 보고 배치를 교체하지 않았다. source는 승인된133ee1f의 원본이다. 동일 사람의4개 원래 루프와memorySeed1~8·성격4개·identity·실제 디렉터를 썼다.

각 배치의4개 사람 루프, 총32개를 native 회전/이동으로 먼저 검증했다. 모두500tick 안에 경로를 완료했고 벽에 막히지 않았다. waypoint/18world-unit 도달 조건·실제 사람 입력 생성은 원래 검사와 같다. 사람 루프를 봇에게 미래 입력으로 제공하지 않았다.

## 실제 선 절단 결과

|matchSeed|초기 거리|실제 선 절단/128|성공률|현재 관측 선이 한 번도 없었던 사례|
|---:|---:|---:|---:|---:|
|13|5|0|0%|0|
|17|5|0|0%|0|
|44|5|56|43.75%|0|
|115|5|99|77.34%|0|
|6|12|0|0%|69|
|11|12|0|0%|3|
|16|12|0|0%|0|
|2(먼 배치)|17|0|0%|109|
|전체|—|**155/1024**|**15.14%**|181|

주 지표는 고정 사례 전체를 분모로 한다. 해당 봇에 귀속된 EXISTING_TRAIL_CONTACT/PENDING_TRAIL_CONTACT 사망만 성공이며 HOME_CAPTURE·벽 사망은 성공이 아니다.155개 중 실제 ATTACK이 선택한 사람을 노리는 동안의 절단은138개이고 다른 행동 중 절단은17개다. 봇 사망1개는 같은 tick에 양쪽이 절단된 사례로 성공과 함께 별도 기록했다.

|성격|성공/256|성공률|그중 ATTACK 중 절단|
|---|---:|---:|---:|
|선사냥꾼|40|15.63%|35|
|영역탐험가|43|16.80%|38|
|안전지킴이|38|14.84%|33|
|영역도둑|34|13.28%|32|

memorySeed별 성공 수(각128개)는15·19·19·12·23·24·22·21이다. 루프별 성공 수(각256개)는41·7·49·58이다. [전체 사례CSV](../evidence/bot-expanded-attack-baseline/cases.csv)와 [축별 요약](../evidence/bot-expanded-attack-baseline/summary.json)에 분자/분모를 남겼다. 후보 거절의 전체trace는.local에 보존했다.

같은5칸이라도 배치/진행 방향에 따라0~77.34%로 크게 다르다.12칸에서도 모든 seed16 사례는 선을 관측했지만 절단은0이다. ‘멀어서 못 봄’만으로 전체 실패를 설명할 수 없다. 다만 관측 선이 있다고 현재 도착 ETA·귀환·역절단 조건을 통과하는 공격 기회가 있었다는 뜻은 아니다. 이번에 NO_APPROACH 추가 분해나 공격 수치 조정은 하지 않았다. 결과가 낮다고 배치를 사후 제외하거나 절대 성공률 목표를 새로 정하지 않는다.

## 정합성·공정성

- 기존16개와 같은 L115/M07 조합이 정확히13/16이며 기존 성공13개 새 손실0이다. 원래memorySeed1·identity 없음/direct fixture도 재생하여 ATTACK0tick·사람t76 생존/점령1회임을 확인했다. 기대 실패 테스트는 수정하지 않았다.
- 사전 고정44사례(기존16개+다른7배치 각각4성격의M07/R01)에서 observer ON/OFF의 전체 궤적·메모리·다음 행동 RNG·디렉터/예약이 같다.
- 먼 배치에서32개의 초기 판단(memorySeed8×성격4)을 비교했다. 관측 밖 사람의 숨은 intent 또는 위치/heading을 바꿔도 봇 입력·메모리·RNG·예약이 같다. 이는 초기 판단 공정성 확인이며 다른 사람 움직임의 미래 경기까지 동일하다는 주장이나 전체 공정성 증명은 아니다.
- 새 audit 스크립트 strict 타입 검사를 통과했다. 이번에는 기준 측정뿐이라 개선 비율·성능 개선·사람 플레이 통과를 보고하지 않는다.

원본은.local/bot-expanded-attack-baseline-v2에 보존한다.32개 물리 사전검증과44개 비간섭 검사도 원본에 있다. 초기 임시 프로토콜은 결과 실행 전에 최종 선정 규칙으로 교체했고 보존했으며, 위v2가 실제 실행한 프로토콜이다. 앞으로 같은 고정 사례의 성공→실패/실패→성공과 축별 차이를 비교한다.

```powershell
node --import tsx scripts/prepare-bot-phase04-perimeter.ts --out=../NEW_BASE_SOURCE
node --import tsx scripts/bot-expanded-spawn-candidates.ts --out=../NEW_CANDIDATES.json
node --import tsx scripts/prepare-bot-expanded-attack.ts --out=../NEW_ATTACK --candidates=../NEW_CANDIDATES.json --source-protocol=../NEW_BASE_SOURCE/protocol.json
node --import tsx scripts/bot-expanded-attack-audit.ts --root=../NEW_ATTACK
node --import tsx scripts/bot-expanded-fairness-audit.ts --root=../NEW_ATTACK
```

prepare는 명시한 원본 source/후보 파일을 참조한다. 현재 helper는 승인 기준133ee1f를 동결한다. 다음 행동 버전과 비교할 때는 별도로 해당 버전의 source를 동결하며, 기존 결과를 덮어쓰지 않는다.
