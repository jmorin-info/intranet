#!/usr/bin/env node
// Fail on errors and new warnings; retain the existing warning inventory.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'apps/frontend');
const baselinePath = path.join(root, 'scripts/frontend-lint-baseline.json');
const update = process.argv.length === 3 && process.argv[2] === '--update-baseline';
if (process.argv.length > 2 && !update) throw new Error('Unknown lint option');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'omnitech-lint-'));
try {
  const reportPath = path.join(temporary, 'report.json');
  const requireFrontend = createRequire(path.join(frontend, 'package.json'));
  const next = requireFrontend.resolve('next/dist/bin/next');
  const result = spawnSync(process.execPath,
    [next, 'lint', '--format', 'json', '--output-file', reportPath],
    { cwd: frontend, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.signal || !fs.existsSync(reportPath))
    throw new Error('Lint failed before producing its report');
  const rows = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Missing lint results');
  const warnings = new Map();
  let errors = 0;
  for (const row of rows) {
    if (!Array.isArray(row.messages) || typeof row.errorCount !== 'number') throw new Error('Invalid lint report');
    errors += row.errorCount;
    const relative = path.relative(root, row.filePath).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Lint file escaped project');
    const lines = fs.readFileSync(row.filePath, 'utf8').split(/\r?\n/);
    for (const message of row.messages) {
      if (message.severity === 2 || message.fatal) {
        console.error(`${relative}:${message.line || 0}: ${message.ruleId || 'fatal'}: ${message.message}`);
        continue;
      }
      if (message.severity !== 1) throw new Error('Invalid lint severity');
      const identity = [relative, message.ruleId, message.message, (lines[message.line - 1] || '').trim()];
      const key = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
      const existing = warnings.get(key);
      warnings.set(key, { file: relative, rule: message.ruleId, message: message.message,
        count: (existing?.count || 0) + 1 });
    }
  }
  if (errors || result.status !== 0) throw new Error(`Lint has ${errors} errors (exit ${result.status})`);
  const entries = Object.fromEntries([...warnings.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(entries).reduce((sum, row) => sum + row.count, 0);
  if (update) {
    fs.writeFileSync(baselinePath, JSON.stringify({ schemaVersion: 1, warnings: entries }, null, 2) + '\n');
    console.log(`Explicit baseline update: ${total} existing warnings. Review this inventory in the PR.`);
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (baseline.schemaVersion !== 1 || !baseline.warnings) throw new Error('Invalid lint baseline');
    let added = 0;
    for (const [key, row] of warnings) {
      const previous = baseline.warnings[key]?.count || 0;
      if (row.count > previous) {
        added += row.count - previous;
        console.error(`${row.file}: ${row.rule}: ${row.message}`);
      }
    }
    console.log(`Lint: ${errors} errors; ${total} existing warnings; ${added} new warnings.`);
    if (added) throw new Error('New lint debt is forbidden');
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
