import json
from pathlib import Path
import stat
import tempfile
import unittest

from export_ci_results import export_results


class SanitizedCIExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.private = self.root / 'private'
        self.run = self.private / 'a-run'
        self.run.mkdir(parents=True, mode=0o700)
        self.output = self.root / 'public'
        (self.run / 'manifest.json').write_text('{"status":"passed"}')

    def tearDown(self):
        self.temp.cleanup()

    def fixture(self, **changes):
        data = {'status': 'passed', 'postgresql': 'PostgreSQL 16.13 (test build)', 'checks': 219,
                'totals': {'syntheticUsers': 4, 'auditRows': 121}, 'application': {'runtimeSha256': 'a' * 64},
                'tests': [{'name': 'concurrent starts create one pending instance and one durable start audit', 'status': 'passed', 'checks': 6, 'durationMs': 10}]}
        data.update(changes)
        (self.run / 'results.json').write_text(json.dumps(data))

    def test_passed_export_has_readable_modes_and_a_plain_summary(self):
        self.fixture()
        result = export_results(self.private, self.output, '16.13')
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['actualPostgreSQL'], '16.13')
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE((self.output / 'results.json').stat().st_mode), 0o644)
        self.assertIn('Démarrage concurrent unique', (self.output / 'summary.md').read_text())

    def test_raw_password_url_stack_sql_paths_and_unknown_labels_never_escape(self):
        secret = 'DO_NOT_PUBLISH_a9!'
        self.fixture(error=secret, safety={'database': secret},
                     application={'source': secret, 'runtimeSha256': 'a' * 64, 'password': secret},
                     totals={'scenarios': secret, 'auditRows': secret},
                     tests=[{'name': secret, 'status': 'failed', 'checks': secret, 'error': secret,
                             'evidence': {'url': 'postgresql://' + secret, 'sql': secret}}])
        export_results(self.private, self.output, '16.13')
        for filename in ('results.json', 'summary.md'):
            rendered = (self.output / filename).read_text()
            self.assertNotIn(secret, rendered)
            self.assertNotIn('postgresql://', rendered)
        self.assertNotIn('error', json.loads((self.output / 'results.json').read_text())['tests'][0])

    def test_missing_or_invalid_private_proof_produces_an_explicit_failure(self):
        for payload in ('not JSON', '[]'):
            (self.run / 'results.json').write_text(payload)
            result = export_results(self.private, self.output, '16.13')
            self.assertEqual(result['status'], 'failed')
            self.assertEqual(result['totals']['scenarios'], 0)

    def test_actual_server_must_match_matrix_version(self):
        self.fixture(postgresql='PostgreSQL 16.16 (test build)')
        result = export_results(self.private, self.output, '16.13')
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['failureCategory'], 'server_version_mismatch')

    def test_public_output_cannot_overlap_private_credentials(self):
        self.fixture()
        with self.assertRaises(ValueError):
            export_results(self.private, self.run / 'export', '16.13')
        with self.assertRaises(ValueError):
            export_results(self.private, self.root, '16.13')

    def test_report_cannot_claim_success_without_scenarios(self):
        self.fixture(tests=[])
        self.assertEqual(export_results(self.private, self.output, '16.13')['status'], 'failed')

    def test_non_string_labels_are_not_published_or_interpreted(self):
        self.fixture(tests=[{'name': ['private-value'], 'status': 'passed', 'checks': 1}])
        export_results(self.private, self.output, '16.13')
        self.assertNotIn('private-value', (self.output / 'results.json').read_text())

    def test_zero_assertions_cannot_be_reported_as_a_success(self):
        self.fixture(checks=0)
        self.assertEqual(export_results(self.private, self.output, '16.13')['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
