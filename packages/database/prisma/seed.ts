// =============================================================================
// OMNITECH Security Intranet — Database Seed
// ISO 27001:2022 Compliant Document Management System
// =============================================================================

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Pre-computed bcrypt hash for "Admin123!" (cost factor 10)
const ADMIN_PASSWORD_HASH =
  '$2b$10$EIXe0Q5VDWDiHhg4GOpVOeZzKZmhHsOYNIxnyOCOAqNMVAo/1jIPi';

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

const departments = [
  { name: 'Direction des Systemes d\'Information', code: 'DSI' },
  { name: 'Ressources Humaines', code: 'RH' },
  { name: 'Direction Generale', code: 'DIRECTION' },
  { name: 'Commercial', code: 'COMMERCIAL' },
  { name: 'Operations', code: 'OPERATIONS' },
  { name: 'Juridique', code: 'JURIDIQUE' },
];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  departmentCode: string;
}

const users: SeedUser[] = [
  { email: 'julien@omnitech-security.fr', firstName: 'Julien', lastName: 'Moreau', role: 'SUPER_ADMIN', departmentCode: 'DSI' },
  { email: 'damien@omnitech-security.fr', firstName: 'Damien', lastName: 'Leroy', role: 'DIRECTION', departmentCode: 'DIRECTION' },
  { email: 'renaud@omnitech-security.fr', firstName: 'Renaud', lastName: 'Dupont', role: 'DIRECTION', departmentCode: 'DIRECTION' },
  { email: 'alexandre@omnitech-security.fr', firstName: 'Alexandre', lastName: 'Bernard', role: 'DIRECTION', departmentCode: 'DIRECTION' },
  { email: 'estelle@omnitech-security.fr', firstName: 'Estelle', lastName: 'Martin', role: 'REVIEWER', departmentCode: 'DSI' },
  { email: 'sophie@omnitech-security.fr', firstName: 'Sophie', lastName: 'Duval', role: 'ADMIN', departmentCode: 'DSI' },
  { email: 'marc@omnitech-security.fr', firstName: 'Marc', lastName: 'Petit', role: 'COLLABORATEUR', departmentCode: 'COMMERCIAL' },
  { email: 'claire@omnitech-security.fr', firstName: 'Claire', lastName: 'Robert', role: 'COLLABORATEUR', departmentCode: 'RH' },
  { email: 'thomas@omnitech-security.fr', firstName: 'Thomas', lastName: 'Garnier', role: 'COLLABORATEUR', departmentCode: 'OPERATIONS' },
  { email: 'audrey@omnitech-security.fr', firstName: 'Audrey', lastName: 'Faure', role: 'AUDITEUR', departmentCode: 'JURIDIQUE' },
  { email: 'prestataire@cheops.fr', firstName: 'Jean', lastName: 'Dupont', role: 'PRESTATAIRE', departmentCode: '' },
];

// ---------------------------------------------------------------------------
// ISO 27001:2022 Annex A Controls — All 93 Controls
// ---------------------------------------------------------------------------

interface IsoControlSeed {
  code: string;
  title: string;
  domain: string;
}

const isoControls: IsoControlSeed[] = [
  // =========================================================================
  // A.5 — Organizational controls (37 controls)
  // =========================================================================
  { code: 'A.5.1',  title: 'Policies for information security',                  domain: 'A.5 Organizational controls' },
  { code: 'A.5.2',  title: 'Information security roles and responsibilities',    domain: 'A.5 Organizational controls' },
  { code: 'A.5.3',  title: 'Segregation of duties',                              domain: 'A.5 Organizational controls' },
  { code: 'A.5.4',  title: 'Management responsibilities',                        domain: 'A.5 Organizational controls' },
  { code: 'A.5.5',  title: 'Contact with authorities',                           domain: 'A.5 Organizational controls' },
  { code: 'A.5.6',  title: 'Contact with special interest groups',               domain: 'A.5 Organizational controls' },
  { code: 'A.5.7',  title: 'Threat intelligence',                                domain: 'A.5 Organizational controls' },
  { code: 'A.5.8',  title: 'Information security in project management',         domain: 'A.5 Organizational controls' },
  { code: 'A.5.9',  title: 'Inventory of information and other associated assets', domain: 'A.5 Organizational controls' },
  { code: 'A.5.10', title: 'Acceptable use of information and other associated assets', domain: 'A.5 Organizational controls' },
  { code: 'A.5.11', title: 'Return of assets',                                   domain: 'A.5 Organizational controls' },
  { code: 'A.5.12', title: 'Classification of information',                      domain: 'A.5 Organizational controls' },
  { code: 'A.5.13', title: 'Labelling of information',                           domain: 'A.5 Organizational controls' },
  { code: 'A.5.14', title: 'Information transfer',                               domain: 'A.5 Organizational controls' },
  { code: 'A.5.15', title: 'Access control',                                     domain: 'A.5 Organizational controls' },
  { code: 'A.5.16', title: 'Identity management',                                domain: 'A.5 Organizational controls' },
  { code: 'A.5.17', title: 'Authentication information',                         domain: 'A.5 Organizational controls' },
  { code: 'A.5.18', title: 'Access rights',                                      domain: 'A.5 Organizational controls' },
  { code: 'A.5.19', title: 'Information security in supplier relationships',     domain: 'A.5 Organizational controls' },
  { code: 'A.5.20', title: 'Addressing information security within supplier agreements', domain: 'A.5 Organizational controls' },
  { code: 'A.5.21', title: 'Managing information security in the ICT supply chain', domain: 'A.5 Organizational controls' },
  { code: 'A.5.22', title: 'Monitoring, review and change management of supplier services', domain: 'A.5 Organizational controls' },
  { code: 'A.5.23', title: 'Information security for use of cloud services',     domain: 'A.5 Organizational controls' },
  { code: 'A.5.24', title: 'Information security incident management planning and preparation', domain: 'A.5 Organizational controls' },
  { code: 'A.5.25', title: 'Assessment and decision on information security events', domain: 'A.5 Organizational controls' },
  { code: 'A.5.26', title: 'Response to information security incidents',         domain: 'A.5 Organizational controls' },
  { code: 'A.5.27', title: 'Learning from information security incidents',       domain: 'A.5 Organizational controls' },
  { code: 'A.5.28', title: 'Collection of evidence',                             domain: 'A.5 Organizational controls' },
  { code: 'A.5.29', title: 'Information security during disruption',             domain: 'A.5 Organizational controls' },
  { code: 'A.5.30', title: 'ICT readiness for business continuity',              domain: 'A.5 Organizational controls' },
  { code: 'A.5.31', title: 'Legal, statutory, regulatory and contractual requirements', domain: 'A.5 Organizational controls' },
  { code: 'A.5.32', title: 'Intellectual property rights',                       domain: 'A.5 Organizational controls' },
  { code: 'A.5.33', title: 'Protection of records',                              domain: 'A.5 Organizational controls' },
  { code: 'A.5.34', title: 'Privacy and protection of personal identifiable information (PII)', domain: 'A.5 Organizational controls' },
  { code: 'A.5.35', title: 'Independent review of information security',         domain: 'A.5 Organizational controls' },
  { code: 'A.5.36', title: 'Compliance with policies, rules and standards for information security', domain: 'A.5 Organizational controls' },
  { code: 'A.5.37', title: 'Documented operating procedures',                    domain: 'A.5 Organizational controls' },

  // =========================================================================
  // A.6 — People controls (8 controls)
  // =========================================================================
  { code: 'A.6.1', title: 'Screening',                                           domain: 'A.6 People controls' },
  { code: 'A.6.2', title: 'Terms and conditions of employment',                  domain: 'A.6 People controls' },
  { code: 'A.6.3', title: 'Information security awareness, education and training', domain: 'A.6 People controls' },
  { code: 'A.6.4', title: 'Disciplinary process',                                domain: 'A.6 People controls' },
  { code: 'A.6.5', title: 'Responsibilities after termination or change of employment', domain: 'A.6 People controls' },
  { code: 'A.6.6', title: 'Confidentiality or non-disclosure agreements',        domain: 'A.6 People controls' },
  { code: 'A.6.7', title: 'Remote working',                                      domain: 'A.6 People controls' },
  { code: 'A.6.8', title: 'Information security event reporting',                domain: 'A.6 People controls' },

  // =========================================================================
  // A.7 — Physical controls (14 controls)
  // =========================================================================
  { code: 'A.7.1',  title: 'Physical security perimeters',                       domain: 'A.7 Physical controls' },
  { code: 'A.7.2',  title: 'Physical entry',                                     domain: 'A.7 Physical controls' },
  { code: 'A.7.3',  title: 'Securing offices, rooms and facilities',             domain: 'A.7 Physical controls' },
  { code: 'A.7.4',  title: 'Physical security monitoring',                       domain: 'A.7 Physical controls' },
  { code: 'A.7.5',  title: 'Protecting against physical and environmental threats', domain: 'A.7 Physical controls' },
  { code: 'A.7.6',  title: 'Working in secure areas',                            domain: 'A.7 Physical controls' },
  { code: 'A.7.7',  title: 'Clear desk and clear screen',                        domain: 'A.7 Physical controls' },
  { code: 'A.7.8',  title: 'Equipment siting and protection',                    domain: 'A.7 Physical controls' },
  { code: 'A.7.9',  title: 'Security of assets off-premises',                    domain: 'A.7 Physical controls' },
  { code: 'A.7.10', title: 'Storage media',                                      domain: 'A.7 Physical controls' },
  { code: 'A.7.11', title: 'Supporting utilities',                               domain: 'A.7 Physical controls' },
  { code: 'A.7.12', title: 'Cabling security',                                   domain: 'A.7 Physical controls' },
  { code: 'A.7.13', title: 'Equipment maintenance',                              domain: 'A.7 Physical controls' },
  { code: 'A.7.14', title: 'Secure disposal or re-use of equipment',             domain: 'A.7 Physical controls' },

  // =========================================================================
  // A.8 — Technological controls (34 controls)
  // =========================================================================
  { code: 'A.8.1',  title: 'User endpoint devices',                              domain: 'A.8 Technological controls' },
  { code: 'A.8.2',  title: 'Privileged access rights',                           domain: 'A.8 Technological controls' },
  { code: 'A.8.3',  title: 'Information access restriction',                     domain: 'A.8 Technological controls' },
  { code: 'A.8.4',  title: 'Access to source code',                              domain: 'A.8 Technological controls' },
  { code: 'A.8.5',  title: 'Secure authentication',                              domain: 'A.8 Technological controls' },
  { code: 'A.8.6',  title: 'Capacity management',                                domain: 'A.8 Technological controls' },
  { code: 'A.8.7',  title: 'Protection against malware',                         domain: 'A.8 Technological controls' },
  { code: 'A.8.8',  title: 'Management of technical vulnerabilities',            domain: 'A.8 Technological controls' },
  { code: 'A.8.9',  title: 'Configuration management',                           domain: 'A.8 Technological controls' },
  { code: 'A.8.10', title: 'Information deletion',                               domain: 'A.8 Technological controls' },
  { code: 'A.8.11', title: 'Data masking',                                       domain: 'A.8 Technological controls' },
  { code: 'A.8.12', title: 'Data leakage prevention',                            domain: 'A.8 Technological controls' },
  { code: 'A.8.13', title: 'Information backup',                                 domain: 'A.8 Technological controls' },
  { code: 'A.8.14', title: 'Redundancy of information processing facilities',    domain: 'A.8 Technological controls' },
  { code: 'A.8.15', title: 'Logging',                                            domain: 'A.8 Technological controls' },
  { code: 'A.8.16', title: 'Monitoring activities',                              domain: 'A.8 Technological controls' },
  { code: 'A.8.17', title: 'Clock synchronization',                              domain: 'A.8 Technological controls' },
  { code: 'A.8.18', title: 'Use of privileged utility programs',                 domain: 'A.8 Technological controls' },
  { code: 'A.8.19', title: 'Installation of software on operational systems',    domain: 'A.8 Technological controls' },
  { code: 'A.8.20', title: 'Networks security',                                  domain: 'A.8 Technological controls' },
  { code: 'A.8.21', title: 'Security of network services',                       domain: 'A.8 Technological controls' },
  { code: 'A.8.22', title: 'Segregation of networks',                            domain: 'A.8 Technological controls' },
  { code: 'A.8.23', title: 'Web filtering',                                      domain: 'A.8 Technological controls' },
  { code: 'A.8.24', title: 'Use of cryptography',                                domain: 'A.8 Technological controls' },
  { code: 'A.8.25', title: 'Secure development life cycle',                      domain: 'A.8 Technological controls' },
  { code: 'A.8.26', title: 'Application security requirements',                  domain: 'A.8 Technological controls' },
  { code: 'A.8.27', title: 'Secure system architecture and engineering principles', domain: 'A.8 Technological controls' },
  { code: 'A.8.28', title: 'Secure coding',                                      domain: 'A.8 Technological controls' },
  { code: 'A.8.29', title: 'Security testing in development and acceptance',     domain: 'A.8 Technological controls' },
  { code: 'A.8.30', title: 'Outsourced development',                             domain: 'A.8 Technological controls' },
  { code: 'A.8.31', title: 'Separation of development, test and production environments', domain: 'A.8 Technological controls' },
  { code: 'A.8.32', title: 'Change management',                                  domain: 'A.8 Technological controls' },
  { code: 'A.8.33', title: 'Test information',                                   domain: 'A.8 Technological controls' },
  { code: 'A.8.34', title: 'Protection of information systems during audit testing', domain: 'A.8 Technological controls' },
];

// ---------------------------------------------------------------------------
// AppConfig entries
// ---------------------------------------------------------------------------

const appConfigs = [
  { key: 'app_name',              value: 'OMNITECH Intranet',                     description: 'Application display name' },
  { key: 'app_url',               value: 'https://intranet.omnitech-security.fr', description: 'Public application URL' },
  { key: 'smtp_host',             value: 'smtp.omnitech-security.fr',             description: 'SMTP server hostname' },
  { key: 'smtp_port',             value: '587',                                   description: 'SMTP server port' },
  { key: 'smtp_from',             value: 'noreply@omnitech-security.fr',          description: 'Default sender email address' },
  { key: 'docuseal_url',          value: 'https://docuseal.omnitech-security.fr', description: 'DocuSeal instance URL for electronic signatures' },
  { key: 'docuseal_api_key',      value: 'CHANGE_ME',                             description: 'DocuSeal API key (change in production)' },
  { key: 'review_reminder_days',  value: '30',                                    description: 'Days before next review date to send reminder' },
  { key: 'session_timeout_hours', value: '8',                                     description: 'User session timeout in hours' },
  { key: 'max_upload_size_mb',    value: '50',                                    description: 'Maximum file upload size in megabytes' },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding OMNITECH Intranet database...\n');

  // 1. Departments
  console.log('Creating departments...');
  const deptMap: Record<string, string> = {};
  for (const dept of departments) {
    const created = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
    deptMap[dept.code] = created.id;
    console.log(`  [+] ${dept.code} — ${dept.name}`);
  }

  // 2. Users
  console.log('\nCreating users...');
  for (const u of users) {
    const departmentId = u.departmentCode ? deptMap[u.departmentCode] : null;
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        departmentId,
      },
      create: {
        email: u.email,
        passwordHash: ADMIN_PASSWORD_HASH,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        departmentId,
        gdprConsentAt: new Date(),
        gdprConsentIp: '127.0.0.1',
      },
    });
    console.log(`  [+] ${u.email} (${u.role})`);
  }

  // Create external access for prestataire
  const prestataireUser = await prisma.user.findUnique({ where: { email: 'prestataire@cheops.fr' } });
  if (prestataireUser) {
    await prisma.externalAccess.upsert({
      where: { id: 'seed-external-access' },
      create: {
        id: 'seed-external-access',
        userId: prestataireUser.id,
        companyName: 'CHEOPS Technology',
        contractRef: 'CTR-CHEOPS-2024-001',
        accessExpiresAt: new Date('2027-06-30'),
        sessionTimeout: 1800,
        isActive: true,
      },
      update: {},
    });
    console.log(`  [+] ExternalAccess for prestataire@cheops.fr`);
  }

  // 3. ISO 27001:2022 Annex A Controls
  console.log('\nSeeding ISO 27001:2022 Annex A controls...');
  let controlCount = 0;
  for (const ctrl of isoControls) {
    await prisma.isoControl.upsert({
      where: { code: ctrl.code },
      update: { title: ctrl.title, domain: ctrl.domain },
      create: ctrl,
    });
    controlCount++;
  }
  console.log(`  [+] ${controlCount} controls seeded`);
  console.log(`      A.5 Organizational controls: 37`);
  console.log(`      A.6 People controls: 8`);
  console.log(`      A.7 Physical controls: 14`);
  console.log(`      A.8 Technological controls: 34`);

  // 4. AppConfig
  console.log('\nCreating application configuration...');
  for (const cfg of appConfigs) {
    await prisma.appConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, description: cfg.description },
      create: cfg,
    });
    console.log(`  [+] ${cfg.key} = ${cfg.value}`);
  }

  // 5. Compliance Tasks
  console.log('\nSeeding compliance tasks...');
  const complianceTasks = [
    { title: 'Revue PSSI et politiques de sécurité', frequency: 'ANNUAL', isoControl: 'A.5.1' },
    { title: 'Tests de restauration VM (Veeam)', frequency: 'QUARTERLY', isoControl: 'A.8.13' },
    { title: 'Revue des accès et habilitations', frequency: 'QUARTERLY', isoControl: 'A.5.18' },
    { title: 'Test PCA/PRA', frequency: 'ANNUAL', isoControl: 'A.5.30' },
    { title: 'Audit interne ISO 27001', frequency: 'ANNUAL', isoControl: 'A.5.35' },
    { title: 'Revue règles firewall FortiGate', frequency: 'QUARTERLY', isoControl: 'A.8.20' },
    { title: 'Sauvegarde configs Switch/Firewall', frequency: 'MONTHLY', isoControl: 'A.8.13' },
    { title: 'Sensibilisation sécurité collaborateurs', frequency: 'SEMI_ANNUAL', isoControl: 'A.6.3' },
    { title: 'Revue des accès prestataires', frequency: 'MONTHLY', isoControl: 'A.5.19' },
    { title: 'Mise à jour inventaire des actifs', frequency: 'SEMI_ANNUAL', isoControl: 'A.5.9' },
  ];

  const existingTasks = await prisma.complianceTask.count();
  if (existingTasks === 0) {
    const now = new Date();
    for (const t of complianceTasks) {
      const nextDueDate = new Date(now);
      switch (t.frequency) {
        case 'MONTHLY': nextDueDate.setMonth(nextDueDate.getMonth() + 1); break;
        case 'QUARTERLY': nextDueDate.setMonth(nextDueDate.getMonth() + 3); break;
        case 'SEMI_ANNUAL': nextDueDate.setMonth(nextDueDate.getMonth() + 6); break;
        case 'ANNUAL': nextDueDate.setFullYear(nextDueDate.getFullYear() + 1); break;
      }
      await prisma.complianceTask.create({
        data: {
          title: t.title,
          frequency: t.frequency,
          isoControl: t.isoControl,
          nextDueDate,
          status: 'TODO',
        },
      });
      console.log(`  [+] ${t.title} (${t.frequency})`);
    }
  } else {
    console.log(`  [~] Compliance tasks already exist (${existingTasks}), skipping.`);
  }

  // 6. Wiki Pages
  console.log('\nSeeding wiki pages...');
  const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (adminUser) {
    const wikiPages = [
      {
        title: 'Guide du nouvel arrivant',
        slug: 'guide-nouvel-arrivant',
        category: 'RH',
        content: `<h2>Bienvenue chez OMNITECH Security</h2>
<p>Ce guide a pour objectif de faciliter votre intégration au sein de l'entreprise. Vous y trouverez toutes les informations essentielles pour bien démarrer.</p>

<h3>1. Vos premiers jours</h3>
<ul>
  <li><strong>Accueil RH</strong> : Rendez-vous au bureau RH pour signer votre contrat, récupérer votre badge d'accès et votre kit de bienvenue.</li>
  <li><strong>Poste de travail</strong> : Le service DSI vous remettra votre ordinateur portable avec Windows pré-configuré, ESET Endpoint Security installé et votre compte Active Directory activé.</li>
  <li><strong>Messagerie</strong> : Votre adresse email <code>prenom@omnitech-security.fr</code> est déjà créée. Connectez-vous via Outlook.</li>
</ul>

<h3>2. Accès aux systèmes</h3>
<ul>
  <li><strong>Intranet</strong> : Accessible à <code>https://intranet.omnitech-security.fr</code>. Utilisez vos identifiants Active Directory.</li>
  <li><strong>VPN</strong> : FortiClient SSL VPN est obligatoire pour le télétravail. Demandez vos accès VPN via un ticket IT.</li>
  <li><strong>MFA</strong> : L'authentification multi-facteur sera configurée lors de votre première connexion. Conservez précieusement vos 8 codes de secours.</li>
</ul>

<h3>3. Sécurité de l'information</h3>
<p>OMNITECH Security applique une Politique de Sécurité du Système d'Information (PSSI) validée par la Direction, conforme à ISO 27001:2022, à la directive NIS2 et aux référentiels ANSSI. Chaque collaborateur doit :</p>
<ul>
  <li>Lire et signer la PSSI et la charte informatique lors de la première connexion à l'intranet</li>
  <li>Verrouiller son poste dès qu'il quitte son bureau (Windows + L)</li>
  <li>Ne jamais partager ses identifiants — l'authentification AD s'appuie sur RADIUS 802.1X</li>
  <li>Signaler tout email suspect au RSSI (les emails sont protégés par DKIM/SPF/DMARC)</li>
  <li>Compléter le quiz de sensibilisation sécurité (charte informatique) dans les 30 jours</li>
</ul>

<h3>4. Outils au quotidien</h3>
<table>
  <thead><tr><th>Outil</th><th>Usage</th><th>Accès</th></tr></thead>
  <tbody>
    <tr><td>Intranet</td><td>Wiki, actualités, tickets IT, annuaire</td><td>Navigateur web</td></tr>
    <tr><td>SEAL System</td><td>ERP sûreté (projets clients)</td><td>Application dédiée</td></tr>
    <tr><td>FortiClient VPN</td><td>Accès distant sécurisé</td><td>Client VPN installé</td></tr>
    <tr><td>DocuSeal</td><td>Signature électronique</td><td>Via l'intranet</td></tr>
  </tbody>
</table>

<h3>5. Contacts utiles</h3>
<ul>
  <li><strong>Support IT</strong> : Créez un ticket via l'intranet (section Helpdesk)</li>
  <li><strong>RH</strong> : <code>rh@omnitech-security.fr</code></li>
  <li><strong>RSSI</strong> : Julien Moreau — <code>julien@omnitech-security.fr</code></li>
</ul>`,
      },
      {
        title: 'Contacts urgence IT',
        slug: 'contacts-urgence',
        category: 'IT',
        content: `<h2>Contacts urgence</h2>
<h3>Support CHEOPS (MSP)</h3>
<ul>
  <li><strong>Zakaria TEGUIA</strong> — Responsable MSP</li>
  <li>Email : z.teguia@cheops.fr</li>
</ul>
<h3>RSSI</h3>
<ul>
  <li><strong>Julien MORIN</strong> — jmorin@omnitech-security.fr</li>
</ul>`,
      },
      {
        title: 'FAQ Télétravail',
        slug: 'faq-teletravail',
        category: 'RH',
        content: `<h2>FAQ Télétravail</h2>
<h3>Connexion ?</h3>
<p>VPN FortiClient SSL obligatoire.</p>
<h3>Outils ?</h3>
<ul><li>VPN + Outlook + Teams + Intranet</li></ul>`,
      },
      {
        title: 'Charte messagerie',
        slug: 'charte-messagerie',
        category: 'Sécurité',
        content: `<h2>Règles messagerie</h2>
<ul>
  <li>Pas de données confidentielles sans chiffrement</li>
  <li>Vérifier l'expéditeur (les emails OMNITECH sont protégés par DKIM, SPF et DMARC)</li>
  <li>Signaler tout email suspect au RSSI</li>
</ul>`,
      },
      {
        title: 'Politique de Sécurité du Système d\'Information (PSSI)',
        slug: 'pssi',
        category: 'Sécurité',
        content: `<h2>Politique de Sécurité du Système d'Information</h2>
<p>La PSSI d'OMNITECH Security constitue le document de référence de la gouvernance sécurité. Elle est validée par la Direction et révisée annuellement (ISO 27001:2022 — A.5.1).</p>

<h3>Cadre réglementaire et normatif</h3>
<ul>
  <li><strong>ISO 27001:2022</strong> — Système de Management de la Sécurité de l'Information (SMSI)</li>
  <li><strong>Directive NIS2</strong> (2022/2555) — Exigences de cybersécurité pour les entités importantes</li>
  <li><strong>ANSSI</strong> — Guide d'hygiène informatique et recommandations applicables</li>
  <li><strong>EBIOS Risk Manager</strong> — Méthode d'analyse de risques retenue pour l'identification et le traitement des risques SI</li>
</ul>

<h3>Infrastructure de sécurité opérationnelle</h3>
<ul>
  <li><strong>Pare-feu</strong> : Fortinet FortiGate — filtrage périmétrique et inspection applicative</li>
  <li><strong>Protection des postes</strong> : ESET Endpoint Security (antivirus / EDR)</li>
  <li><strong>Détection des incidents</strong> : SIEM Wazuh — corrélation d'événements et alertes en temps réel</li>
  <li><strong>Supervision</strong> : Centreon — monitoring des services et équipements critiques</li>
  <li><strong>Accès réseau</strong> : Active Directory avec authentification RADIUS 802.1X</li>
  <li><strong>Accès distant</strong> : VPN SSL/IPSec via FortiClient</li>
  <li><strong>Messagerie</strong> : Protection DKIM / SPF / DMARC contre l'usurpation d'identité</li>
</ul>

<h3>Gouvernance sécurité</h3>
<ul>
  <li><strong>RSSI</strong> : Responsable de la politique de sécurité et du SMSI</li>
  <li><strong>Sensibilisation</strong> : Programme annuel de formation (charte informatique, quiz sécurité)</li>
  <li><strong>Revue annuelle</strong> : La PSSI et les politiques associées sont révisées chaque année par le RSSI et validées par la Direction</li>
</ul>

<p><em>Référence : ISO 27001:2022 — A.5.1 (Politiques de sécurité) | Directive NIS2 — Art. 21(2)(a)</em></p>`,
      },
      {
        title: 'Procédure de signalement incident',
        slug: 'procedure-signalement-incident',
        category: 'Sécurité',
        content: `<h2>Procédure de signalement d'incident de sécurité</h2>
<p>Conformément à la norme ISO 27001:2022 (contrôle A.5.24 — Gestion des incidents de sécurité de l'information), tout collaborateur doit signaler immédiatement tout incident ou suspicion d'incident.</p>

<h3>1. Qu'est-ce qu'un incident de sécurité ?</h3>
<ul>
  <li>Réception d'un email de phishing ou d'une pièce jointe suspecte</li>
  <li>Comportement anormal de votre poste de travail (lenteur soudaine, pop-ups, programmes inconnus)</li>
  <li>Perte ou vol d'un équipement (ordinateur, téléphone, clé USB)</li>
  <li>Accès non autorisé constaté (compte compromis, accès physique suspect)</li>
  <li>Divulgation accidentelle de données confidentielles</li>
  <li>Panne ou indisponibilité d'un service critique</li>
</ul>

<h3>2. Étapes de signalement</h3>
<ol>
  <li><strong>Étape 1 — Identifier</strong> : Notez l'heure, la nature de l'incident, les systèmes ou données concernés.</li>
  <li><strong>Étape 2 — Isoler</strong> : Si possible, déconnectez l'équipement du réseau (débranchez le câble Ethernet ou désactivez le Wi-Fi). Ne l'éteignez <strong>pas</strong>.</li>
  <li><strong>Étape 3 — Signaler</strong> : Créez un ticket dans l'intranet :
    <ul>
      <li>Section : <strong>Helpdesk</strong></li>
      <li>Catégorie : <strong>SECURITY</strong></li>
      <li>Priorité : <strong>P1</strong> (critique) ou <strong>P2</strong> (urgent) selon la gravité</li>
    </ul>
  </li>
  <li><strong>Étape 4 — Informer</strong> : Prévenez votre responsable hiérarchique et le RSSI par téléphone si l'incident est critique (P1).</li>
  <li><strong>Étape 5 — Documenter</strong> : Conservez toute preuve (captures d'écran, emails, logs) sans modifier les fichiers concernés.</li>
</ol>

<h3>3. Délais de signalement</h3>
<table>
  <thead><tr><th>Niveau</th><th>Délai maximum</th><th>Exemple</th></tr></thead>
  <tbody>
    <tr><td><strong>P1 — Critique</strong></td><td>Immédiat (< 1h)</td><td>Ransomware, fuite de données, intrusion active</td></tr>
    <tr><td><strong>P2 — Urgent</strong></td><td>4 heures</td><td>Phishing ciblé, compte compromis, perte d'équipement</td></tr>
    <tr><td><strong>P3 — Normal</strong></td><td>24 heures</td><td>Email suspect isolé, anomalie mineure</td></tr>
  </tbody>
</table>

<h3>4. Ce qu'il ne faut PAS faire</h3>
<ul>
  <li>Ne tentez <strong>pas</strong> de résoudre l'incident seul</li>
  <li>Ne supprimez <strong>pas</strong> les emails suspects — transférez-les au RSSI</li>
  <li>Ne branchez <strong>pas</strong> de clé USB inconnue</li>
  <li>Ne communiquez <strong>pas</strong> sur l'incident en dehors des canaux autorisés</li>
</ul>

<h3>5. Suivi et clôture</h3>
<p>Le RSSI coordonne la réponse à l'incident. Un rapport post-incident est rédigé dans les 72 heures incluant :</p>
<ul>
  <li>Chronologie des événements</li>
  <li>Impact constaté</li>
  <li>Actions correctives mises en place</li>
  <li>Recommandations pour éviter la récurrence</li>
</ul>
<p><em>Référence : ISO 27001:2022 — A.5.24, A.5.25, A.5.26, A.5.27</em></p>`,
      },
    ];

    for (const page of wikiPages) {
      const existing = await prisma.wikiPage.findUnique({ where: { slug: page.slug } });
      if (!existing) {
        await prisma.wikiPage.create({
          data: {
            title: page.title,
            slug: page.slug,
            category: page.category,
            content: page.content,
            authorId: adminUser.id,
            isPublished: true,
          },
        });
        console.log(`  [+] Wiki: ${page.title}`);
      } else {
        console.log(`  [~] Wiki: ${page.title} already exists, skipping.`);
      }
    }
  } else {
    console.log('  [!] No admin user found — skipping wiki pages.');
  }

  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
