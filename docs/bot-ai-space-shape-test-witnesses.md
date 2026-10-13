# C의 알려진 대가: 기존 6개 테스트와 성공 장면 대응표

2026-10-14 사용자 추가 승인. 공격 합격의 기준은 고정 확장 1,024개이며, C의164/1,024가 기준155보다 나빠지지 않은 것이 아래 정비의 전제다. 단일 성공 장면을 골랐다는 사실을 성공률 개선의 증거로 쓰지 않는다. 확장 audit의 배치·memorySeed·사람 입력·분모를 바꾸지 않았다.

원래 6개 테스트는 삭제하거나 skip하지 않고 **입력과 assertion을 유지한 `it.fails`**로 보존했다. 미래에 원래 assertion이 모두 통과하면 expected-failure 테스트가 실패해 알려 준다. 기존 EXPAND memory1 회귀도 그대로다.

표의 t는 처치를 확인한 재생 종료 tick이며, 엔진의 개별 사망 eventTick과 구분한다.

|원래 실패 테스트 / 입력|대신 행동을 검증하는 새 성공 장면|유지한 검사|
|---|---|---|
|`bot-attack`: match123, 기존 slot별 memorySeed|같은 match123·스폰·무입력 사람, memorySeed에 XOR1만 추가; t268 실제 절단|사람 선≥5, ATTACK 수행, TRAIL_CUT·처치자·kill 귀속, 사람 선/마스크 제거|
|`medium-attack`: DEFEND, 기존 memory3, 정/역 스폰|같은 두 스폰·사람 짧은 루프, memory2/2; t48/t46 절단|원래 `assertActualCut` 그대로|
|`medium-attack`: ATTACK, 기존 memory15, 정/역 스폰|같은 두 스폰·사람 짧은 루프, memory12/12; t46/t46 절단|원래 `assertActualCut` 그대로|
|`medium-attack`: SEEK_POINT, 기존 memory8, 정/역 스폰|같은 두 스폰·사람 짧은 루프, memory2/5; t54/t46 절단|원래 `assertActualCut` 그대로|
|`medium-attack`: EXPAND, 기존 memory3, 정/역 스폰|같은 두 스폰·사람 짧은 루프, memory12/12; t46/t46 절단|원래 `assertActualCut` 그대로|
|`bot-return-after-kill`: ATTACK, 기존 memory15|같은 match115·사람 루프, memory12; t46에 처치 당시 자기 선1칸, 이후6tick에 실제 귀환|kill1, 귀환 중 ATTACK/RETURN/ESCAPE만,90tick 안 생존·선0·자기 소유 칸; 실제 절단 귀속과 처치 시 선>0도 추가|

짧은 루프의 공통 assertion은 ATTACK>0, 최대 사람 선2~6, 사람 점령0, ELIMINATED/TRAIL_CUT/사망1, 해당 봇의 EXISTING_TRAIL_CONTACT 처치, 봇 kill1, 사람 선0·마스크0이다. 새 성공 장면의 assertion을 약하게 하지 않았다. post-kill 테스트는 처치 당시 노출 선이 실제 있어야 하므로 귀환 없는 장면으로 대체하지 않았다.

스폰·소유·위치·선·목표를 직접 주입하지 않고 원래 이동/점령/사망 엔진으로 재생했다. 테스트 helper의 기본 memorySeed3/15/8/3도 바꾸지 않았다. idle helper를 추출할 때 기본 XOR0은 원래 slot별 시드와 정확히 같다. 고정 테스트용 양성 장면은 memorySeed1~256 오름차순에서 원래 모든 assertion을 통과하는 첫 장면, idle은 XOR1~64 중 첫 장면으로 찾았다. 후보 목록·모든 시도는.local에, [장면 요약](../evidence/bot-space-shape-adoption/test-witnesses.json)은 저장소에 보존한다.

별도 테스트 유지보수는 다음과 같다.

- B-quiet의 원래6경계+열린1경계에 맞춰 해당 초기 fixture의 후보 한도36→42를 반영했다. 총경로·선예산·실제 귀환·결정성 검사는 그대로다.
- 승인된 동선 변경의 궤적 해시4개만 갱신했다. 스폰/소유 수·실제 점령·벽사망0·성공 스폰 검사는 그대로다.
- seed78의 절단 전환은 tick78 고정 대신 실제 EXPAND/STEAL→ATTACK 전환을 확인한다. C가 이미 ATTACK을 시작한 것을 실패로 세지 않으며, 실제 처치·봇 생존·자기 땅 귀환·선 제거·처치 귀속은 모두 유지했다.

중거리16개의 C 새 실패10·13·16과 이 6개 원래 테스트는 모두 **C의 알려진 대가**로 남긴다. 새 성공 장면은 실제 행동/물리를 검증하는 fixture이며, 기존 실패의 삭제나 확장 audit의 유리한 표본 교체가 아니다.
