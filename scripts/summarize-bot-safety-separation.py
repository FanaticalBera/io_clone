"""Shared measurement, paired adjacent contrasts; raw trajectories stay local."""
import csv, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT.parent / 'bot-safety-separation'
OUT = ROOT / 'evidence/bot-safety-separation'
protocol = json.loads((OUT/'protocol.json').read_text(encoding='utf-8'))
arms = [a['name'] for a in protocol['arms']]
seeds = protocol['seeds']
keys = ['deaths','net','totalCapture','reclaimed','tickMs']
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def pct(a,b): return 100*(b-a)/a if a else None
def tv(r):
 a,b = [next(p for p in r['personalities'] if p['personality']==n) for n in ['EXPAND','SEEK_POINT']]
 return sum(abs(a['goalFrames'].get(k,0)/a['aliveFrames']-b['goalFrames'].get(k,0)/b['aliveFrames']) for k in set(a['goalFrames'])|set(b['goalFrames']))/2
performance=json.loads((RAW/'performance.json').read_text(encoding='utf-8')) if (RAW/'performance.json').exists() else None
if performance and 'summary' not in performance: performance=None
metrics={}; extras={}; hashes={}
for arm in arms:
 path=RAW/(arm+'.json');data=json.loads(path.read_text(encoding='utf-8'));hashes[arm]=digest(path)
 if data['seeds']!=seeds: raise ValueError('Seed mismatch '+arm)
 metrics[arm]={};extras[arm]={}
 for r in data['reports']:
  if r['seconds']!=120 or r['phase']!='RUNNING' or r['requestedTicks']!=3600: raise ValueError('Length mismatch')
  cost=next((p['medianMsPerTick'] for p in performance['summary'][arm]['bySeed'] if p['seed']==r['seed']),None) if performance else None
  metrics[arm][r['seed']]={'deaths':r['deaths'],'net':sum(p['netTerritoryChange'] for p in r['growth']['participants']),'totalCapture':r['totalCapture'],'reclaimed':sum(p['reclaimedCells'] for p in r['personalities']),'tickMs':cost,'walls':r['walls'],'tv':tv(r),'trajectoryHash':r['trajectoryHash']}
  extras[arm][r['seed']]={'reposition':r['reposition']['stats'] if r['reposition'] else None,'personas':[{k:p[k] for k in ['personality','deaths','totalCapture','stolenCells','stolenShare','reclaimedCells']} for p in r['personalities']]}
def signal(ds):
 positive=sum(d>0 for d in ds);negative=sum(d<0 for d in ds);total=sum(ds)
 loo=[total-d for d in ds];direction='increase' if positive>=7 and all(d>0 for d in loo) else 'decrease' if negative>=7 and all(d<0 for d in loo) else 'inconclusive'
 return {'positive':positive,'negative':negative,'ties':len(ds)-positive-negative,'sumDelta':total,'leaveOneOutSums':loo,'direction':direction,'note':'Inconclusive is not no effect; predefined directional screen, not a significance test.'}
totals={}
for arm in arms:
 rows=list(metrics[arm].values());total={k:sum(r[k] for r in rows) for k in keys if k!='tickMs'};total['tickMs']=performance['summary'][arm]['medianMsPerTick'] if performance else None;total['walls']=sum(r['walls'] for r in rows);total['tv']=sum(r['tv'] for r in rows)/len(rows);totals[arm]=total
comparisons=[]
for a,b in zip(arms,arms[1:]):
 differences=[]
 for seed in seeds:
  before,after=metrics[a][seed],metrics[b][seed]
  differences.append({'seed':seed,'delta':{k:after[k]-before[k] if after[k] is not None else None for k in keys},'percent':{k:pct(before[k],after[k]) if after[k] is not None else None for k in keys}})
 paired={k:signal([r['delta'][k] for r in differences]) for k in keys if differences[0]['delta'][k] is not None}
 comparisons.append({'before':a,'after':b,'bySeed':differences,'totalDelta':{k:totals[b][k]-totals[a][k] if totals[b][k] is not None else None for k in keys},'totalPercent':{k:pct(totals[a][k],totals[b][k]) if totals[b][k] is not None else None for k in keys},'paired':paired})
cumulative={arm:{k:signal([metrics[arm][seed][k]-metrics['base'][seed][k] for seed in seeds]) for k in keys if metrics[arm][seeds[0]][k] is not None} for arm in arms[1:]}
result={'cumulativePaired':cumulative,'seeds':seeds,'measurement':'Same current audit and growth helper on exact historical shared sources. Reclaim at tick boundaries, 60s lost-cell memory reset on respawn. Net excludes initial/spawn grants and adds pre-neutralization death reset losses; not final held territory.','interpretation':protocol['separation'],'armTotals':totals,'bySeed':metrics,'adjacentComparisons':comparisons,'observerExtras':extras,'cost':{k:v for k,v in performance.items() if k!='batches'} if performance else None,'rawHashes':hashes,'noFurtherSafetyChanges':True,'6004':'Recorded only; no new fix.','retentionDecision':'Deferred to user review.'}
if performance: result['rawHashes']['performance']=digest(RAW/'performance.json')
# Keep compact seed/arm/cost rows and signals, not full game trajectories.
with (OUT/'personality-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.writer(f);writer.writerow(['arm','seed','personality','deaths','totalCapture','stolenCells','stolenShare','reclaimedCells'])
 for arm in arms:
  for seed in seeds:
   for p in extras[arm][seed]['personas']:writer.writerow([arm,seed,*[p[k] for k in ['personality','deaths','totalCapture','stolenCells','stolenShare','reclaimedCells']]])
result['observerExtras']={arm:{seed:{'reposition':row['reposition']} for seed,row in rows.items()} for arm,rows in extras.items()}
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (OUT/'metrics-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.writer(f);writer.writerow(['arm','seed',*keys,'walls','tv','trajectoryHash'])
 for arm in arms:
  for seed in seeds: writer.writerow([arm,seed,*[metrics[arm][seed][k] for k in keys],metrics[arm][seed]['walls'],metrics[arm][seed]['tv'],metrics[arm][seed]['trajectoryHash']])
print(json.dumps({'totals':totals,'contrasts':[{k:c[k] for k in ['before','after','totalPercent','paired']} for c in comparisons]},ensure_ascii=False))

if performance:
 with (OUT/'cost-samples.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(performance['batches'][0]));writer.writeheader();writer.writerows(performance['batches'])
