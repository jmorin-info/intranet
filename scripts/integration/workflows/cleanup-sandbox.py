#!/usr/bin/env python3
"""Remove only resources belonging to an already recorded integration run."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('run_directory', type=Path)
args = parser.parse_args()
run_dir = args.run_directory.resolve()
manifest_path = run_dir / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
assert manifest['status'] in ('passed', 'failed'), 'Write a completed proof before cleanup'
assert manifest['runDirectory'] == str(run_dir)
label_key = 'omnitech.approval.integration'
run_id = manifest['runId']
for kind, name in [('container', manifest['container']), ('network', manifest['network'])]:
    command = ['docker', 'inspect', name] if kind == 'container' else ['docker', 'network', 'inspect', name]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        # Missing owned resources are an idempotent cleanup, other inspect failures are errors.
        if 'No such' in result.stderr or 'not found' in result.stderr:
            continue
        raise RuntimeError(result.stderr)
    resource = json.loads(result.stdout)[0]
    labels = resource['Config'].get('Labels', {}) if kind == 'container' else resource.get('Labels', {})
    assert labels.get(label_key) == run_id, f'Refusing to remove an unowned {kind}'
    deletion = ['docker', 'rm', '-fv', name] if kind == 'container' else ['docker', 'network', 'rm', name]
    subprocess.run(deletion, check=True, stdout=subprocess.DEVNULL)
manifest['cleaned'] = True
manifest['cleanedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'status': 'cleaned', 'proof': str(manifest_path)}))
