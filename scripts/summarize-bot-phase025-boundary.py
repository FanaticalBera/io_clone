"""Fixed-seed paired ablation summary; audit outputs remain immutable."""
import argparse,gzip,hashlib,itertools,json,statistics
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--input',default='.local/bot-phase025-boundary');parser.add_argument('--output',default='evidence/bot-phase025-boundary');args=parser.parse_args()
root=Path(args.input);out=Path(args.output);protocol=json.loads((out/'protocol.json').read_text(encoding='utf-8-sig'))
names=protocol['arms'];seeds=protocol['seeds']
def distribution(values):
    v=[x for x in values if x is not None]
    return {'n':len(v),'missing':len(values)-len(v),'mean':statistics.mean(v) if v else None,'median':statistics.median(v) if v else None,
            'min':min(v) if v else None,'max':max(v) if v else None,'sd':statistics.stdev(v) if len(v)>1 else None,
            'atZero':sum(x==0 for x in v),'atMostOne':sum(x<=1 for x in v),'atMostTwo':sum(x<=2 for x in v)}
def totals(reports):
    ps=[p for r in reports for p in r['personalities']];es=[e for r in reports for e in r['episodeAudit']['episodes']];links=[e for r in reports for e in r['episodeAudit']['deathLinks']]
    bonus=[e for e in es if (e['plan'].get('response') or {}).get('bonus',0)>0];launch=[e for e in es if e['launchedTick'] is not None];bl=[e for e in bonus if e['launchedTick'] is not None]
    direct=[e for e in bl if not e['attackInterrupted']];resolved=[e for e in direct if e['outcome'] in ('DEATH','CAPTURE','HOME')]
    deaths=lambda x:sum(e['outcome']=='DEATH' for e in x)
    result={'deaths':sum(r['deaths'] for r in reports),'walls':sum(r['walls'] for r in reports),'totalCapture':sum(r['totalCapture'] for r in reports),
            'netTerritory':sum(p['netTerritoryChange'] for r in reports for p in r['growth']['participants']),
            'reclaimedCells':sum(p['reclaimedCells'] for p in ps),'stolenCells':sum(p['stolenCells'] for p in ps),
            'selectedPlans':len(es),'launchedPlans':len(launch),'expansionLinkedDeaths':deaths(es),
            'bonusSelectedPlans':len(bonus),'bonusLaunchedPlans':len(bl),'bonusLinkedDeaths':deaths(bonus),'bonusLaunchedDeaths':deaths(bl),
            'bonusDirectLaunchedPlans':len(direct),'bonusDirectDeaths':deaths(direct),'bonusAttackInterruptedDeaths':deaths([e for e in bl if e['attackInterrupted']]),
            'bonusDeathRatePerLaunch':deaths(bl)/len(bl) if bl else None,'bonusDirectDeathRatePerLaunch':deaths(direct)/len(direct) if direct else None,
            'bonusDirectResolvedPlans':len(resolved),'bonusDirectResolvedDeathRate':deaths(resolved)/len(resolved) if resolved else None,
            'bonusCensoredLaunchedPlans':sum(e['outcome']=='CENSORED' for e in bl),'bonusReplannedLaunchedPlans':sum(e['outcome']=='REPLANNED' for e in bl),
            'bonusExposureSeconds':sum(e['exposureTicks'] for e in bl)/30,'bonusDeathsPer100ExposureSeconds':deaths(bl)*3000/sum(e['exposureTicks'] for e in bl) if sum(e['exposureTicks'] for e in bl) else None,
            'rememberedBonusDeaths':sum(e['rememberedBonus']>0 for e in links),'unlinkedRememberedBonusDeaths':sum(e['rememberedBonus']>0 and e['episodeId'] is None for e in links),
            'deathsWithoutBonusEpisode':sum((e['attributedBonus'] or 0)<=0 for e in links),
            'personalities':{}}
    for name in ['EXPAND','ATTACK','DEFEND','SEEK_POINT']:
        rows=[p for p in ps if p['personality']==name];eps=[e for e in es if e['personality']==name];bs=[e for e in eps if (e['plan'].get('response') or {}).get('bonus',0)>0];l=[e for e in bs if e['launchedTick'] is not None]
        result['personalities'][name]={'deaths':sum(p['deaths'] for p in rows),'totalCapture':sum(p['totalCapture'] for p in rows),'stolenCells':sum(p['stolenCells'] for p in rows),
          'stolenShare':sum(p['stolenCells'] for p in rows)/(sum(p['totalCapture'] for p in rows) or 1),'reclaimedCells':sum(p['reclaimedCells'] for p in rows),
          'meanPlannedExternalLength':sum(p['externalLengthSum'] for p in rows)/(sum(p['expansionPlans'] for p in rows) or 1),
          'internalCellMoves':sum(p['internalCellMoves'] for p in rows),'externalCellMoves':sum(p['externalCellMoves'] for p in rows),
          'crowdedPlans':sum(p['crowdedPlans'] for p in rows),'crowdedSmallPlans':sum(p['crowdedSmallPlans'] for p in rows),
          'shapes':{shape:sum(p['shapes'].get(shape,0) for p in rows) for shape in sorted({shape for p in rows for shape in p['shapes']})},
          'bonusLaunchedPlans':len(l),'bonusLinkedDeaths':deaths(l),'bonusAttackInterruptedDeaths':deaths([e for e in l if e['attackInterrupted']])}
    proximity={}
    for b in [False,True]:
        for outcome in ['all','survived','died']:
            rows=[e for e in launch if ((e['plan'].get('response') or {}).get('bonus',0)>0)==b and not e['attackInterrupted'] and
                  (outcome=='all' or outcome=='survived' and e['outcome'] in ('CAPTURE','HOME') or outcome=='died' and e['outcome']=='DEATH')]
            proximity[('bonus' if b else 'zero')+'_'+outcome]={'launchedPlans':len(rows),
              'atSelection':{key:distribution([e['plannedDistances'][key] for e in rows]) for key in ['grudge','topGrudge','damage']},
              'beforeDeath':{key:distribution([e['terminalDistances'][key] for e in rows if e['outcome']=='DEATH']) for key in ['grudge','topGrudge','damage','killer']},
              'rawD':distribution([(e['plan'].get('response') or {}).get('reclaimRaw',0) for e in rows]),
              'rawV':distribution([(e['plan'].get('response') or {}).get('revengeRaw',0) for e in rows]),
              'appliedBonus':distribution([(e['plan'].get('response') or {}).get('bonus',0) for e in rows]),
              'overlapCells':distribution([(e['plan'].get('response') or {}).get('overlapCells',0) for e in rows])}
    result['proximity']=proximity
    tv=[next(g['totalVariation'] for g in r['goalDistances'] if {g['a'],g['b']}=={'EXPAND','SEEK_POINT'}) for r in reports]
    result['explorerThiefGoalTV']=distribution(tv)
    result['explorerThiefGoalTVMean']=statistics.mean(tv)
    for name in result['personalities']:
        result[name+'StolenShare']=result['personalities'][name]['stolenShare']
    return result
raw={};results={};archiveHashes={};deathEvidence=[]
archiveRoot=root/'archives';archiveRoot.mkdir(exist_ok=True)
for name in names:
    data=json.loads((root/(name+'.json')).read_text(encoding='utf-8-sig'));assert [r['seed'] for r in data['reports']]==seeds
    assert all(r['seconds']==120 and r['phase']=='RUNNING' and r['walls']==0 for r in data['reports'])
    for r in data['reports']:
        assert len(r['episodeAudit']['deathLinks'])==r['deaths']
        assert r['personalities'] and sum(p['deaths'] for p in r['personalities'])==r['deaths']
    # Sanitized path and compact gzip keep exact audit observations portable.
    data['source']='isolated/'+name;raw[name]=data
    payload=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode('utf-8');compressed=gzip.compress(payload,mtime=0)
    path=archiveRoot/(name+'.json.gz');path.write_bytes(compressed);archiveHashes[str(path).replace('\\','/')]=hashlib.sha256(compressed).hexdigest()
    for r in data['reports']:
        byId={e['id']:e for e in r['episodeAudit']['episodes']}
        deathEvidence.append({'arm':name,'seed':r['seed'],'deaths':[{**link,'episode':byId.get(link['episodeId'])} for link in r['episodeAudit']['deathLinks']]})
    results[name]={'totals':totals(data['reports']),'bySeed':[{'seed':r['seed'],**totals([r]),'trajectoryHash':r['trajectoryHash']} for r in data['reports']]}
def paired(a,b,metric):
    deltas=[rb[metric]-ra[metric] for ra,rb in zip(results[a]['bySeed'],results[b]['bySeed'])]
    npos=sum(d>1e-12 for d in deltas);nneg=sum(d< -1e-12 for d in deltas);s=sum(deltas);loo=[s-d for d in deltas]
    direction='higher' if npos>=7 and min(loo)>0 else 'lower' if nneg>=7 and max(loo)<0 else 'indistinguishable'
    return {'reference':a,'arm':b,'metric':metric,'pairedDeltas':dict(zip(seeds,deltas)),'deltaSum':s,'mean':statistics.mean(deltas),'median':statistics.median(deltas),
      'min':min(deltas),'max':max(deltas),'sampleSD':statistics.stdev(deltas),'lowerSeeds':nneg,'higherSeeds':npos,'tiedSeeds':len(deltas)-npos-nneg,
      'leaveOneOutTotalRange':[min(loo),max(loo)],'classification':direction,'interpretation':'Exploratory directional consistency only; indistinguishable is not no effect.'}
comparisons=[paired(a,b,metric) for a,b in itertools.combinations(names,2) for metric in ['deaths','reclaimedCells','totalCapture','netTerritory','explorerThiefGoalTVMean','EXPANDStolenShare','ATTACKStolenShare','DEFENDStolenShare','SEEK_POINTStolenShare']]
legacyChecks={}
prior=json.loads(Path('evidence/bot-phase025-ablation/summary.json').read_text(encoding='utf-8-sig'))
for name in ['control','reclaim']:
    legacyChecks[name]={str(r['seed']):r['trajectoryHash']==next(x['trajectoryHash'] for x in raw[name]['reports'] if x['seed']==r['seed']) for r in prior['arms'][name]['bySeed']}
    assert all(legacyChecks[name].values()),'Previous trajectory mismatch'
(out/'death-plans.json').write_text(json.dumps(deathEvidence,ensure_ascii=False,indent=2),encoding='utf-8')
result={'protocol':'protocol.json','measurementNotes':raw[names[0]]['measurement'],'classificationRule':protocol['classification'],
        'episodeNotes':'Uninterrupted expansion cohorts exclude ATTACK overrides but retain ESCAPE/RETURN. End-censored/replanned episodes separately counted. Rates per launch are descriptive over 120 s, not uncensored survival probabilities.',
        'proximityNotes':'Conditional on launch-time public target identity and existing territory; missing targets are excluded and their counts shown. Death distances include existing and pending line cells immediately before neutralization. Survived selection-distance cohorts avoid death-only conditioning. No hidden opponent heads/trails used in policy.',
        'legacyTrajectoryChecks':legacyChecks,'rawLocalArchiveSHA256':archiveHashes,'deathPlans':'death-plans.json','arms':results,'comparisons':comparisons}
(out/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for name in names:
    r=results[name]['totals'];print(name,{k:r[k] for k in ['deaths','reclaimedCells','totalCapture','netTerritory','bonusLaunchedPlans','bonusLinkedDeaths','bonusDirectDeaths','bonusAttackInterruptedDeaths','rememberedBonusDeaths','unlinkedRememberedBonusDeaths']})
for r in comparisons:
    if r['metric']=='deaths':print('Death pair',r['reference'],r['arm'],r['pairedDeltas'],r['classification'],r['lowerSeeds'],r['higherSeeds'],r['tiedSeeds'])
