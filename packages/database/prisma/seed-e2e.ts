/** Synthetic fixtures only. Does not run the business seed or import real data. */
import { PrismaClient, UserRole } from '@prisma/client';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ephemeralDatabaseUrl, ephemeralStoragePath } from '../../../scripts/e2e/ephemeral-database';

const root = path.resolve(__dirname, '../../..');
const backendRequire = createRequire(path.join(root, 'apps/backend/package.json'));
const bcrypt = backendRequire('bcrypt') as { hash(value: string, rounds: number): Promise<string> };
const { PDFDocument, StandardFonts } = backendRequire('pdf-lib');

async function main() {
  const url = ephemeralDatabaseUrl();
  const storage = ephemeralStoragePath(root);
  const secret = process.env.E2E_TOTP_SECRET;
  if (!secret || !/^[A-Z2-7]{32,}$/.test(secret)) throw new Error('[e2e] Supply an explicit synthetic E2E_TOTP_SECRET (Base32, at least 20 bytes).');
  const accounts = [
    { prefix: 'SUPER_ADMIN', role: UserRole.SUPER_ADMIN },
    { prefix: 'ADMIN', role: UserRole.ADMIN },
    { prefix: 'COLLAB', role: UserRole.COLLABORATEUR },
  ].map((account) => {
    const email = process.env[`E2E_${account.prefix}_EMAIL`];
    const password = process.env[`E2E_${account.prefix}_PASSWORD`];
    if (!email || !/^[^@]+@(?:e2e\.local|example\.test)$/.test(email) || !password || password.length < 12) {
      throw new Error(`[e2e] Supply dedicated synthetic E2E_${account.prefix}_EMAIL/PASSWORD (12+ chars).`);
    }
    return { ...account, email, password };
  });
  for (const directory of [path.dirname(storage), storage]) {
    const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('[e2e] Fixture storage must not traverse a symbolic link.');
  }
  await mkdir(storage, { recursive: true, mode: 0o700 });
  if ((await readdir(storage)).length) throw new Error('[e2e] Refusing bootstrap: fixture storage must be empty.');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const identity = await prisma.$queryRaw<Array<{ database: string; username: string }>>`SELECT current_database() AS database, current_user AS username`;
    const expected = new URL(url);
    if (identity[0]?.database !== decodeURIComponent(expected.pathname.slice(1)) || identity[0]?.username !== decodeURIComponent(expected.username)) {
      throw new Error('[e2e] Connected database identity differs from the guarded URL.');
    }
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`;
    if (tables.length) throw new Error('[e2e] Refusing bootstrap: the disposable database must be empty.');
    await prisma.$disconnect();
    // Historical migrations are incomplete on a fresh database. This path is
    // restricted to an empty disposable DB, never used for production migrations.
    const cli = path.join(root, 'packages/database/node_modules/prisma/build/index.js');
    const pushed = spawnSync(process.execPath, [cli, 'db', 'push', '--schema', path.join(__dirname, 'schema.prisma'), '--skip-generate'], {
      cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit',
    });
    if (pushed.status !== 0) throw new Error('[e2e] Disposable Prisma schema bootstrap failed.');
    await prisma.$connect();
    const department = await prisma.department.create({ data: { name: 'Équipe de test E2E', code: 'E2E' } });
    const users: Record<string, { id: string }> = {};
    for (const account of accounts) {
      users[account.prefix] = await prisma.user.create({ data: {
        email: account.email, passwordHash: await bcrypt.hash(account.password, 12), firstName: 'Compte', lastName: `E2E ${account.prefix}`,
        role: account.role, departmentId: department.id, isActive: true,
        mfaEnabled: true, mfaRequired: false, mfaSecret: secret,
        gdprConsentAt: new Date(), chartesAcceptedAt: new Date(), onboardingCompletedAt: new Date(),
        welcomeChecklistDismissedAt: new Date(), digestFrequency: 'NONE', noaEnabled: false,
      } });
    }
    await prisma.appConfig.createMany({ data: [
      { key: 'smtp.enabled', value: 'false' }, { key: 'ldap.enabled', value: 'false' },
      { key: 'maintenance_mode', value: 'false' }, { key: 'feature.humor.noa', value: 'false' },
      { key: 'e2e.fixture', value: 'synthetic-only' },
    ] });
    await mkdir(path.join(storage, 'documents'), { recursive: true, mode: 0o700 });
    for (const [index, classification] of ['CONFIDENTIEL', 'PUBLIC'].entries()) {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage([595, 842]).drawText(`Document synthetique ISO E2E ${index + 1}`, { x: 50, y: 750, font, size: 16 });
      const content = Buffer.from(await pdf.save());
      const filename = `documents/e2e-${index + 1}.pdf`;
      await writeFile(path.join(storage, filename), content, { mode: 0o600 });
      const document = await prisma.document.create({ data: {
        title: `Politique ISO de test E2E ${index + 1}`, reference: `E2E-POL-00${index + 1}`,
        category: 'POLICY', status: 'APPROVED', ownerId: users.COLLAB!.id,
        classification, isPublic: classification === 'PUBLIC', scanStatus: 'CLEAN',
      } });
      const version = await prisma.documentVersion.create({ data: {
        documentId: document.id, versionNumber: '1.0', fileUrl: filename,
        fileType: 'application/pdf', fileSizeBytes: content.length,
        checksum: createHash('sha256').update(content).digest('hex'), uploadedById: users.COLLAB!.id,
      } });
      await prisma.document.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
    }
    const space = await prisma.ticketSpace.create({ data: { name: 'Support E2E', slug: 'support-e2e', isDefault: true } });
    await prisma.ticket.create({ data: {
      reference: 'E2E-TICKET-001', title: 'Demande synthétique E2E', description: 'Aucune donnée ni destinataire réel.',
      creatorId: users.COLLAB!.id, assigneeId: users.ADMIN!.id, departmentId: department.id, spaceId: space.id,
    } });
    console.log('[e2e] Disposable schema and three MFA-enabled synthetic role accounts created.');
  } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : '[e2e] Bootstrap failed.'); process.exitCode = 1; });
