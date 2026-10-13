import csv,hashlib,json
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT.parent/'bot-phase025-closeout';OUT=ROOT/'evidence/bot-phase025-closeout'
p=json.loads((OUT/'protocol.json').read_text(encoding='utf-8'));seeds=p['seeds'];arms=[a['name'] for a in p['arms']]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def signal(ds):
    up=sum(x>0 for x in ds);down=sum(x<0 for x in ds);total=sum(ds);loo=[total-x for x in ds]
    return {'up':up,'down':down,'ties':len(ds)-up-down,'sumDelta':total,'leaveOneOutSums':loo,'direction':'increase' if up>=7 and all(x>0 for x in loo) else 'decrease' if down>=7 and all(x<0 for x in loo) else 'inconclusive'}
def pct(a,b):return 100*(b-a)/a if a else None
def tv(a,b,excludeReposition=False):
    ka={k:v for k,v in a['goalFrames'].items() if not(excludeReposition and k=='REPOSITION')};kb={k:v for k,v in b['goalFrames'].items() if not(excludeReposition and k=='REPOSITION')}
    na=sum(ka.values()) if excludeReposition else a['aliveFrames'];nb=sum(kb.values()) if excludeReposition else b['aliveFrames']
    if not na or not nb:raise ValueError('No alive samples for TV')
    return sum(abs(ka.get(k,0)/na-kb.get(k,0)/nb) for k in ka.keys()|kb.keys())/2
for arm in p['arms']:
    for name,h in arm['sourceHashes'].items():assert digest(Path(arm['source'])/name)==h,('source changed',arm['name'],name)
for name,h in p['measurementHashes'].items():assert digest(ROOT/name)==h,('measurement changed',name)
data={arm:json.loads((RAW/(arm+'.json')).read_text(encoding='utf-8')) for arm in arms};rows={};personas={};allTV={};bots=[]
for arm,d in data.items():
    assert d['seeds']==seeds and [r['seed'] for r in d['reports']]==seeds
    rows[arm]={};personas[arm]={};allTV[arm]={}
    for r in d['reports']:
        assert r['seconds']==120 and r['phase']=='RUNNING' and r['holding']['samples']==3600
        ps={q['personality']:q for q in r['personalities']};a,b=ps['EXPAND'],ps['SEEK_POINT']
        rows[arm][r['seed']]={'holdingMean':r['holding']['total']['timeAverageCells'],'finalHolding':r['holding']['total']['finalCells'],'deaths':r['deaths'],'reclaimed':sum(q['reclaimedCells'] for q in ps.values()),'walls':r['walls'],'tv':tv(a,b),'tvWithoutReposition':tv(a,b,True),'tickMs':None,'netReference':sum(q['netTerritoryChange'] for q in r['growth']['participants']),'captureReference':r['totalCapture'],'trajectoryHash':r['trajectoryHash']}
        personas[arm][r['seed']]={name:{k:q[k] for k in ['stolenCells','totalCapture','stolenShare','deaths','reclaimedCells','goalFrames','aliveFrames']} for name,q in ps.items()}
        names=sorted(ps);allTV[arm][r['seed']]={x+'/'+y:tv(ps[x],ps[y]) for i,x in enumerate(names) for y in names[i+1:]}
        bots += [{'arm':arm,'seed':r['seed'],**{k:q[k] for k in ['slot','personality','timeAverageCells','finalCells','maximumShare']}} for q in r['holding']['participants']]
for x,y in zip(data['base']['reports'],data['current']['reports']):
    roster=lambda r:[(q['slot'],q['personality'],q['nickname']) for q in r['holding']['participants']]
    assert roster(x)==roster(y),'Different initial roster assignments'
    oldbase=json.loads((ROOT.parent/'bot-safety-separation/base.json').read_text(encoding='utf-8'))
    assert x['trajectoryHash']==next(r['trajectoryHash'] for r in oldbase['reports'] if r['seed']==x['seed'])
    oldcurrent=json.loads((ROOT.parent/'bot-perf-rp-review/optimized.json').read_text(encoding='utf-8'))
    old=next(r for r in oldcurrent['reports'] if r['seed']==y['seed'])
    assert all(y[k]==old[k] for k in ['trajectoryHash','equivalenceProof','holding','personalities','deaths','walls'])
performance=json.loads((RAW/'performance.json').read_text(encoding='utf-8')) if (RAW/'performance.json').exists() else None
if performance and 'summary' not in performance:performance=None
if performance:
    expected={(round,arm,seed) for round in range(3) for arm in arms for seed in seeds}
    assert len(performance['batches'])==48 and {(r['round'],r['arm'],r['seed']) for r in performance['batches']}==expected
    for r in performance['batches']:assert r['ticks']==3600 and r['deaths']==rows[r['arm']][r['seed']]['deaths']
    for arm in arms:
        for q in performance['summary'][arm]['bySeed']:rows[arm][q['seed']]['tickMs']=q['medianMsPerTick']
metrics=['holdingMean','finalHolding','deaths','reclaimed','tv','tvWithoutReposition','tickMs','netReference','captureReference'];totals={}
for arm in arms:
    totals[arm]={k:(performance['summary'][arm]['medianMsPerTick'] if performance else None) if k=='tickMs' else sum(r[k] for r in rows[arm].values())/(8 if k in ['holdingMean','finalHolding','tv','tvWithoutReposition'] else 1) for k in metrics}
paired={k:signal([rows['current'][seed][k]-rows['base'][seed][k] for seed in seeds]) for k in metrics if rows['current'][seeds[0]][k] is not None}
percent={k:pct(totals['base'][k],totals['current'][k]) if totals['current'][k] is not None else None for k in metrics}
personaTotals={};personaSignals={}
for arm in arms:
    personaTotals[arm]={}
    for name in personas[arm][seeds[0]]:
        stolen=sum(personas[arm][seed][name]['stolenCells'] for seed in seeds);capture=sum(personas[arm][seed][name]['totalCapture'] for seed in seeds)
        personaTotals[arm][name]={'stolenCells':stolen,'totalCapture':capture,'stolenShare':stolen/capture if capture else 0}
for name in personaTotals['base']:personaSignals[name]=signal([personas['current'][seed][name]['stolenShare']-personas['base'][seed][name]['stolenShare'] for seed in seeds])
pairwiseTV={key:{'base':sum(allTV['base'][seed][key] for seed in seeds)/8,'current':sum(allTV['current'][seed][key] for seed in seeds)/8,'signal':signal([allTV['current'][seed][key]-allTV['base'][seed][key] for seed in seeds])} for key in allTV['base'][seeds[0]]}
diag=json.loads((RAW/'outlier-diagnostic.json').read_text(encoding='utf-8'));powers=json.loads((RAW/'power-details.json').read_text(encoding='utf-8-sig'))
wake=next((q for q in powers if q['id']==1 and 'SleepTime' in q['data']),None)
sleepSeconds=(datetime.fromisoformat(wake['data']['WakeTime'].replace('Z','+00:00'))-datetime.fromisoformat(wake['data']['SleepTime'].replace('Z','+00:00'))).total_seconds() if wake else None
assert digest(ROOT.parent/'bot-perf-rp-review/performance.json')==diag['oldFileSha256']
checks={'walls':totals['base'].get('walls',sum(r['walls'] for r in rows['base'].values()))==0 and sum(r['walls'] for r in rows['current'].values())==0,'holding':percent['holdingMean']>=-5,'deaths':percent['deaths']<20,'cost':percent['tickMs']<20 if performance and performance['resourceGuard']['overlappingRows']==0 else None,'seed4LegacyDeaths':rows['current'][4]['deaths']<20}
result={'protocol':'protocol.json','totals':totals,'percent':percent,'paired':paired,'bySeed':rows,'personaTotals':personaTotals,'personaSignals':personaSignals,'pairwiseTV':pairwiseTV,'cost':{k:v for k,v in performance.items() if k!='batches'} if performance else None,'outlierDiagnostic':{'original':diag['old'],'repeat':{k:v for k,v in diag['diagnostic'].items() if k!='nextRng'},'atUtc':diag['atUtc'],'gcEntriesCaptured':len(diag['gc']),'originalPreserved':True,'oldFileSha256':diag['oldFileSha256'],'powerEvents':powers,'sleepSeconds':sleepSeconds,'interpretation':'Sleep/resume is the leading explanation, inferred from a 203s system sleep interval within the old session and normal repeat. Original per-row timestamps/CPU/GC were not recorded; no definitive row-level attribution or sample replacement.'},'checks':checks,'verdict':'quantitative thresholds clear, user spectating pending' if all(v is True for v in checks.values()) else 'review required or cost pending','rawHashes':{f:digest(RAW/f) for f in ['base.json','current.json','outlier-diagnostic.json','power-details.json']},'decisions':p['decisions'],'phase3':'not started; user observation required'}
if performance:result['rawHashes']['performance.json']=digest(RAW/'performance.json')
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (OUT/'metrics-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f);w.writerow(['arm','seed',*metrics,'walls','trajectoryHash'])
    for arm in arms:
        for seed,r in rows[arm].items():w.writerow([arm,seed,*[r[k] for k in metrics],r['walls'],r['trajectoryHash']])
with (OUT/'personality-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f);w.writerow(['arm','seed','personality','stolenCells','totalCapture','stolenShare','deaths','reclaimedCells'])
    for arm in arms:
        for seed in seeds:
            for name,r in personas[arm][seed].items():w.writerow([arm,seed,name,*[r[k] for k in ['stolenCells','totalCapture','stolenShare','deaths','reclaimedCells']]])
with (OUT/'holding-by-bot.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(bots[0]));w.writeheader();w.writerows(bots)
with (OUT/'tv-pairs-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f);w.writerow(['seed','pair','baseTV','currentTV','delta'])
    for seed in seeds:
        for pair in pairwiseTV:
            a=allTV['base'][seed][pair];b=allTV['current'][seed][pair]
            w.writerow([seed,pair,a,b,b-a])
if performance:
    with (OUT/'cost-samples.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(performance['batches'][0]));w.writeheader();w.writerows(performance['batches'])
print(json.dumps({'totals':totals,'percent':percent,'signals':paired,'checks':checks},ensure_ascii=False))
