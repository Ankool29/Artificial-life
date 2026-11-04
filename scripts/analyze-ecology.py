"""Publish and validate the ecological campaign using Python's standard library.

Usage: python3 scripts/analyze-ecology.py [/tmp/luma-ecology-study.json]
The result is an experimental dataset, not a new game save format.
"""
import hashlib
import json
import statistics
import sys
from pathlib import Path

source = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/luma-ecology-study.json')
p = json.loads(source.read_text())
assert p['protocolVersion'] == 1 and not p['metadata']['pilot']
assert p['replicates'] == 12 and len(p['runs']) == 96 and p['parity']
assert all(r['summary']['maxResidual'] < 1e-4 for r in p['runs'])
assert all(r['summary']['maxSaveChars'] < 100000 for r in p['runs'])

# The paired absence control changes only agent presence, after identical conditioning.
index = {(r['scenario'], r['environmentSeed']): r for r in p['runs']}
for a, b in [('favorable', 'without-creature'), ('overharvest', 'overharvest-control')]:
    for seed in [f'ecology-e{i}' for i in range(12)]:
        x, y = [json.loads(json.dumps(index[(k, seed)]['initial'])) for k in (a, b)]
        x['ecology']['creaturePresent'] = y['ecology']['creaturePresent']
        assert x == y, (a, b, seed)

mean = statistics.mean
summary = []
for scenario in dict.fromkeys(r['scenario'] for r in p['runs']):
    runs = [r for r in p['runs'] if r['scenario'] == scenario]
    rows = [r['summary'] for r in runs]
    assert len(rows) == 12
    if scenario in ['without-creature', 'overharvest-control']:
        assert all(r['alive'] is None and r['counters']['consumed'] == 0 for r in rows)
    summary.append(dict(
        scenario=scenario, n=len(rows),
        meanFinalPopulation=mean(r['population'] for r in rows),
        finalPopulationRange=[min(r['population'] for r in rows), max(r['population'] for r in rows)],
        meanFinalStages={k: mean(r['stages'].get(k, 0) for r in rows) for k in ['seed', 'germinating', 'growing', 'mature', 'fruiting', 'senescent', 'dead']},
        totals={k: sum(r['counters'][k] for r in rows) for k in rows[0]['counters']},
        meanPerRun={k: mean(r['counters'][k] for r in rows) for k in rows[0]['counters']},
        eventRatesPerSimulationMinute={k: mean(r['counters'][k] / (r['elapsedSeconds'] / 60) for r in rows) for k in ['germinated', 'born', 'died', 'produced', 'consumed']},
        meanFinalSoilWater=mean(r['soilWater'] for r in rows),
        meanFinalSoilMinerals=mean(r['soilMinerals'] for r in rows),
        meanPlantFruitAvailability=mean(r['meanPlantFruitAvailability'] for r in rows),
        meanEmptyFruitFraction=mean(r['emptyFruitFraction'] for r in rows),
        creaturesPresent=sum(r['alive'] is not None for r in rows),
        creaturesAliveAtHour=sum(r['alive'] is True for r in rows),
        deathSeconds=[r['deathSeconds'] for r in rows],
        maxSaveChars=max(r['maxSaveChars'] for r in rows),
        maxBalanceResidual=max(r['maxResidual'] for r in rows),
    ))
benchmark = []
for condition in ['empty', 'vegetation']:
    rows = [r for r in p['benchmark'] if r['condition'] == condition]
    ms = [r['ms'] for r in rows]
    benchmark.append(dict(condition=condition, n=len(rows), ticks=10000,
                          medianMs=statistics.median(ms), rangeMs=[min(ms), max(ms)],
                          saveChars=rows[0]['saveChars'], finalPopulation=rows[0]['population']))
p['aggregation'] = dict(scenarios=summary, benchmark=benchmark)
p['rawInputSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
out = Path('docs/research/ecology-results.json')
out.write_text(json.dumps(p, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(p['aggregation'], ensure_ascii=False, indent=2))
print(f'Published {len(p["runs"])} trajectories: {out.stat().st_size} bytes')
