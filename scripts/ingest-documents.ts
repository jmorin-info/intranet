/**
 * OMNITECH Intranet — Document Ingestion Script
 * Analyzes /tmp/doc/ structure and imports documents into the intranet GED
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/ingest-documents.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();
const SOURCE_DIR = '/tmp/doc';
const STORAGE_DIR = process.env.STORAGE_PATH || '/root/omnitech-intranet/storage';

// =============================================================================
// Classification rules: map folder paths to document categories and ISO controls
// =============================================================================

interface ClassificationRule {
  pathMatch: RegExp;
  category: string;
  isoControls: string[];
  classification: string;
  description?: string;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Chartes
  { pathMatch: /Charte/i, category: 'POLICY', isoControls: ['A.5.1', 'A.6.2'], classification: 'INTERNE', description: 'Charte obligatoire' },
  // Politiques de securite
  { pathMatch: /Politiq|PSSI|POL-SEC|POL-SMSI/i, category: 'POLICY', isoControls: ['A.5.1', 'A.5.2'], classification: 'INTERNE' },
  // Procedures
  { pathMatch: /PROC-|Procedure|Procédure/i, category: 'PROCEDURE', isoControls: ['A.5.37'], classification: 'INTERNE' },
  // Formulaires
  { pathMatch: /FRM-|Formulaire|Modèle|Modele/i, category: 'FORM', isoControls: ['A.5.37'], classification: 'INTERNE' },
  // Plans (PRA/PCA)
  { pathMatch: /PRA|PCA|Plan de Continu/i, category: 'PLAN', isoControls: ['A.5.29', 'A.5.30'], classification: 'CONFIDENTIEL' },
  // Rapports d'audit
  { pathMatch: /Rapport|Report|Audit|RAPP-/i, category: 'REPORT', isoControls: ['A.5.35', 'A.5.36'], classification: 'CONFIDENTIEL' },
  // Revues
  { pathMatch: /REV-|Revue/i, category: 'REPORT', isoControls: ['A.5.36'], classification: 'INTERNE' },
  // Registres
  { pathMatch: /Registre|Inventaire|AST-/i, category: 'RECORD', isoControls: ['A.5.9', 'A.5.12'], classification: 'CONFIDENTIEL' },
  // Analyse de risque
  { pathMatch: /Risque|EBIOS|Atelier/i, category: 'RECORD', isoControls: ['A.5.7', 'A.8.8'], classification: 'CONFIDENTIEL' },
  // Reseau / Firewall
  { pathMatch: /Firewall|Réseau|Switch|VLAN|COM-/i, category: 'RECORD', isoControls: ['A.8.20', 'A.8.21'], classification: 'CONFIDENTIEL' },
  // Guides
  { pathMatch: /Guide|Sensibilisation/i, category: 'GUIDE', isoControls: ['A.6.3'], classification: 'INTERNE' },
  // Contrats
  { pathMatch: /Contrat|PAS |Plan d.Assurance/i, category: 'CONTRACT', isoControls: ['A.5.19', 'A.5.20'], classification: 'CONFIDENTIEL' },
  // Default
  { pathMatch: /.*/, category: 'OTHER', isoControls: [], classification: 'INTERNE' },
];

// Map folder names to ISO domains
const FOLDER_TO_DOMAIN: Record<string, string> = {
  '0 - Outils de travail': 'OUTILS',
  '1 - Contexte et Périmètre': 'SMSI',
  '2 - Leadership': 'SMSI',
  '3 - Planification': 'SMSI',
  '4 - Supports': 'SMSI',
  '5 - Fonctionnement': 'SMSI',
  '6 - Évaluation de la performance': 'SMSI',
  '7 - Amélioration': 'SMSI',
  '8 - Système d\'Information': 'DSI',
  '9 - SMSI [JMO]': 'SMSI',
};

// =============================================================================
// Helpers
// =============================================================================

function classifyFile(filePath: string): ClassificationRule {
  const relativePath = filePath.replace(SOURCE_DIR, '');
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pathMatch.test(relativePath)) return rule;
  }
  return CLASSIFICATION_RULES[CLASSIFICATION_RULES.length - 1]!;
}

function extractReference(filename: string): string | null {
  // Try to extract reference like "POL-SEC-001", "PROC-IT-002", "FRM-CHG-001", etc.
  const match = filename.match(/([A-Z]{2,5}-[A-Z]{2,5}-\d{3})/);
  return match ? match[1] : null;
}

function extractDomain(filePath: string): string {
  const parts = filePath.replace(SOURCE_DIR + '/', '').split('/');
  const topFolder = parts[0] || '';
  return FOLDER_TO_DOMAIN[topFolder] || 'SMSI';
}

function cleanTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')           // Remove extension
    .replace(/^\d{8}\s*-?\s*/, '')     // Remove date prefix like "20240105 -"
    .replace(/\s*-\s*OMNITECH.*$/i, '') // Remove "- OMNITECH Security..."
    .replace(/\s*-\s*Document interne.*$/i, '') // Remove "- Document interne..."
    .replace(/\s*-\s*JMO\s*\.?$/i, '') // Remove "- JMO"
    .replace(/\s*-\s*Copie$/i, '')     // Remove "- Copie"
    .replace(/\s*\[.*?\]\s*/g, ' ')    // Remove [brackets]
    .replace(/\s+/g, ' ')
    .trim();
}

function generateReference(category: string, domain: string, sequence: number): string {
  const catCodes: Record<string, string> = {
    POLICY: 'POL', PROCEDURE: 'PRC', PLAN: 'PLN', RECORD: 'REC',
    FORM: 'FRM', GUIDE: 'GDE', REPORT: 'RPT', CONTRACT: 'CTR', OTHER: 'OTH',
  };
  const catCode = catCodes[category] || 'OTH';
  return `OMS-${catCode}-${domain}-${String(sequence).padStart(3, '0')}`;
}

async function computeChecksum(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getMimeType(ext: string): string {
  const mimes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.doc': 'application/msword',
    '.xls': 'application/vnd.ms-excel',
  };
  return mimes[ext.toLowerCase()] || 'application/octet-stream';
}

// =============================================================================
// Main ingestion
// =============================================================================

async function main() {
  console.log('=== OMNITECH Document Ingestion ===\n');

  // Get the admin user for document ownership
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
  });
  if (!admin) throw new Error('No SUPER_ADMIN user found');
  console.log(`Owner: ${admin.email}\n`);

  // Get existing ISO controls
  const isoControls = await prisma.isoControl.findMany();
  const isoMap = new Map(isoControls.map(c => [c.code, c.id]));

  // Collect all document files
  const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls'];
  const files: string[] = [];

  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip temp/perso/backup dirs
        if (/Temp|Perso|wazuh_backup|Deploy|Old$/i.test(entry.name)) continue;
        walkDir(fullPath);
      } else if (SUPPORTED_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        // Skip duplicates: if PDF exists, skip DOCX with same base name
        const baseName = entry.name.replace(/\.[^.]+$/, '');
        const pdfVersion = path.join(dir, baseName + '.pdf');
        if (path.extname(entry.name).toLowerCase() === '.docx' && fs.existsSync(pdfVersion)) {
          continue; // Skip DOCX if PDF version exists
        }
        // Skip templates/models
        if (/^\[Modèle\]|^\[En cours/i.test(entry.name)) continue;
        files.push(fullPath);
      }
    }
  }

  walkDir(SOURCE_DIR);
  console.log(`Found ${files.length} documents to import\n`);

  // Track sequence numbers per category-domain
  const sequences: Record<string, number> = {};
  // Get max existing sequence
  const existingDocs = await prisma.document.findMany({ select: { reference: true } });
  for (const doc of existingDocs) {
    const match = doc.reference.match(/OMS-(\w+)-(\w+)-(\d+)/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      sequences[key] = Math.max(sequences[key] || 0, parseInt(match[3]!, 10));
    }
  }

  let imported = 0;
  let skipped = 0;
  const results: Array<{ ref: string; title: string; category: string; file: string }> = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const rule = classifyFile(filePath);
    const domain = extractDomain(filePath);
    const existingRef = extractReference(filename);

    // Generate or use existing reference
    const seqKey = `${rule.category === 'POLICY' ? 'POL' : rule.category === 'PROCEDURE' ? 'PRC' : rule.category === 'FORM' ? 'FRM' : rule.category === 'RECORD' ? 'REC' : 'OTH'}-${domain}`;
    sequences[seqKey] = (sequences[seqKey] || 0) + 1;
    const reference = existingRef || generateReference(rule.category, domain, sequences[seqKey]!);

    const title = cleanTitle(filename);
    if (!title || title.length < 3) { skipped++; continue; }

    // Check if document already exists (by reference or title)
    const existing = await prisma.document.findFirst({
      where: { OR: [{ reference }, { title }] },
    });
    if (existing) {
      console.log(`  SKIP (exists): ${reference} — ${title}`);
      skipped++;
      continue;
    }

    // Copy file to storage
    const docId = crypto.randomUUID();
    const storageDir = path.join(STORAGE_DIR, 'documents', docId);
    fs.mkdirSync(storageDir, { recursive: true });
    const storedFilename = `${crypto.randomUUID()}${ext}`;
    const storedPath = path.join(storageDir, storedFilename);
    fs.copyFileSync(filePath, storedPath);

    const fileUrl = `/storage/documents/${docId}/${storedFilename}`;
    const checksum = await computeChecksum(filePath);
    const fileSize = fs.statSync(filePath).size;
    const mimeType = getMimeType(ext);

    // Create document + version in transaction
    await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          id: docId,
          title,
          reference,
          description: rule.description || `Document importé depuis ${path.dirname(filePath).replace(SOURCE_DIR, '')}`,
          category: rule.category as any,
          status: 'APPROVED',
          ownerId: admin.id,
          classification: rule.classification,
          isPublic: false,
          scanStatus: 'CLEAN',
        },
      });

      await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: '1.0',
          fileUrl,
          fileType: mimeType,
          fileSizeBytes: fileSize,
          checksum,
          changeLog: 'Import initial',
          uploadedById: admin.id,
        },
      });

      // Update currentVersionId
      const version = await tx.documentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: { createdAt: 'desc' },
      });
      if (version) {
        await tx.document.update({
          where: { id: doc.id },
          data: { currentVersionId: version.id },
        });
      }

      // Link ISO controls
      for (const code of rule.isoControls) {
        const controlId = isoMap.get(code);
        if (controlId) {
          await tx.documentIsoControl.create({
            data: { documentId: doc.id, isoControlId: controlId },
          }).catch(() => {}); // Skip if already linked
        }
      }
    });

    console.log(`  OK: [${rule.category}] ${reference} — ${title} (${(fileSize/1024).toFixed(0)} Ko)`);
    results.push({ ref: reference, title, category: rule.category, file: filename });
    imported++;
  }

  // Also update chartes with real PDFs if available
  const chartePdf = '/tmp/doc/9 - SMSI [JMO]/Chartes/CHA-001 - 20250611- Omnitech Security - Charte Informatique.pdf';
  const pssiPdf = '/tmp/doc/9 - SMSI [JMO]/Politiques/17032026 - Politique de Sécurité des Systèmes d\'Information.pdf';

  if (fs.existsSync(chartePdf)) {
    console.log('\n--- Updating Charte Informatique with real PDF ---');
    const charteInfo = await prisma.charte.findUnique({ where: { slug: 'charte-informatique' } });
    if (charteInfo) {
      const targetDir = path.join(STORAGE_DIR, 'chartes', charteInfo.id);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(chartePdf, path.join(targetDir, 'placeholder.pdf'));
      const hash = await computeChecksum(chartePdf);
      const size = fs.statSync(chartePdf).size;
      await prisma.charteVersion.updateMany({
        where: { charteId: charteInfo.id, isActive: true },
        data: { checksum: hash, fileSizeBytes: size, fileType: 'application/pdf' },
      });
      console.log(`  Updated: ${charteInfo.title} (${(size/1024).toFixed(0)} Ko)`);
    }
  }

  if (fs.existsSync(pssiPdf)) {
    console.log('\n--- Updating PSSI with real PDF ---');
    const pssiInfo = await prisma.charte.findUnique({ where: { slug: 'pssi' } });
    if (pssiInfo) {
      const targetDir = path.join(STORAGE_DIR, 'chartes', pssiInfo.id);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(pssiPdf, path.join(targetDir, 'placeholder.pdf'));
      const hash = await computeChecksum(pssiPdf);
      const size = fs.statSync(pssiPdf).size;
      await prisma.charteVersion.updateMany({
        where: { charteId: pssiInfo.id, isActive: true },
        data: { checksum: hash, fileSizeBytes: size, fileType: 'application/pdf' },
      });
      console.log(`  Updated: ${pssiInfo.title} (${(size/1024).toFixed(0)} Ko)`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total:    ${imported + skipped}`);

  // Print by category
  const byCategory: Record<string, number> = {};
  for (const r of results) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }
  console.log('\n  By category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error('Ingestion failed:', e); process.exit(1); });
