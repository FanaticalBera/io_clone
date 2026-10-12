"""Actual holdings only; verify unchanged trajectories before any inference."""
import csv, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT.parent/'bot-holding-review'
OLD=ROOT.parent/'bot-safety-separation'
OUT=ROOT/'evidence/bot-holding-review'
protocol=json.loads((OUT/'protocol.json').read_text(encoding='utf-8'))
seeds=protocol['seeds'];arms=[a['name'] for a in protocol['arms']]
metrics=['timeAverageCells','finalCells','maximumShare']
def signal(ds):
 up=sum(d>0 for d in ds);down=sum(d<0 for d in ds);total=sum(ds);loo=[total-d for d in ds]
 direction='increase' if up>=7 and all(d>0 for d in loo) else 'decrease' if down>=7 and all(d<0 for d in loo) else 'inconclusive'
 return {'up':up,'down':down,'ties':len(ds)-up-down,'direction':direction,'sumDelta':total,'leaveOneOutSums':loo}
def pct(a,b):return 100*(b-a)/a if a else None
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
if digest(ROOT/'tests/bot-holding-tracker.ts')!=protocol['holdingHelperHash'] or digest(ROOT/'scripts/bot-phase025-audit.ts')!=protocol['auditScriptHash']:raise ValueError('Measurement source changed')
rows={};bots={};hashes={};verified=[]
for definition in protocol['arms']:
 arm=definition['name']
 for file,h in definition['sourceHashes'].items():
  if digest(Path(definition['source'])/file)!=h:raise ValueError('Behavior source changed '+arm+' '+file)
 data=json.loads((RAW/(arm+'.json')).read_text(encoding='utf-8'));old=json.loads((OLD/(arm+'.json')).read_text(encoding='utf-8'));oldBySeed={r['seed']:r for r in old['reports']}
 if data['seeds']!=seeds:raise ValueError('Seed mismatch')
 rows[arm]={};bots[arm]={};hashes[arm]=digest(RAW/(arm+'.json'))
 for r in data['reports']:
  previous=oldBySeed[r['seed']]
  if r['trajectoryHash']!=previous['trajectoryHash']:raise ValueError('Trajectory changed '+arm+' '+str(r['seed']))
  for key in ['deaths','walls','totalCapture']:
   if r[key]!=previous[key]:raise ValueError('Legacy metric changed')
  if r['growth']!=previous['growth']:raise ValueError('Growth measurement changed')
  h=r['holding']
  if h['samples']!=3600 or h['firstSampleTick']!=1 or h['lastSampleTick']!=3600:raise ValueError('Holding sample window changed')
  if len(h['participants'])!=14:raise ValueError('Bot roster changed')
  if h['total']['holdingCellTicks']!=sum(b['holdingCellTicks'] for b in h['participants']):raise ValueError('Holding aggregate does not reconcile')
  if h['total']['finalCells']!=sum(b['finalCells'] for b in h['participants']):raise ValueError('Final aggregate does not reconcile')
  rows[arm][r['seed']]={**h['total'],'deaths':r['deaths'],'walls':r['walls'],'mapCells':h['mapCells'],'trajectoryHash':r['trajectoryHash']}
  bots[arm][r['seed']]={p['slot']:p for p in h['participants']};verified.append({'arm':arm,'seed':r['seed'],'trajectoryHash':r['trajectoryHash']})
aggregates={arm:{**{k:sum(r[k] for r in values.values())/len(seeds) for k in metrics},'finalSumAcrossSeeds':sum(r['finalCells'] for r in values.values()),'deaths':sum(r['deaths'] for r in values.values()),'walls':sum(r['walls'] for r in values.values())} for arm,values in rows.items()}
contrasts=[]
pairs=[*zip(arms,arms[1:]),('base','start'),('counter','start')]
for before,after in pairs:
 changes=[{'seed':seed,'delta':{k:rows[after][seed][k]-rows[before][seed][k] for k in metrics}} for seed in seeds]
 contrasts.append({'before':before,'after':after,'meanDelta':{k:aggregates[after][k]-aggregates[before][k] for k in metrics},'meanPercent':{k:pct(aggregates[before][k],aggregates[after][k]) for k in metrics},'paired':{k:signal([c['delta'][k] for c in changes]) for k in metrics},'bySeed':changes})
launch=next(c for c in contrasts if c['before']=='counter' and c['after']=='departure')
primary=launch['paired']['timeAverageCells']['direction'];opposite=any(launch['paired'][k]['direction']=='decrease' for k in ['finalCells','maximumShare'])
decision='benefit_signal' if primary=='increase' and not opposite else 'loss_signal' if primary=='decrease' else 'tradeoff' if primary=='increase' and opposite else 'inconclusive'
result={'seeds':seeds,'metrics':metrics,'aggregates':aggregates,'contrasts':contrasts,'departureDecision':decision,'interpretation':'Same-seed adjacent conditional effects, not independent/factorial contributions. Inconclusive is not equivalence. Means over eight separate equal-duration games, not a summed multi-map share.','verifiedTrajectories':len(verified),'rawHashes':hashes,'behaviorSourceFrozen':True}
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (OUT/'whole-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
 fields=['arm','seed','timeAverageCells','finalCells','maximumCells','maximumShare','maximumTick','largestBotMaximumShare','holdingCellTicks','deaths','walls','mapCells','trajectoryHash'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for arm in arms:
  for seed in seeds:w.writerow({'arm':arm,'seed':seed,**rows[arm][seed]})
with (OUT/'bots-by-seed.csv').open('w',encoding='utf-8',newline='') as f:
 fields=['arm','seed','slot','participantId','nickname','personality','timeAverageCells','finalCells','maximumCells','maximumShare','maximumTick','holdingCellTicks'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for arm in arms:
  for seed in seeds:
   for p in bots[arm][seed].values():w.writerow({'arm':arm,'seed':seed,**p})
with (OUT/'bot-paired-deltas.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['before','after','seed','slot','nickname','personality',*metrics])
 for before,after in pairs:
  for seed in seeds:
   for slot,b in bots[before][seed].items():
    a=bots[after][seed][slot]
    if (a['participantId'],a['personality'],a['nickname'])!=(b['participantId'],b['personality'],b['nickname']):raise ValueError('Bot assignment changed')
    w.writerow([before,after,seed,slot,a['nickname'],a['personality'],*[a[k]-b[k] for k in metrics]])
with (OUT/'bot-slot-signals.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['before','after','slot','metric','direction','up','down','ties','sumDelta','minimumLOO','maximumLOO'])
 for before,after in pairs:
  for slot in range(14):
   for k in metrics:
    paired=signal([bots[after][seed][slot][k]-bots[before][seed][slot][k] for seed in seeds]);w.writerow([before,after,slot,k,*[paired[p] for p in ['direction','up','down','ties','sumDelta']],min(paired['leaveOneOutSums']),max(paired['leaveOneOutSums'])])
print(json.dumps({'aggregates':aggregates,'departureDecision':decision,'launch':launch,'verifiedTrajectories':len(verified)},ensure_ascii=False))

rawCPU=RAW/'current-cpu.cpuprofile'
if rawCPU.exists():
 from collections import Counter
 p=json.loads(rawCPU.read_text(encoding='utf-8'));nodes={n['id']:n for n in p['nodes']};parent={c:n['id'] for n in p['nodes'] for c in n.get('children',[])}
 names=['plannedCapture','planExpansion','getBotInput','evaluateDepartureSafety','projectDeparture','headVisits','selectOwnedDepartureFallback','evaluateRepositionStartSafety','stepSteering'];counts=Counter()
 for nodeId in p['samples']:
  seen=set()
  while nodeId in nodes:
   name=nodes[nodeId]['callFrame']['functionName']
   if name in names:seen.add(name)
   nodeId=parent.get(nodeId,-1)
  counts.update(seen)
 profile={'seed':19,'ticks':3600,'deaths':rows['start'][19]['deaths'],'warmupDiscarded':1,'samples':len(p['samples']),'method':'Fraction of sampled call stacks containing each function, inclusive descendants; nested percentages must not be added. Single function attribution, not a benchmark delta.','selectedInclusivePercent':{k:100*counts[k]/len(p['samples']) for k in names},'rawHash':digest(rawCPU)}
 (OUT/'profile-summary.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rejection=RAW/'rejection-profile.json'
if rejection.exists():
 r=json.loads(rejection.read_text(encoding='utf-8'))
 if r['trajectoryHash']!=rows['start'][19]['trajectoryHash']:raise ValueError('Rejection profile trajectory mismatch')
 r['rawHash']=digest(rejection);(OUT/'rejection-profile.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
