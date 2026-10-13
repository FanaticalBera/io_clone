import csv,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;RAW=ROOT.parent/'bot-perf-rp-review';OUT=ROOT/'evidence/bot-perf-rp-review'
protocol=json.loads((OUT/'protocol.json').read_text(encoding='utf-8'));seeds=protocol['seeds'];arms=[a['name'] for a in protocol['arms']]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def signal(ds):
 up=sum(d>0 for d in ds);down=sum(d<0 for d in ds);total=sum(ds);loo=[total-d for d in ds]
 return {'up':up,'down':down,'ties':len(ds)-up-down,'sumDelta':total,'leaveOneOutSums':loo,'direction':'increase' if up>=7 and all(d>0 for d in loo) else 'decrease' if down>=7 and all(d<0 for d in loo) else 'inconclusive'}
def pct(a,b):return 100*(b-a)/a if a else None
for a in protocol['arms']:
 for name,h in a['sourceHashes'].items():
  if digest(Path(a['source'])/name)!=h:raise ValueError('Frozen production source changed')
for name,h in protocol['measurementHashes'].items():
 if digest(ROOT/name)!=h:raise ValueError('Measurement code changed')
for name,h in protocol['duplicateSourceHashes'].items():
 if digest(Path(protocol['duplicateSource'])/name)!=h:raise ValueError('Frozen duplicate probe changed')
raws={arm:json.loads((RAW/(arm+'.json')).read_text(encoding='utf-8')) for arm in arms}
rows={};proof=[]
for arm,data in raws.items():
 if data['seeds']!=seeds:raise ValueError('Seed mismatch')
 if [r['seed'] for r in data['reports']]!=seeds:raise ValueError('Audit report order/count mismatch')
 rows[arm]={}
 for r in data['reports']:
  if r['holding']['samples']!=3600:raise ValueError('Frame count mismatch')
  rows[arm][r['seed']]={'timeAverageCells':r['holding']['total']['timeAverageCells'],'finalCells':r['holding']['total']['finalCells'],'deaths':r['deaths'],'reclaimed':sum(p['reclaimedCells'] for p in r['personalities']),'walls':r['walls'],'trajectoryHash':r['trajectoryHash'],'repositionStarts':r['reposition']['stats']['starts'],'tickMs':None}
for x,y in zip(raws['baseline']['reports'],raws['optimized']['reports']):
 checks={k:x[k]==y[k] for k in ['trajectoryHash','equivalenceProof','holding','growth','personalities','deathDetails','departure','reposition','director','totalCapture','deaths','walls']}
 if not all(checks.values()):raise ValueError('Optimization changed '+str(x['seed'])+str(checks))
 old=next(r for r in json.loads((ROOT.parent/'bot-holding-review/start.json').read_text(encoding='utf-8'))['reports'] if r['seed']==x['seed'])
 if x['trajectoryHash']!=old['trajectoryHash']:raise ValueError('Baseline differs from original abfeedd')
 proof.append({'seed':x['seed'],'trajectoryHash':x['trajectoryHash'],'allChecksEqual':True,'traceHash':x['equivalenceProof']['traceHash'],'memoryHash':x['equivalenceProof']['memoryHash']})
if any(r['repositionStarts']!=0 for r in rows['no-reposition'].values()):raise ValueError('Disabled reposition still starts')
long={a:json.loads((RAW/(a+'-long.json')).read_text(encoding='utf-8'))['reports'][0] for a in ['baseline','optimized']}
if any(long['baseline'][k]!=long['optimized'][k] for k in ['trajectoryHash','equivalenceProof','holding','growth','personalities','deathDetails','deaths','walls']):raise ValueError('Long optimization replay differs')
duplicates=json.loads((RAW/'duplicates.json').read_text(encoding='utf-8'))
if [r['seed'] for r in duplicates['reports']]!=seeds:raise ValueError('Duplicate report order/count mismatch')
for r in duplicates['reports']:
 baseline=next(s for s in raws['optimized']['reports'] if s['seed']==r['seed'])
 if r['trajectoryHash']!=baseline['trajectoryHash'] or r['nextRng']!=baseline['equivalenceProof']['nextRng']:raise ValueError('Duplicate probe changes behavior')
q=sum(r['queries'] for r in duplicates['reports']);hits=sum(r['hits'] for r in duplicates['reports'])
performance=json.loads((RAW/'performance.json').read_text(encoding='utf-8')) if (RAW/'performance.json').exists() else None
if performance and 'summary' not in performance:performance=None
if performance:
 expected={(round,arm,seed) for round in range(3) for arm in arms for seed in seeds}
 actual={(r['round'],r['arm'],r['seed']) for r in performance['batches']}
 if actual!=expected or len(performance['batches'])!=len(expected):raise ValueError('Cost sample count mismatch')
 for r in performance['batches']:
  if r['ticks']!=3600 or r['deaths']!=rows[r['arm']][r['seed']]['deaths']:raise ValueError('Cost behavior mismatch')
 for arm in arms:
  for seed in seeds:rows[arm][seed]['tickMs']=next(s['medianMsPerTick'] for s in performance['summary'][arm]['bySeed'] if s['seed']==seed)
metrics=['timeAverageCells','finalCells','deaths','reclaimed','tickMs'];totals={}
for arm,values in rows.items():totals[arm]={k:performance['summary'][arm]['medianMsPerTick'] if k=='tickMs' and performance else None if k=='tickMs' else sum(r[k] for r in values.values())/(8 if k in ['timeAverageCells','finalCells'] else 1) for k in metrics}
contrasts=[]
for before,after in [('baseline','optimized'),('baseline','no-reposition')]:
 paired=[{'seed':seed,'delta':{k:rows[after][seed][k]-rows[before][seed][k] if rows[after][seed][k] is not None else None for k in metrics}} for seed in seeds]
 contrasts.append({'before':before,'after':after,'delta':{k:totals[after][k]-totals[before][k] if totals[after][k] is not None else None for k in metrics},'percent':{k:pct(totals[before][k],totals[after][k]) if totals[after][k] is not None else None for k in metrics},'signals':{k:signal([p['delta'][k] for p in paired]) for k in metrics if paired[0]['delta'][k] is not None},'bySeed':paired})
result={'seeds':seeds,'totals':totals,'contrasts':contrasts,'optimizationProof':proof,'longProof':{'seed':137,'ticks':8800,'trajectoryHash':long['baseline']['trajectoryHash'],'deaths':long['baseline']['deaths'],'allChecksEqual':True},'duplicateReview':{'queries':q,'hits':hits,'hitRatio':hits/q,'bySeed':[{k:r[k] for k in ['seed','plans','plansWithDuplicates','queries','hits','hitRatio','trajectoryHash']} for r in duplicates['reports']],'scope':duplicates['scope'],'decision':'Do not implement an extra cache for this 0.83% exact hit rate; key/allocation costs require evidence, no cache speedup claimed.'},'cost':{k:v for k,v in performance.items() if k!='batches'} if performance else None,'rawHashes':{arm:digest(RAW/(arm+'.json')) for arm in arms},'repositionDecision':'Deferred to user; live reposition stays enabled.'}
if performance:result['rawHashes']['performance']=digest(RAW/'performance.json')
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (OUT/'metrics-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['arm','seed',*metrics,'walls','repositionStarts','trajectoryHash'])
 for arm in arms:
  for seed,r in rows[arm].items():w.writerow([arm,seed,*[r[k] for k in metrics],r['walls'],r['repositionStarts'],r['trajectoryHash']])
if performance:
 with (OUT/'cost-samples.csv').open('w',encoding='utf-8',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(performance['batches'][0]));w.writeheader();w.writerows(performance['batches'])
print(json.dumps({'totals':totals,'contrasts':contrasts,'duplicates':result['duplicateReview']['hitRatio']},ensure_ascii=False))
