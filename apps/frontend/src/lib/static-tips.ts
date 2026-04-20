/**
 * Liste statique d'astuces UX/productivité pour l'intranet OMNITECH.
 *
 * Utilisée en fallback quand l'API backend `/tips` n'est pas disponible ou
 * pour la page `/tips` qui présente l'ensemble des astuces génériques.
 * Les astuces contextuelles (rôle, module) restent fournies par le backend
 * via {@link TipBanner}.
 */

export type StaticTipCategory = 'navigation' | 'security' | 'productivity' | 'admin' | 'email' | 'password' | 'vpn' | 'data' | 'rgpd';

export interface StaticTip {
  id: string;
  title: string;
  body: string;
  category: StaticTipCategory;
  /** Nom d'icône lucide (ex: "Search", "Keyboard"). */
  icon: string;
  /** Lien optionnel vers la section concernée. */
  link?: string;
}

export const STATIC_TIPS: StaticTip[] = [
  {
    id: 'static-ctrl-k',
    title: 'Navigation rapide',
    body: 'Appuyez sur Ctrl+K à tout moment pour ouvrir la navigation rapide et sauter directement à une page.',
    category: 'navigation',
    icon: 'Search',
  },
  {
    id: 'static-dashboard-tickets',
    title: 'Vos tickets sur le dashboard',
    body: 'Vos tickets assignés s\'affichent directement sur le dashboard — cliquez sur "Mes tickets" pour tout voir.',
    category: 'productivity',
    icon: 'Ticket',
    link: '/tickets?assigneeId=me',
  },
  {
    id: 'static-new-doc',
    title: 'Création express de document',
    body: 'Pour créer un document en quelques secondes, utilisez le raccourci Ctrl+Shift+D depuis n\'importe quelle page.',
    category: 'productivity',
    icon: 'FileText',
    link: '/documents/new',
  },
  {
    id: 'static-mfa',
    title: 'Activez la 2FA',
    body: 'Activez l\'authentification à deux facteurs depuis Mon espace > MFA pour sécuriser votre compte.',
    category: 'security',
    icon: 'Shield',
    link: '/mfa',
  },
  {
    id: 'static-chartes',
    title: 'Chartes à signer',
    body: 'Les chartes non signées apparaissent dans vos notifications — pensez à les traiter régulièrement.',
    category: 'admin',
    icon: 'FileSignature',
    link: '/notifications',
  },
  {
    id: 'static-search-global',
    title: 'Recherche globale',
    body: 'La recherche globale (Ctrl+K) indexe documents, wiki, tickets, news et incidents. Un seul point d\'entrée.',
    category: 'navigation',
    icon: 'Search',
  },
  {
    id: 'static-hubs',
    title: 'Naviguez par hub',
    body: 'Utilisez les hubs pour naviguer par domaine : Travail, Sécurité, Admin. Ctrl+Alt+1/2/3/4 pour sauter directement.',
    category: 'navigation',
    icon: 'LayoutGrid',
  },
  {
    id: 'static-bookmarks',
    title: 'Pages favorites',
    body: 'Épinglez vos pages favorites dans la sidebar via le bouton étoile en haut à droite de chaque page.',
    category: 'productivity',
    icon: 'Star',
  },
  {
    id: 'static-compact-sidebar',
    title: 'Mode compact',
    body: 'Le mode compact (bouton en bas de la sidebar) libère de l\'espace écran pour les longues sessions de travail.',
    category: 'productivity',
    icon: 'PanelLeftClose',
  },
  {
    id: 'static-history',
    title: 'Historique de navigation',
    body: 'Alt+Gauche / Alt+Droite pour naviguer dans l\'historique de votre navigateur comme dans une SPA classique.',
    category: 'navigation',
    icon: 'History',
  },
  {
    id: 'static-pwa',
    title: 'Installez en PWA',
    body: 'Installez l\'intranet en PWA depuis votre navigateur pour un accès rapide, offline et sans barre d\'adresse.',
    category: 'productivity',
    icon: 'Smartphone',
  },
  {
    id: 'static-widgets',
    title: 'Personnalisez vos widgets',
    body: 'Les widgets du dashboard se personnalisent depuis le bouton Réglages en haut du tableau de bord.',
    category: 'productivity',
    icon: 'Settings',
    link: '/dashboard',
  },
  {
    id: 'static-incident',
    title: 'Signaler un incident',
    body: 'Signalez un incident de sécurité depuis le hub Sécurité > Incidents pour une prise en charge ISO 27001.',
    category: 'security',
    icon: 'ShieldAlert',
    link: '/incidents/new',
  },
  {
    id: 'static-runbooks',
    title: 'Runbooks historisés',
    body: 'Vos runbooks exécutés sont historisés automatiquement pour les audits ISO 27001 et le retour d\'expérience.',
    category: 'admin',
    icon: 'BookOpen',
    link: '/runbooks',
  },
  {
    id: 'static-veeam',
    title: 'Statut des sauvegardes',
    body: 'Le statut de vos sauvegardes Veeam est visible dans Exports IT, mis à jour chaque mois automatiquement.',
    category: 'admin',
    icon: 'HardDrive',
    link: '/admin/it-exports',
  },
  /* ---- Astuces cybersécurité pratiques ---- */
  {
    id: 'static-phishing',
    title: 'Reconnaître un e-mail de phishing',
    body: "Vérifiez toujours l'adresse de l'expéditeur, survolez les liens avant de cliquer et méfiez-vous des pièces jointes inattendues. En cas de doute, transférez le mail à security@omnitech.fr.",
    category: 'email',
    icon: 'Mail',
    link: '/wiki?search=phishing',
  },
  {
    id: 'static-password-manager',
    title: 'Utilisez un gestionnaire de mots de passe',
    body: "Ne réutilisez jamais le même mot de passe. Utilisez le gestionnaire agréé par l'entreprise pour générer et stocker des mots de passe uniques et robustes.",
    category: 'password',
    icon: 'KeyRound',
    link: '/wiki?search=mot+de+passe',
  },
  {
    id: 'static-password-strength',
    title: 'Mot de passe robuste',
    body: 'Un bon mot de passe fait au moins 14 caractères et mélange majuscules, minuscules, chiffres et caractères spéciaux. Privilégiez une phrase de passe facile à retenir.',
    category: 'password',
    icon: 'KeyRound',
    link: '/wiki?search=mot+de+passe',
  },
  {
    id: 'static-vpn-public-wifi',
    title: 'VPN obligatoire sur Wi-Fi public',
    body: "Connectez-vous systématiquement au VPN OMNITECH avant d'utiliser un réseau Wi-Fi public (hôtel, café, aéroport). Sans VPN, vos données transitent en clair.",
    category: 'vpn',
    icon: 'Globe',
    link: '/wiki?search=VPN',
  },
  {
    id: 'static-vpn-split-tunnel',
    title: 'VPN : mode split-tunnel',
    body: "Le VPN en split-tunnel ne protège que le trafic vers l'entreprise. Activez le mode full-tunnel pour les missions sensibles depuis l'étranger.",
    category: 'vpn',
    icon: 'Globe',
    link: '/wiki?search=VPN+configuration',
  },
  {
    id: 'static-lock-screen',
    title: 'Verrouillez votre poste',
    body: 'Win+L (Windows) ou Ctrl+Cmd+Q (Mac) : verrouillez votre poste dès que vous vous absentez, même 30 secondes. C\'est un réflexe obligatoire en ESN.',
    category: 'security',
    icon: 'Lock',
    link: '/wiki?search=verrouillage+poste',
  },
  {
    id: 'static-usb-policy',
    title: 'Clés USB : attention danger',
    body: "N'insérez jamais une clé USB d'origine inconnue. Si vous trouvez une clé, déposez-la au service IT. Les clés USB sont un vecteur d'attaque courant.",
    category: 'data',
    icon: 'Usb',
    link: '/wiki?search=USB+politique',
  },
  {
    id: 'static-rgpd-minimisation',
    title: 'RGPD : minimisation des données',
    body: "Ne collectez que les données strictement nécessaires au traitement. Moins vous stockez de données personnelles, moins vous exposez l'entreprise en cas de fuite.",
    category: 'rgpd',
    icon: 'Scale',
    link: '/wiki?search=RGPD+minimisation',
  },
  {
    id: 'static-rgpd-retention',
    title: 'RGPD : durées de conservation',
    body: "Vérifiez les durées de rétention définies dans le registre des traitements. Les données personnelles périmées doivent être supprimées ou anonymisées.",
    category: 'rgpd',
    icon: 'Scale',
    link: '/wiki?search=RGPD+conservation',
  },
  {
    id: 'static-email-attachment',
    title: 'Pièces jointes suspectes',
    body: "Les fichiers .exe, .js, .vbs en pièce jointe sont presque toujours malveillants. N'ouvrez jamais une pièce jointe exécutable, même d'un collègue, sans vérification.",
    category: 'email',
    icon: 'Mail',
    link: '/wiki?search=pieces+jointes+securite',
  },
  {
    id: 'static-data-classification',
    title: 'Classifiez vos données',
    body: "Appliquez le marquage C1/C2/C3/C4 à tous vos documents. Un document non classifié sera traité au niveau le plus restrictif par défaut.",
    category: 'data',
    icon: 'FolderLock',
    link: '/wiki?search=classification+donnees',
  },
  {
    id: 'static-backup-321',
    title: 'Règle de sauvegarde 3-2-1',
    body: "Conservez 3 copies de vos données, sur 2 supports différents, dont 1 hors site. Vérifiez régulièrement que vos sauvegardes sont restaurables.",
    category: 'data',
    icon: 'HardDrive',
    link: '/wiki?search=sauvegarde+3-2-1',
  },
  {
    id: 'static-social-engineering',
    title: "Ingénierie sociale : restez vigilant",
    body: "Un appel urgent d'un « directeur » vous demandant un virement ? Vérifiez toujours par un canal secondaire. L'ingénierie sociale cible la confiance, pas la technologie.",
    category: 'security',
    icon: 'ShieldAlert',
    link: '/wiki?search=ingenierie+sociale',
  },
  {
    id: 'static-update-os',
    title: 'Mises à jour : ne remettez pas à demain',
    body: "Installez les mises à jour de sécurité dès qu'elles sont disponibles. 60% des brèches exploitent des vulnérabilités pour lesquelles un correctif existait déjà.",
    category: 'security',
    icon: 'RefreshCw',
    link: '/wiki?search=mises+a+jour+securite',
  },
  {
    id: 'static-rgpd-droit-acces',
    title: 'RGPD : droit d\'accès des personnes',
    body: "Toute personne peut demander l'accès à ses données personnelles. Redirigez ces demandes vers le DPO sous 48h maximum.",
    category: 'rgpd',
    icon: 'Scale',
    link: '/wiki?search=RGPD+droit+acces',
  },
];

export const TIP_CATEGORY_LABELS: Record<StaticTipCategory, string> = {
  navigation: 'Navigation',
  security: 'Sécurité',
  productivity: 'Productivité',
  admin: 'Administration',
  email: 'E-mail',
  password: 'Mot de passe',
  vpn: 'VPN',
  data: 'Données',
  rgpd: 'RGPD',
};

export const TIP_CATEGORY_ACCENTS: Record<StaticTipCategory, string> = {
  navigation: '#296DC1', // seal-blue
  security: '#892034', // seal-bordeaux
  productivity: '#F9964A', // seal-orange
  admin: '#004469', // navy
  email: '#D97706', // amber
  password: '#7C3AED', // violet
  vpn: '#059669', // emerald
  data: '#0891B2', // cyan
  rgpd: '#BE185D', // pink
};

/** Icônes lucide par catégorie pour affichage visuel. */
export const TIP_CATEGORY_ICONS: Record<StaticTipCategory, string> = {
  navigation: 'Compass',
  security: 'ShieldCheck',
  productivity: 'Zap',
  admin: 'Settings',
  email: 'Mail',
  password: 'KeyRound',
  vpn: 'Globe',
  data: 'Database',
  rgpd: 'Scale',
};
