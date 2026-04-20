// =============================================================================
// OMNITECH Security Intranet — Seed Content (données réalistes)
// Insère des documents, tickets, incidents, notifications, événements, etc.
// Idempotent : vérifie l'existence avant insertion.
// =============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = resolve(__dirname, '../../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nextMonday(base: Date): Date {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

function thisWeekDay(dayOffset: number, hour: number): Date {
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  monday.setHours(hour, 0, 0, 0);
  monday.setDate(monday.getDate() + dayOffset);
  return monday;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== SEED CONTENT : démarrage ===\n');

  // --- Lookup admin & department ---
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error('Aucun SUPER_ADMIN trouvé. Lancez le seed principal.');
  console.log(`Admin : ${admin.email}`);

  const dept = await prisma.department.findFirst({ select: { id: true, name: true } });
  if (!dept) throw new Error('Aucun Department trouvé.');
  console.log(`Département : ${dept.name}\n`);

  let created = 0;
  let skipped = 0;
  const log = (label: string, isNew: boolean) => {
    if (isNew) { created++; console.log(`  + ${label}`); }
    else { skipped++; console.log(`  ~ ${label} (existe)`); }
  };

  // =========================================================================
  // 1. DOCUMENTS + VERSIONS
  // =========================================================================
  console.log('--- Documents ---');

  const documents: {
    title: string; reference: string; category: any; status: any;
    content: string; versionNumber: string;
  }[] = [
    {
      title: 'Politique de Sécurité des Systèmes d\'Information (PSSI)',
      reference: 'DOC-PSSI-001',
      category: 'POLICY',
      status: 'APPROVED',
      versionNumber: '2.1',
      content: `<h2>PSSI OMNITECH Security</h2>
<p>Ce document définit la politique de sécurité des systèmes d'information d'OMNITECH Security, conformément aux exigences de la norme ISO 27001:2022. Il couvre la gouvernance de la sécurité, la gestion des risques, la classification des actifs et les responsabilités de chaque collaborateur. La direction s'engage à fournir les ressources nécessaires à la mise en oeuvre et à l'amélioration continue du SMSI.</p>`,
    },
    {
      title: 'Procédure de gestion des incidents',
      reference: 'DOC-PGI-002',
      category: 'PROCEDURE',
      status: 'APPROVED',
      versionNumber: '1.3',
      content: `<h2>Procédure de gestion des incidents de sécurité</h2>
<p>Cette procédure décrit le processus de détection, qualification, traitement et clôture des incidents de sécurité. Chaque incident est classifié selon sa sévérité (P1 à P4) et suit un circuit d'escalade défini. Le SOC assure la surveillance 24/7 et coordonne la réponse. Un retour d'expérience est systématiquement réalisé pour les incidents P1 et P2.</p>`,
    },
    {
      title: 'Plan de continuité d\'activité',
      reference: 'DOC-PCA-003',
      category: 'PLAN',
      status: 'DRAFT',
      versionNumber: '0.9',
      content: `<h2>Plan de Continuité d'Activité (PCA)</h2>
<p>Document en cours de rédaction. Le PCA définit les mesures organisationnelles et techniques permettant d'assurer la continuité des activités critiques en cas de sinistre majeur. Il inclut l'analyse d'impact métier (BIA), les stratégies de reprise, les procédures de bascule et les tests périodiques. Objectifs de reprise : RTO 4h pour les systèmes critiques, RPO 1h maximum.</p>`,
    },
    {
      title: 'Guide d\'utilisation du poste de travail',
      reference: 'DOC-GUIDE-004',
      category: 'GUIDE',
      status: 'APPROVED',
      versionNumber: '1.0',
      content: `<h2>Guide d'utilisation du poste de travail</h2>
<p>Ce guide s'adresse à tous les collaborateurs OMNITECH. Il couvre la configuration initiale du poste, les bonnes pratiques de sécurité quotidiennes, l'utilisation du VPN, la gestion des mots de passe via KeePassXC, et les règles relatives au verrouillage automatique. Tout logiciel non référencé au catalogue DSI est interdit. En cas de doute, contactez le support IT au poste 4242.</p>`,
    },
    {
      title: 'Rapport d\'audit annuel 2025',
      reference: 'DOC-AUDIT-005',
      category: 'REPORT',
      status: 'ARCHIVED',
      versionNumber: '1.0',
      content: `<h2>Rapport d'audit interne — Exercice 2025</h2>
<p>L'audit annuel du SMSI a été réalisé en novembre 2025 par le cabinet ExtAudit. Les conclusions montrent une conformité globale de 87 % aux exigences ISO 27001:2022. Trois non-conformités mineures ont été identifiées : gestion des accès prestataires, revue des droits trimestrielle incomplète, et absence de test PCA documenté. Un plan d'actions correctives a été validé en comité SMSI.</p>`,
    },
  ];

  for (const doc of documents) {
    const existing = await prisma.document.findFirst({ where: { reference: doc.reference } });
    if (existing) { log(doc.title, false); continue; }

    const created_doc = await prisma.document.create({
      data: {
        title: doc.title,
        reference: doc.reference,
        category: doc.category,
        status: doc.status,
        ownerId: admin.id,
        content: doc.content,
        isNative: true,
        isPublic: doc.status === 'APPROVED',
        classification: 'INTERNE',
      },
    });

    await prisma.documentVersion.create({
      data: {
        documentId: created_doc.id,
        versionNumber: doc.versionNumber,
        fileUrl: `/docs/${doc.reference.toLowerCase()}.html`,
        fileType: 'text/html',
        fileSizeBytes: Buffer.byteLength(doc.content, 'utf8'),
        checksum: `sha256-${doc.reference.toLowerCase()}`,
        changeLog: `Version ${doc.versionNumber} — publication initiale`,
        uploadedById: admin.id,
      },
    });
    log(doc.title, true);
  }

  // =========================================================================
  // 2. TICKETS
  // =========================================================================
  console.log('\n--- Tickets ---');

  const tickets: {
    reference: string; title: string; description: string;
    category: any; priority: any; status: any;
  }[] = [
    {
      reference: 'TIC-2026-001',
      title: 'Écran bloqué après mise à jour Windows',
      description: 'Après la mise à jour KB5034441 du 10/04, le poste DSI-PC-017 reste bloqué sur l\'écran de chargement Windows. Redémarrage forcé sans effet. Le collaborateur ne peut plus travailler.',
      category: 'INCIDENT',
      priority: 'HIGH',
      status: 'OPEN',
    },
    {
      reference: 'TIC-2026-002',
      title: 'Demande d\'accès VPN pour prestataire',
      description: 'Le prestataire CHEOPS Technology (contact : j.martin@cheops.fr) intervient du 14 au 25 avril pour la migration Exchange. Besoin d\'un accès VPN avec restrictions réseau sur le VLAN serveurs mail uniquement.',
      category: 'ACCESS',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
    },
    {
      reference: 'TIC-2026-003',
      title: 'Problème imprimante 3ème étage',
      description: 'L\'imprimante HP LaserJet du 3ème étage (IMP-3E-001) affiche "bourrage papier" en continu malgré le nettoyage. Le bac 2 semble défectueux. Intervention technicien demandée.',
      category: 'HARDWARE',
      priority: 'LOW',
      status: 'RESOLVED',
    },
    {
      reference: 'TIC-2026-004',
      title: 'Licence Adobe Creative Cloud expirée',
      description: 'Les 5 licences Adobe CC du service Communication ont expiré le 31/03/2026. Les collaborateurs ne peuvent plus utiliser Photoshop et InDesign. Renouvellement urgent nécessaire.',
      category: 'SOFTWARE',
      priority: 'MEDIUM',
      status: 'OPEN',
    },
    {
      reference: 'TIC-2026-005',
      title: 'Alerte antivirus poste RH-PC-042',
      description: 'L\'EDR CrowdStrike a détecté un comportement suspect sur RH-PC-042 : exécution de PowerShell encodé en base64, tentative de connexion sortante vers un C2 connu. Poste isolé du réseau en attendant analyse SOC.',
      category: 'SECURITY',
      priority: 'CRITICAL',
      status: 'OPEN',
    },
  ];

  for (const t of tickets) {
    const existing = await prisma.ticket.findFirst({ where: { reference: t.reference } });
    if (existing) { log(t.title, false); continue; }

    await prisma.ticket.create({
      data: {
        reference: t.reference,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        creatorId: admin.id,
        departmentId: dept.id,
        resolvedAt: t.status === 'RESOLVED' ? new Date() : undefined,
      },
    });
    log(t.title, true);
  }

  // =========================================================================
  // 3. INCIDENTS SECURITE
  // =========================================================================
  console.log('\n--- Incidents sécurité ---');

  const incidents: {
    reference: string; title: string; description: string;
    category: any; severity: any; status: any;
  }[] = [
    {
      reference: 'INC-2026-001',
      title: 'Tentative de phishing ciblé direction',
      description: 'Campagne de spear-phishing ciblant le COMEX. Emails usurpant l\'identité du DG avec demande de virement urgent. 3 emails identifiés, aucun clic confirmé. Analyse des en-têtes en cours pour identifier l\'origine.',
      category: 'PHISHING',
      severity: 'CRITICAL',
      status: 'UNDER_INVESTIGATION',
    },
    {
      reference: 'INC-2026-002',
      title: 'Fuite de données USB non chiffrée',
      description: 'Une clé USB non chiffrée contenant des fichiers RH (bulletins de paie Q1 2026) a été retrouvée dans le parking visiteurs. Données personnelles de 23 collaborateurs potentiellement exposées. DPO notifié.',
      category: 'DATA_BREACH',
      severity: 'HIGH',
      status: 'CONTAINED',
    },
    {
      reference: 'INC-2026-003',
      title: 'Scan de ports détecté depuis IP externe',
      description: 'Le SIEM a détecté un scan SYN massif (>10 000 ports) depuis l\'IP 185.220.101.42 ciblant notre plage publique. Aucune intrusion constatée. IP bloquée au niveau du pare-feu FortiGate. Analyse threat intel en cours.',
      category: 'UNAUTHORIZED_ACCESS',
      severity: 'MEDIUM',
      status: 'RECOVERED',
    },
  ];

  for (const inc of incidents) {
    const existing = await prisma.incident.findFirst({ where: { reference: inc.reference } });
    if (existing) { log(inc.title, false); continue; }

    await prisma.incident.create({
      data: {
        reference: inc.reference,
        title: inc.title,
        description: inc.description,
        category: inc.category,
        severity: inc.severity,
        status: inc.status,
        reporterId: admin.id,
        assignedToId: admin.id,
        containedAt: inc.status === 'CONTAINED' ? new Date() : undefined,
        resolvedAt: inc.status === 'RECOVERED' ? new Date() : undefined,
      },
    });
    log(inc.title, true);
  }

  // =========================================================================
  // 4. NOTIFICATIONS
  // =========================================================================
  console.log('\n--- Notifications ---');

  const notifications: { title: string; body: string; type: any }[] = [
    {
      title: 'Nouveau document publié : PSSI v2.1',
      body: 'La Politique de Sécurité des Systèmes d\'Information a été mise à jour. Veuillez en prendre connaissance.',
      type: 'DOC_PUBLISHED',
    },
    {
      title: 'Ticket critique : Alerte antivirus RH-PC-042',
      body: 'Un ticket de sécurité critique a été ouvert. Action immédiate requise.',
      type: 'TICKET_CREATED',
    },
    {
      title: 'Revue d\'accès trimestrielle à valider',
      body: 'La campagne de revue des accès Q1 2026 est ouverte. Merci de valider les accès de votre équipe avant le 30 avril.',
      type: 'ACK_REQUIRED',
    },
    {
      title: 'Actualité : Exercice de crise cyber prévu le 22 avril',
      body: 'Un exercice de simulation d\'attaque sera réalisé la semaine prochaine. Consultez l\'article pour les détails.',
      type: 'NEWS_POSTED',
    },
    {
      title: 'Signature requise : Charte informatique v3',
      body: 'Une nouvelle version de la charte informatique est disponible. Votre signature électronique est requise.',
      type: 'SIGNATURE_NEEDED',
    },
  ];

  for (const n of notifications) {
    const existing = await prisma.notification.findFirst({
      where: { userId: admin.id, title: n.title },
    });
    if (existing) { log(n.title, false); continue; }

    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: n.title,
        body: n.body,
        type: n.type,
        isRead: false,
      },
    });
    log(n.title, true);
  }

  // =========================================================================
  // 5. CALENDAR EVENTS
  // =========================================================================
  console.log('\n--- CalendarEvents ---');

  const events: {
    title: string; description: string; category: string;
    startDate: Date; endDate: Date; location?: string;
  }[] = [
    {
      title: 'Comité SMSI mensuel',
      description: 'Revue mensuelle du Système de Management de la Sécurité de l\'Information. Ordre du jour : indicateurs KPI, incidents du mois, avancement plan de traitement des risques.',
      category: 'COMITE',
      startDate: thisWeekDay(2, 14), // mercredi 14h
      endDate: thisWeekDay(2, 16),   // mercredi 16h
      location: 'Salle Vauban — 2ème étage',
    },
    {
      title: 'Formation phishing — session 2',
      description: 'Deuxième session de sensibilisation au phishing pour les nouveaux arrivants Q1 2026. Atelier pratique avec exemples réels anonymisés.',
      category: 'FORMATION',
      startDate: thisWeekDay(4, 10), // vendredi 10h
      endDate: thisWeekDay(4, 12),   // vendredi 12h
      location: 'Salle de formation B — RDC',
    },
    {
      title: 'Revue d\'accès trimestrielle',
      description: 'Revue des droits d\'accès Q1 2026. Chaque responsable de département vérifie et valide les accès de ses collaborateurs conformément à la politique A.5.18.',
      category: 'AUDIT',
      startDate: nextMonday(new Date()),        // lundi prochain 9h
      endDate: new Date(nextMonday(new Date()).getTime() + 2 * 3600000), // +2h
      location: 'Visioconférence Teams',
    },
  ];

  for (const ev of events) {
    const existing = await prisma.calendarEvent.findFirst({
      where: { title: ev.title, createdById: admin.id },
    });
    if (existing) { log(ev.title, false); continue; }

    await prisma.calendarEvent.create({
      data: {
        title: ev.title,
        description: ev.description,
        category: ev.category,
        startDate: ev.startDate,
        endDate: ev.endDate,
        location: ev.location,
        createdById: admin.id,
        departmentId: dept.id,
      },
    });
    log(ev.title, true);
  }

  // =========================================================================
  // 6. CHARTE VERSION (pour résoudre le KPI sans version)
  // =========================================================================
  console.log('\n--- CharteVersion ---');

  const charte = await prisma.charte.findFirst({ select: { id: true, title: true } });
  if (charte) {
    const existingVersion = await prisma.charteVersion.findFirst({
      where: { charteId: charte.id },
    });
    if (existingVersion) {
      log(`Version charte "${charte.title}"`, false);
    } else {
      await prisma.charteVersion.create({
        data: {
          charteId: charte.id,
          versionNumber: '3.0',
          fileUrl: '/chartes/charte-informatique-v3.pdf',
          fileType: 'application/pdf',
          fileSizeBytes: 245760,
          checksum: 'sha256-charte-informatique-v3-placeholder',
          changeLog: 'Mise à jour 2026 — intégration des exigences NIS2 et recommandations ANSSI.',
          publishedAt: new Date(),
          isActive: true,
        },
      });
      log(`Version 3.0 de "${charte.title}"`, true);
    }
  } else {
    console.log('  ! Aucune Charte trouvée en base — étape ignorée.');
  }

  // =========================================================================
  // 7. VEILLE ITEMS
  // =========================================================================
  console.log('\n--- VeilleItems ---');

  const veilleSource = await prisma.veilleSource.findFirst({ select: { id: true, name: true, url: true } });

  const veilleItems: {
    title: string; description: string; sourceUrl: string;
    sourceName: string; severity: string; cveId?: string;
  }[] = [
    {
      title: 'CVE-2026-21345 — Exécution de code à distance dans OpenSSL 3.x',
      description: 'Une vulnérabilité critique (CVSS 9.8) dans OpenSSL 3.2.x permet l\'exécution de code arbitraire via un certificat X.509 malformé. Patch disponible en 3.2.3. Mise à jour immédiate recommandée pour tous les serveurs exposés.',
      sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2026-21345',
      sourceName: veilleSource?.name ?? 'NVD',
      severity: 'CRITICAL',
      cveId: 'CVE-2026-21345',
    },
    {
      title: 'CERTFR-2026-ALE-004 — Alerte ANSSI : campagne APT ciblant les ESN françaises',
      description: 'L\'ANSSI alerte sur une campagne d\'attaques persistantes avancées ciblant spécifiquement les entreprises de services numériques en France. Vecteur initial : compromission de la supply chain logicielle. IOCs et recommandations disponibles dans le bulletin.',
      sourceUrl: 'https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-004/',
      sourceName: veilleSource?.name ?? 'CERT-FR',
      severity: 'HIGH',
    },
    {
      title: 'Rapport Mandiant : tendances ransomware Q1 2026',
      description: 'Mandiant publie son rapport trimestriel sur l\'évolution des menaces ransomware. Augmentation de 34 % des attaques par double extorsion. Les secteurs santé et services financiers restent les plus ciblés. Nouvelles tactiques d\'exfiltration via des services cloud légitimes.',
      sourceUrl: 'https://www.mandiant.com/resources/reports/ransomware-trends-q1-2026',
      sourceName: veilleSource?.name ?? 'Mandiant',
      severity: 'MEDIUM',
    },
  ];

  for (const vi of veilleItems) {
    const existing = await prisma.veilleItem.findFirst({ where: { sourceUrl: vi.sourceUrl } });
    if (existing) { log(vi.title, false); continue; }

    await prisma.veilleItem.create({
      data: {
        title: vi.title,
        description: vi.description,
        sourceUrl: vi.sourceUrl,
        sourceName: vi.sourceName,
        severity: vi.severity,
        cveId: vi.cveId ?? null,
        publishedAt: new Date(Date.now() - Math.random() * 7 * 86400000), // dans la dernière semaine
        isProcessed: true,
      },
    });
    log(vi.title, true);
  }

  // =========================================================================
  // Résumé
  // =========================================================================
  console.log(`\n=== SEED CONTENT terminé : ${created} créé(s), ${skipped} ignoré(s) ===`);
}

main()
  .catch((e) => {
    console.error('Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
