import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_KB = [
  { keywords: ['vpn', 'connexion', 'distant'], question: 'Problème de connexion VPN', answer: 'Vérifiez que FortiClient est à jour. Redémarrez le client VPN. Si le problème persiste, vérifiez vos identifiants AD.' },
  { keywords: ['mot de passe', 'password', 'mdp', 'oublié'], question: 'Réinitialisation de mot de passe', answer: 'Utilisez la fonction "Mot de passe oublié" sur la page de connexion, ou contactez votre administrateur pour un reset manuel.' },
  { keywords: ['imprimante', 'impression', 'imprimer'], question: 'Problème d\'impression', answer: 'Vérifiez que l\'imprimante est allumée et connectée au réseau. Redémarrez le spooler d\'impression (services.msc > Spouleur d\'impression > Redémarrer).' },
  { keywords: ['lent', 'performance', 'ralenti', 'lag'], question: 'Poste de travail lent', answer: 'Redémarrez le poste. Vérifiez l\'espace disque disponible (>10 Go requis). Lancez un scan antivirus ESET. Si le problème persiste, créez un ticket IT.' },
  { keywords: ['email', 'outlook', 'messagerie', 'mail'], question: 'Problème de messagerie', answer: 'Vérifiez votre connexion réseau. Essayez Outlook Web Access (OWA). Videz le cache Outlook. Si le problème persiste, contactez le support IT.' },
  { keywords: ['wifi', 'réseau', 'internet', 'connexion'], question: 'Problème de réseau/WiFi', answer: 'Vérifiez que le WiFi est activé. Oubliez et reconnectez-vous au réseau OMNITECH-CORP. Vérifiez le câble Ethernet si connexion filaire.' },
  { keywords: ['logiciel', 'installer', 'application', 'programme'], question: 'Installation de logiciel', answer: 'Les installations de logiciels sont gérées par le service IT. Créez un ticket de type "Demande logiciel" avec le nom et la version souhaitée.' },
  { keywords: ['teams', 'visio', 'réunion', 'appel'], question: 'Problème Microsoft Teams', answer: 'Vérifiez votre connexion internet. Mettez à jour Teams. Vérifiez les paramètres audio/vidéo. En cas de problème de partage d\'écran, essayez le navigateur web.' },
  { keywords: ['sauvegarde', 'backup', 'fichier perdu', 'récupérer'], question: 'Récupération de fichiers', answer: 'Les sauvegardes sont effectuées quotidiennement par Veeam. Contactez le support IT avec le chemin du fichier et la date approximative de la dernière version connue.' },
  { keywords: ['mfa', 'totp', 'authentification', 'double'], question: 'Problème MFA/TOTP', answer: 'Vérifiez l\'heure de votre téléphone (doit être synchronisée). Si vous avez perdu votre téléphone, utilisez un code de secours ou contactez le RSSI pour un reset MFA.' },
  { keywords: ['intranet', 'accès', 'connexion', 'dashboard'], question: 'Comment accéder à l\'intranet OMNITECH ?', answer: 'Rendez-vous sur https://intranet.omnitech-security.fr et connectez-vous avec vos identifiants Active Directory (même login que votre session Windows). En cas de problème, utilisez la fonction "Mot de passe oublié".' },
  { keywords: ['document', 'procédure', 'télécharger', 'pdf'], question: 'Où trouver les procédures et documents officiels ?', answer: 'Tous les documents SMSI sont disponibles dans la section Documents de l\'intranet. Utilisez les filtres par catégorie (Politique, Procédure, Formulaire) pour trouver rapidement ce que vous cherchez.' },
  { keywords: ['signature', 'signer', 'docuseal', 'électronique'], question: 'Comment signer un document électroniquement ?', answer: 'Allez dans "Mes signatures" dans la sidebar. Les documents en attente de signature apparaissent avec un bouton "Signer". Vous pouvez aussi recevoir un email avec un lien direct.' },
  { keywords: ['charte', 'obligatoire', 'accepter'], question: 'Pourquoi dois-je signer des chartes à la connexion ?', answer: 'Les chartes obligatoires (PSSI — Politique de Sécurité du Système d\'Information, Charte informatique) définissent les règles d\'usage du SI chez OMNITECH Security. Leur lecture et signature sont exigées avant l\'accès à l\'intranet, conformément à ISO 27001 (A.5.1 et A.6.2) et à la directive NIS2. Après publication d\'une nouvelle version, vous devrez re-signer pour maintenir votre conformité.' },
  { keywords: ['prestataire', 'externe', 'accès', 'cheops'], question: 'Comment fonctionne l\'accès prestataire ?', answer: 'Les prestataires ont un compte local (hors AD) avec MFA obligatoire. Ils n\'accèdent qu\'aux documents contractuels et à leurs tickets. L\'accès est révisé mensuellement par le RSSI.' },
  { keywords: ['quiz', 'sensibilisation', 'formation', 'test'], question: 'Comment accéder au quiz de sensibilisation ?', answer: 'Le quiz cybersécurité est accessible depuis "Quiz Sécurité" dans la sidebar. 20 questions sur la sécurité au quotidien chez OMNITECH. Score minimum de 70% requis.' },
  { keywords: ['bitlocker', 'chiffrement', 'disque'], question: 'Mon PC affiche une demande de clé BitLocker', answer: 'BitLocker protège votre disque dur. Si la clé est demandée, ne paniquez pas. Contactez le support IT via un ticket — les clés de récupération sont stockées dans le registre REG-008.' },
  { keywords: ['fortinet', 'forticlient', 'vpn', 'distant'], question: 'Comment configurer le VPN FortiClient ?', answer: 'T\u00e9l\u00e9chargez FortiClient depuis le catalogue IT. Configurez avec : serveur vpn.omnitech-security.fr, port 443, protocole SSL. Utilisez vos identifiants AD pour vous connecter.' },
  { keywords: ['phishing', 'hameçonnage', 'suspect', 'signaler'], question: 'Comment signaler un e-mail de phishing ?', answer: 'Ne cliquez sur aucun lien et n\'ouvrez pas les pi\u00e8ces jointes. Transf\u00e9rez l\'e-mail complet au RSSI (rssi@omnitech-security.fr) puis supprimez-le. Vous pouvez aussi cr\u00e9er un ticket de cat\u00e9gorie S\u00e9curit\u00e9 pour signalement.' },
  { keywords: ['classification', 'confidentiel', 'public', 'secret', 'interne'], question: 'Comment fonctionne la classification des documents ?', answer: 'OMNITECH utilise 4 niveaux (ISO 27001 A.5.12) : Public (diffusable), Interne (collaborateurs uniquement), Confidentiel (besoin d\'en conna\u00eetre) et Secret (cercle restreint, validation RSSI). La classification d\u00e9termine les droits d\'acc\u00e8s et les r\u00e8gles de diffusion.' },
  { keywords: ['approbation', 'workflow', 'publier', 'cycle'], question: 'Comment fonctionne le cycle d\'approbation d\'un document ?', answer: 'Le cycle comporte 5 \u00e9tapes : 1) R\u00e9daction (brouillon), 2) Soumission en revue, 3) Validation par le reviewer, 4) Approbation par un responsable habilit\u00e9, 5) Publication. Chaque \u00e9tape est trac\u00e9e dans l\'historique du document.' },
  { keywords: ['incident', 'sécurité', 'signaler', 'cyberattaque'], question: 'Que faire en cas d\'incident de s\u00e9curit\u00e9 ?', answer: 'Signalez imm\u00e9diatement via le module Incidents de l\'intranet ou contactez le RSSI Julien MORIN. D\u00e9crivez les faits, l\'impact estim\u00e9 et les syst\u00e8mes concern\u00e9s. Ne tentez pas de r\u00e9soudre seul : la remont\u00e9e rapide limite la propagation.' },
  { keywords: ['accès', 'dossier', 'partage', 'permission'], question: 'Comment demander un acc\u00e8s \u00e0 un dossier partag\u00e9 ?', answer: 'Cr\u00e9ez un ticket de cat\u00e9gorie Acc\u00e8s en pr\u00e9cisant le chemin du partage r\u00e9seau, la justification m\u00e9tier et la dur\u00e9e souhait\u00e9e. Le responsable du dossier et le RSSI valident la demande conform\u00e9ment \u00e0 ISO 27001 A.5.15.' },
  { keywords: ['wiki', 'page', 'créer', 'rédiger', 'documentation'], question: 'Comment cr\u00e9er une page wiki ?', answer: 'Rendez-vous dans Wiki > Nouvelle page. R\u00e9digez en Markdown, ajoutez des tags pour faciliter la recherche et publiez. Les pages wiki permettent de documenter les proc\u00e9dures op\u00e9rationnelles, runbooks et bases de connaissances \u00e9quipe.' },
  { keywords: ['revue', 'accès', 'périodique', 'révision'], question: 'Comment fonctionne la revue p\u00e9riodique des acc\u00e8s ?', answer: 'Conform\u00e9ment \u00e0 ISO 27001 A.5.18, les acc\u00e8s sont r\u00e9vis\u00e9s trimestriellement. Les managers re\u00e7oivent une demande de validation pour chaque collaborateur. Les acc\u00e8s non justifi\u00e9s sont r\u00e9voqu\u00e9s automatiquement apr\u00e8s 15 jours sans r\u00e9ponse.' },
  { keywords: ['pdf', 'merge', 'split', 'ocr', 'stirling'], question: 'O\u00f9 trouver les outils PDF (merge, split, OCR) ?', answer: 'Les outils PDF sont accessibles via Stirling PDF, int\u00e9gr\u00e9 \u00e0 l\'intranet. Rendez-vous dans le menu Outils pour fusionner, d\u00e9couper, compresser ou appliquer l\'OCR sur vos documents PDF sans logiciel tiers.' },
  { keywords: ['veeam', 'export', 'sauvegarde', 'restauration'], question: 'Comment uploader un export Veeam ?', answer: 'Rendez-vous dans le module IT Exports de l\'intranet. S\u00e9lectionnez le type d\'export (Veeam Backup), joignez le fichier et renseignez la date du backup. Le support IT validera et int\u00e9grera l\'export dans la politique de sauvegarde.' },
  { keywords: ['lent', 'ordinateur', 'lenteur', 'optimiser'], question: 'Mon ordinateur est lent, que faire ?', answer: 'Checklist : 1) Red\u00e9marrez le poste, 2) V\u00e9rifiez l\'espace disque (>10 Go requis), 3) Fermez les onglets et applications inutiles, 4) Lancez un scan antivirus ESET, 5) V\u00e9rifiez les mises \u00e0 jour Windows. Si le probl\u00e8me persiste, cr\u00e9ez un ticket IT.' },
];

interface KBArticle {
  keywords: string[];
  question: string;
  answer: string;
}

interface KBSearchResult {
  question: string;
  answer: string;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Synonym map for common IT terms (normalized, accent-free).
 * Each key expands to include all its synonyms during search.
 */
const IT_SYNONYMS: Record<string, string[]> = {
  'mdp': ['mot de passe', 'password', 'pwd'],
  'mot de passe': ['mdp', 'password', 'pwd'],
  'password': ['mdp', 'mot de passe', 'pwd'],
  'ordi': ['ordinateur', 'pc', 'poste', 'laptop', 'portable'],
  'ordinateur': ['ordi', 'pc', 'poste', 'laptop', 'portable'],
  'imprimante': ['printer', 'impression', 'imprimer'],
  'printer': ['imprimante', 'impression', 'imprimer'],
  'vpn': ['acces distant', 'connexion distante', 'fortinet', 'forticlient'],
  'acces distant': ['vpn', 'connexion distante'],
  'wifi': ['reseau', 'internet', 'sans fil', 'wireless'],
  'mail': ['email', 'outlook', 'messagerie', 'courriel'],
  'email': ['mail', 'outlook', 'messagerie'],
  'tel': ['telephone', 'mobile', 'smartphone'],
  'lent': ['performance', 'ralenti', 'lag', 'freeze'],
};

@Injectable()
export class HelpdeskService {
  constructor(private readonly prisma: PrismaService) {}

  async getKnowledgeBase() {
    const config = await this.prisma.appConfig.findUnique({ where: { key: 'helpdesk_kb' } });
    if (config) {
      try { return JSON.parse(config.value); } catch { return DEFAULT_KB; }
    }
    return DEFAULT_KB;
  }

  /**
   * Compute Levenshtein distance between two strings.
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }

  /**
   * Normalize a string: lowercase, remove accents.
   */
  private normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Expand query terms with synonyms so "mdp" also matches "mot de passe" keywords.
   */
  private expandWithSynonyms(terms: string[]): string[] {
    const expanded = new Set<string>(terms);
    for (const term of terms) {
      const synonyms = IT_SYNONYMS[term];
      if (synonyms) {
        for (const syn of synonyms) {
          // Add each word of multi-word synonyms individually
          syn.split(/\s+/).forEach(w => expanded.add(w));
          expanded.add(syn);
        }
      }
    }
    return Array.from(expanded);
  }

  /**
   * Check whether a term fuzzy-matches a keyword within 1-2 edits,
   * proportional to the term length (short terms require exact match).
   */
  private fuzzyMatches(term: string, keyword: string): boolean {
    if (term === keyword) return true;
    if (keyword.includes(term) || term.includes(keyword)) return true;
    if (term.length < 4) return false; // no fuzzy for very short terms
    const maxDist = term.length <= 5 ? 1 : 2;
    return this.levenshtein(term, keyword) <= maxDist;
  }

  /**
   * Search the KB using keyword match scoring with:
   * - Synonym expansion for common IT abbreviations
   * - Fuzzy matching (1-2 character typos)
   * Returns the best-matching article with a confidence percentage.
   * If confidence < 30%, suggests creating a ticket instead.
   */
  async searchKnowledgeBase(query: string): Promise<{
    result: KBSearchResult | null;
    allResults: KBSearchResult[];
    suggestTicket: boolean;
  }> {
    const kb: KBArticle[] = await this.getKnowledgeBase();
    if (!query || query.trim().length < 2) {
      return { result: null, allResults: [], suggestTicket: false };
    }

    const rawTerms = this.normalize(query)
      .split(/\s+/)
      .filter(t => t.length > 1);

    // Expand with synonyms before scoring
    const queryTerms = this.expandWithSynonyms(rawTerms);

    const scored: KBSearchResult[] = kb.map((article) => {
      const normalizedKeywords = article.keywords.map(k => this.normalize(k));
      const normalizedQuestion = this.normalize(article.question);
      const normalizedAnswer = this.normalize(article.answer);

      let score = 0;
      const matchedKeywords: string[] = [];

      for (const term of queryTerms) {
        // Exact keyword match (highest weight)
        const exactMatch = normalizedKeywords.find(k => k === term);
        if (exactMatch) {
          score += 3;
          matchedKeywords.push(exactMatch);
          continue;
        }
        // Fuzzy keyword match — allows 1-2 character typos (medium-high weight)
        const fuzzyMatch = normalizedKeywords.find(k => this.fuzzyMatches(term, k));
        if (fuzzyMatch) {
          score += 2;
          matchedKeywords.push(fuzzyMatch);
          continue;
        }
        // Question/answer text match (lower weight)
        if (normalizedQuestion.includes(term)) {
          score += 1;
        } else if (normalizedAnswer.includes(term)) {
          score += 0.5;
        }
      }

      // Confidence: ratio of score to the maximum possible score
      // Base on original rawTerms length (not expanded) to avoid inflating confidence
      const maxScore = rawTerms.length * 3;
      const confidence = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;

      return {
        question: article.question,
        answer: article.answer,
        confidence,
        matchedKeywords: [...new Set(matchedKeywords)],
      };
    });

    // Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);

    const topResults = scored.filter(r => r.confidence > 0);
    const bestResult = topResults.length > 0 ? topResults[0] : null;
    const suggestTicket = !bestResult || bestResult.confidence < 30;

    return {
      result: bestResult,
      allResults: topResults.slice(0, 5),
      suggestTicket,
    };
  }

  async updateKnowledgeBase(kb: Array<{ keywords: string[]; question: string; answer: string }>) {
    await this.prisma.appConfig.upsert({
      where: { key: 'helpdesk_kb' },
      create: { key: 'helpdesk_kb', value: JSON.stringify(kb), description: 'Helpdesk knowledge base articles' },
      update: { value: JSON.stringify(kb) },
    });
    return { message: 'Base de connaissances mise à jour', count: kb.length };
  }
}
