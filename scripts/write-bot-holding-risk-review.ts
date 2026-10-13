import {readFileSync,writeFileSync} from 'node:fs';
const s=JSON.parse(readFileSync('evidence/bot-holding-risk-review/summary.json','utf8')),v=JSON.parse(readFileSync('evidence/bot-holding-risk-review/validation.json','utf8'));
const n=(x:number|null,d=2)=>x===null?'결측':x.toFixed(d),percent=(x:number|null)=>x===null?'—':(x>0?'+':'')+n(x)+'%',sig=(x:any)=>x.direction==='INCREASE'?'증가 신호':x.direction==='DECREASE'?'감소 신호':'구분 불가',table=(a:any[],f:(v:any)=>string)=>a.map(f).join('\n');
const names:any={holding:'보유 시간 평균',final:'최종 보유 평균',deaths:'전체 사망',deathLoss:'전체 사망 중립화 손실',largeDeaths:'256칸 이상 사망',largeDeathLoss:'256칸 이상 사망 손실',escapeDeaths:'ESCAPE 중 전체 사망',escapeDeathFraction:'전체 사망 중 ESCAPE 비중',largeEscapeDeaths:'256+ ESCAPE 중 사망',largeEscapeDeathFraction:'256+ 사망 중 ESCAPE 비중',escapeSeconds:'전체 ESCAPE 누적 초',largeEscapeSeconds:'256+ ESCAPE 누적 초',largeEscapeDeathsPer1000Seconds:'256+ ESCAPE 1000초당 사망',reclaim:'되찾기(기존 tick 경계)',enemyRecovery:'적 소유 피해 칸 회수(정확한 transfer)',neutralRecovery:'중립화된 피해 칸 회수',totalCapture:'총 점령',net:'순영토 참고',attacks:'공격 시작',attackKills:'활성 표적 처치',TV:'탐험가–도둑 TV',wallDeaths:'벽 사망'};
const fraction=(k:string)=>k.endsWith('Fraction'),show=(k:string,x:number)=>fraction(k)?n(x*100)+'%':n(x,k==='TV'?4:2),role:any={DEFEND:'안전지킴이',ATTACK:'선사냥꾼',EXPAND:'영역탐험가',SEEK_POINT:'영역도둑'};
let text=`# 보유 quota 위험 강화 단독 비교

2026-10-13. 사용자 미채택 큰 루프를 제거하고 **a535bf7 위 위험 강화 하나만** 구현·비교했다.120초 전체 사망 감소 방향 신호가 있고 보유 평균은거의같다. 그러나256칸 이상 사망/손실의 방향은구분불가이고240초 공격 처치 감소·성격 분포 변화도 함께 봐야 한다. **위험 강화는 검토/관전 후보로 보고하며 큰 루프를 자동 재시험하지 않았다.** master와원격은 그대로다.

## 1. 범위와 비율 표현

- 기준은a535bf7(133ee1f 위 실제 벽 선택 검사), c990e6e의큰 루프는미채택이다. 당시소스/보고/원본은보존하며 현재게임에서는큰 루프후보를생성하지않는다. 기존 회수테스트는삭제/기대실패로바꾸지않았다.
- baseline과다른shared 동작은bot-strategy.ts의확장위험감점, bot-tactical.ts의실행위험거리, 공통bot-holding-risk.ts뿐이다. settingsFor 자체를바꾸지않아서공격점수의기존계수/조건을직접바꾸지않았다. 확장geometry/후보수/생성RNG·출발1초/벽0.65초·주기/특성/부활/인원은유지한다.
- quota Q=실제map.cells.length/참여명단수. 사망/부활대기/사람ELIMINATED도명단에포함하고FINISHED 이탈은제외한다. 관측명단없는옛caller만config.maxSlots를fallback으로쓴다. ‘현재살아있는명수’나‘관측된적수’를분모로쓰지않는다.

|기준|Q 대비 비율|R56·14명 환산|위험 배율|
|---|---:|---:|---:|
|시작|0.3742299258640493|256칸|1.15|
|한 번 두배|0.7484598517280986|512칸|1.25|
|두 번 두배·상한|1.4969197034561972|1024칸|최대1.35|

R56은9577칸, Q=9577/14=684.0714285714286칸이다. 시작T=Q×0.3742299258640493, 보유<T면m=1. 그외m=1.15+0.10×clamp(log2(보유/T),0,2). 기존확장거리위험감점과탐험가excursionRisk에만m을곱한다. 실행중위험거리는시작이상일때max(기존거리,min(7,ceil(기존거리×m))), 미만은기존거리그대로다. 기존보다약한위험거리/감점은없다. 수치표의1.35는기존제안식의부동소수표현(1.3499999999999999)을반올림한표시이며 계산식을임의로바꾸지않았다.

## 2. 행동 동일 리팩터와 비간섭

절대값버전을먼저동결한뒤비율표현으로바꿨다. **동일R56·14명8시드120초 궤적·판단·메모리·행동RNG·예약모두동일**하다. 숫자0~2048의모든정수보유와위험거리샘플도절대값공식과정확히일치한다. 다른맵/인원에서는quota로환산하므로절대칸기준과같다고주장하지않는다.

양쪽8시드240초의사망/회수계측유무(완전observer OFF대rich계측)는궤적·메모리·RNG·예약·보유가같다. 기준120초는이전a535bf7 고정값과판단hash까지같다. source와시드4·19·73·11·31·47·101·137, R56/14봇/7칸스폰/safeRespawn/CLASSIC/30Hz를결과전에고정했다.

## 3. 120초 주 비교 / 240초 보조

동일seed의paired 차이를비교한다.7/8 같은방향 AND 어느seed를하나빼도그방향인경우에만탐색적신호로쓴다. **구분불가는효과없음·동등함이아니다.** 비율의변화는절대퍼센트포인트(pp), 다른항은상대%로표시한다.
`;
for(const c of s.comparisons){text+=`\n### ${c.seconds}초\n\n|지표|기준|위험 강화|변화|방향|\n|---|---:|---:|---:|---|\n`+table(Object.keys(names),k=>{const a=c.totals.baseline[k],b=c.totals.candidate[k],d=c.signals[k];return `|${names[k]}|${show(k,a)}|${show(k,b)}|${fraction(k)?n(100*(b-a))+'pp':percent(c.percent[k])}|${sig(d)}(${d.positive}↑/${d.negative}↓/${d.tied}=)|`;})+`\n\n|seed|보유 평균 기준→후보|256+ 사망 기준→후보|256+ 손실 기준→후보|전체 사망 기준→후보|\n|---|---:|---:|---:|---:|\n`+table(c.rows,(r:any)=>`|${r.seed}|${n(r.baseline.holding)}→${n(r.candidate.holding)}|${r.baseline.largeDeaths}→${r.candidate.largeDeaths}|${r.baseline.largeDeathLoss}→${r.candidate.largeDeathLoss}|${r.baseline.deaths}→${r.candidate.deaths}|`)+`\n\n|성격|탈취 비중 기준→후보|\n|---|---:|\n`+table(c.roles,(r:any)=>`|${role[r.personality]}|${n(r.baseline.stolenShare*100)}%→${n(r.candidate.stolenShare*100)}%|`)+`\n`;}
text+=`
큰봇의사망/손실은합계상줄었지만120초/240초모두사전방향신호에못미친다. 전체사망감소는120초7/8에서신호이고240초는구분불가다. 보유시간평균은각각−0.35%/−0.42%로재검토−5%안이다. 감소합계만으로강한개선확정이라고부르지않는다. seed4의120초보유악화, seed101의240초보유·큰봇사망악화를관전주의점으로남긴다.

ESCAPE 시간당사망은낮아졌으나같은시간의동일위험노출실험이아니다. 강화버전은더일찍ESCAPE에들어가누적체류시간이늘고, 상대/선/경로도달라진다. 따라서‘사망위험60%감소’라는인과주장은하지않는다. 실제사망수/손실·전체보유와함께판단한다. 사망직전보유는중립화callback시점, 노출시간분모는최종입력후step전의보유>=256이다. 같은step의점령/분리로구간을건너는경우가있다.

## 4. 사망 크기·원인과 회수
`;
for(const index of [0,1]){const a=s.deaths.baseline[index],b=s.deaths.candidate[index];text+=`\n|${a.seconds}초 사망 당시 보유|기준 사망/손실/사망당|후보 사망/손실/사망당|\n|---|---:|---:|\n`+table(a.bins,(r:any)=>{const v=b.bins.find((v:any)=>v.bin===r.bin);return `|${r.bin}|${r.count}/${r.loss}/${n(r.lossPerDeath)}|${v.count}/${v.loss}/${n(v.lossPerDeath)}|`;})+`\n\n|${a.seconds}초 사망 원인|기준 횟수/손실|후보 횟수/손실|\n|---|---:|---:|\n`+table([...new Set([...Object.keys(a.causes),...Object.keys(b.causes)])],k=>`|${k}|${a.causes[k]?.count??0}/${a.causes[k]?.loss??0}|${b.causes[k]?.count??0}/${b.causes[k]?.loss??0}|`)+`\n`;}
text+=`
사망시보유는영토중립화직전이다. 그전HOME_CAPTURE 점령/분리로이미잃은땅을중립화손실에이중산입하지않는다. 실제노출은callback의확정trailCells 수이며pending접촉은원인별로구분한다. 현재ESCAPE/ATTACK 등모드와같은생명마지막확장의예측크기/외부길이/나이를개별CSV에보존했다.

**기존재배치후실제회수fixture는양쪽모두t103에15칸도착, t190에5칸회수·사망0이다.** 이전큰루프의D0 우회·선절단회귀는현재후보에없다. 이것이위험강화로그회귀를고쳤다는뜻은아니다. 큰루프가제거됐고fixture보유는강화시작점미만이다. 큰루프재시험시에도동일한회수테스트는합격조건으로남아야한다.

## 5. 사람1+봇13 3분 참고 목표

기존4개자동입력루프를반복하고사람사망시중단했다. 실제사용자의3분30%플레이를재현한것이아니다.180초1등봇20%는참고지표이며단독합격기준이아니다. 사람이먼저죽으면결측으로남기고0%나새seed로대체하지않는다.

|seed|기준180초1등봇|후보180초1등봇|기준/후보종료초|
|---|---:|---:|---:|
`+table(s.human.baseline,(r:any)=>{const v=s.human.candidate.find((v:any)=>v.seed===r.seed);return `|${r.seed}|${r.leaderAt180===null?'결측':n(r.leaderAt180*100)+'%'}|${v.leaderAt180===null?'결측':n(v.leaderAt180*100)+'%'}|${n(r.endSeconds)}/${n(v.endSeconds)}|`;})+`

20%도달은양쪽0개다. 유효180초시드는기준${s.human.baseline.filter((r:any)=>!r.censoredBefore180).length}/8, 후보${s.human.candidate.filter((r:any)=>!r.censoredBefore180).length}/8로달라생존시드만평균내어성장개선으로해석하지않는다. 같은seed별봇13명분포는human-bot-shares.csv에있다.

## 6. 필수 회귀와 비용

- 중거리16개13/16, ID5·6·14 알려진대가유지·새손실0. known seed1 공격0tick/사람생존, 기존기대실패/seed3별도테스트도유지한다.
- 확장155/1024, 사례별결과변경${s.checks.expanded.changes.length}개,44개observer동일검사. 기존기하/메모리/성격/경로배치에서비교했다.
- 타입검사/production build: ${v.typecheckBuild}. Vitest: ${v.vitest}. PC: ${v.pc}. 새위험경계·비율환산·비간섭·실제회수·벽0·소유권/부활검사를유지한다. R22·8명에서는quota기준이약71.06칸으로달라지므로두개이전궤적pin만새승인동작의hash로갱신했다.
`;
if(s.cost)text+=`- observer/HUD OFF, 같은세션120초×8시드×2갈래×3라운드48표본. 양쪽seed19warmup은제외. 전체8시드라운드3회의중앙값은${n(s.cost.summary.baseline.medianMsPerTick,4)}→${n(s.cost.summary.candidate.medianMsPerTick,4)}ms/tick(${percent(s.cost.percent)}). 모든표본을보존하고다른테스트와겹친표본은제외했다.\n\n|seed|기준ms/tick|후보ms/tick|변화|\n|---|---:|---:|---:|\n`+table(s.cost.rows,(r:any)=>`|${r.seed}|${n(r.baseline,4)}|${n(r.candidate,4)}|${percent(r.percent)}|`)+`\n\n비용방향은${sig(s.cost.signal)}. 시드별은3회중앙값이고전체값은8시드전체라운드중앙값이라서둘을임의로평균내섞지않는다.\n`;
text+=`
## 7. 다음 순서와 보존한 후보

위험단독비교의감소추세와전체사망신호는유망하지만큰봇사망/손실·보유/공격/3분성장의불확실성도남는다. 우선관전/검토로현재후보를평가한다. 큰루프는자동으로다시켜지않았고현재두변경을섞은측정도하지않았다. 이전큰루프의작은봇회수실패는256+보호와별개여서, 위험이좋다고그회귀까지해결됐다고주장할수없다.

큰루프재시험시비용후보: 먼저같은판단에서plannedCapture의정확히같은외부차단칸집합(자기땅이아닌path칸을정렬·중복제거, owners/map/자기owner고정)의중복률을측정한다. 자기땅prefix는이미flood의장벽이어서key에서제외할수있다. 충분한중복이있으면그판단안에서만flood결과를재사용하는정확한cache를제안한다. 후보는버리지않고점수/순서/각후보의RNG jitter소비도그대로여서해시동일검증이가능하다. 예전에전체경로cache는중복률/관리비용으로보류했으므로큰변형을추가한풀에서다시측정해야하며낮으면계속보류한다. 안전검사완화·RNG생략·임의후보수축소는비용절감안으로쓰지않는다. 이번에는cache를구현하지않는다.

**새맵전벽후보(기록만):** bot-immediate-safety.ts의immediateLookAhead/expansionPerimeterBlocked/perimeterEscapeDirection은중심hex거리>=map.radius−2를쓴다. map생성시경계칸0부터이웃그래프최단거리로계산한칸별끝거리<=2로전환하는안을보존한다. 현재완전육각형에서모든칸의판정및8시드궤적이같아야한다. 지금은해당파일·map생성·직렬화에변경없다.

## 8. 자료

[요약/방향/소스hash](../evidence/bot-holding-risk-review/summary.json), [120/240초seed별전체지표](../evidence/bot-holding-risk-review/seed-comparison.csv), [사망/직전계획](../evidence/bot-holding-risk-review/death-details.csv), [사람구성봇별보유](../evidence/bot-holding-risk-review/human-bot-shares.csv), [비율동일성](../evidence/bot-holding-risk-review/normalization-proof.json), [실제회수fixture](../evidence/bot-holding-risk-review/recovery-regression.json), [검증](../evidence/bot-holding-risk-review/validation.json).

원본은메인.local/bot-holding-risk-review와.local/bot-holding-risk-expanded에두고저장소에는요약/CSV만남긴다. 앞선큰루프실험원본/보고서도보존했다. 실험브랜치로컬커밋만남기고master133ee1f와원격은변경하지않았다. 재현은prepare-bot-holding-risk-review.ts로절대값소스를먼저동결하고freeze-bot-holding-risk-candidate.ts로비율소스를동결한뒤bot-growth-analysis.ts(--root/--arm=native/--source-key=native,candidate,absolute)·중립audit·공격회귀·단독비용·요약/작성script순서로진행한다. 기존동결폴더는덮어쓰지않는다.
`;
writeFileSync('docs/bot-ai-holding-risk-review.md',text);console.log('docs/bot-ai-holding-risk-review.md');
