#!/usr/bin/env python3
"""Real PostgreSQL sandbox. Does not start the application, seed, or mutate source."""
import argparse
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
def locate_source():
    for candidate in [ROOT.parent / 'source', *ROOT.parents]:
        if (candidate / 'packages/database/prisma/schema.prisma').is_file():
            return candidate
    return None

parser.add_argument('--source', type=Path, default=locate_source())
parser.add_argument('--backend-dist', type=Path, help='explicit candidate build directory outside source')
parser.add_argument('--artifacts', type=Path, required=True, help='private artifact directory outside the source tree')
parser.add_argument('--image', default='postgres:16')
parser.add_argument('--only', default='', help='case name regular expression, empty runs all')
parser.add_argument('--keep', action='store_true', help='retain successful sandbox for inspection')
args = parser.parse_args()
os.umask(0o077)
assert args.source, '--source must point to a built monorepo'
source = args.source.resolve()
backend_dist = args.backend_dist.resolve() if args.backend_dist else source / 'apps/backend/dist'
artifacts = args.artifacts.resolve()
assert artifacts != source and source not in artifacts.parents, 'Artifacts must remain outside source'
assert os.geteuid() == 0, 'Docker network namespace execution requires root on Linux'
assert (backend_dist / 'approval-workflows/workflow-runtime.service.js').is_file(), 'Compile the backend first'
assert args.image.startswith('postgres:16'), 'Only the approved official PostgreSQL16 image may be used'
for required in ['packages/database/prisma/schema.prisma']:
    assert (source / required).is_file(), f'Feature build is missing {required}'
run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
run_dir = artifacts / run_id
run_dir.mkdir(parents=True, mode=0o700)
name = 'omnitech-approval-it-' + run_id.lower()
network = name + '-net'
password = secrets.token_urlsafe(36)
database = 'approval_it_' + secrets.token_hex(6)
url = f'postgresql://approval_it:{password}@127.0.0.1:5432/{database}?schema=public&connection_limit=8&pool_timeout=20'
env_file = run_dir / 'postgres.env'
env_file.write_text(f'POSTGRES_USER=approval_it\nPOSTGRES_PASSWORD={password}\nPOSTGRES_DB={database}\n')
label = 'omnitech.approval.integration=' + run_id
manifest = {'runId': run_id, 'status': 'preparing', 'container': name, 'network': network, 'label': label, 'image': args.image, 'port': 5432, 'hostPublishedPort': None, 'connectionMethod': 'nsenter-private-network', 'database': database, 'source': str(source), 'backendDist': str(backend_dist), 'runDirectory': str(run_dir)}

def write_json(filename, data):
    target = run_dir / filename
    with target.open('w') as stream:
        json.dump(data, stream, indent=2)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())

def run(command, log, env=None):
    with (run_dir / log).open('a') as stream:
        result = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, env=env, cwd=source, check=False)
    if result.returncode:
        raise RuntimeError(f'{command[0]} failed ({result.returncode}); inspect private {log}')

write_json('manifest.json', manifest)
created_network = created_container = False
try:
    run(['docker', 'network', 'create', '--internal', '--label', label, network], 'setup.log')
    created_network = True
    run(['docker', 'run', '-d', '--name', name, '--label', label, '--network', network, '--cpus', '1', '--memory', '512m', '--memory-swap', '512m', '--pids-limit', '200', '--env-file', str(env_file), '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,noexec,size=268435456', args.image, 'postgres', '-c', 'max_connections=20', '-c', 'shared_buffers=64MB'], 'setup.log')
    created_container = True
    for attempt in range(60):
        ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'approval_it', '-d', database], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('PostgreSQL did not become ready in 60 seconds')
    inspect = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    bindings = inspect['HostConfig']['PortBindings']
    assert not bindings, 'No host port may be published'
    assert all(value is None for value in inspect['NetworkSettings']['Ports'].values()), 'Unexpected network exposure'
    pid = inspect['State']['Pid']
    assert Path(f'/proc/{pid}/comm').read_text().strip() == 'postgres'
    namespace = ['nsenter', '--target', str(pid), '--net', '--']
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image]))[0]
    write_json('isolation.json', {'containerId': inspect['Id'], 'imageId': inspect['Image'], 'imageDigests': image.get('RepoDigests'), 'portBindings': bindings, 'effectivePorts': inspect['NetworkSettings']['Ports'], 'connectionMethod': 'nsenter-private-network', 'memoryBytes': inspect['HostConfig']['Memory'], 'nanoCpus': inspect['HostConfig']['NanoCpus'], 'networkInternal': True, 'tmpfs': inspect['HostConfig']['Tmpfs']})
    env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()), 'NODE_PATH': str(source / 'apps/backend/node_modules') + ':' + str(source / 'node_modules'), 'DATABASE_URL': url, 'INTRANET_INTEGRATION_SOURCE': str(source), 'INTRANET_INTEGRATION_DATABASE_URL': url, 'INTRANET_INTEGRATION_BACKEND_DIST': str(backend_dist), 'INTEGRATION_RUN_DIR': str(run_dir), 'INTEGRATION_PG_PORT': '5432', 'INTEGRATION_ALLOWED': 'throwaway-postgres-only', 'INTEGRATION_ONLY': args.only}
    run(namespace + ['node', str(source / 'packages/database/node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', str(source / 'packages/database/prisma/schema.prisma')], 'schema.log', env)
    run(namespace + ['node', str(ROOT / 'runtime-postgres.cjs')], 'runtime.log', env)
    result = json.loads((run_dir / 'results.json').read_text())
    assert result['status'] == 'passed'
    manifest['status'] = 'passed'; manifest['results'] = result['totals']
    write_json('manifest.json', manifest)
    with (run_dir / 'postgres.log').open('w') as stream:
        subprocess.run(['docker', 'logs', name], stdout=stream, stderr=subprocess.STDOUT)
    # Proof is durable before removing this sandbox and its anonymous volumes.
    if not args.keep:
        run(['docker', 'rm', '-fv', name], 'cleanup.log'); created_container = False
        run(['docker', 'network', 'rm', network], 'cleanup.log'); created_network = False
        manifest['cleaned'] = True
        write_json('manifest.json', manifest)
    print(json.dumps({'status': 'passed', 'proof': str(run_dir / 'results.json'), 'scenarios': result['totals']['scenarios'], 'checks': result['totals']['checks'], 'cleaned': manifest.get('cleaned', False)}))
except Exception as error:
    manifest['status'] = 'failed'; manifest['error'] = str(error)
    manifest['retainedContainer'] = name if created_container else None
    manifest['retainedNetwork'] = network if created_network else None
    write_json('manifest.json', manifest)
    if created_container:
        with (run_dir / 'postgres.log').open('w') as stream:
            subprocess.run(['docker', 'logs', name], stdout=stream, stderr=subprocess.STDOUT)
    print(json.dumps({'status': 'failed', 'proof': str(run_dir / 'manifest.json'), 'retainedForDiagnosis': created_container}))
    sys.exit(1)
