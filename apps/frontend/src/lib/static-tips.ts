/**
 * Liste statique d'astuces UX/productivité/sécurité pour l'intranet OMNITECH.
 *
 * Utilisée en fallback quand l'API backend `/tips` n'est pas disponible et
 * pour la page `/tips` qui présente l'ensemble des astuces génériques.
 * Les astuces contextuelles (rôle, module) restent fournies par le backend
 * via {@link TipBanner}.
 *
 * Chaque tip porte :
 *  - id, title, body (contenu court, 1 à 2 phrases)
 *  - category (une des 9 catégories "fines" pour rétro-compat — mappée vers
 *    les 6 grandes catégories Productivité / Sécurité / Documents /
 *    Collaboration / Conformité / IA via {@link TIP_GROUP_OF_CATEGORY})
 *  - icon (nom lucide — ex: "Zap", "Shield", "Bot")
 *  - difficulty ("basic" | "intermediate" | "advanced")
 *  - createdAt (date ISO pour la section "Nouveautés")
 *  - iso (contrôle ISO 27001 associé, optionnel)
 *  - link (lien legacy) OU actionLabel + actionHref (CTA profond)
 */

export type StaticTipCategory =
  | "navigation"
  | "security"
  | "productivity"
  | "admin"
  | "email"
  | "password"
  | "vpn"
  | "data"
  | "rgpd"
  | "documents"
  | "collaboration"
  | "conformity"
  | "ai";

export type TipDifficulty = "basic" | "intermediate" | "advanced";

/** Les 6 grandes catégories affichées dans la UI (filtres principaux). */
export type TipGroup =
  | "productivite"
  | "securite"
  | "documents"
  | "collaboration"
  | "conformite"
  | "ia";

export interface StaticTip {
  id: string;
  title: string;
  body: string;
  category: StaticTipCategory;
  /** Nom d'icône lucide (ex: "Search", "Keyboard"). */
  icon: string;
  /** Lien optionnel vers la section concernée (legacy). */
  link?: string;
  /** Label du CTA si différent de "Ouvrir". */
  actionLabel?: string;
  /** URL du CTA (prioritaire sur link). */
  actionHref?: string;
  /** Contrôle ISO 27001 associé (ex: "A.5.17", "A.8.7"). */
  iso?: string;
  /** Niveau de maîtrise requis. */
  difficulty: TipDifficulty;
  /** Date de publication — utilisée pour la section "Nouveautés". */
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

export const STATIC_TIPS: StaticTip[] = [
  /* ---------- Productivité / navigation ---------- */
  {
    id: "static-ctrl-k",
    title: "Navigation rapide (Cmd+K)",
    body: "Appuyez sur Ctrl+K (ou Cmd+K sur Mac) à tout moment pour ouvrir la palette de commandes et sauter directement à une page.",
    category: "navigation",
    icon: "Command",
    difficulty: "basic",
    createdAt: "2025-01-10",
  },
  {
    id: "static-dashboard-tickets",
    title: "Vos tickets sur le dashboard",
    body: 'Vos tickets assignés s\'affichent directement sur le dashboard — cliquez sur "Mes tickets" pour tout voir.',
    category: "productivity",
    icon: "Ticket",
    actionLabel: "Voir mes tickets",
    actionHref: "/helpdesk?assigneeId=me",
    difficulty: "basic",
    createdAt: "2025-01-12",
  },
  {
    id: "static-new-doc",
    title: "Création express de document",
    body: "Créez un document en quelques secondes avec Ctrl+Shift+D depuis n'importe quelle page de l'intranet.",
    category: "productivity",
    icon: "FilePlus",
    actionHref: "/documents/new",
    actionLabel: "Nouveau document",
    difficulty: "intermediate",
    createdAt: "2025-01-15",
  },
  {
    id: "static-search-global",
    title: "Recherche globale universelle",
    body: "La recherche globale (Ctrl+K) indexe documents, wiki, tickets, news et incidents. Un seul point d'entrée pour tout retrouver.",
    category: "navigation",
    icon: "Search",
    actionHref: "/search",
    difficulty: "basic",
    createdAt: "2025-01-16",
  },
  {
    id: "static-hubs",
    title: "Naviguez par hub",
    body: "Les hubs structurent l'intranet par domaine : Travail, Sécurité, Admin. Utilisez Ctrl+Alt+1/2/3/4 pour sauter directement.",
    category: "navigation",
    icon: "LayoutGrid",
    actionHref: "/hub",
    difficulty: "intermediate",
    createdAt: "2025-01-18",
  },
  {
    id: "static-bookmarks",
    title: "Pages favorites",
    body: "Épinglez vos pages favorites via le bouton étoile en haut à droite de chaque page — elles réapparaissent dans la sidebar.",
    category: "productivity",
    icon: "Star",
    difficulty: "basic",
    createdAt: "2025-01-20",
  },
  {
    id: "static-compact-sidebar",
    title: "Mode compact",
    body: "Le mode compact (bouton en bas de la sidebar) libère de l'espace écran pour les longues sessions de travail.",
    category: "productivity",
    icon: "PanelLeftClose",
    difficulty: "basic",
    createdAt: "2025-01-22",
  },
  {
    id: "static-history",
    title: "Historique de navigation",
    body: "Alt+Gauche / Alt+Droite pour naviguer dans l'historique — même comportement que votre navigateur.",
    category: "navigation",
    icon: "History",
    difficulty: "basic",
    createdAt: "2025-01-24",
  },
  {
    id: "static-pwa",
    title: "Installez en PWA",
    body: "Installez l'intranet en PWA depuis votre navigateur pour un accès rapide, offline et sans barre d'adresse.",
    category: "productivity",
    icon: "Smartphone",
    difficulty: "intermediate",
    createdAt: "2025-01-26",
  },
  {
    id: "static-widgets",
    title: "Personnalisez vos widgets",
    body: "Les widgets du dashboard se personnalisent via le bouton Réglages en haut du tableau de bord.",
    category: "productivity",
    icon: "Settings",
    actionHref: "/dashboard",
    difficulty: "basic",
    createdAt: "2025-01-28",
  },
  {
    id: "static-alt-click-glance",
    title: "Aperçu rapide : Alt+clic",
    body: 'Maintenez Alt tout en cliquant sur un lien pour ouvrir un aperçu "Glance" sans quitter la page courante.',
    category: "productivity",
    icon: "Eye",
    difficulty: "advanced",
    createdAt: "2025-02-02",
  },
  {
    id: "static-dark-mode",
    title: "Mode sombre",
    body: "Activez le mode sombre depuis votre profil pour réduire la fatigue oculaire lors des sessions nocturnes.",
    category: "productivity",
    icon: "Moon",
    actionHref: "/profile",
    difficulty: "basic",
    createdAt: "2025-02-05",
  },
  {
    id: "static-keyboard-shortcuts",
    title: "Liste des raccourcis",
    body: 'Appuyez sur "?" à n\'importe quel moment pour afficher la liste complète des raccourcis clavier.',
    category: "productivity",
    icon: "Keyboard",
    difficulty: "basic",
    createdAt: "2025-02-08",
  },
  {
    id: "static-focus-mode",
    title: "Mode concentration",
    body: 'Masquez la sidebar et les notifications avec F11 pour un vrai mode "focus" sans distraction.',
    category: "productivity",
    icon: "Focus",
    difficulty: "intermediate",
    createdAt: "2025-02-12",
  },
  {
    id: "static-sidebar-pin",
    title: "Épingler une section",
    body: "Cliquez sur l'épingle à côté d'une catégorie dans la sidebar pour la garder toujours ouverte.",
    category: "navigation",
    icon: "Pin",
    difficulty: "intermediate",
    createdAt: "2025-02-14",
  },

  /* ---------- Sécurité ---------- */
  {
    id: "static-mfa",
    title: "Activez la 2FA",
    body: "Activez l'authentification à deux facteurs depuis Mon espace > MFA pour sécuriser votre compte en moins d'une minute.",
    category: "security",
    icon: "ShieldCheck",
    actionHref: "/mfa",
    actionLabel: "Configurer la MFA",
    iso: "A.5.17",
    difficulty: "basic",
    createdAt: "2025-01-10",
  },
  {
    id: "static-phishing",
    title: "Reconnaître un e-mail de phishing",
    body: "Vérifiez l'adresse de l'expéditeur, survolez les liens avant de cliquer et méfiez-vous des pièces jointes inattendues. En cas de doute, transférez le mail à security@omnitech.fr.",
    category: "email",
    icon: "MailWarning",
    actionHref: "/wiki?search=phishing",
    iso: "A.6.3",
    difficulty: "basic",
    createdAt: "2025-01-11",
  },
  {
    id: "static-password-manager",
    title: "Utilisez un gestionnaire de mots de passe",
    body: "Ne réutilisez jamais le même mot de passe. Utilisez le gestionnaire agréé pour générer et stocker des mots de passe uniques et robustes.",
    category: "password",
    icon: "KeyRound",
    actionHref: "/wiki?search=mot+de+passe",
    iso: "A.5.17",
    difficulty: "basic",
    createdAt: "2025-01-12",
  },
  {
    id: "static-password-strength",
    title: "Mot de passe robuste",
    body: "Un bon mot de passe fait au moins 14 caractères et mélange majuscules, minuscules, chiffres et symboles. Privilégiez une phrase de passe facile à retenir.",
    category: "password",
    icon: "KeyRound",
    iso: "A.5.17",
    difficulty: "basic",
    createdAt: "2025-01-13",
  },
  {
    id: "static-hibp",
    title: "Vérifiez vos fuites (HIBP)",
    body: "Consultez le tableau de bord MFA pour savoir si votre adresse a été vue dans une fuite de données publique (source HIBP).",
    category: "password",
    icon: "AlertOctagon",
    actionHref: "/mfa",
    iso: "A.5.17",
    difficulty: "intermediate",
    createdAt: "2025-03-02",
  },
  {
    id: "static-vpn-public-wifi",
    title: "VPN obligatoire sur Wi-Fi public",
    body: "Connectez-vous systématiquement au VPN OMNITECH avant d'utiliser un Wi-Fi public (hôtel, café, aéroport). Sans VPN, vos données transitent en clair.",
    category: "vpn",
    icon: "Globe",
    actionHref: "/wiki?search=VPN",
    iso: "A.8.20",
    difficulty: "basic",
    createdAt: "2025-01-14",
  },
  {
    id: "static-vpn-split-tunnel",
    title: "VPN : mode split-tunnel",
    body: "Le split-tunnel ne protège que le trafic vers l'entreprise. Activez le full-tunnel pour les missions sensibles depuis l'étranger.",
    category: "vpn",
    icon: "Globe",
    actionHref: "/wiki?search=VPN+configuration",
    iso: "A.8.20",
    difficulty: "advanced",
    createdAt: "2025-01-15",
  },
  {
    id: "static-lock-screen",
    title: "Verrouillez votre poste",
    body: "Win+L (Windows) ou Ctrl+Cmd+Q (Mac) : verrouillez votre poste dès que vous vous absentez, même 30 secondes. Réflexe obligatoire en ESN.",
    category: "security",
    icon: "Lock",
    iso: "A.7.7",
    difficulty: "basic",
    createdAt: "2025-01-16",
  },
  {
    id: "static-usb-policy",
    title: "Clés USB : attention danger",
    body: "N'insérez jamais une clé USB d'origine inconnue. Si vous trouvez une clé, déposez-la au service IT. Les USB sont un vecteur d'attaque courant.",
    category: "data",
    icon: "Usb",
    iso: "A.7.10",
    difficulty: "basic",
    createdAt: "2025-01-17",
  },
  {
    id: "static-email-attachment",
    title: "Pièces jointes suspectes",
    body: "Les .exe, .js, .vbs en pièce jointe sont presque toujours malveillants. N'ouvrez jamais une pièce jointe exécutable sans vérification, même d'un collègue.",
    category: "email",
    icon: "Paperclip",
    iso: "A.6.3",
    difficulty: "basic",
    createdAt: "2025-01-18",
  },
  {
    id: "static-social-engineering",
    title: "Ingénierie sociale : restez vigilant",
    body: "Un appel urgent d'un \"directeur\" demandant un virement ? Vérifiez toujours par un canal secondaire. L'ingénierie sociale cible la confiance, pas la technologie.",
    category: "security",
    icon: "ShieldAlert",
    iso: "A.6.3",
    difficulty: "intermediate",
    createdAt: "2025-01-20",
  },
  {
    id: "static-update-os",
    title: "Mises à jour : ne remettez pas à demain",
    body: "Installez les mises à jour de sécurité dès qu'elles sont disponibles. 60 % des brèches exploitent des failles pour lesquelles un correctif existait déjà.",
    category: "security",
    icon: "RefreshCw",
    iso: "A.8.8",
    difficulty: "basic",
    createdAt: "2025-01-22",
  },
  {
    id: "static-incident",
    title: "Signaler un incident",
    body: "Signalez un incident de sécurité depuis le hub Sécurité > Incidents pour une prise en charge conforme ISO 27001.",
    category: "security",
    icon: "ShieldAlert",
    actionHref: "/incidents",
    iso: "A.5.24",
    difficulty: "intermediate",
    createdAt: "2025-02-01",
  },
  {
    id: "static-quishing",
    title: "Méfiez-vous des QR codes",
    body: "Un QR code collé sur du matériel ou reçu par e-mail peut rediriger vers un site malveillant (quishing). Vérifiez toujours l'URL avant d'ouvrir.",
    category: "email",
    icon: "QrCode",
    iso: "A.6.3",
    difficulty: "intermediate",
    createdAt: "2025-03-10",
  },
  {
    id: "static-clean-desk",
    title: "Bureau propre (clean desk)",
    body: "Aucun document sensible ne doit rester visible sur votre bureau en fin de journée. Rangez dans un tiroir verrouillé.",
    category: "security",
    icon: "ClipboardList",
    iso: "A.7.7",
    difficulty: "basic",
    createdAt: "2025-02-10",
  },

  /* ---------- Documents & GED ---------- */
  {
    id: "static-doc-versioning",
    title: "Versioning automatique",
    body: "Chaque modification de document crée une nouvelle version. Comparez ou restaurez depuis l'onglet Historique du document.",
    category: "documents",
    icon: "GitBranch",
    actionHref: "/documents",
    iso: "A.5.33",
    difficulty: "intermediate",
    createdAt: "2025-02-15",
  },
  {
    id: "static-doc-watermark",
    title: "Filigrane automatique",
    body: "Les documents classés C3/C4 sont filigranés automatiquement avec votre nom à l'ouverture — traçabilité garantie en cas de fuite.",
    category: "documents",
    icon: "Stamp",
    iso: "A.5.13",
    difficulty: "advanced",
    createdAt: "2025-03-05",
  },
  {
    id: "static-e-signature",
    title: "Signature électronique",
    body: "Signez vos contrats et chartes en quelques clics via /signatures — équivalent juridique d'une signature manuscrite (eIDAS).",
    category: "documents",
    icon: "FileSignature",
    actionHref: "/signatures",
    actionLabel: "Accéder aux signatures",
    iso: "A.5.31",
    difficulty: "basic",
    createdAt: "2025-01-30",
  },
  {
    id: "static-data-classification",
    title: "Classifiez vos documents",
    body: "Appliquez le marquage C1/C2/C3/C4 à tous vos documents. Un document non classifié est traité au niveau le plus restrictif par défaut.",
    category: "documents",
    icon: "FolderLock",
    actionHref: "/wiki?search=classification+donnees",
    iso: "A.5.12",
    difficulty: "intermediate",
    createdAt: "2025-02-03",
  },
  {
    id: "static-backup-321",
    title: "Règle de sauvegarde 3-2-1",
    body: "Conservez 3 copies de vos données, sur 2 supports différents, dont 1 hors site. Vérifiez régulièrement que vos sauvegardes sont restaurables.",
    category: "documents",
    icon: "HardDrive",
    actionHref: "/wiki?search=sauvegarde+3-2-1",
    iso: "A.8.13",
    difficulty: "intermediate",
    createdAt: "2025-02-06",
  },
  {
    id: "static-doc-share-link",
    title: "Liens de partage expirables",
    body: "Partagez un document externe via un lien à durée de vie limitée plutôt qu'un e-mail avec pièce jointe — révocable à tout moment.",
    category: "documents",
    icon: "Link2",
    iso: "A.5.14",
    difficulty: "intermediate",
    createdAt: "2025-03-15",
  },
  {
    id: "static-doc-ocr",
    title: "OCR intégré",
    body: "Les PDF scannés sont océrisés automatiquement — la recherche globale indexe leur contenu texte en quelques minutes.",
    category: "documents",
    icon: "ScanText",
    difficulty: "basic",
    createdAt: "2025-03-18",
  },
  {
    id: "static-doc-retention",
    title: "Durée de conservation",
    body: "Chaque document porte une durée de conservation. Au-delà, il est archivé ou supprimé automatiquement selon la politique RGPD.",
    category: "documents",
    icon: "CalendarClock",
    iso: "A.5.33",
    difficulty: "advanced",
    createdAt: "2025-03-20",
  },

  /* ---------- Collaboration ---------- */
  {
    id: "static-mentions",
    title: "Mentionnez vos collègues",
    body: "Tapez @ dans un commentaire pour mentionner un collègue — il recevra une notification push et un e-mail.",
    category: "collaboration",
    icon: "AtSign",
    difficulty: "basic",
    createdAt: "2025-02-20",
  },
  {
    id: "static-notifications-center",
    title: "Centre de notifications",
    body: "Toutes vos alertes (tickets, chartes, mentions) sont regroupées dans le centre de notifications — accès en un clic sur la cloche.",
    category: "collaboration",
    icon: "Bell",
    actionHref: "/notifications",
    difficulty: "basic",
    createdAt: "2025-02-22",
  },
  {
    id: "static-notifications-rules",
    title: "Règles de notifications",
    body: "Réglez vos préférences de notification par canal (push, e-mail, in-app) depuis votre profil pour éviter la surcharge.",
    category: "collaboration",
    icon: "BellRing",
    actionHref: "/profile",
    difficulty: "intermediate",
    createdAt: "2025-03-12",
  },
  {
    id: "static-wiki-contribute",
    title: "Contribuez au wiki",
    body: 'Toute la documentation interne est éditable par les collaborateurs — proposez une amélioration via le bouton "Modifier" en haut de page.',
    category: "collaboration",
    icon: "BookOpen",
    actionLabel: "Ouvrir le wiki",
    difficulty: "basic",
    createdAt: "2025-02-25",
  },
  {
    id: "static-comments",
    title: "Commentaires contextuels",
    body: "Commentez directement un document ou un incident — l'historique reste attaché et consultable par toute l'équipe.",
    category: "collaboration",
    icon: "MessageSquare",
    difficulty: "basic",
    createdAt: "2025-02-28",
  },
  {
    id: "static-spaces",
    title: "Espaces collaboratifs",
    body: "Regroupez documents, wiki et tickets d'un projet dans un Espace dédié — chaque membre y accède selon ses droits.",
    category: "collaboration",
    icon: "Users",
    difficulty: "intermediate",
    createdAt: "2025-03-08",
  },
  {
    id: "static-directory",
    title: "Trouvez un collègue",
    body: "L'annuaire recense tout le monde avec poste, rôle, équipe et téléphone — plus besoin de demander « qui est Julien ? ».",
    category: "collaboration",
    icon: "Contact",
    actionHref: "/directory",
    difficulty: "basic",
    createdAt: "2025-03-14",
  },

  /* ---------- Conformité ---------- */
  {
    id: "static-chartes",
    title: "Chartes à signer",
    body: "Les chartes non signées apparaissent dans vos notifications — traitez-les rapidement pour rester conforme.",
    category: "conformity",
    icon: "FileSignature",
    actionHref: "/notifications",
    iso: "A.5.4",
    difficulty: "basic",
    createdAt: "2025-01-19",
  },
  {
    id: "static-runbooks",
    title: "Runbooks historisés",
    body: "Vos runbooks exécutés sont historisés pour les audits ISO 27001 et le retour d'expérience — rien à archiver manuellement.",
    category: "conformity",
    icon: "BookCheck",
    actionHref: "/runbooks",
    iso: "A.5.37",
    difficulty: "intermediate",
    createdAt: "2025-01-25",
  },
  {
    id: "static-iso27001-overview",
    title: "Cartographie ISO 27001",
    body: 'Chaque module porte les contrôles ISO 27001 qu\'il implémente — repérable via le badge "A.x.y" sur les pages concernées.',
    category: "conformity",
    icon: "ShieldCheck",
    iso: "A.5.1",
    difficulty: "advanced",
    createdAt: "2025-03-01",
  },
  {
    id: "static-rgpd-minimisation",
    title: "RGPD : minimisation des données",
    body: "Ne collectez que les données strictement nécessaires au traitement. Moins vous stockez, moins vous exposez en cas de fuite.",
    category: "rgpd",
    icon: "Scale",
    actionHref: "/wiki?search=RGPD+minimisation",
    iso: "A.5.34",
    difficulty: "intermediate",
    createdAt: "2025-02-04",
  },
  {
    id: "static-rgpd-retention",
    title: "RGPD : durées de conservation",
    body: "Vérifiez les durées de rétention dans le registre des traitements. Les données personnelles périmées doivent être supprimées ou anonymisées.",
    category: "rgpd",
    icon: "Scale",
    actionHref: "/wiki?search=RGPD+conservation",
    iso: "A.5.34",
    difficulty: "advanced",
    createdAt: "2025-02-07",
  },
  {
    id: "static-rgpd-droit-acces",
    title: "RGPD : droit d'accès",
    body: "Toute personne peut demander l'accès à ses données personnelles. Redirigez ces demandes vers le DPO sous 48h.",
    category: "rgpd",
    icon: "Scale",
    actionHref: "/wiki?search=RGPD+droit+acces",
    iso: "A.5.34",
    difficulty: "intermediate",
    createdAt: "2025-02-09",
  },
  {
    id: "static-quiz",
    title: "Mini-quiz cyber",
    body: "Testez vos réflexes cyber en 2 minutes via /quiz — un score par mois est recommandé par le RSSI.",
    category: "conformity",
    icon: "HelpCircle",
    actionHref: "/quiz",
    actionLabel: "Lancer le quiz",
    iso: "A.6.3",
    difficulty: "basic",
    createdAt: "2025-03-22",
  },
  {
    id: "static-veeam",
    title: "Statut des sauvegardes",
    body: "Le statut de vos sauvegardes Veeam est visible dans Exports IT, mis à jour chaque mois automatiquement.",
    category: "conformity",
    icon: "HardDrive",
    actionHref: "/admin/it-exports",
    iso: "A.8.13",
    difficulty: "advanced",
    createdAt: "2025-02-11",
  },
  {
    id: "static-audit-trail",
    title: "Piste d'audit",
    body: "Chaque action sensible (accès C4, changement de rôle, export) est tracée. Consultable par le RSSI en cas d'enquête.",
    category: "conformity",
    icon: "ScrollText",
    iso: "A.8.15",
    difficulty: "advanced",
    createdAt: "2025-03-25",
  },

  /* ---------- IA ---------- */
  {
    id: "static-ai-chatbot",
    title: "Chatbot interne",
    body: "Posez vos questions RH, IT ou sécurité au chatbot — il interroge le wiki et vos documents accessibles avant de répondre.",
    category: "ai",
    icon: "Bot",
    actionHref: "/chat",
    actionLabel: "Ouvrir le chat",
    difficulty: "basic",
    createdAt: "2025-03-28",
  },
  {
    id: "static-ai-semantic-search",
    title: "Recherche sémantique",
    body: 'La recherche comprend le sens, pas seulement les mots : cherchez "comment prolonger mon badge" et l\'intranet trouvera la procédure.',
    category: "ai",
    icon: "Sparkles",
    actionHref: "/search",
    difficulty: "intermediate",
    createdAt: "2025-04-01",
  },
  {
    id: "static-ai-summary",
    title: "Résumés automatiques",
    body: "Tout document de plus de 3 pages propose un résumé IA en haut de page — gagnez 5 minutes sur chaque lecture longue.",
    category: "ai",
    icon: "FileText",
    difficulty: "basic",
    createdAt: "2025-04-05",
  },
  {
    id: "static-ai-prompt-hygiene",
    title: "Hygiène de prompt",
    body: "Ne collez jamais de données C3/C4 (identités clients, secrets) dans un chatbot externe. Utilisez uniquement les outils IA internes validés.",
    category: "ai",
    icon: "ShieldAlert",
    iso: "A.5.33",
    difficulty: "advanced",
    createdAt: "2025-04-08",
  },
  {
    id: "static-ai-explain",
    title: "Expliquez un document",
    body: 'Sélectionnez un paragraphe et utilisez "Expliquer" dans le menu contextuel — l\'IA reformule le passage en langage simple.',
    category: "ai",
    icon: "Lightbulb",
    difficulty: "intermediate",
    createdAt: "2025-04-12",
  },
  {
    id: "static-ai-translate",
    title: "Traduction instantanée",
    body: "Les documents en anglais peuvent être traduits en un clic via le bouton Globe. Utile pour les audits et les référentiels internationaux.",
    category: "ai",
    icon: "Languages",
    difficulty: "basic",
    createdAt: "2025-04-15",
  },
];

/* ------------------------------------------------------------------ */
/*  Libellés / styles par catégorie fine                               */
/* ------------------------------------------------------------------ */

export const TIP_CATEGORY_LABELS: Record<StaticTipCategory, string> = {
  navigation: "Navigation",
  security: "Sécurité",
  productivity: "Productivité",
  admin: "Administration",
  email: "E-mail",
  password: "Mot de passe",
  vpn: "VPN",
  data: "Données",
  rgpd: "RGPD",
  documents: "Documents",
  collaboration: "Collaboration",
  conformity: "Conformité",
  ai: "IA",
};

export const TIP_CATEGORY_ACCENTS: Record<StaticTipCategory, string> = {
  navigation: "#296DC1", // seal-blue
  security: "#892034", // seal-bordeaux
  productivity: "#F9964A", // seal-orange
  admin: "#F68D2E", // navy
  email: "#D97706", // amber
  password: "#7C3AED", // violet
  vpn: "#059669", // emerald
  data: "#0891B2", // cyan
  rgpd: "#BE185D", // pink
  documents: "#0F766E", // teal
  collaboration: "#2563EB", // blue
  conformity: "#475569", // slate
  ai: "#9333EA", // purple
};

/** Icônes lucide par catégorie pour affichage visuel. */
export const TIP_CATEGORY_ICONS: Record<StaticTipCategory, string> = {
  navigation: "Compass",
  security: "ShieldCheck",
  productivity: "Zap",
  admin: "Settings",
  email: "Mail",
  password: "KeyRound",
  vpn: "Globe",
  data: "Database",
  rgpd: "Scale",
  documents: "Folder",
  collaboration: "Users",
  conformity: "FileCheck",
  ai: "Bot",
};

/* ------------------------------------------------------------------ */
/*  Grands groupes (6 catégories affichées dans les filtres)           */
/* ------------------------------------------------------------------ */

export const TIP_GROUP_LABELS: Record<TipGroup, string> = {
  productivite: "Productivité",
  securite: "Sécurité",
  documents: "Documents",
  collaboration: "Collaboration",
  conformite: "Conformité",
  ia: "IA",
};

export const TIP_GROUP_ACCENTS: Record<TipGroup, string> = {
  productivite: "#F9964A",
  securite: "#892034",
  documents: "#0F766E",
  collaboration: "#2563EB",
  conformite: "#475569",
  ia: "#9333EA",
};

export const TIP_GROUP_ICONS: Record<TipGroup, string> = {
  productivite: "Zap",
  securite: "ShieldCheck",
  documents: "Folder",
  collaboration: "Users",
  conformite: "FileCheck",
  ia: "Bot",
};

/** Mapping catégorie fine → groupe UI affiché. */
export const TIP_GROUP_OF_CATEGORY: Record<StaticTipCategory, TipGroup> = {
  navigation: "productivite",
  productivity: "productivite",
  security: "securite",
  password: "securite",
  vpn: "securite",
  email: "securite",
  documents: "documents",
  data: "documents",
  collaboration: "collaboration",
  conformity: "conformite",
  admin: "conformite",
  rgpd: "conformite",
  ai: "ia",
};

export const TIP_DIFFICULTY_LABELS: Record<TipDifficulty, string> = {
  basic: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Retourne les tips appartenant à une catégorie fine OU à un groupe UI. */
export function getTipsByCategory(
  category: StaticTipCategory | TipGroup | "all",
): StaticTip[] {
  if (category === "all") return STATIC_TIPS;
  // Match contre les groupes UI en priorité
  if ((category as TipGroup) in TIP_GROUP_LABELS) {
    return STATIC_TIPS.filter(
      (t) => TIP_GROUP_OF_CATEGORY[t.category] === category,
    );
  }
  return STATIC_TIPS.filter((t) => t.category === category);
}

/** Retourne les tips d'un niveau de difficulté donné. */
export function getTipsByDifficulty(level: TipDifficulty): StaticTip[] {
  return STATIC_TIPS.filter((t) => t.difficulty === level);
}

/**
 * Retourne un tip "pseudo-aléatoire" mais déterministe pour la journée UTC.
 * Le même utilisateur voit le même tip tout au long de la journée, les tips
 * tournent d'un jour à l'autre.
 */
export function getRandomTip(source: StaticTip[] = STATIC_TIPS): StaticTip {
  if (source.length === 0) return STATIC_TIPS[0]!;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  return source[dayOfYear % source.length]!;
}

/** Renvoie les N tips les plus récents par createdAt. */
export function getRecentTips(limit = 5): StaticTip[] {
  return [...STATIC_TIPS]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

/** Renvoie le groupe UI correspondant à une catégorie fine. */
export function groupOfCategory(category: StaticTipCategory): TipGroup {
  return TIP_GROUP_OF_CATEGORY[category];
}
