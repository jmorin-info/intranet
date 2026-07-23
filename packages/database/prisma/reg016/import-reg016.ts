/**
 * import-reg016.ts — Import du Registre Documentaire SMSI (REG_016) dans la GED.
 * ---------------------------------------------------------------------------
 * Aligne la base `Document` sur le classeur officiel REG_016 (source de vérité
 * SMSI ISO 27001:2022). À la date de rédaction : 9 documents en base vs 154
 * lignes « actives » dans REG_016 (~5 % de couverture).
 *
 * DÉCISIONS ACTÉES (validées le 2026-07-20) :
 *  (b) Les lignes État = « Annulé » (54) sont EXCLUES (tombstones sans valeur
 *      SMSI active) — reportées dans le rapport, jamais écrites.
 *  (c) La référence REG_016 (ex. « CHA_001 ») est conservée telle quelle comme
 *      `Document.reference` (on NE passe PAS par generateReference()).
 *  (a) Mapping « rôle SMSI → utilisateur » : voir OWNER_MAP ci-dessous.
 *      >>> À RELIRE/AJUSTER avant --apply <<<  Le dry-run affiche qui est résolu.
 *
 * SÉCURITÉ D'EXÉCUTION :
 *  - `--dry-run` (DÉFAUT) : AUCUNE écriture. Affiche le rapport complet.
 *  - `--apply` : écrit réellement (upsert idempotent par référence).
 *  - Idempotent : relançable sans dupliquer (findFirst par reference puis
 *    update, sinon create). Ne touche jamais deletedAt ni les versions.
 *  - `ownerId` étant NOT NULL, toute ligne dont le propriétaire ne se résout
 *    pas (même via le fallback) est IGNORÉE et listée (jamais d'owner NULL).
 *
 * Usage :
 *   tsx packages/database/prisma/reg016/import-reg016.ts                 # dry-run
 *   tsx packages/database/prisma/reg016/import-reg016.ts --apply         # écrit
 *   tsx packages/database/prisma/reg016/import-reg016.ts --tsv <chemin>  # autre TSV
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DocumentStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

// ── Arguments CLI ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const tsvIdx = argv.indexOf("--tsv");
const TSV_PATH =
  tsvIdx !== -1 && argv[tsvIdx + 1] ? argv[tsvIdx + 1] : join(__dirname, "registre.tsv");

// ── (a) Mapping rôle SMSI → utilisateur — À CONFIRMER ───────────────────────
// Stratégie de résolution par entrée : `email` (prioritaire), sinon
// `departmentCode` (1er user actif du département, rôle le plus élevé),
// sinon `role`. Fallback global si rien ne résout : FALLBACK_OWNER_EMAIL.
type OwnerRule = { email?: string; departmentCode?: string; role?: string };
const FALLBACK_OWNER_EMAIL = "jmorin@omnitech-security.fr"; // admin demandeur
const OWNER_MAP: Record<string, OwnerRule> = {
  RSSI: { email: "jmorin@omnitech-security.fr" },
  "Admin Sys": { departmentCode: "DSI" },
  // Qualité : Estelle Duchan a quitté la société (voir EXCLUDED_OWNER_EMAILS) ;
  // le référent Qualité est désormais Alexandre Huet (2026-07-20).
  Qualité: { email: "alexandre.huet@invissys.com" },
  "Qualité / Admin Sys": { email: "alexandre.huet@invissys.com" },
  "Qualité / Admin Sys ": { email: "alexandre.huet@invissys.com" },
  // RH : porté par Caroline Vigier + Sylvie Bravard ; propriétaire unique =
  // Sylvie Bravard (arbitrage 2026-07-20, ownerId est unique).
  RH: { email: "sbravard@omnitech-security.fr" },
  "RH / Secrétariat": { email: "sbravard@omnitech-security.fr" },
  "RSSI / Admin Sys": { email: "jmorin@omnitech-security.fr" },
  "Admin Sys / RH": { departmentCode: "DSI" },
  Direction: { departmentCode: "DIRECTION" },
  "Facility Mgr": { departmentCode: "OPERATIONS" },
  // Dev Lead : Pierre Gélard (compte pgelard).
  "Dev Lead": { email: "pgelard@omnitech-security.fr" },
  "Relais DPO": { departmentCode: "DIRECTION" },
  "À définir": {}, // -> fallback
};

// ── Mappings d'énumérations REG_016 → Prisma ────────────────────────────────
const CATEGORY_MAP: Record<string, DocumentCategory> = {
  Politique: "POLICY",
  Procédure: "PROCEDURE",
  Instruction: "INSTRUCTION",
  Standard: "STANDARD",
  Guide: "GUIDE",
  Charte: "CHARTER",
  Organisation: "ORGANIZATION",
  Plan: "PLAN",
  Registre: "REGISTRY",
  Formulaire: "FORM",
  Communication: "COMMUNICATION",
};
// NB : DocumentStatus n'a pas d'équivalent natif pour « Diffusé »/« Rédigé » —
// mappés au plus proche (APPROVED / DRAFT). « Annulé » = exclu (voir plus bas).
const STATUS_MAP: Record<string, DocumentStatus> = {
  "À faire": "DRAFT",
  "En rédaction": "DRAFT",
  Rédigé: "DRAFT",
  Relecture: "IN_REVIEW",
  "À approuver": "PENDING_APPROVAL",
  Approuvé: "APPROVED",
  Diffusé: "APPROVED",
};
const LEVEL_MAP: Record<string, DocumentLevel> = {
  Gouvernance: "GOVERNANCE",
  "Opérationnel / maîtrise": "OPERATIONAL",
  "Preuve / enregistrement": "EVIDENCE",
  "Communication / engagement": "COMMUNICATION",
};
const PRIORITY_MAP: Record<string, DocumentPriority> = {
  Critique: "CRITICAL",
  Haute: "HIGH",
  Moyenne: "MEDIUM",
  Basse: "LOW",
};
function classificationFromNiveau(v: string): string {
  if (/Niveau\s*1/i.test(v)) return "SECRET";
  if (/Niveau\s*2/i.test(v)) return "CONFIDENTIEL";
  if (/Niveau\s*4/i.test(v)) return "PUBLIC";
  return "INTERNE"; // Niveau 3 / défaut (POL_015 §5)
}

// ── Parsing TSV ─────────────────────────────────────────────────────────────
interface Row {
  ref: string;
  parentRef: string;
  type: string;
  level: string;
  name: string;
  status: string;
  classification: string;
  priority: string;
  blocking: string;
  owner: string;
  approver: string;
  iso: string;
  version: string;
  periodicity: string;
  file: string;
  location: string;
}
function parseTsv(path: string): Row[] {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Réf.\t"));
  if (headerIdx === -1) throw new Error("En-tête « Réf. » introuvable dans le TSV");
  const out: Row[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const c = line.split("\t");
    const ref = (c[0] ?? "").trim();
    if (!ref) continue;
    out.push({
      ref,
      parentRef: (c[1] ?? "").trim(),
      type: (c[2] ?? "").trim(),
      level: (c[3] ?? "").trim(),
      name: (c[4] ?? "").trim(),
      status: (c[5] ?? "").trim(),
      classification: (c[6] ?? "").trim(),
      priority: (c[7] ?? "").trim(),
      blocking: (c[8] ?? "").trim(),
      owner: (c[9] ?? "").trim(),
      approver: (c[10] ?? "").trim(),
      iso: (c[11] ?? "").trim(),
      version: (c[12] ?? "").trim(),
      periodicity: (c[13] ?? "").trim(),
      file: (c[14] ?? "").trim(),
      location: (c[16] ?? "").trim(),
    });
  }
  return out;
}

// ── Résolution propriétaire (cache) ─────────────────────────────────────────
// Comptes exclus de la résolution automatique par département/rôle : comptes
// bot/service qui ne doivent JAMAIS devenir propriétaires de documents SMSI.
// (audit-lighthouse = bot SUPER_ADMIN de test — sinon il capte tout DSI.)
const EXCLUDED_OWNER_EMAILS = [
  "audit-lighthouse@omnitech-security.fr", // bot SUPER_ADMIN de test
  "educhan@omnitech-security.fr", // Estelle Duchan — a quitté la société
];

const ownerCache = new Map<string, string | null>();
async function resolveUserId(roleLabel: string): Promise<string | null> {
  const key = roleLabel || "À définir";
  if (ownerCache.has(key)) return ownerCache.get(key)!;
  const rule = OWNER_MAP[key] ?? {};
  let user: { id: string } | null = null;
  if (rule.email) {
    user = await prisma.user.findFirst({
      where: { email: rule.email, deletedAt: null },
      select: { id: true },
    });
  }
  if (!user && rule.departmentCode) {
    user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        department: { code: rule.departmentCode },
        email: { notIn: EXCLUDED_OWNER_EMAILS },
      },
      // Tri déterministe (rôle le plus élevé, puis email) : sinon le
      // propriétaire d'un département à plusieurs comptes peut varier d'un run
      // à l'autre (ex. Facility Mgr / OPERATIONS).
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: { id: true },
    });
  }
  if (!user && rule.role) {
    user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        role: rule.role as never,
        email: { notIn: EXCLUDED_OWNER_EMAILS },
      },
      select: { id: true },
    });
  }
  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: FALLBACK_OWNER_EMAIL, deletedAt: null },
      select: { id: true },
    });
    if (user) console.warn(`  ⚠️  owner « ${key} » non résolu → fallback ${FALLBACK_OWNER_EMAIL}`);
  }
  ownerCache.set(key, user?.id ?? null);
  return user?.id ?? null;
}

// ── ISO controls (par code) ─────────────────────────────────────────────────
async function resolveIsoControlIds(isoField: string): Promise<string[]> {
  const codes = isoField
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!codes.length) return [];
  const found = await prisma.isoControl.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  return found.map((f) => f.id);
}

async function main() {
  console.log(
    `\n=== Import REG_016 — ${APPLY ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)"} ===`,
  );
  console.log(`TSV : ${TSV_PATH}`);
  const rows = parseTsv(TSV_PATH);
  const active = rows.filter((r) => r.status !== "Annulé" && r.type);
  const cancelled = rows.length - active.length;
  console.log(
    `Lignes : ${rows.length} total · ${active.length} actives · ${cancelled} exclues (Annulé/type vide)\n`,
  );

  let created = 0,
    updated = 0,
    skipped = 0;
  const skippedRefs: string[] = [];
  for (const r of active) {
    const category = CATEGORY_MAP[r.type];
    if (!category) {
      skipped++;
      skippedRefs.push(`${r.ref} (type inconnu: ${r.type})`);
      continue;
    }
    const ownerId = await resolveUserId(r.owner);
    if (!ownerId) {
      skipped++;
      skippedRefs.push(`${r.ref} (owner non résolu: ${r.owner})`);
      continue;
    }
    const approverId = await resolveUserId(r.approver.split("/")[0].trim());

    const data = {
      parentReference: r.parentRef || null,
      title: r.name,
      category,
      status: STATUS_MAP[r.status] ?? "DRAFT",
      classification: classificationFromNiveau(r.classification),
      priority: PRIORITY_MAP[r.priority] ?? null,
      documentLevel: LEVEL_MAP[r.level] ?? null,
      blocking: /^oui$/i.test(r.blocking),
      reviewPeriodicity: r.periodicity || null,
      ownerId,
      approverId: approverId ?? null,
      externalStoragePath: r.location || null,
      externalStorageProvider: r.location ? "network-share" : null,
    };
    const isoIds = await resolveIsoControlIds(r.iso);

    const existing = await prisma.document.findFirst({
      where: { reference: r.ref, deletedAt: null },
      select: { id: true },
    });
    if (!APPLY) {
      console.log(
        `  ${existing ? "≈ MAJ  " : "+ CRÉE"} ${r.ref.padEnd(18)} ${data.category.padEnd(12)} ${data.status.padEnd(16)} owner=${ownerId.slice(0, 8)} iso=${isoIds.length}`,
      );
      existing ? updated++ : created++;
      continue;
    }
    if (existing) {
      await prisma.document.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      const doc = await prisma.document.create({ data: { reference: r.ref, ...data } });
      if (isoIds.length) {
        await prisma.documentIsoControl.createMany({
          data: isoIds.map((isoControlId) => ({ documentId: doc.id, isoControlId })),
          skipDuplicates: true,
        });
      }
      created++;
    }
  }

  console.log(`\n=== Rapport ===`);
  console.log(`  Créés   : ${created}`);
  console.log(`  MAJ     : ${updated}`);
  console.log(`  Exclus  : ${cancelled} (Annulé / type vide)`);
  console.log(`  Ignorés : ${skipped} (owner ou type non résolu)`);
  if (skippedRefs.length) {
    console.log(`  Détail ignorés :`);
    skippedRefs.forEach((s) => console.log(`    - ${s}`));
  }
  if (!APPLY) console.log(`\n(DRY-RUN — relancer avec --apply pour écrire réellement.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
