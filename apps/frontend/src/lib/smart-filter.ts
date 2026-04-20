/**
 * Smart Filter — parser NL → filtres structurés
 * ==============================================
 *
 * Transforme une requête en langage naturel (FR, avec fallback EN) en un
 * jeu de filtres structurés exploitables par les pages de liste (tickets,
 * documents, incidents...). Aucun backend IA : heuristiques locales, rapides,
 * déterministes et faciles à tester.
 *
 * Exemples :
 *   "mes tickets ouverts cette semaine critiques"
 *   "documents à revoir ce mois"
 *   "incidents haute priorité hier"
 *
 * L'appelant décide quels champs il utilise parmi ceux retournés.
 */

export type SmartStatus = 'open' | 'in_progress' | 'closed' | 'pending' | 'resolved';
export type SmartPriority = 'low' | 'medium' | 'high' | 'critical';
export type SmartPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month';

export interface SmartFilter {
  /** Texte libre restant après extraction (à utiliser pour une recherche fulltext). */
  query: string;
  /** "mes X" → true */
  mine: boolean;
  status: SmartStatus | null;
  priority: SmartPriority | null;
  period: SmartPeriod | null;
  /** Tags détectés via `#tag`. */
  tags: string[];
  /** Assignés via `@nom`. */
  mentions: string[];
}

type Rule = { match: RegExp; apply: (f: SmartFilter) => void };

const RULES: Rule[] = [
  // Possessif "mes / mon / ma / my"
  { match: /\b(mes|mon|ma|my)\b/i, apply: (f) => { f.mine = true; } },

  // Statuts
  { match: /\b(ouverts?|open)\b/i, apply: (f) => { f.status = 'open'; } },
  { match: /\b(en\s+cours|in\s+progress|wip)\b/i, apply: (f) => { f.status = 'in_progress'; } },
  { match: /\b(ferm[ée]s?|closed)\b/i, apply: (f) => { f.status = 'closed'; } },
  { match: /\b(en\s+attente|pending)\b/i, apply: (f) => { f.status = 'pending'; } },
  { match: /\b(r[ée]solus?|resolved)\b/i, apply: (f) => { f.status = 'resolved'; } },

  // Priorités
  { match: /\b(critiques?|critical|p1)\b/i, apply: (f) => { f.priority = 'critical'; } },
  { match: /\b(haute?s?\s+priorit[ée]?s?|high|urgents?|p2)\b/i, apply: (f) => { f.priority = 'high'; } },
  { match: /\b(moyennes?\s+priorit[ée]?s?|medium|p3)\b/i, apply: (f) => { f.priority = 'medium'; } },
  { match: /\b(basses?\s+priorit[ée]?s?|low|mineurs?|p4)\b/i, apply: (f) => { f.priority = 'low'; } },

  // Périodes
  { match: /\b(aujourd'?hui|today)\b/i, apply: (f) => { f.period = 'today'; } },
  { match: /\b(hier|yesterday)\b/i, apply: (f) => { f.period = 'yesterday'; } },
  { match: /\b(cette\s+semaine|this\s+week)\b/i, apply: (f) => { f.period = 'this_week'; } },
  { match: /\b(ce\s+mois|this\s+month)\b/i, apply: (f) => { f.period = 'this_month'; } },
  { match: /\b(mois\s+dernier|last\s+month)\b/i, apply: (f) => { f.period = 'last_month'; } },
];

export function parseSmartFilter(input: string): SmartFilter {
  const filter: SmartFilter = {
    query: '',
    mine: false,
    status: null,
    priority: null,
    period: null,
    tags: [],
    mentions: [],
  };

  if (!input || !input.trim()) return filter;
  let remaining = ` ${input} `;

  // Tags #xxx
  remaining = remaining.replace(/\s#([\p{L}0-9_-]+)/giu, (_, tag: string) => {
    filter.tags.push(tag.toLowerCase());
    return ' ';
  });

  // Mentions @xxx
  remaining = remaining.replace(/\s@([\p{L}0-9_.-]+)/giu, (_, name: string) => {
    filter.mentions.push(name.toLowerCase());
    return ' ';
  });

  // Règles
  for (const rule of RULES) {
    const m = rule.match.exec(remaining);
    if (m) {
      rule.apply(filter);
      remaining = remaining.replace(rule.match, ' ');
    }
  }

  filter.query = remaining.replace(/\s+/g, ' ').trim();
  return filter;
}

/**
 * Convertit un SmartPeriod en bornes ISO (inclusives côté `from`, exclusives côté `to`).
 */
export function periodToRange(period: SmartPeriod | null, now: Date = new Date()):
  | { from: string; to: string }
  | null {
  if (!period) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  switch (period) {
    case 'today':
      end.setDate(end.getDate() + 1);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      break;
    case 'this_week': {
      const day = (start.getDay() + 6) % 7; // lundi = 0
      start.setDate(start.getDate() - day);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      break;
    }
    case 'this_month':
      start.setDate(1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      break;
    case 'last_month':
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      break;
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Résume le filtre en tokens affichables (pour des chips au-dessus de la liste).
 */
export interface SmartFilterChip {
  key: string;
  label: string;
}

export function smartFilterToChips(f: SmartFilter): SmartFilterChip[] {
  const chips: SmartFilterChip[] = [];
  if (f.mine) chips.push({ key: 'mine', label: 'Les miens' });
  if (f.status) chips.push({ key: `status:${f.status}`, label: f.status.replace('_', ' ') });
  if (f.priority) chips.push({ key: `priority:${f.priority}`, label: f.priority });
  if (f.period) chips.push({ key: `period:${f.period}`, label: f.period.replace('_', ' ') });
  for (const tag of f.tags) chips.push({ key: `tag:${tag}`, label: `#${tag}` });
  for (const m of f.mentions) chips.push({ key: `mention:${m}`, label: `@${m}` });
  if (f.query) chips.push({ key: 'query', label: `"${f.query}"` });
  return chips;
}
