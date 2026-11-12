#!/usr/bin/env python3
"""Publish an allowlisted CI report; keep credentials and raw diagnostics private."""
import argparse
import json
import os
from pathlib import Path
import re

SCENARIOS = {
    'concurrent different actors: exactly one single-step decision wins (5 trials)': 'Décideurs concurrents : un seul gagnant',
    'concurrent repeated submission by the same actor is idempotent (5 trials)': 'Double envoi idempotent',
    'parallel unanimous decisions advance once without a lost vote (5 trials)': 'Votes parallèles sans perte',
    'concurrent starts create one pending instance and one durable start audit': 'Démarrage concurrent unique',
    'rejection returns for correction and repeated rejection does not duplicate owner notification': 'Refus et retour pour correction',
    'concurrent cancellation is idempotent with one cancellation audit': 'Annulation concurrente idempotente',
    'approval versus cancellation has a single terminal winner (5 trials)': 'Course approbation / annulation',
    'concurrent daily reminders commit one marker and one notification per recipient (5 trials)': 'Relances concurrentes et minuit à Paris',
    'permissions and future-stage guards reject before any write': 'Droits et étapes futures',
    'legacy pending circuits on published, archived or obsolete documents are inert': 'Anciens circuits sur documents terminés',
}
TOTAL_FIELDS = ('scenarios', 'checks', 'successfulScenarios', 'syntheticUsers', 'syntheticDocuments', 'auditRows', 'internalNotificationRows')
HASH_FIELDS = ('runtimeSha256', 'engineSha256', 'transactionSha256', 'schemaSha256')


def read_json(path):
    try:
        if path.stat().st_size > 2_000_000:
            return {}
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def count(value):
    return value if type(value) is int and 0 <= value <= 1_000_000_000 else 0


def export_results(private_root, output, expected_postgres):
    private_root, output = Path(private_root).resolve(), Path(output).resolve()
    if output == private_root or private_root in output.parents or output in private_root.parents:
        raise ValueError('Public and private artifact directories must be separate')
    if not re.fullmatch(r'16\.\d{1,3}', expected_postgres):
        raise ValueError('An explicit PostgreSQL16 minor version is required')
    manifests = sorted(private_root.glob('*/manifest.json'))
    raw = read_json(manifests[-1].parent / 'results.json') if manifests else {}
    version = re.match(r'^PostgreSQL (\d{1,2}\.\d{1,3})(?:\s|$)', str(raw.get('postgresql', '')))
    actual = version.group(1) if version else None
    tests = []
    for index, item in enumerate(raw.get('tests', []) if isinstance(raw.get('tests'), list) else []):
        if not isinstance(item, dict):
            continue
        tests.append({
            'scenario': SCENARIOS.get(item.get('name'), f'Scénario supplémentaire {index + 1}') if isinstance(item.get('name'), str) else f'Scénario supplémentaire {index + 1}',
            'status': 'passed' if item.get('status') == 'passed' else 'failed',
            'checks': count(item.get('checks')),
            'durationMs': count(item.get('durationMs')),
        })
    totals_raw = raw.get('totals') if isinstance(raw.get('totals'), dict) else {}
    totals = {key: count(totals_raw.get(key)) for key in TOTAL_FIELDS}
    totals['scenarios'] = len(tests)
    totals['successfulScenarios'] = sum(item['status'] == 'passed' for item in tests)
    totals['checks'] = count(raw.get('checks'))
    passed = raw.get('status') == 'passed' and actual == expected_postgres and bool(tests) and totals['checks'] > 0 and all(item['status'] == 'passed' and item['checks'] > 0 for item in tests)
    hashes = raw.get('application') if isinstance(raw.get('application'), dict) else {}
    public = {
        'schemaVersion': 1, 'status': 'passed' if passed else 'failed',
        'expectedPostgreSQL': expected_postgres, 'actualPostgreSQL': actual,
        'failureCategory': None if passed else 'server_version_mismatch' if actual and actual != expected_postgres else 'scenario_or_setup_failure',
        'totals': totals, 'tests': tests,
        'application': {key: hashes[key] for key in HASH_FIELDS if isinstance(hashes.get(key), str) and re.fullmatch(r'[a-f0-9]{64}', hashes[key])},
    }
    output.mkdir(parents=True, exist_ok=True, mode=0o755)
    output.chmod(0o755)
    destination = output / 'results.json'
    destination.write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n')
    destination.chmod(0o644)
    summary = [f'### Transactions approbation PostgreSQL {expected_postgres}', '',
               f"Résultat : **{'réussi' if passed else 'échec'}** — serveur observé : **{actual or 'non disponible'}**.", '',
               f"{totals['successfulScenarios']}/{totals['scenarios']} scénarios réussis ; {totals['checks']} assertions.", '',
               '| Scénario | Résultat | Assertions |', '| --- | --- | ---: |']
    summary.extend(f"| {item['scenario']} | {'Réussi' if item['status'] == 'passed' else 'Échec'} | {item['checks']} |" for item in tests)
    summary.extend(['', 'Les diagnostics bruts, fichiers d’environnement et journaux SQL restent privés.'])
    summary_path = output / 'summary.md'
    summary_path.write_text('\n'.join(summary) + '\n')
    summary_path.chmod(0o644)
    return public


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-postgres', required=True)
    args = parser.parse_args()
    result = export_results(args.private_root, args.output, args.expected_postgres)
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
