import hashlib,json,math
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;RAW=ROOT.parent/'bot-phase025-spectating';OUT=ROOT/'evidence/bot-phase025-spectating';OUT.mkdir(parents=True,exist_ok=True)
reference=json.loads((ROOT.parent/'bot-phase025-closeout/current.json').read_text(encoding='utf-8'))
rows=[];hashes={}
def opposed(a,b):
    u=[a['end'][k]-a['start'][k] for k in ['x','y']];v=[b['end'][k]-b['start'][k] for k in ['x','y']];n=math.hypot(*u)*math.hypot(*v)
    return n>0 and sum(x*y for x,y in zip(u,v))/n<=-.5+1e-12
for seed in [137,47,73,19]:
    file=RAW/f'seed{seed}.json';d=json.loads(file.read_text(encoding='utf-8'));ref=next(r for r in reference['reports'] if r['seed']==seed)
    assert d['prefixHash']==ref['trajectoryHash'] and d['prefixMatches'];hashes[file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
    for r in d['rows']:
        closed=[e for e in r['rp'] if e['outcome']!='OPEN'];triples=[]
        for i in range(len(closed)-2):
            a,b,c=closed[i:i+3]
            if min(e['movedCells'] for e in [a,b,c])>=2 and a['lifeId']==b['lifeId']==c['lifeId'] and a['attackerId']==c['attackerId']!=b['attackerId'] and c['startedTick']-a['startedTick']<=900 and opposed(a,b) and opposed(b,c):triples.append([a['startedTick'],b['startedTick'],c['startedTick']])
        plans=[q for q in r['plans'] if q['reason']=='EXPANSION_SCORE' and q.get('plan')];lengths=[q['plan']['externalLength'] for q in plans]
        row={k:r[k] for k in ['window','slot','nickname','personality','trait','aliveFrames','deadFrames','goalFrames','reasons','rejections','candidateCalls','noSafeCandidates','startHolding','endHolding','totalCapture','stolenCells','reclaimedCells','lostToCapture','kills','rpSelection']}
        row.update({'seed':seed,'near6Percent':100*r['near6Frames']/r['aliveFrames'],'near2Percent':100*r['near2Frames']/r['aliveFrames'],'stolenShare':r['stolenCells']/r['totalCapture'],'newExpansionMeanExternalLength':sum(lengths)/len(lengths),'repositionClosed':closed,'repositionArrivals':sum(e['outcome']=='ARRIVED' for e in closed),'pingPongTriples':triples,'deaths':[{k:v for k,v in q.items() if k!='lastSample'} for q in r['deaths']]})
        selected=[2248,2627,3334,3695] if seed==137 else [1797,2159,2172,2418,2812] if seed==73 else []
        row['hudExamples']=[{**{k:q[k] for k in ['selectedTick','endedTick','outcome','dRaw','appliedBonus','interruptions','neutralCells','ordinaryStolenCells']},'expected':len(q['expectedCellIds']),'actual':len(q['actualCellIds']),'otherRecovery':len(q['otherReclaimCellIds'])} for q in r.get('hudPlans',[]) if q['selectedTick'] in selected]
        if seed==137:
            loss=lambda lo,hi:{str(slot):sum(q['cells'] for q in r['losses'] if q['attackerSlot']==slot and lo<=q['tick']<hi) for slot in [3,11]}
            row['pingPongContext']={'first':2537,'second':2849,'third':3257,'attackStarted':2897,'attackTargetSlot':3,'targetKilledAt':3095,'losses2627to2849':loss(2627,2849),'losses2849to3257':loss(2849,3257),'cooldownViolation':False,'alreadyInOriginal120sAudit':ref['reposition']['stats']['pingPong']}
            q=next(q for q in r['hudPlans'] if q['selectedTick']==3334);ids=set(q['actualCellIds']);gained=[c for t in r['captureTransfers'] if 3334<=t['tick']<=3468 for c in t['cells'] if c['cellId'] in ids]
            assert len(gained)==16 and all(c['previousOwner']==0 for c in gained)
            row['neutralReclaimExample']={'selectedTick':3334,'captureTick':3467,'hudExpected':16,'hudActual':16,'allActualPreviousOwnersNeutral':True,'existingAuditReclaimOnTick':next(q['reclaimedOnTick'] for q in r['captures'] if q['tick']==3467)}
        rows.append(row)
summary={'runtime':'c84fc7a behavior, checked on a0272ba worktree; game code unchanged','method':'Deterministic headless replay of the human-selected windows; pre-step frames in [start,end), direct events and ownership transfers. First3600 input/world hashes equal the fixed closing audits. Additional137/73 observer passes explain ping-pong and exact HUD outcomes. Not a new 8-seed performance or balance comparison.','rows':rows,'rawHashes':hashes,'measurementLimits':['47 persona samples have different time windows, traits and surroundings; descriptive contrast, not an isolated personality effect.','19 has no user-specified window: inspect first3600 ticks only.','Audit reclaim counts enemy-owned to own tick-boundary transfers with same-life60s lost memory. HUD uses bounded damage regions and exact capture transfers, includes historically lost neutral cells. Do not equate or replace either metric.','No new safety tuning, RNG consumption during the match, or phase3 implementation.'],'next':'Manual observations support existing damage response and relative persona differences. Preserve137 ping-pong as a purposeful-new-damage/attack interruption fixture; record late deaths for phase3 planning proposal, no extra2.5 tuning approved.'}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# 2.5단계 관전 피드백 재현', '', '2026-10-12 · 현재 c84fc7a 행동 · 사용자 지정 구간', '',
'브라우저 영상을 다시 본 것이 아니라 같은 시드의 실제 이동을 재생하고 판단·점령·피해·처치 기록으로 확인했다. 137은 #5, 47은 #9·#5, 73은 #13 기준이다. 19 #2는 지정 tick이 없어 첫 120초를 확인했다. 모든 시드의 첫 3,600tick 입력·소유권·선·위치·방향·생명 해시가 마감 audit과 같다. 게임 행동을 수정하지 않았다.', '',
'## 구간별 결과', '', '|시드·봇|구간|총 점령|상대 땅 비중|audit 되찾기|처치/사망|재배치 도착|', '|---|---|---:|---:|---:|---:|---:|']
for r in rows:lines.append(f"|{r['seed']} #{r['slot']} {r['nickname']}|{r['window']['start']}~{r['window']['end']}|{r['totalCapture']}|{100*r['stolenShare']:.1f}%|{r['reclaimedCells']}|{len(r['kills'])}/{len(r['deaths'])}|{r['repositionArrivals']}|")
lines += ['', '범위는 [시작, 끝)이다. audit 되찾기는 마감 비교와 같은 정의이며 아래 HUD의 계획별 실제 회수와 구별한다.', '',
'## 137 #5: 적 때문에 작은 확장과 피해 대응이 반복됐다', '',
'확장·탈취 계획 실행은 생존 프레임의 약 70.4%, 재배치는 약 18.0%였다. 6칸 안 상대 머리가 있는 시간은 약 26.7%다. 선택된 확장 32개 중 가까운 머리가 있던 14개는 노출 선 2~5칸의 작은 루프였다. 이 구간에 HOME_PATROL 판단은 없었다. 주변에 적이 있다는 설명은 맞지만 계속 대기만 한 장면은 아니다.', '',
'30회 점령, 총 452칸 획득, 상대에게 329칸을 빼앗겼다. t1760에 #10, t3095에 #3을 처치했다. 재배치 도착은 t2248·2627·3334·3695의 4회다. 마지막 t3801에는 #11의 영토 폐쇄 점령(HOME_CAPTURE)으로 선이 끊겨 죽었고, 구간 끝 7칸은 부활 직후 상태다. 획득과 피해가 동시에 진행되고 사망으로 보유량이 초기화된 점을 함께 봐야 한다.', '',
'### A→B→A 왕복 지표 1건은 보존한다', '',
'- t2537: #11 피해 쪽으로 이동, t2627 도착.',
'- 그 뒤 #3이 38칸을 추가 탈취했고, t2849에 #3 피해 쪽 이동을 시작했다.',
'- t2897에는 #3을 공격하는 기회로 전환했고 t3095에 #3을 처치했다.',
'- t2849~3257 사이 #11이 69칸을 새로 탈취하여 t3257에 #11 피해 쪽으로 돌아갔다. t3334 도착했다.', '',
'세 이동의 실제 방향·가해자·30초 조건은 기존 왕복 지표를 만족한다. 봇 전체의 6초 재시도 대기는 지켰다. 이미 기존 120초 audit에도 1건이 기록된 장면이며 새로 생긴 동작은 아니다. 새 피해와 공격 전환이 있는 이동이어서 의미 없는 헛왕복으로 단정하지 않는다. 3단계의 계획 유지·중단 검증에서 재사용할 구체 사례로 남긴다.', '',
'## 47: 둘 다 탈취하지만 상대 땅 비중은 달랐다', '',
'#9 영역탐험가/도박꾼은 t1000~2650에 397칸을 점령했고 상대 땅은 106칸(26.7%)이었다. 보유 칸은 329→640으로 증가했고 처치 2회·사망 0회였다. #5 영역도둑/기회주의는 t2600~5000에 339칸을 점령했고 상대 땅은 154칸(45.4%)이었다. 서로 다른 시각·특성·환경의 표본이므로 이 차이를 순수한 성격 효과의 증명으로 쓰지 않는다. 다만 관전한 둘이 같은 비율로 상대 땅만 먹은 장면은 아니었다.', '',
'#5는 재배치 도착 4회, audit 되찾기 86칸이 있었다. 벽 회피 PERIMETER_GUARD가 16회 발생했지만 긴 구간의 연속 보류가 아니라 흩어진 사건이며 가장 긴 연속은 4tick이었다. t4943에 압박으로 귀환, t4967에 위험 회피로 전환했고 t4977에는 #13에게 기존 선을 잘려 죽었다. t4967 보유 550칸이 마지막 사망으로 사라졌다. 공격을 고집하다 죽었다고 해석할 근거는 없다.', '',
'## 73 #13: 작은 되찾기는 실제로 있었다', '',
'안전지킴이/기회주의는 재배치 7회 중 4회 도착했고, 선택 확장의 평균 노출 길이는 6.54칸이었다. 상대 땅을 많이 먹는 장면이지만 작은 루프로 피해 방향을 밀어 들어가는 행동이 확인됐다. audit 정의로는 되찾기 117칸이다.', '',
'- t1797 도착 후 예상 D 10칸 계획은 t1820 벽 회피로 바뀌었고, 실제 D 회수는 0칸이었다.',
'- t2159 도착 후 계획은 벽 회피를 거쳐 t2172 새 확장으로 교체되었다. 취소된 계획의 예상 D를 완료로 세지 않는다.',
'- t2418 도착 후 예상 2칸을 t2496에 실제로 2칸 되찾았다.',
'- t2812 도착 후 예상 7칸을 t2887에 실제로 7칸 되찾았다. 압박·위험으로 귀환 방향을 바꿨지만 회수는 완료됐다.', '',
't3649에는 공격 기회로 전환했고 t3657에 #7의 영토 폐쇄 점령으로 선이 끊겼다. 피해 대응 전체가 사라진 사례가 아니라, 대응이 진행되다가 마지막 짧은 공격 구간에서 죽은 사례다. 신규 안전 조건을 추가하지 않고 사망 기록으로 남긴다.', '',
'## 19 #2: 처치도 사망도 있었다', '',
'첫 120초에서 안전지킴이/겁쟁이는 2처치·2사망이었다. t981에는 #11과 서로 선을 끊어 동시에 죽었고, t1991에는 회피 중 #10에게 선이 잘렸다. t3394에는 #13을 처치했다. 직접 ATTACK 상태는 생존 프레임의 약 1.8%이고 두 사망 때는 ESCAPE 상태였다. 교전 결과를 공격 성격이나 겁쟁이 효과만으로 단정하지 않는다.', '',
'## HUD와 audit 되찾기는 다른 정의다', '',
'137 t3334의 계획은 예상 D 16칸이었고 t3467에 HUD 기준으로 16칸을 실제 회수했다. 그 16칸의 점령 직전 소유자는 모두 0(중립)이었다. HUD는 이전에 내 땅이었던 피해 구역의 중립 칸도 회수로 기록한다. 기존 audit은 적 소유→내 소유 전환만 집계하므로 같은 점령의 되찾기가 0칸이다. D를 선택하고도 실행하지 않았다고 판단할 상황은 아니다.', '',
'반대로 137 t2627의 계획은 압박으로 작은 귀환으로 바뀌어 예상 6→실제 0칸이다. 예측과 실행의 차이는 실제 취소·축소에서도 생긴다. HUD의 한 계획 숫자와 audit의 60초 손실 누적치를 섞지 않는다. 기존 8시드 비교의 값·정의를 바꾸지 않았으며, 앞으로 중립화된 피해 지역 회수를 보조 항목으로 분리하면 관전과 수치의 연결이 쉬워질 것이다.', '',
'## 판단과 다음 작업', '',
'피해 방향 이동, 안전 때문에 중단/축소되는 계획, 실제 회수, 성격별 탈취 비중 차이를 모두 확인했다. 이번 장면만으로 REPOSITION을 원복하거나 2.5단계 안전 수치를 더 조정할 근거는 충분하지 않다. 관전 확인은 여기까지로 충분하며, 다음 작업은 3단계 수치·구조 제안이다. 구현은 아직 시작하지 않았다.', '',
'137의 A→B→A와 공격 전환, 47의 벽 회피와 귀환 중 절단, 73의 회수 완료·계획 교체·마지막 공격 사망을 회귀 자료로 남긴다. 예측 D와 실제 회수, 최신 판단과 계획 생성 이유를 계속 구별해야 한다.', '',
'증거: [요약·행동/사망/재배치 기록](../evidence/bot-phase025-spectating/summary.json). 큰 원본은 기본 저장소 `.local/bot-phase025-spectating/`에 있고, 관측 스크립트는 `scripts/bot-phase025-spectating.ts`다. 137·73은 실제 HUD의 BotReclaimDiagnostics로도 확인했으며, 최초 네 경기와 추가 관측을 구별한다. 스크립트 타입 검증과 전체 3600tick 궤적 재현 검증을 통과했다.', '']
(ROOT/'docs/bot-ai-phase025-spectating.md').write_text('\n'.join(lines),encoding='utf-8')
print('Scene summary and report written')
