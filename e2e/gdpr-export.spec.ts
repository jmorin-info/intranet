import { execFileSync } from 'node:child_process';
import { test, expect } from './helpers/safe-test';
import { login, credsFor } from './helpers/login';

// Python's standard ZIP reader avoids a second application dependency and
// never extracts archive paths to disk. CI uses the Ubuntu Python 3 runtime.
const readArchive = String.raw`
import hashlib, json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    required = ['data.json', 'rapport.pdf', 'audit-logs.csv', 'README.txt']
    if sorted(names) != sorted(required): raise ValueError('Unexpected export entries')
    if any(entry.file_size > 20 * 1024 * 1024 for entry in archive.infolist()): raise ValueError('Oversized synthetic export')
    data = archive.read('data.json')
    print(json.dumps({'files': names, 'data': json.loads(data), 'hash': hashlib.sha256(data).hexdigest(),
        'readme': archive.read('README.txt').decode('utf-8'), 'pdf': archive.read('rapport.pdf').startswith(b'%PDF-')}))
`;

test.describe('Personal data export of a synthetic collaborator', () => {
  test('the profile downloads a ZIP with JSON, PDF, audit CSV and matching integrity hash', async ({ page }) => {
    await login(page, 'USER');
    await page.goto('/profile');
    const button = page.getByRole('button', { name: 'Télécharger mes données (ZIP)', exact: true });
    await expect(button).toBeVisible();
    const response = page.waitForResponse((value) => new URL(value.url()).pathname.endsWith('/users/me/gdpr-export') && value.request().method() === 'POST');
    const [download, exported] = await Promise.all([page.waitForEvent('download'), response, button.click()]);
    expect(exported.status()).toBe(200);
    expect(exported.headers()['content-type']).toContain('application/zip');
    expect(download.suggestedFilename()).toMatch(/^export-rgpd-.*\.zip$/);
    const filename = await download.path();
    expect(filename).toBeTruthy();
    const payload = JSON.parse(execFileSync('python3', ['-c', readArchive, filename!], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }));
    expect(payload.files).toEqual(expect.arrayContaining(['data.json', 'rapport.pdf', 'audit-logs.csv', 'README.txt']));
    expect(payload.pdf).toBe(true);
    expect(payload.hash).toBe(exported.headers()['x-gdpr-data-sha256']);
    expect(payload.readme).toContain(payload.hash);
    expect(payload.data.user.email).toBe(credsFor('USER').email);
    expect(payload.data.user).toHaveProperty('id');
    expect(payload.data.user).toHaveProperty('firstName');
    expect(payload.data.user).not.toHaveProperty('passwordHash');
    expect(payload.data.user).not.toHaveProperty('mfaSecret');
  });
});
