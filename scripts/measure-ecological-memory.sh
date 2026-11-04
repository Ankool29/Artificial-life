#!/usr/bin/env bash
# Run from the repository root; each measurement uses a fresh Node process.
set -euo pipefail
luma_probe_dir=$(mktemp -d /tmp/luma-ecological-memory.XXXXXX)
trap 'rm -rf "$luma_probe_dir"' EXIT
node scripts/build-ecological-memory-probe.mjs "$luma_probe_dir"
for luma_rep in 0 1 2 3 4 5 6; do
  for luma_condition in off on; do
    node --expose-gc "$luma_probe_dir/probe.mjs" "$luma_condition" > "$luma_probe_dir/$luma_rep-$luma_condition.json"
  done
done
python3 - "$luma_probe_dir" "${1:-/tmp/luma-ecological-memory.json}" <<'PY'
import json,sys
from pathlib import Path
folder,out=map(Path,sys.argv[1:])
rows=[]
for rep in range(7):
    for condition in ['off','on']:
        row=json.loads((folder/f'{rep}-{condition}.json').read_text())
        rows.append(dict(rep=rep,**row))
p=dict(protocolVersion=1,method='fresh-process-two-warmups-three-major-GCs',rows=rows)
out.write_text(json.dumps(p)+'\n')
print(json.dumps(p))
PY
