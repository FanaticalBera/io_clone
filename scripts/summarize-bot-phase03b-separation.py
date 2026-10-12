import argparse,json,csv,hashlib
from pathlib import Path
from collections import Counter
p=argparse.ArgumentParser();p.add_argument('--raw',default='../bot-phase03b-separation');p.add_argument('--out',default='evidence/bot-phase03b-separation');args=p.parse_args();root=Path(args.raw);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
protocol=read(root/'protocol.json');names=['baseline','tactical','strategy','combined'];arms={n:read(root/(n+'.json'))['reports'] for n in names};legacy=read(root/'legacy-control.json')['reports'];near=read(root/'near-baseline-final.json')['reports']
def role(r,who):return next(g for g in r['personalities'] if g['personality']==who)
def tv(r,exclude=False):
 a=role(r,'EXPAND')['goalFrames'];b=role(r,'SEEK_POINT')['goalFrames'];a={k:v for k,v in a.items() if not exclude or k!='REPOSITION'};b={k:v for k,v in b.items() if not exclude or k!='REPOSITION'}
 return .5*sum(abs(a.get(k,0)/sum(a.values())-b.get(k,0)/sum(b.values())) for k in a.keys()|b.keys())
def total(rows):
 parts=[p for r in rows for p in r['transitionAudit']['participants']];d={'holding':sum(r['holding']['total']['timeAverageCells'] for r in rows)/len(rows),'final':sum(r['holding']['total']['finalCells'] for r in rows)/len(rows),'deaths':sum(r['deaths'] for r in rows),'reclaim':sum(g['reclaimedCells'] for r in rows for g in r['personalities']),'tv':sum(tv(r) for r in rows)/len(rows),'tvWithoutRP':sum(tv(r,True) for r in rows)/len(rows),'nearRate':1800*sum(p['nearReplacements'] for p in parts)/sum(p['nearFrames'] for p in parts),'nearStops':sum(p['nearReplacements'] for p in parts),'nearFrames':sum(p['nearFrames'] for p in parts),'targetABA':sum(p['targetABA'] for p in parts),'modeABA':sum(p['modeABA'] for p in parts),'voluntaryTargetABA':sum(p['voluntaryTargetABA'] for p in parts),'voluntaryModeABA':sum(p['voluntaryModeABA'] for p in parts),'nearVoluntary':sum(p['nearVoluntaryReplacements'] for p in parts),'walls':sum(r['walls'] for r in rows),'wouldBlockHold':sum(p['wouldBlock'] for p in parts)}
 d['modeABAWithSafety']=sum(c['type']=='MODE' and any(e['change']=='SAFETY' for e in c['changes'][1:]) for r in rows for c in r['transitionAudit']['abaCases'])
 for who in ['ATTACK','EXPAND','DEFEND','SEEK_POINT']:
  groups=[role(r,who) for r in rows];capture=sum(g['totalCapture'] for g in groups);stolen=sum(g['stolenCells'] for g in groups);d['share_'+who]=stolen/capture if capture else 0
 return d
safetyKinds=['notifications','planStops','expansionStops'];reasons=['DANGER','EARLY_CLOSURE','EXPANSION_PRESSURE'];personalities=['ATTACK','EXPAND','DEFEND','SEEK_POINT']
def safety(rows,who,kind,reason):return sum(p[kind][reason] for r in rows for p in r['safetyStopAudit']['participants'] if p['personality']==who)
def signal(base,current,get):
 diff=[get([y])-get([x]) for x,y in zip(base,current)];positive=sum(v>1e-9 for v in diff);negative=sum(v< -1e-9 for v in diff)
 loo=[get([r for j,r in enumerate(current) if j!=i])-get([r for j,r in enumerate(base) if j!=i]) for i in range(len(base))]
 direction='increase' if positive>=7 and all(v>0 for v in loo) else 'decrease' if negative>=7 and all(v<0 for v in loo) else 'indistinguishable'
 return {'positive':positive,'negative':negative,'tie':8-positive-negative,'leaveOneOutMin':min(loo),'leaveOneOutMax':max(loo),'direction':direction}
aggregate={n:total(rows) for n,rows in arms.items()};signals={n:{k:signal(arms['baseline'],arms[n],lambda rows:total(rows)[k]) for k in aggregate[n]} for n in names if n!='baseline'}
for n,rows in arms.items():
 aggregate[n]['deathCauses']=dict(sum((Counter(d['cause'] for d in r['deathDetails']) for r in rows),Counter()))
 aggregate[n]['byPersonality']={who:{'captured':sum(role(r,who)['totalCapture'] for r in rows),'stolen':sum(role(r,who)['stolenCells'] for r in rows),'deaths':sum(role(r,who)['deaths'] for r in rows),'expansionPlans':sum(role(r,who)['expansionPlans'] for r in rows),'aliveFrames':sum(role(r,who)['aliveFrames'] for r in rows),'safety':{kind:{reason:safety(rows,who,kind,reason) for reason in reasons} for kind in safetyKinds}} for who in personalities}
safetySignals={n:{who:{kind:{reason:signal(arms['baseline'],rows,lambda data:safety(data,who,kind,reason)) for reason in reasons} for kind in ['planStops']} for who in personalities} for n,rows in arms.items() if n!='baseline'}
proof=[]
oldBaseline=read('../bot-phase03a/verified-final.json')['reports'];oldCombined=read('../bot-phase03b/current-final.json')['reports']
for i,x in enumerate(arms['baseline']):
 y=legacy[i];b=arms['combined'][i];observer=near[i]
 check={'seed':x['seed'],'baselineMatches3A':x['trajectoryHash']==oldBaseline[i]['trajectoryHash'] and x['equivalenceProof']==oldBaseline[i]['equivalenceProof'],'combinedMatches3B':b['trajectoryHash']==oldCombined[i]['trajectoryHash'] and b['equivalenceProof']==oldCombined[i]['equivalenceProof'],'zeroFactorTrajectory':x['trajectoryHash']==y['trajectoryHash'],'zeroFactorNormalizedState':x['cadenceNeutralProof']==y['cadenceNeutralProof'],'zeroFactorRng':x['equivalenceProof']['nextRng']==y['equivalenceProof']['nextRng'],'zeroFactorReservations':x['director']==y['director'],'nearObserverTrajectory':x['trajectoryHash']==observer['trajectoryHash'],'nearObserverStateRng':x['equivalenceProof']==observer['equivalenceProof'],'nearObserverReservations':x['director']==observer['director'],'sourceCaptureHooks':x['supplementaryRecovery']==oldBaseline[i]['supplementaryRecovery']}
 assert all(v for k,v in check.items() if k!='seed'),check;proof.append(check)
nearRows=[];nearPersonality={};cases=[];changes=[]
for r in near:
 d=r['nearRestartAudit'];parts=d['participants'];keys=[k for k in parts[0] if k not in ['slot','personality','recancelReasons']];row={'seed':r['seed'],**{k:sum(p[k] for p in parts) for k in keys}}
 changeKeys={(e['slot'],e['tick']) for e in d['changedChoices']};failCases=[e for e in d['cases'] if e['reason']!='EARLY_CLOSURE'];row['realRepeatsEligible']=sum(e['realReturn'] and e['eligibleAtSelection'] for e in failCases);row['realRepeatSelectionsChanged']=sum(e['realReturn'] and (e['slot'],e['selectedTick']) in changeKeys for e in failCases);row['atHomeRepeatSelectionsChanged']=sum(not e['realReturn'] and (e['slot'],e['selectedTick']) in changeKeys for e in failCases);row['changedRealReturn']=sum(e['realReturn'] for e in d['changedChoices']);row['changedAtHome']=sum(not e['realReturn'] for e in d['changedChoices']);nearRows.append(row)
 cases += [{'seed':r['seed'],**e} for e in d['cases']];changes += [{'seed':r['seed'],**e} for e in d['changedChoices']]
nearTotal={k:sum(r[k] for r in nearRows) for k in nearRows[0] if k!='seed'};assert nearTotal['zeroCheckMismatches']==0
for who in personalities:
 parts=[p for r in near for p in r['nearRestartAudit']['participants'] if p['personality']==who];nearPersonality[who]={k:sum(p[k] for p in parts) for k in parts[0] if k not in ['slot','personality','recancelReasons']}
source=[]
for arm in protocol['arms']:
 for file,h in arm['sourceHashes'].items():assert hashlib.sha256((Path(arm['source'])/file).read_bytes()).hexdigest()==h,(arm['name'],file)
 source.append({'name':arm['name'],'sourceManifestSha256':hashlib.sha256(json.dumps(arm['sourceHashes'],sort_keys=True).encode()).hexdigest(),'schedulerSha256':arm['sourceHashes']['src/shared/bot-scheduler.ts']})
summary={'date':'2026-10-13','baseline':protocol['base'],'unadopted3B':protocol['combined'],'master':'960f678','protocol':{k:protocol[k] for k in ['seeds','ticks','simulationHz','mapRadius','spawnRadius','bots','safeRespawn','variant','definitions','adoption']},'sourceManifests':source,'aggregate':aggregate,'signals':signals,'safetySignals':safetySignals,'equivalence':proof,'nearB':{'basis':'3A; remains adopted reference after cadence comparisons, no experimental cadence arm adopted','definitions':near[0]['nearRestartAudit']['definition'],'total':nearTotal,'bySeed':nearRows,'byPersonality':nearPersonality},'scope':{'3B':'not adopted; two cadence factors measured independently','3C':'closed, Persistent excluded automatically','3D':'prefix measurement complete','nearBehavior':'not implemented; single-decision B shadow only'}}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
def csvFile(name,data):
 with (out/name).open('w',encoding='utf-8',newline='') as f:
  w=csv.DictWriter(f,list(data[0]));w.writeheader();w.writerows(data)
bySeed=[];personalityRows=[];safetyRows=[];deathRows=[]
for n,rows in arms.items():
 for i,r in enumerate(rows):
  metrics=total([r]);base=total([arms['baseline'][i]]);bySeed.append({'arm':n,'seed':r['seed'],**metrics,**{'delta_'+k:metrics[k]-base[k] for k in metrics},'trajectoryHash':r['trajectoryHash']})
  for who in personalities:
   g=role(r,who);personalityRows.append({'arm':n,'seed':r['seed'],'personality':who,'captured':g['totalCapture'],'stolen':g['stolenCells'],'stolenShare':g['stolenShare'],'expansionPlans':g['expansionPlans'],'aliveFrames':g['aliveFrames'],'deaths':g['deaths']})
   for reason in reasons:safetyRows.append({'arm':n,'seed':r['seed'],'personality':who,'reason':reason,**{kind:safety([r],who,kind,reason) for kind in safetyKinds},'delta_planStops':safety([r],who,'planStops',reason)-safety([arms['baseline'][i]],who,'planStops',reason)})
  counts=Counter(d['cause'] for d in r['deathDetails']);deathRows.append({'arm':n,'seed':r['seed'],**{k:counts[k] for k in ['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT','HOME_CAPTURE']},'walls':r['walls']})
csvFile('paired-seeds.csv',bySeed);csvFile('personality-seeds.csv',personalityRows);csvFile('safety-stops.csv',safetyRows);csvFile('death-causes.csv',deathRows);csvFile('near-seeds.csv',nearRows)
if cases:csvFile('near-repeat-cases.csv',cases)
if changes:
 for row in changes:
  for key in ['actual','shadow']:
   candidate=json.loads(row.pop(key)) if row[key] else [None]*5
   row[key+'_goal']=candidate[0];row[key+'_target']=candidate[2];row[key+'_anchor']=candidate[3]
 csvFile('near-changed-choices.csv',changes)
print(json.dumps({'aggregate':{n:{k:v for k,v in d.items() if k!='byPersonality'} for n,d in aggregate.items()},'directions':{n:{k:(v['positive'],v['negative'],v['direction']) for k,v in d.items()} for n,d in signals.items()},'near':nearTotal},ensure_ascii=True))

loo=[]
for n in names[1:]:
 for metric in aggregate['baseline']:
  if metric in ['deathCauses','byPersonality']:continue
  for i,seed in enumerate(protocol['seeds']):
   base=[r for j,r in enumerate(arms['baseline']) if j!=i];current=[r for j,r in enumerate(arms[n]) if j!=i];x=total(base)[metric];y=total(current)[metric];loo.append({'arm':n,'metric':metric,'excludedSeed':seed,'baseline':x,'current':y,'delta':y-x})
csvFile('leave-one-out.csv',loo)
