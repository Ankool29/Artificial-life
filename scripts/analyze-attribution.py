"""Aggregate the recorded paired study without rerunning or rounding live worlds.

Usage: python3 scripts/analyze-attribution.py [/tmp/luma-attribution-study]
Only Python's standard library is required. Raw inputs are produced by the two
optional Vitest study files; the publication format is not a game save format.
"""
import hashlib
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/luma-attribution-study')
output = Path('docs/research/attribution-results.json')
mean = lambda xs: statistics.mean(xs) if xs else None
cues = ['amber', 'blue', 'rose']
inputs = {}
for name in ['old-learning', 'new-learning', 'old-control', 'new-control', 'old-exposures', 'new-exposures']:
    inputs[name] = json.loads((root / f'{name}.json').read_text())

# A fresh timing-only process gives both engines the same warmup context,
# independent of how many controlled exposures preceded the benchmark.
for engine in ['old', 'new']:
    path = root / f'{engine}-timing.json'
    if path.exists():
        timed = json.loads(path.read_text())
        exposures = inputs[f'{engine}-exposures']
        assert timed['timingOnly'] is True
        assert timed['metadata']['simulationSourceSha256'] == exposures['metadata']['simulationSourceSha256']
        exposures['benchmark'] = timed['benchmark'] | {'runMode': 'timing-only'}
        assert timed['memoryBudget'] == exposures['memoryBudget']


def credited(m):
    return m['credit'] is not None


def correct(m):
    return credited(m) and m['source'] == m['credit']['targetId']


def summarize(rows):
    meals = [m for r in rows for m in r['stats']['meals']]
    completed = [m for m in meals if m['source'] is not None and m['complete']]
    negative = [m for m in completed if m['completedNegative'] and m['cue'] == 'rose']
    valid = [m for m in completed if correct(m) and m['credit']['outcome'] == 'completed']
    correct_negative = [m for m in negative if correct(m) and m['credit']['outcome'] == 'completed']
    credits = [m for m in meals if credited(m)]
    wrong = [m for m in credits if not correct(m)]
    false_machine = [m for m in wrong if m['source'] is not None]
    deaths = [r['stats']['death'] for r in rows if r['stats']['death']]
    return dict(n=len(rows), completedMachineMeals=len(completed), correctCompleted=len(valid),
                correctRate=len(valid) / len(completed) if completed else None,
                negativeMachineRoseMeals=len(negative), correctNegative=len(correct_negative),
                negativeRate=len(correct_negative) / len(negative) if negative else None,
                creditedOutcomes=len(credits), falseCredits=len(wrong),
                falseMachineCredits=len(false_machine), falseInitialCredits=len(wrong)-len(false_machine),
                partialCredits=sum(r['stats']['partialCredits'] for r in rows),
                emptyAttempts=sum(sum(r['stats']['empty'].values()) for r in rows),
                lowProbabilityEmpty=sum(r['stats']['emptyBelief']['lowLearnedProbability'] for r in rows),
                attempts={c:sum(r['stats']['attempts'][c] for r in rows) for c in cues},
                produced={c:sum(r['stats']['produced'][c] for r in rows) for c in cues},
                ingested={c:sum(r['stats']['ingested'][c] for r in rows) for c in cues},
                toxicAfterFoodAversion=sum(r['stats']['toxicAfterFoodAversion'] for r in rows),
                toxicAfterInstrumentalAversion=sum(r['stats']['toxicAfterInstrumentalAversion'] for r in rows),
                lifeSeconds=mean([r['stats']['end']['tick']/10 for r in rows]),
                alive=sum(r['stats']['alive'] for r in rows),
                toxicLastTick=sum(d['trigger']=='toxic-last-tick' for d in deaths),
                starvationLastTick=sum(d['trigger']=='starvation-last-tick' for d in deaths),
                firstPositiveCreditSeconds=[r['stats']['firstPositiveCredit']/10 if r['stats']['firstPositiveCredit'] is not None else None for r in rows],
                firstNegativeCreditSeconds=[r['stats']['firstNegativeCredit']/10 if r['stats']['firstNegativeCredit'] is not None else None for r in rows],
                sampledPeakStateBytes=max(r['stats']['sampledPeakStateBytes'] for r in rows),
                peakSlots={k:max(r['stats']['peakSlots'][k] for r in rows) for k in ['episodes','links','gut','hypotheses']})


summaries=[]
for name in ['old-learning','new-learning','old-control','new-control']:
    p=inputs[name]
    assert len(p['runs']) == 156 and not p['metadata']['pilot']
    assert p['parity']['identical'] and p['hidden']['cognitivePathsIdentical']
    if name.endswith('control'):
        assert all(m['value']==0 and m['probability']==0 for r in p['runs'] for m in r['stats']['end']['models'])
    for layout in ['spaced','compact']:
        for version in ['modern','legacy']:
            rows=[r for r in p['runs'] if r['layout']==layout and (r['geneticSeed']=='legacy-v1')==(version=='legacy')]
            summaries.append(dict(engine=name, layout=layout, genomeVersion=version, **summarize(rows)))

# Validate initial conditions and pairing. Outcomes/encounters may then diverge.
for a,b in [('old-learning','new-learning'),('old-control','new-control'),('old-learning','old-control'),('new-learning','new-control')]:
    for x,y in zip(inputs[a]['runs'],inputs[b]['runs']):
        assert x['tag']==y['tag'] and x['genome']==y['genome']

exposure_summaries=[]
for engine in ['old','new']:
    p=inputs[f'{engine}-exposures']
    assert len(p['exposures'])==96
    for learning in [True,False]:
        for condition in ['nutritious','toxic-dose']:
            for delay in [0,1200]:
                xs=[x for x in p['exposures'] if (x['learning'],x['condition'],x['delay'])==(learning,condition,delay)]
                rs=[r for x in xs for r in x['rows']]
                exposure_summaries.append(dict(engine=engine,learning=learning,condition=condition,delay=delay,n=len(xs),
                    meals=len(rs),credits=sum(r['credit'] is not None for r in rs),
                    negativeRewards=sum(r['reward']<0 for r in rs),
                    meanReward=mean([r['reward'] for r in rs]),
                    valueCurve=[mean([x['rows'][i]['value'] for x in xs]) for i in range(6)],
                    firstCreditLatency=[next((r['credit']['tick']-r['start'] for r in x['rows'] if r['credit']),None) for x in xs]))
for a,b in zip(inputs['old-exposures']['exposures'],inputs['new-exposures']['exposures']):
    assert (a['seed'],a['learning'],a['condition'],a['delay'])==(b['seed'],b['learning'],b['condition'],b['delay'])
    for x,y in zip(a['rows'],b['rows']):
        assert x['biologyHash']==y['biologyHash'] and x['rng']==y['rng'] and x['reward']==y['reward']

# Descriptive genetic contrasts, not post-hoc attribution to a single gene.
genotypes=[]
for name in ['old-learning','new-learning']:
    for g in inputs[name]['config']['geneticSeeds']:
        rs=[r for r in inputs[name]['runs'] if r['geneticSeed']==g]
        genotypes.append(dict(engine=name,seed=g,genome=rs[0]['genome'],**summarize(rs)))

benchmark=[]
for name in ['old','new']:
    b=inputs[f'{name}-exposures']['benchmark']['rows']
    benchmark.append(dict(engine=name,n=len(b),ticksPerRep=5000,
        medianMs=statistics.median(x['elapsedMs'] for x in b),minMs=min(x['elapsedMs'] for x in b),maxMs=max(x['elapsedMs'] for x in b)))

meal_columns=['foodId','cue','source','ingestedTick','complete','completedReward','completedNegative','completedPositive','damage','gain','creditTarget','creditTick','creditReward','outcome','eligibility','beforeValue','value','boundAtIngestion','hypothesesAtIngestion']
hypothesis_columns=['episodeId','targetId','situation','actionTick']

def compact_meal(m):
    c=m['credit'] or {}
    return [m[k] for k in meal_columns[:10]]+[c.get(k) for k in ['targetId','tick','reward','outcome','eligibility','beforeValue','value']]+[m['boundAtIngestion'],[[h[k] for k in hypothesis_columns] for h in m['hypothesesAtIngestion']]]


published={'schemaVersion':1,'referenceCommit':inputs['old-learning']['config']['referenceCommit'],
    'columns':{'meals':meal_columns,'hypotheses':hypothesis_columns,
      'transitions':['tick','targetId','episodeId','situation','event','beforeProbability','probability','value','learned'],
      'samples':['tick','energy','health','toxins','hunger','stomach','stockAmber','stockBlue','stockRose','qAmber','qBlue','qRose'],
      'models':['targetId','situation','attempts','observations','successes','probability','value','outcomes','partialOutcomes','lastReward','lastTick'],
      'stocks':['id','cue','stock','pendingAt','readyAt']},'summary':summaries,
    'exposureSummary':exposure_summaries,'genotypes':genotypes,'benchmarkSummary':benchmark,'cohorts':{},'controls':{}}
keep_stats=['start','alive','firstGoodProduction','firstGoodIngestion','attempts','empty','emptyBelief','cooling','produced','ingested',
    'decisions','urgentDecisions','toxicAfterFoodAversion','toxicAfterInstrumentalAversion','firstPositiveCredit','firstNegativeCredit',
    'partialCredits','unattributedOutcomes','peakSlots','sampledPeakStateBytes','scoreBins','damageToxic','damageStarvation','maxToxins',
    'minEnergy','minHealth','roseIngestions','phaseCounts','poisonFinal','death','samples','end','transitions']
for name in ['old-learning','new-learning','old-control','new-control']:
    p=inputs[name]
    runs=[]
    for r in p['runs']:
        stats={k:r['stats'][k] for k in keep_stats}
        stats['transitions']=[[t.get(k) for k in published['columns']['transitions']] for t in stats['transitions']]
        stats['samples']=[[t[k] for k in published['columns']['samples'][:6]]+
            [dict(t['stocks']).get(c) for c in cues]+[t['foodValues'][c] for c in cues] for t in stats['samples']]
        stats['end']=dict(stats['end'])
        stats['end']['models']=[[m.get(k,0) for k in published['columns']['models']] for m in stats['end']['models']]
        stats['end']['stocks']=[[m[k] for k in published['columns']['stocks']] for m in stats['end']['stocks']]
        stats['meals']=[compact_meal(m) for m in r['stats']['meals']]
        runs.append({k:r[k] for k in ['tag','geneticSeed','environmentSeed','layout','rotation','genome']} | {'stats':stats})
    published['cohorts'][name]={'config':p['config'],'metadata':p['metadata'],'runs':runs,
        'biological':p['biological'],'hidden':p['hidden'],'parity':p['parity']}
for name in ['old-exposures','new-exposures']:
    published['controls'][name]=inputs[name]
# Retain all measurements, one cohort record per line, without the 10 Hz trace.
# No values are rounded here: input measurement precision is preserved.
parts=[]
for k,v in published.items():
    if k=='cohorts':
        groups=[]
        for name,p in v.items():
            pre={k:v for k,v in p.items() if k!='runs'}
            text=json.dumps(pre,ensure_ascii=False,separators=(',',':'),allow_nan=False)
            text=text[:-1]+',"runs":[\n'+',\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':'),allow_nan=False) for r in p['runs'])+'\n]}'
            groups.append(json.dumps(name)+':'+text)
        value='{\n'+',\n'.join(groups)+'\n}'
    else:value=json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    parts.append(json.dumps(k)+':'+value)
output.write_text('{\n'+',\n'.join(parts)+'\n}\n')
(root/'aggregate.json').write_text(json.dumps({k:v for k,v in published.items() if k not in ['cohorts','controls']},indent=2)+'\n')
print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
    'cohorts':[{k:r[k] for k in ['engine','layout','genomeVersion','n','correctCompleted','completedMachineMeals','correctNegative','negativeMachineRoseMeals','falseCredits','emptyAttempts','lifeSeconds']} for r in summaries],
    'benchmark':benchmark},indent=2))
