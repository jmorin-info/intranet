/**
 * Helpdesk Chat utilities
 * - Intent detection (pattern matching for common IT requests)
 * - Conversation history persistence (localStorage)
 * - Contextual follow-up suggestion generation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: Array<{ label: string; href?: string; action?: string }>;
  suggestions?: string[];
  ragScore?: number;       // normalised 0-100, present when answer comes from RAG
  source?: 'kb' | 'rag' | 'intent' | 'fallback';
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

export interface DetectedIntent {
  key: string;
  response: string;
  actions?: Array<{ label: string; href?: string }>;
  /** If true the chatbot should NOT fall through to KB / RAG */
  terminal: boolean;
  /** Follow-up suggestions */
  suggestions: string[];
}

const INTENT_PATTERNS: Array<{
  patterns: RegExp[];
  build: () => DetectedIntent;
}> = [
  {
    patterns: [
      /\b(cr[eé]{1,2}er|ouvrir|nouveau|nouvelle)\b.*\bticket/i,
      /\bticket\b.*(cr[eé]{1,2}er|ouvrir|nouveau)/i,
    ],
    build: () => ({
      key: 'create_ticket',
      response:
        'Bien sûr ! Cliquez sur le bouton ci-dessous pour créer un nouveau ticket IT. Notre équipe support le prendra en charge rapidement.',
      actions: [{ label: 'Créer un ticket', href: '/tickets?create=true' }],
      terminal: true,
      suggestions: [
        'Comment suivre mon ticket ?',
        'Quels sont les délais de traitement ?',
        'Qui contacter en cas d\'urgence ?',
      ],
    }),
  },
  {
    patterns: [
      /\b(mot\s*de\s*passe|password|mdp)\b.*(oubli|reset|r[eé]init|chang|perdu)/i,
      /\b(oubli|reset|r[eé]init|chang|perdu)\b.*(mot\s*de\s*passe|password|mdp)/i,
      /\b(mdp\s*oubli[eé]?|password\s*reset)\b/i,
    ],
    build: () => ({
      key: 'password_reset',
      response:
        'Pour réinitialiser votre mot de passe :\n\n1. Rendez-vous sur votre **profil** et utilisez l\'option de changement de mot de passe.\n2. Si vous n\'avez plus accès, créez un ticket de type **Réinitialisation mot de passe**.\n3. En cas d\'urgence, contactez le support IT directement.\n\nVotre nouveau mot de passe doit contenir au moins 12 caractères, une majuscule, un chiffre et un caractère spécial.',
      actions: [
        { label: 'Mon profil', href: '/profile' },
        { label: 'Créer un ticket réinit. MDP', href: '/tickets?create=true&category=password_reset' },
      ],
      terminal: true,
      suggestions: [
        'Comment activer le MFA / double authentification ?',
        'Mon compte est bloqué, que faire ?',
        'Politique de sécurité des mots de passe',
      ],
    }),
  },
  {
    patterns: [
      /\bvpn\b/i,
    ],
    build: () => ({
      key: 'vpn',
      response:
        'Pour le VPN OMNITECH :\n\n1. **Première connexion** : demandez un accès VPN via un ticket (catégorie "Accès VPN").\n2. **Problème de connexion** : vérifiez que votre client VPN est à jour, redémarrez-le, et assurez-vous d\'être connecté à Internet.\n3. **Configuration** : les paramètres de connexion sont disponibles dans la base documentaire.\n\nSi le problème persiste, créez un ticket avec les détails de l\'erreur.',
      actions: [
        { label: 'Demander accès VPN', href: '/tickets?create=true&category=vpn_access' },
      ],
      terminal: false, // also search KB for more specific VPN info
      suggestions: [
        'Comment configurer le VPN sur Mac ?',
        'Le VPN est lent, que faire ?',
        'Accès VPN depuis l\'étranger',
      ],
    }),
  },
  {
    patterns: [
      /\bj['']?ai\s+(un\s+)?probl[eè]me\s+(avec|de|sur|pour)\b/i,
      /\b(probl[eè]me|souci|bug|erreur|panne)\b(?!.*\b(mot\s*de\s*passe|vpn|ticket)\b)/i,
    ],
    build: () => ({
      key: 'need_details',
      response:
        'Je comprends que vous rencontrez un problème. Pour mieux vous aider, pourriez-vous préciser :\n\n- **Quel outil / application** est concerné ?\n- **Quel message d\'erreur** s\'affiche (le cas échéant) ?\n- **Depuis quand** le problème se produit-il ?\n\nAvec ces informations, je pourrai vous orienter plus efficacement.',
      terminal: true,
      suggestions: [
        'Problème avec ma messagerie',
        'Mon ordinateur est lent',
        'Une application ne répond plus',
      ],
    }),
  },
];

/**
 * Detect a user intent from the query string.
 * Returns null if no pattern matches.
 */
export function detectIntent(query: string): DetectedIntent | null {
  const normalised = query.trim();
  if (!normalised) return null;

  for (const { patterns, build } of INTENT_PATTERNS) {
    if (patterns.some((re) => re.test(normalised))) {
      return build();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contextual follow-up suggestions
// ---------------------------------------------------------------------------

/** Topic keywords mapped to relevant follow-up questions */
const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  email: [
    'Comment configurer ma messagerie sur mobile ?',
    'Ma boîte est pleine, comment libérer de l\'espace ?',
    'Comment créer une règle de tri automatique ?',
  ],
  imprimante: [
    'Comment ajouter une imprimante réseau ?',
    'L\'imprimante affiche une erreur, que faire ?',
    'Comment scanner un document ?',
  ],
  reseau: [
    'Le Wi-Fi ne fonctionne pas',
    'Comment se connecter au réseau invité ?',
    'Accès au partage réseau',
  ],
  logiciel: [
    'Comment installer un nouveau logiciel ?',
    'Demander une licence logicielle',
    'Un logiciel plante au démarrage',
  ],
  materiel: [
    'Mon écran ne s\'allume pas',
    'Comment connecter un deuxième écran ?',
    'Demander un remplacement matériel',
  ],
  securite: [
    'Comment activer le MFA ?',
    'J\'ai reçu un email suspect',
    'Politique de sécurité IT',
  ],
  compte: [
    'Mon compte est bloqué',
    'Comment changer mon mot de passe ?',
    'Gestion de mes accès et permissions',
  ],
};

const TOPIC_KEYWORDS: Record<string, string[]> = {
  email: ['email', 'mail', 'messagerie', 'outlook', 'smtp', 'imap', 'boite'],
  imprimante: ['imprimante', 'impression', 'imprimer', 'scanner', 'scan'],
  reseau: ['reseau', 'réseau', 'wifi', 'wi-fi', 'ethernet', 'internet', 'connexion'],
  logiciel: ['logiciel', 'application', 'app', 'software', 'installer', 'licence'],
  materiel: ['materiel', 'matériel', 'ecran', 'écran', 'clavier', 'souris', 'laptop', 'pc', 'ordinateur'],
  securite: ['securite', 'sécurité', 'mfa', 'phishing', 'virus', 'antivirus', 'suspect'],
  compte: ['compte', 'acces', 'accès', 'permission', 'role', 'profil', 'login', 'session'],
};

/**
 * Given a query, return up to 3 contextual follow-up suggestions.
 * Falls back to generic suggestions if no topic matches.
 */
export function getContextualSuggestions(query: string, existingSuggestions?: string[]): string[] {
  const lower = query.toLowerCase();

  // Find best matching topic
  let bestTopic: string | null = null;
  let bestCount = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const count = keywords.filter((kw) => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestTopic = topic;
    }
  }

  if (bestTopic && TOPIC_SUGGESTIONS[bestTopic]) {
    const topicSugs = TOPIC_SUGGESTIONS[bestTopic];
    if (!topicSugs) return [];
    // Filter out any that are already in existingSuggestions
    const filtered = existingSuggestions
      ? topicSugs.filter((s) => !existingSuggestions.includes(s))
      : topicSugs;
    return filtered.slice(0, 3);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Conversation history persistence (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'omnitech:helpdesk-history';
const MAX_MESSAGES = 50;

export function loadHistory(): SerializedMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SerializedMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveHistory(messages: SerializedMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a RAG score (typically 0–1 cosine similarity from TF-IDF)
 * into a 0–100 percentage for display.
 */
export function normalizeRagScore(sources: Array<{ score: number }>): number {
  if (!sources || sources.length === 0) return 0;
  const maxScore = Math.max(...sources.map((s) => s.score));
  // The TF-IDF scores are usually 0–1; clamp to be safe
  return Math.min(100, Math.round(Math.max(0, maxScore) * 100));
}

export function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: 'Confiance elevee', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  if (score >= 40) return { text: 'Confiance moyenne', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  return { text: 'Confiance faible', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
}
