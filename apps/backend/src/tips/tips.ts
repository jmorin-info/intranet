export interface ChangelogEntry {
  date: string; // ISO date
  version: string;
  title: string;
  description: string;
  type: 'feature' | 'fix' | 'improvement' | 'security' | 'ui';
}

export const CHANGELOG: ChangelogEntry[] = [
  // === Version 3.2 — Avril 2026 ===
  { date: '2026-04-12', version: '3.2', title: 'PWA offline + installation', description: 'Service Worker stale-while-revalidate, page offline, bannière d\'installation PWA, manifest enrichi.', type: 'improvement' },
  { date: '2026-04-12', version: '3.2', title: 'Filtres sauvegardables', description: 'Sauvegardez vos combinaisons de filtres préférées sur Documents, Tickets, Incidents.', type: 'feature' },
  { date: '2026-04-12', version: '3.2', title: 'Raccourcis clavier globaux', description: 'Ctrl+Shift+D/T/I/N/W/P pour naviguer rapidement. Appuyez sur ? pour la liste.', type: 'improvement' },
  { date: '2026-04-12', version: '3.2', title: 'Notifications email enrichies', description: 'Templates spécialisés par type, badges colorés, digest quotidien, préférences de notification.', type: 'feature' },
  { date: '2026-04-12', version: '3.2', title: 'Import CSV utilisateurs', description: 'Importez des utilisateurs en masse via fichier CSV avec validation et preview.', type: 'feature' },
  { date: '2026-04-12', version: '3.2', title: 'Calendrier événements custom', description: 'Créez des événements (audits, formations, comités) directement dans le calendrier.', type: 'feature' },
  { date: '2026-04-12', version: '3.2', title: 'Templates de tickets', description: '10 modèles prédéfinis pour créer des tickets rapidement (accès, matériel, VPN, incident...).', type: 'feature' },
  { date: '2026-04-12', version: '3.2', title: 'Cohérence UX globale', description: 'Harmonisation typographie, dark mode, couleurs, accessibilité sur toutes les pages.', type: 'ui' },
  { date: '2026-04-12', version: '3.2', title: 'Recherche globale améliorée', description: 'Filtres avancés (type, période, tri), suggestions populaires, incidents dans les résultats.', type: 'improvement' },
  { date: '2026-04-12', version: '3.2', title: 'Préférences de notification', description: 'Désactivez les emails par type depuis votre profil (sauf alertes sécurité, toujours envoyées).', type: 'feature' },

  // === Version 3.1 — Avril 2026 ===
  { date: '2026-04-12', version: '3.1', title: 'OnlyOffice Docs intégré', description: 'Éditez les fichiers Word, Excel, PowerPoint directement dans l\'intranet via OnlyOffice (focus mode).', type: 'feature' },
  { date: '2026-04-12', version: '3.1', title: 'Stirling PDF natif', description: 'Suite complète d\'outils PDF (merge, split, OCR, compress, filigrane) en iframe avec barre d\'outils rapide.', type: 'feature' },
  { date: '2026-04-12', version: '3.1', title: 'Focus mode éditeurs', description: 'Les éditeurs OnlyOffice et Stirling passent automatiquement en plein écran sans sidebar/header.', type: 'ui' },
  { date: '2026-04-12', version: '3.1', title: 'Suggestions de refus GED', description: '23 suggestions structurées (forme, fond, conformité, sécurité) pour guider le rédacteur lors d\'un refus.', type: 'feature' },
  { date: '2026-04-12', version: '3.1', title: 'Fix MFA LDAP', description: 'Correction du bug où le MFA n\'était jamais demandé pour les utilisateurs authentifiés via LDAP.', type: 'fix' },
  { date: '2026-04-12', version: '3.1', title: 'Sécurité signatures renforcée', description: 'Impossible de signer à la place d\'un autre utilisateur + audit des tentatives interdites.', type: 'security' },

  // === Version 3.0 — Avril 2026 ===
  { date: '2026-04-10', version: '3.0', title: 'Module Incidents', description: 'Gestion complète des incidents de sécurité : signalement, workflow, remédiations, timeline (ISO 27001 A.5.24).', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Module IT Exports', description: '16 catégories de preuves ISO (AD audit, Fortigate, Veeam, pentest) avec drag-and-drop.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Wiki collaboratif', description: 'Pages personnelles, édition avec verrou, historique des versions, partage par visibilité.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Tickets par département', description: 'Filtrage et routage des tickets par département avec configuration des espaces et modules.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Revue périodique des accès', description: 'Campagnes trimestrielles de revue des droits d\'accès (ISO 27001 A.5.18).', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Web Push VAPID', description: 'Notifications push navigateur pour les alertes critiques, tickets et signatures.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Politique de rétention', description: 'Archivage et suppression automatique des documents et audit logs (ISO 27001 A.5.33).', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Workflow GED refondu', description: 'Cycle à 5 étapes avec statut REVIEW_APPROVED — seul le rédacteur lance l\'approbation.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Dashboard SMSI par rôle', description: '6 KPIs sécurité avec filtrage par rôle (full/mid/min scope).', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Charte SEAL System', description: 'Couleurs PANTONE officielles, gradient signature, composants .seal-* intégrés.', type: 'ui' },
  { date: '2026-04-10', version: '3.0', title: 'Script Veeam PowerShell', description: 'Rapport mensuel des sauvegardes Veeam B&R avec upload automatique vers l\'intranet.', type: 'feature' },
  { date: '2026-04-10', version: '3.0', title: 'Sécurité renforcée', description: 'SQL injection fix, path traversal fix, Helmet CSP, rate limiting, ParseUUIDPipe, audit actorSnapshot.', type: 'security' },

  // === Version 2.x ===
  { date: '2026-04-08', version: '2.5', title: 'Module IA intégré', description: 'Recherche intelligente multi-sources, analyse de tickets, recommandations personnalisées.', type: 'feature' },
  { date: '2026-04-08', version: '2.5', title: 'Vues Kanban documents et conformité', description: 'Drag-and-drop pour les documents et les tâches de conformité.', type: 'feature' },
  { date: '2026-04-08', version: '2.5', title: 'Wiki interne WYSIWYG', description: 'Créez et éditez des pages wiki avec un éditeur visuel.', type: 'feature' },
  { date: '2026-04-07', version: '2.4', title: 'Bannières P1/P2/P3', description: 'Système de bannières prioritaires pour les communications critiques.', type: 'feature' },
  { date: '2026-04-07', version: '2.4', title: 'Planning conformité', description: '10 tâches ISO avec suivi des échéances et rappels automatiques.', type: 'feature' },
  { date: '2026-04-07', version: '2.4', title: 'Annuaire et organigramme', description: 'Trombinoscope collaborateurs avec filtres et arbre hiérarchique.', type: 'feature' },
  { date: '2026-04-07', version: '2.3', title: 'Photo de profil', description: 'Uploadez votre photo de profil depuis la page Mon profil.', type: 'feature' },
  { date: '2026-04-07', version: '2.3', title: 'Contacts externes', description: 'Répertoire prestataires (CHEOPS, ESET, Fortinet) avec badges astreinte.', type: 'feature' },
  { date: '2026-04-06', version: '2.2', title: 'Raccourcis clavier', description: 'Appuyez sur ? pour voir tous les raccourcis (Ctrl+K, Ctrl+/, etc.).', type: 'improvement' },
  { date: '2026-04-06', version: '2.2', title: '6 sources de veille', description: 'CERT-FR, CVE Feed, The Hacker News, BleepingComputer — 659+ alertes.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Multi-quiz campaigns', description: 'Créez plusieurs quiz de sensibilisation avec des questions personnalisées.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Enquêtes Google Forms', description: 'Créez des enquêtes avec 5 types de questions : étoiles, texte, QCM, échelle, oui/non.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Référentiels multi-framework', description: 'NIST CSF, NIS2, ANSSI — suivez votre conformité sur plusieurs référentiels.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Notifications email', description: 'Recevez les notifications importantes par email automatiquement.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Système d\'astuces', description: 'Des astuces contextuelles apparaissent pour vous guider.', type: 'improvement' },
  { date: '2026-04-05', version: '2.0', title: 'Prévisualisation PDF/DOCX', description: 'Visualisez les documents directement dans le navigateur.', type: 'feature' },
  { date: '2026-04-05', version: '2.0', title: 'Kanban drag-and-drop', description: 'Déplacez les tickets entre colonnes par glisser-déposer.', type: 'feature' },
  { date: '2026-04-05', version: '1.9', title: 'Audit Active Directory', description: 'Script PowerShell v5 pour auditer l\'AD avec intégration intranet.', type: 'feature' },
  { date: '2026-04-04', version: '1.8', title: 'Scan conformité documents', description: 'Extraction de texte PDF/DOCX et mapping ISO automatique.', type: 'feature' },
  { date: '2026-04-04', version: '1.7', title: 'Contrôles ISO en français', description: '93 contrôles traduits avec titres FR dans toute l\'interface.', type: 'improvement' },
];

export interface Tip {
  id: string;
  title: string;
  body: string;
  icon: string; // lucide icon name
  targetRoles: string[]; // empty = all roles
  context: string; // 'welcome' | 'dashboard' | 'documents' | 'tickets' | 'general' | 'security' | 'admin'
  priority: number; // higher = shown first
}

export const TIPS: Tip[] = [
  // Welcome tips (first login)
  {
    id: 'welcome-1',
    title: "Bienvenue sur l'intranet",
    body: 'Explorez le tableau de bord pour voir vos documents, tickets et notifications en un coup d\'œil.',
    icon: 'Sparkles',
    targetRoles: [],
    context: 'welcome',
    priority: 100,
  },
  {
    id: 'welcome-mfa',
    title: 'Activez la double authentification',
    body: "Protégez votre compte en activant le MFA dans votre profil. C'est rapide et essentiel.",
    icon: 'Shield',
    targetRoles: [],
    context: 'welcome',
    priority: 90,
  },
  {
    id: 'welcome-chartes',
    title: 'Chartes à signer',
    body: 'Des chartes obligatoires peuvent nécessiter votre signature. Vérifiez dans la section Chartes.',
    icon: 'FileSignature',
    targetRoles: [],
    context: 'welcome',
    priority: 80,
  },

  // Dashboard tips
  {
    id: 'dash-search',
    title: 'Recherche rapide',
    body: 'Utilisez Ctrl+K pour ouvrir la recherche globale à tout moment.',
    icon: 'Search',
    targetRoles: [],
    context: 'dashboard',
    priority: 70,
  },
  {
    id: 'dash-widgets',
    title: 'Personnalisez votre tableau de bord',
    body: "Cliquez sur l'icône engrenage pour choisir les widgets affichés.",
    icon: 'Settings',
    targetRoles: [],
    context: 'dashboard',
    priority: 60,
  },

  // Document tips
  {
    id: 'doc-upload',
    title: 'Téléversez vos documents',
    body: 'Les documents PDF et DOCX sont automatiquement analysés pour la conformité.',
    icon: 'Upload',
    targetRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN'],
    context: 'documents',
    priority: 50,
  },
  {
    id: 'doc-version',
    title: 'Gestion des versions',
    body: "Chaque modification crée une nouvelle version. L'historique complet est consultable.",
    icon: 'History',
    targetRoles: [],
    context: 'documents',
    priority: 40,
  },

  // Ticket tips
  {
    id: 'ticket-sla',
    title: 'Délais de résolution',
    body: 'Les tickets CRITICAL doivent être traités sous 4h, HIGH sous 8h. Le SLA est affiché sur chaque ticket.',
    icon: 'Clock',
    targetRoles: [],
    context: 'tickets',
    priority: 50,
  },
  {
    id: 'ticket-category',
    title: 'Choisissez la bonne catégorie',
    body: 'Une catégorie précise permet un routage plus rapide vers le bon interlocuteur.',
    icon: 'Tag',
    targetRoles: [],
    context: 'tickets',
    priority: 40,
  },

  // Security tips
  {
    id: 'sec-phishing',
    title: 'Phishing',
    body: "Ne cliquez jamais sur un lien suspect. Transférez l'email au RSSI et créez un ticket SECURITY.",
    icon: 'AlertTriangle',
    targetRoles: [],
    context: 'security',
    priority: 80,
  },
  {
    id: 'sec-password',
    title: 'Mot de passe',
    body: 'Votre mot de passe doit faire 12 caractères minimum avec majuscules, minuscules, chiffres et spéciaux.',
    icon: 'Key',
    targetRoles: [],
    context: 'security',
    priority: 70,
  },
  {
    id: 'sec-lock',
    title: 'Verrouillez votre poste',
    body: 'Windows+L dès que vous quittez votre bureau, même brièvement.',
    icon: 'Lock',
    targetRoles: [],
    context: 'security',
    priority: 60,
  },
  {
    id: 'sec-usb',
    title: 'Clés USB inconnues',
    body: 'Ne branchez jamais une clé USB trouvée. Remettez-la au service IT.',
    icon: 'Usb',
    targetRoles: [],
    context: 'security',
    priority: 50,
  },

  // Admin tips
  {
    id: 'admin-compliance',
    title: 'Tableau de conformité',
    body: 'Lancez un scan des documents pour mettre à jour automatiquement le taux de couverture.',
    icon: 'BarChart',
    targetRoles: ['ADMIN', 'SUPER_ADMIN'],
    context: 'admin',
    priority: 60,
  },
  {
    id: 'admin-ldap',
    title: 'Synchronisation AD',
    body: 'La synchronisation LDAP tourne automatiquement à 2h30. Vous pouvez la forcer dans Configuration.',
    icon: 'RefreshCw',
    targetRoles: ['ADMIN', 'SUPER_ADMIN'],
    context: 'admin',
    priority: 50,
  },
  {
    id: 'admin-veille',
    title: 'Veille cybersécurité',
    body: 'Les flux CERT-FR sont mis à jour toutes les 2h. Un bulletin hebdomadaire est généré chaque lundi.',
    icon: 'Rss',
    targetRoles: ['ADMIN', 'SUPER_ADMIN', 'REVIEWER'],
    context: 'admin',
    priority: 40,
  },

  // Document workflow tips
  {
    id: 'doc-workflow',
    title: 'Soumettre un document pour validation',
    body: 'Pour soumettre un document, cliquez sur « Demander la validation ». Le reviewer désigné sera notifié et pourra approuver, demander des modifications ou rejeter.',
    icon: 'FileCheck',
    targetRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN'],
    context: 'documents',
    priority: 45,
  },

  // Survey participation tip
  {
    id: 'survey-participation',
    title: 'Enquêtes de satisfaction',
    body: 'Participez aux enquêtes internes pour améliorer notre environnement de travail. Vos réponses sont anonymes et prises en compte.',
    icon: 'MessageSquare',
    targetRoles: [],
    context: 'dashboard',
    priority: 45,
  },

  // Wiki contribution tip
  {
    id: 'wiki-contribute',
    title: 'Contribuez au Wiki',
    body: 'Le Wiki interne est collaboratif. Partagez vos connaissances en créant ou enrichissant des articles. Chaque contribution aide l\'équipe.',
    icon: 'BookOpen',
    targetRoles: ['COLLABORATEUR', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN'],
    context: 'general',
    priority: 40,
  },

  // Keyboard shortcuts tip
  {
    id: 'keyboard-shortcuts',
    title: 'Raccourcis clavier',
    body: 'Gagnez du temps : Ctrl+K ouvre la recherche globale, ? affiche tous les raccourcis disponibles.',
    icon: 'Keyboard',
    targetRoles: [],
    context: 'general',
    priority: 55,
  },

  // Dark mode tip
  {
    id: 'dark-mode',
    title: 'Mode sombre',
    body: 'Préférez travailler dans l\'obscurité ? Activez le mode sombre depuis les paramètres de votre profil ou via l\'icône en haut à droite.',
    icon: 'Moon',
    targetRoles: [],
    context: 'general',
    priority: 35,
  },

  // Profile completion tip
  {
    id: 'profile-complete',
    title: 'Complétez votre profil',
    body: 'Un profil complet (photo, téléphone, département) aide vos collègues à vous identifier et facilite la collaboration.',
    icon: 'UserCheck',
    targetRoles: [],
    context: 'welcome',
    priority: 70,
  },

  // Veille tip
  {
    id: 'veille-acknowledge',
    title: 'Alertes de veille cybersécurité',
    body: 'Quand une alerte veille vous concerne, cliquez sur « Acquitter » pour confirmer sa prise en compte. Les alertes non traitées remontent automatiquement.',
    icon: 'Bell',
    targetRoles: ['ADMIN', 'SUPER_ADMIN', 'REVIEWER'],
    context: 'admin',
    priority: 45,
  },

  // Compliance planning tip
  {
    id: 'compliance-planning',
    title: 'Planification de conformité',
    body: 'Consultez le planificateur de conformité pour suivre les tâches récurrentes ISO 27001. Les tâches en retard sont signalées en rouge.',
    icon: 'CalendarCheck',
    targetRoles: ['ADMIN', 'SUPER_ADMIN'],
    context: 'admin',
    priority: 55,
  },

  // File server tip
  {
    id: 'file-server',
    title: 'Serveur de fichiers',
    body: 'Accédez au serveur de fichiers partagé pour stocker et retrouver vos documents d\'équipe. Les fichiers sont classés par département et projet.',
    icon: 'HardDrive',
    targetRoles: [],
    context: 'general',
    priority: 30,
  },

  // Teams integration tip
  {
    id: 'teams-integration',
    title: 'Intégration Microsoft Teams',
    body: 'Les notifications importantes de l\'intranet peuvent être reçues dans Teams. Activez l\'intégration dans vos préférences de notification.',
    icon: 'MessageCircle',
    targetRoles: [],
    context: 'general',
    priority: 35,
  },

  // Prestataire tips
  {
    id: 'presta-scope',
    title: 'Accès limité',
    body: 'En tant que prestataire, vous avez accès aux tickets IT, documents contractuels et fichiers réseau.',
    icon: 'Shield',
    targetRoles: ['PRESTATAIRE'],
    context: 'welcome',
    priority: 100,
  },
  {
    id: 'presta-mfa',
    title: 'MFA obligatoire',
    body: "L'authentification multifacteur est obligatoire pour votre compte. Configurez-la dès maintenant.",
    icon: 'Smartphone',
    targetRoles: ['PRESTATAIRE'],
    context: 'welcome',
    priority: 95,
  },
  { id: 'doc-workflow', title: 'Workflow documentaire', body: 'Soumettez vos documents pour revue, puis ils seront approuvés par la Direction avant publication.', icon: 'FileCheck', targetRoles: [], context: 'documents', priority: 45 },
  { id: 'satisfaction-tip', title: 'Votre avis compte', body: 'Répondez aux enquêtes de satisfaction pour améliorer nos services. Vos réponses sont confidentielles.', icon: 'MessageSquare', targetRoles: [], context: 'general', priority: 35 },
  { id: 'wiki-contribute-tip', title: 'Contribuez au Wiki', body: 'Partagez vos connaissances en ajoutant ou modifiant des pages Wiki. Le savoir collectif profite à tous.', icon: 'BookOpen', targetRoles: ['ADMIN', 'SUPER_ADMIN', 'REVIEWER'], context: 'general', priority: 30 },
  { id: 'shortcuts-tip', title: 'Raccourcis clavier', body: 'Appuyez sur ? pour voir tous les raccourcis. Ctrl+K ouvre la recherche, Ctrl+/ le helpdesk.', icon: 'Keyboard', targetRoles: [], context: 'dashboard', priority: 55 },
  { id: 'dark-mode-tip', title: 'Mode sombre', body: 'Activez le mode sombre depuis le bouton dans le header pour un confort visuel en soirée.', icon: 'Moon', targetRoles: [], context: 'general', priority: 25 },
  { id: 'profile-complete-tip', title: 'Complétez votre profil', body: 'Ajoutez votre photo, téléphone et compétences dans votre profil pour faciliter la collaboration.', icon: 'UserCheck', targetRoles: [], context: 'welcome', priority: 75 },
  { id: 'veille-ack', title: 'Traitez les alertes', body: 'Marquez les alertes veille comme Appliqué, N/A ou Accepté pour suivre leur traitement.', icon: 'ShieldCheck', targetRoles: ['ADMIN', 'SUPER_ADMIN', 'REVIEWER'], context: 'admin', priority: 45 },
  { id: 'compliance-plan', title: 'Planning conformité', body: 'Consultez le planning des tâches de conformité pour ne manquer aucune échéance.', icon: 'Calendar', targetRoles: ['ADMIN', 'SUPER_ADMIN'], context: 'admin', priority: 40 },
  { id: 'files-tip', title: 'Fichiers réseau', body: 'Accédez aux partages réseau directement depuis l intranet avec vos identifiants AD.', icon: 'HardDrive', targetRoles: [], context: 'general', priority: 20 },
  { id: 'teams-tip', title: 'Lien Teams', body: 'Ajoutez votre lien Teams dans votre profil pour que vos collègues puissent vous contacter facilement.', icon: 'MessageCircle', targetRoles: [], context: 'welcome', priority: 65 },
];
