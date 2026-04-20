/**
 * sync-knowbe4.ts — Synchronise les formations KnowBe4 terminées vers les certificats intranet.
 * Usage : cd packages/database && set -a && source ../../.env && set +a && npx tsx prisma/sync-knowbe4.ts
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

const KB4_URL = process.env.KNOWBE4_API_URL || 'https://eu.api.knowbe4.com/v1';
const KB4_TOKEN = process.env.KNOWBE4_API_TOKEN;

async function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${KB4_TOKEN}`, Accept: 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  if (!KB4_TOKEN) {
    console.error('KNOWBE4_API_TOKEN not set');
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true, email: true },
  });
  if (!admin) { console.error('No SUPER_ADMIN found'); process.exit(1); }
  console.log(`Admin: ${admin.email}`);

  // Fetch all enrollments (paginated)
  let page = 1;
  let allEnrollments: any[] = [];
  while (true) {
    const url = `${KB4_URL}/training/enrollments?per_page=500&page=${page}`;
    console.log(`Fetching page ${page}...`);
    const data = await fetchJSON(url);
    if (!Array.isArray(data) || data.length === 0) break;
    allEnrollments = allEnrollments.concat(data);
    if (data.length < 500) break;
    page++;
  }

  console.log(`Total enrollments fetched: ${allEnrollments.length}`);
  const passed = allEnrollments.filter((e: any) => e.status === 'Passed');
  console.log(`Passed: ${passed.length}`);

  let created = 0;
  let skipped = 0;
  let noUser = 0;

  for (const enrollment of passed) {
    const email: string | undefined = enrollment?.user?.email;
    if (!email) { skipped++; continue; }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' as any } },
      select: { id: true },
    });
    if (!user) { noUser++; continue; }

    const moduleName: string = enrollment.module_name || enrollment.campaign_name || 'KnowBe4 Training';
    const certName = `[KB4] ${moduleName}`;
    const completionDate = enrollment.completion_date ? new Date(enrollment.completion_date) : new Date();

    // Check duplicate
    const existing = await prisma.certificate.findFirst({
      where: { userId: user.id, name: certName, certType: 'KNOWBE4' },
    });
    if (existing) { skipped++; continue; }

    await prisma.certificate.create({
      data: {
        name: certName,
        certType: 'KNOWBE4',
        obtainedAt: completionDate,
        notes: enrollment.enrollment_id ? `KnowBe4 enrollment #${enrollment.enrollment_id}` : 'Synced from KnowBe4',
        userId: user.id,
        createdById: admin.id,
      },
    });
    created++;
    if (created % 20 === 0) console.log(`  ... ${created} created so far`);
  }

  console.log(`\n✅ Sync terminé : ${created} créés, ${skipped} ignorés (doublons), ${noUser} users non trouvés`);

  const total = await prisma.certificate.count();
  console.log(`Total certificats en base : ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
