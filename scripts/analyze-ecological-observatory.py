"""Validate and publish the paired ecological diagnostic study (standard library).

python3 scripts/analyze-ecological-observatory.py [study.json] [memory.json]
"""
import hashlib
import json
import statistics as stats
import sys
from pathlib import Path
source=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/luma-ecological-diagnostics.json')
memory_path=Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/luma-ecological-memory.json')
p=json.loads(source.read_text())
assert p['protocolVersion']==1 and p['replicates']==6 and not p['metadata']['pilot']
assert len(p['runs'])==48 and len(p['historical'])==96
assert all(x['equal'] and x['samples']==121 for x in p['historical'])
by={(r['scenario'],r['seed']):r for r in p['runs']}
for r in p['runs']:
    assert r['parity']['equal'] and r['parity']['behaviorDigest']==r['parity']['controlDigest']
    assert r['initial']['creature']['genome']==r['final']['creature']['genome']
    if r['report']:
        assert r['report']['final']['body']['health']==0
        assert len(json.dumps(r['report'],ensure_ascii=False,separators=(',',':')))<120000
for i in range(6):
    key=f'diagnostic-e{i}'
    a=json.loads(json.dumps(by['visible-poor-nutrients',key]['initial']))
    b=by['nutritive-control',key]['initial']
    for f in a['foods']:f['nutrients']=28
    assert a==b, 'nutrition control differs in other initial conditions'
    a=json.loads(json.dumps(by['extinction-with-consumption',key]['initial']))
    b=by['consumption-control',key]['initial']
    a['ecology']['creaturePresent']=False
    assert a==b, 'consumption control differs in other initial conditions'
summary=[]
for scenario in dict.fromkeys(r['scenario'] for r in p['runs']):
    rows=[r for r in p['runs'] if r['scenario']==scenario]
    present=[r for r in rows if r['initial']['ecology']['creaturePresent']]
    reports=[r['report'] for r in rows if r['report']]
    summary.append(dict(scenario=scenario,n=len(rows),agentsPresent=len(present),alive=sum(r['final']['creature']['alive'] for r in present),
        deathSecondsAfterStart=[(r['report']['tick']-r['initial']['tick'])/10 if r['report'] else None for r in rows],
        physicalFoodAtDeath=[r['final']['food']['physicalCount'] for r in reports],perceptibleFoodAtDeath=[r['final']['food']['visibleCount'] for r in reports],
        contactAndFitsAtDeath=[r['final']['food']['contactAndFits'] for r in reports],
        meanFinalPlants={c:stats.mean(sum(x['stage']!='dead' and x['variety']==c for x in r['final']['ecology']['plants']) for r in rows) for c in ['amber','blue','rose']},
        sums={k:sum(r['totals'][k] for r in rows) for k in rows[0]['totals']},
        observed={k:{c:sum(r['observed'][k][c] for r in rows) for c in ['amber','blue','rose']} for k in ['produced','consumed','deaths','germinations','births']},
        mortalityFactors={c:{k:sum(r['observed']['mortalityFactors'][c].get(k,0) for r in rows) for k in ['dormantExpired','waterDeficit','energyDeficit','mineralDeficit','oldAge']} for c in ['amber','blue','rose']},
        meanFinalWater=stats.mean(sum(c['water'] for c in r['final']['ecology']['soil']) for r in rows),
        meanFinalMinerals=stats.mean(sum(c['minerals'] for c in r['final']['ecology']['soil']) for r in rows),
        maxSessionChars=max(r['maxSessionChars'] for r in rows)))
benchmark=[]
for condition in ['off','on']:
    times=[r['ms'] for r in p['benchmark'] if r['condition']==condition]
    benchmark.append(dict(condition=condition,n=len(times),ticks=10000,medianMs=stats.median(times),rangeMs=[min(times),max(times)]))
mem=json.loads(memory_path.read_text());assert len(mem['rows'])==14
heap=[]
for condition in ['off','on']:
    xs=[r['retainedHeapDelta'] for r in mem['rows'] if r['condition']==condition]
    heap.append(dict(condition=condition,n=len(xs),medianRetainedHeapDelta=stats.median(xs),range=[min(xs),max(xs)]))
p['memory']=mem
p['aggregation']=dict(scenarios=summary,benchmark=benchmark,heap=heap)
p['rawInputSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
p['memoryInputSha256']=hashlib.sha256(memory_path.read_bytes()).hexdigest()
out=Path('docs/research/ecological-observatory-results.json')
out.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(p['aggregation'],ensure_ascii=False,indent=2))
print(f'Published {len(p["runs"])} paired trajectories and {len(p["historical"])} historical replays; {out.stat().st_size} bytes.')
