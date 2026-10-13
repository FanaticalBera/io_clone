import json,csv
from pathlib import Path
s=json.loads(Path('evidence/bot-phase03b-separation/summary.json').read_text(encoding='utf-8'));a=s['aggregate'];b=a['baseline'];roles={'ATTACK':'선사냥꾼','EXPAND':'영역탐험가','DEFEND':'안전지킴이','SEEK_POINT':'영역도둑'};names={'baseline':'3A','tactical':'전술100ms만','strategy':'개인별전략만','combined':'전체3B(미채택)'}
sign=lambda n,k: s['signals'][n][k];direction=lambda d:'증가 신호' if d['direction']=='increase' else '감소 신호' if d['direction']=='decrease' else '구분 불가'
show=lambda d:f"{direction(d)} (↑{d['positive']} / ↓{d['negative']} / ={d['tie']})"
percent=lambda x,y:(y/x-1)*100
lines=['# 3B 분리 실험과 근접 B안 사전 계측','',
'2026-10-13 · 3A 기준 5b714ea · 비교 소스 7ebf4eb · codex/bot-ai-phase01 · master 960f678 유지','',
'**전체 3B는 채택하지 않는다.** 사용자 검토대로 전술100ms만/개인별전략만을 같은 8시드에서 각각 3A와 비교했다. 전술만 적용한 갈래는 영역도둑 탈취 비중·되찾기가 기준에 가까우나 탐험가–도둑 TV가 작아졌다. 개인별 전략만 적용한 갈래는 보유 증가 신호와 함께 되찾기 감소 신호가 나타났다. 전체 3B의 탈취·회수 손실은 전략 주기·위상 묶음 쪽에서 더 뚜렷하지만 어느 분리 갈래도 자동 채택하지 않는다. 근접 사전 계측의 기준은 현재 채택된 3A로 유지했다.','',
'3C는 종료하며 집요함은 자동 배정에서 계속 제외한다. 명시적 테스트용 정의만 보존한다. 3D prefix 계측은 완료했다. **근접 감점은 구현하지 않았다.** B안의 단일 판단 재정렬을 관측해 실제 반복 실패 선택을 바꿀 가능성을 확인했다. 이전 보고서와 모든 원본은 보존했다.','',
'## 실험을 어떻게 나눴는가','',
'고정 시드 4·19·73·11·31·47·101·137, R56·14봇·spawnRadius1·classic·safeRespawn·30Hz·3,600tick. 결과를 보고 시드를 바꾸지 않았다. 별도 소스 스냅샷에서 재생해 실험 브랜치의 기본 게임 동작 및 master를 전환하지 않았다. 현재 실험 브랜치에는 비교용 전체 3B 코드가 남아 있으며 이번 작업으로 채택하거나 원복한 것은 아니다.','',
'|갈래|정규 전략|전술|','|---|---|---|','|3A 기준|기존6tick/200ms, slot%6 위상|전략 때 함께|','|전술100ms만|기존6tick/200ms, slot%6 위상|기존 적용 조건에서3tick/100ms|','|개인별전략만|승인된 성격별 범위와 독립 개인 위상|독립 전술 tick 없이 전략 때 함께|','|전체3B|개인별 주기·위상|3tick/100ms|','',
'전술만 갈래의 개인 전술 위상은 전체3B와 동일하다. 전략용 독립 RNG의 세 번 추첨 순서도 보존하고 주기/전략 위상 값만 6/slot%6으로 대체했다. 행동/특성/예약 RNG를 배정에 사용하지 않는다. 전략만 갈래는 독립 전술 도래를 껐다. 전략이 도래하면 원래처럼 전술도 함께 계산한다. 전술에서 실제 귀환/무효 경로가 완료되었을 때의 재계획과 기존 긴급 재판단은 해당 층의 일부로 유지했다. 개인 주기만과 시작 위상만을 별도로 분리한 실험은 아니다.','',
'3B 조정자에서 두 스케줄 요소를 모두 끈 추가 제어군도 돌렸다. 8시드 모두 3A와 궤적·예약·다음 행동 RNG·정규화 판단/메모리가 일치했다. 정규화는 추가 기술 필드 schedule/cadence만 제외했다. 따라서 비교를 위해 붙인 3B 조정자 자체의 숨은 행동 변화가 분리에 섞이지 않았음을 확인했다. 위험/귀환/선 길이/근접 머리/출발 안전·V=0·D 상한·경계 후보·REPOSITION 대기·예약 상한은 수정하지 않았다.','',
'## 주요 결과','',
'보유는 매 tick 실제 소유 칸 합의 시간 평균(사망 시간 포함)이고 성장의 주 지표다. TV는 살아 있는 goal 분포의 시드별 총변동 거리를 8경기 평균한다. 탈취 비중은 해당 성격의 전체 탈취 칸 합/전체 점령 칸 합이다. 근접 교체는 근접 상태의 봇 시간1분당 횟수다.','',
'|지표|3A|전술100ms만|개인별전략만|전체3B|','|---|---:|---:|---:|---:|']
for k,label,fmt in [('holding','보유 영토 시간 평균','.2f'),('final','최종 보유 평균','.2f'),('deaths','사망 합계','d'),('reclaim','되찾기 칸 합계','d'),('tv','탐험가–도둑 TV','.4f'),('tvWithoutRP','REPOSITION 제외 TV','.4f'),('nearRate','근접 교체/근접 봇분','.2f'),('targetABA','2초 목표 A→B→A','d'),('modeABA','2초 모드 A→B→A','d'),('modeABAWithSafety','모드 왕복 중 안전 대응 포함','d')]:lines.append('|'+label+'|'+'|'.join(format(a[n][k],fmt) for n in names)+'|')
lines+=['', '|지표|전술100ms만 vs3A|개인별전략만 vs3A|','|---|---|---|']
for k,label in [('holding','보유 평균'),('deaths','사망'),('reclaim','되찾기'),('tv','TV'),('share_SEEK_POINT','도둑 탈취 비중'),('nearRate','근접 교체 빈도'),('targetABA','2초 목표 왕복'),('modeABA','2초 모드 왕복')]:lines.append(f"|{label}|{percent(b[k],a['tactical'][k]):+.2f}% · {show(sign('tactical',k))}|{percent(b[k],a['strategy'][k]):+.2f}% · {show(sign('strategy',k))}|")
lines+=['',
'7/8 시드 같은 방향과 모든 leave-one-out 방향 유지가 사전 방향 기준이다. 동률도 표에 포함한다. 구분 불가는 효과 없음/동등함을 뜻하지 않는다. 비율 지표의 leave-one-out은 해당 시드를 양 갈래에서 제외해 원래 분자/분모로 다시 계산했다. 시드별 비율 차이를 단순 합해 전체 탈취 비중이나 근접 빈도로 대신하지 않았다.','',
f"전술만의 보유 {percent(b['holding'],a['tactical']['holding']):+.2f}%, 사망 {percent(b['deaths'],a['tactical']['deaths']):+.2f}%는 합계상 유리하지만 각각6/8·5/8 방향으로 신호 미달이다. 도둑 비중23.36%와 회수3,233칸은 기준24.08%/3,193칸에 가깝다. 그러나 TV는0.1776→0.1134로6/8 감소했다. 전술만이 성격 수렴 문제까지 해결했다는 결론은 내리지 않는다.",'',
f"전략만의 보유 {percent(b['holding'],a['strategy']['holding']):+.2f}%는7/8 증가와 모든 leave-one-out 증가로 신호를 충족한다. 되찾기 {percent(b['reclaim'],a['strategy']['reclaim']):+.2f}%도7/8 감소와 모든 leave-one-out 감소로 손실 신호를 충족한다. 성장 이득을 얻었으나 피해 대응·성격 표현을 내주는 거래다. 도둑 비중은15.62%, TV는0.1140이다. 같은 현상을 전술 빈도 증가만의 탓으로 설명하기 어렵다.",'',
'전체3B에서2초 목표 왕복이68회로 증가했지만 전술만44회, 전략만37회다. 둘 중 한 요소만으로 전체3B의 증가를 재현하지 못했다. 주기·위상·예약 순서와 이후 궤적이 상호작용한 결과로 보며, 갈래별 효과를 단순 합하거나 특정 안전 조건 하나를 원인으로 확정하지 않는다. 양쪽 분리 갈래와 전체3B 모두 자발적 목표/모드 왕복·근접 자발 교체·최소 유지 적용 대상은0이다.','',
'## 시드별 값','',
'|시드|보유3A→전술→전략|사망3A→전술→전략|회수3A→전술→전략|TV3A→전술→전략|목표왕복3A→전술→전략|','|---:|---:|---:|---:|---:|---:|']
rows=list(csv.DictReader(Path('evidence/bot-phase03b-separation/paired-seeds.csv').open(encoding='utf-8')));by={(r['arm'],int(r['seed'])):r for r in rows}
for seed in s['protocol']['seeds']:
 values=[]
 for key,fmt in [('holding','.1f'),('deaths','.0f'),('reclaim','.0f'),('tv','.3f'),('targetABA','.0f')]:values.append('→'.join(format(float(by[n,seed][key]),fmt) for n in ['baseline','tactical','strategy']))
 lines.append('|'+str(seed)+'|'+'|'.join(values)+'|')
lines+=['',
'전체3B 참고값, 시드별 근접/모드 왕복·모든 지표 차이·성격별 분자/분모는 CSV에 보존한다.','',
'## 성격별 탈취와 사망 원인','',
'|성격|탈취 비중3A|전술만|전략만|전체3B|','|---|---:|---:|---:|---:|']
for who,label in roles.items():lines.append('|'+label+'|'+'|'.join(f"{a[n]['share_'+who]*100:.2f}%" for n in names)+'|')
lines+=['','|사망 원인|3A|전술만|전략만|전체3B|','|---|---:|---:|---:|---:|']
for cause in ['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT','HOME_CAPTURE']:lines.append('|'+cause+'|'+'|'.join(str(a[n]['deathCauses'].get(cause,0)) for n in names)+'|')
lines+=['',
'벽 사망은 네 갈래 모두0이며 모든 사망은 위3종으로 분류된다. HOME_CAPTURE는 영토 폐쇄 점령으로 선이 끊긴 사망이다. 5→4/1의 희소 횟수만으로 일반적인 개선을 단정하지 않는다. 전술만의 기존 선 접촉은78→73, 전략만은78→90이다. 성격·시드별 값과 전체 합계는 사망 CSV에 있다.','',
'## 성격별 안전 중단','',
'단순 진단 통지 tick과 실제 채택한 계획의 중단을 구별한다. 이미 ESCAPE/RETURN에서 같은 DANGER가 반복돼도 새 계획 중단으로 세지 않는다. 점령/실제 귀환/사망·생명 변경으로 계획 이력을 닫는다. 원인은 최종 trace의 safetyOverride/earlyClosure 기준이며, 후단 벽 회피 등으로 덮인 이전 DANGER/PRESSURE를 역산하지 않는다. 실제 중단에는 확장·공격·제어점·재배치 계획을 포함하고, 확장·탈취 부분집합도 별도로 저장했다. EARLY_CLOSURE는 작은 루프로 줄이는 동작이므로 실패한 점령으로 부르지 않는다. 아래는 **채택 계획 중단**이며 괄호는3A 대비 차이다.','',
'|성격·원인|3A|전술만(Δ)|전략만(Δ)|전체3B(Δ)|','|---|---:|---:|---:|---:|']
for who,label in roles.items():
 for reason in ['DANGER','EARLY_CLOSURE','EXPANSION_PRESSURE']:
  x=a['baseline']['byPersonality'][who]['safety']['planStops'][reason];values=[str(x)]+[f"{a[n]['byPersonality'][who]['safety']['planStops'][reason]} ({a[n]['byPersonality'][who]['safety']['planStops'][reason]-x:+d})" for n in ['tactical','strategy','combined']];lines.append('|'+label+' · '+reason+'|'+'|'.join(values)+'|')
lines+=['',
'전술만에서는 DANGER 통지가878→2,319회로 크게 늘지만, 실제 DANGER 계획 중단은368→369회다. 같은 위험을100ms마다 재확인한 통지를 행동 중단 증가로 오해하면 안 된다. 도둑의 실제 중단은 전술만에서 DANGER71→57, PRESSURE145→126이고, 전략만에서도64/85로 줄었다. 전략만의 탈취 손실을 이 두 중단 횟수가 늘었기 때문이라고 설명할 수는 없다. 후보 선택·계획 완료·다른 봇과 만나는 시각이 달라졌다는 수준에서 해석하며 추가 안전 완화로 보정하지 않는다.','',
'원인별·성격별·시드별 raw 통지/전체계획중단/확장중단과 방향 신호는 증거에 있다. 분모가 달라지는 것을 확인하도록 성격별 생존 프레임과 확장 계획 수도 함께 보존했다.','',
'## 근접 B안 사전 계측 — 기준3A','',
'분리 결과로 어느 실험 갈래도 채택하지 않은 상태에서3A를 기준으로 측정했다. 구현이나 실제 B 활성 재생이 아닌 **같은 궤적의 한 판단 재정렬**이다. 후속 생존/성장이나 다른 봇의 예약 변화는 예측하지 않는다.','',
'조건은 기존 제안대로 귀환 완료→재출발1초, 출발→재취소1초, 같은 경계hex1칸 이내/첫 외부 경로 방향60도 이내다. 귀환은 자기 칸·선0인 실제 상태로 확인한다. 실제 노출 후 돌아온 경우와 출발 전에 집 안에서 막힌 재시도를 분리한다. 노출은30Hz tick 경계 상태로 확인하므로 같은 tick 안에 완전히 닫힌 짧은 노출은 누락될 수 있다. 원래 실패는 DANGER/EXPANSION_PRESSURE/LAUNCH_BLOCKED이며, 재취소는 안전 override를 기록하고 EARLY_CLOSURE는 별도다. 벽 회피는4단계 후보대로 기록만 한다.','',
'B 적용에는 취소→귀환2초 이내, 같은 생명의 실패 계획, 관측되는 동일 위협ID+생명/현재6칸 이내를 추가로 요구한다. DANGER의 위협은 관측 선5칸 안의 가장 가까운 머리로 식별한 진단상의 근접 위협이며 실제 가해자를 단정한 값이 아니다. 선 길이 예산만의 위험이나 식별할 머리가 없는 경우 B를 켜지 않는다. 관측 밖 위치·방향은 쓰지 않는다.','',
'감점=min(1.5,0.10×max(0,기본 후보 점수))를 기존 모든 필터에 통과한 확장 후보에만 가정했다. 원래 후보·성격 루프·D/V 상한·공격 점수·예약 점수는 유지하고, 후보 동점 순서를 보존했다. 감점0 재정렬이 실제 선택과 어긋난 사례는0이다.','',
'|시드|실제 귀환 후 같은 재출발|그중 재취소|집 안 차단 후 재출발|그중 재취소|B 선택 변경 가능성|','|---:|---:|---:|---:|---:|---:|']
for r in s['nearB']['bySeed']:lines.append(f"|{r['seed']}|{r['realReturnRestarts']}|{r['reCancelled']}|{r['atHomeRetryRestarts']}|{r['atHomeRetryReCancelled']}|{r['wouldChange']}|")
t=s['nearB']['total'];lines.append(f"|합계|{t['realReturnRestarts']}|{t['reCancelled']}|{t['atHomeRetryRestarts']}|{t['atHomeRetryReCancelled']}|{t['wouldChange']}|")
lines+=['',
f"실제 귀환 후 같은 재출발69회 중 재취소12회, 집 안에서 차단된 뒤 재출발105회 중 재취소33회다. 조기 폐쇄1회는 실패 재취소에 합치지 않았다. 일반 선택5,393회 중 B 대상 선택은335회이고 선택 변경 가능성은 **14회({t['wouldChange']/t['choices']*100:.3f}%)**다. 같은 tick 최종 선택에 남은14회도 동일하다. 앞선 진행 메시지의13회는 합산 오류였으며, 원본 두 측정에서 모두14회로 일치한다. 이14회는 근접 B안이며, 종료한3C의 C1/C2 결과13/16회를 수정한 것이 아니다.",'',
'실제 귀환 재취소12회 중 B 조건을 만족한5회에서 선택을 바꿀 경우는0회다. 집 안 차단 뒤 재취소33회 중5회의 선택은 바뀔 가능성이 있었다. 전체14회 변화 중 실제 귀환 맥락3회, 집 안 차단 맥락11회다. 따라서 현재 B는 실제 귀환 반복 문제를 해결할 근거가 약하고, 출발 전 차단 반복 일부에 영향을 줄 가능성이 더 크다. 선택을 바꿀 수 있다는 결과를 실패 예방/성장 개선으로 부르지 않는다.','',
'정상 완료한 원래 계획은 실패 이력을 지운다. 안전 취소 후 귀환하면서 작은 루프를 점령한 경우는 정상 계획 완료와 구별해 별도 기록했다. 그런 CAPTURE까지 전부 제외하는 더 보수적인 정의에서는 변경이11회로 줄며 실제 귀환 재취소 선택 변경0은 그대로다. 원본 사건·slot/tick·후보 변경 장면을 CSV로 보존해 정의의 차이를 검토할 수 있게 했다.','',
'**현재 수치의 B안을 그대로 구현하는 것은 추천하지 않는다.** 감점/시간 창을 임의로 키우거나 안전 필터를 완화하지 않았다. 이번 결과로 근접 제안의 상태는 사전 계측 후 검토 대기이며, 다음 행동 변경은 별도 검토·승인 이후다.','',
'## 검증과 범위','',
'- 5개 소스갈래×8시드, 각3,600tick 실제 이동·점령·사망 재생. 기준3A와 전체3B는 각각 기존8시드 궤적/판단/메모리/다음RNG와 정확히 일치했다.','- 두 주기 모두 끈 제어군은3A와8시드 궤적/정규화상태/예약/RNG가 같다. 근접 계측 ON/OFF 역시8시드 전체 궤적·판단·메모리·다음RNG·예약이 동일하다.','- 스냅샷을 재생할 때 사망/점령의 private 진단 hook을 해당 소스 모듈에서 연결했다. 중립화 피해 회수의 기준값도 기존3A와 정확히 일치한다.','- 회귀·집계 테스트23개 통과. 반복 위험의 중복 집계, 같은 tick 계획 교체/조기 폐쇄, 완료/생명 초기화, 집요함 자동 제외, 실제/집 안 재시도 분리, B의 생명/거리/만료·원본 불변 및 예약을 확인했다. 프로젝트 타입 검사와 변경TS 스크립트strict 검사도 통과했다.','- 이번 작업의 게임 코드 변경은 집요함 정의 주석뿐이고 실행 규칙은 바꾸지 않았다. 클라이언트/HUD는 수정하지 않았다. 이번에는 분리 갈래 tick 성능을 측정하지 않았으며 audit 소요 시간을 성능으로 대신하지 않는다. 전체3B의 과거 비용 결과를 단독 갈래의 비용이라고 인용하지 않는다.','- master960f678과 작업 폴더를 보존한다. 전체3B·단독 갈래·B안 모두 새로 채택하지 않는다. 3C 종료/3D 계측 완료만 문서에 확정 반영한다.','',
'증거: [요약](../evidence/bot-phase03b-separation/summary.json), [시드별 비교](../evidence/bot-phase03b-separation/paired-seeds.csv), [성격별 분자·분모](../evidence/bot-phase03b-separation/personality-seeds.csv), [안전 중단](../evidence/bot-phase03b-separation/safety-stops.csv), [사망 원인](../evidence/bot-phase03b-separation/death-causes.csv), [leave-one-out](../evidence/bot-phase03b-separation/leave-one-out.csv), [근접 시드 집계](../evidence/bot-phase03b-separation/near-seeds.csv), [실제 반복 장면](../evidence/bot-phase03b-separation/near-repeat-cases.csv), [B 선택 변경](../evidence/bot-phase03b-separation/near-changed-choices.csv). 원본·프로토콜·소스 manifest·로그는 기본 저장소 .local/bot-phase03b-separation/에 보존한다.','',
'## 재실행','',
'```text','node --import tsx scripts/prepare-bot-phase03b-separation.ts --out=../NEW_OUTPUT_DIRECTORY --base=5b714ea --combined=7ebf4eb','node --import tsx scripts/bot-phase025-audit.ts --source=../NEW_OUTPUT_DIRECTORY/tactical --holding --equivalence-proof --cadence-proof --transition-audit --phase03-baseline --safety-stops --seeds=4,19,73,11,31,47,101,137 --ticks=3600 --out=../NEW_OUTPUT_DIRECTORY/tactical.json','```','',
'source를baseline/strategy/combined/legacy-control로 각각 바꾸고 같은 시드/시간으로 실행한다. baseline에--near-restart-audit를 추가해 근접 사전 계측을 기록한다. 집계는scripts/summarize-bot-phase03b-separation.py의--raw와--out으로 새 결과 경로를 지정한다. 기존 원본을 덮지 않는다.']
Path('docs/bot-ai-phase03b-separation.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
