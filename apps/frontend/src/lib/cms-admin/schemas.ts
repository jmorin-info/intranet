/**
 * Registry de schémas form-driven pour l'éditeur `/admin/content/blocks/[id]`.
 *
 * Chaque clé CMS connue (consommée par un composant front) est décrite ici :
 * forme attendue, libellés UI, contraintes (énums d'iconKey/accent/status…).
 *
 * Quand un admin ouvre un bloc dont la clé matche, l'UI affiche un formulaire
 * structuré au lieu de la textarea JSON brute. Les clés inconnues retombent
 * sur la textarea JSON (rétrocompatibilité, pas de blocage).
 *
 * Source de vérité front : doit rester aligné avec les `_cms.ts` voisins des
 * pages consommatrices (mêmes énums, mêmes registres d'icônes).
 */

import { NAV_ICON_OPTIONS } from "./nav-icons";

// ---------------------------------------------------------------------------
// Types — Field, Schema
// ---------------------------------------------------------------------------

export type { EnumOption } from "./schemas-types";
import type { EnumOption } from "./schemas-types";

/** Type d'un champ unique au sein d'un objet/item. */
export type FieldType =
  | { kind: "string"; multiline?: boolean }
  | { kind: "enum"; options: ReadonlyArray<EnumOption> }
  /** Comme `enum` mais avec sémantique "icône" pour l'UI (preview visuel). */
  | { kind: "icon"; options: ReadonlyArray<EnumOption> };

export interface FieldDef {
  /** Clé JSON (snake/camelCase strict). */
  name: string;
  /** Libellé visible côté admin. */
  label: string;
  type: FieldType;
  /** Si true, la sauvegarde rejette les valeurs vides. */
  required?: boolean;
  placeholder?: string;
  /** Texte d'aide affiché sous le champ. */
  help?: string;
}

/** Schéma de la propriété `data` d'un bloc. */
export type DataSchema =
  | { kind: "object"; fields: ReadonlyArray<FieldDef> }
  | {
      kind: "array";
      /** Forme d'un élément du tableau. */
      item:
        | { kind: "string"; placeholder?: string; multiline?: boolean }
        | { kind: "object"; fields: ReadonlyArray<FieldDef> };
      /** Libellé affiché dans la liste des items (col. récap). */
      itemTitle?: (item: unknown, index: number) => string;
      /** Nombre minimum d'items pour considérer le bloc valide (UI hint). */
      minItems?: number;
      /** Nombre maximum d'items (cap soft, UI hint). */
      maxItems?: number;
    };

export interface BlockSchema {
  /** Clé CMS exacte (ex: `trust.commitments`). */
  key: string;
  /** Courte description affichée en haut de l'éditeur. */
  description: string;
  /**
   * Le bloc utilise-t-il un body texte ? Si false, on masque le champ body
   * dans l'éditeur structuré (le body sert juste de description pour l'admin).
   */
  bodyIsContent?: boolean;
  /** Schéma du champ `data`. `undefined` = bloc body-only. */
  data?: DataSchema;
}

// ---------------------------------------------------------------------------
// Énums partagés — alignés avec les _cms.ts des composants consommateurs.
// ---------------------------------------------------------------------------

const ICONS_WELCOME_STEPS: EnumOption[] = [
  { value: "LogIn", label: "LogIn (connexion)" },
  { value: "Layout", label: "Layout (espace)" },
  { value: "Share2", label: "Share2 (collaboration)" },
  { value: "Bell", label: "Bell (notifications)" },
];

const ICONS_WELCOME_SERVICES: EnumOption[] = [
  { value: "FileText", label: "FileText (documents)" },
  { value: "Shield", label: "Shield (conformité)" },
  { value: "Rss", label: "Rss (veille)" },
  { value: "Ticket", label: "Ticket (tickets)" },
  { value: "BookOpen", label: "BookOpen (wiki)" },
  { value: "AlertTriangle", label: "AlertTriangle (incidents)" },
  { value: "Newspaper", label: "Newspaper (actualités)" },
  { value: "Star", label: "Star (quiz)" },
];

const ICONS_TRUST_COMMITMENTS: EnumOption[] = [
  { value: "Flag", label: "Flag (souveraineté)" },
  { value: "Lock", label: "Lock (chiffrement)" },
  { value: "KeyRound", label: "KeyRound (MFA)" },
  { value: "ListChecks", label: "ListChecks (contrôles)" },
  { value: "FlaskConical", label: "FlaskConical (tests)" },
  { value: "ShieldCheck", label: "ShieldCheck (WAF)" },
  { value: "PhoneCall", label: "PhoneCall (SLA)" },
];

const ACCENTS_TRUST: EnumOption[] = [
  { value: "orange", label: "Orange SEAL" },
  { value: "blue", label: "Bleu" },
  { value: "green", label: "Vert" },
  { value: "bordeaux", label: "Bordeaux" },
  { value: "taupe", label: "Taupe" },
];

const ICONS_TRUST_CONTACT: EnumOption[] = [
  { value: "Mail", label: "Mail" },
  { value: "UserCog", label: "UserCog" },
];

const ACCENTS_TRUST_CONTACT: EnumOption[] = [
  { value: "orange", label: "Orange" },
  { value: "blue", label: "Bleu" },
];

const STATUS_CERTIFICATIONS: EnumOption[] = [
  { value: "conforme", label: "Conforme" },
  { value: "en_cours", label: "En cours" },
  { value: "planifie", label: "Planifié" },
];

const STATUS_TRUST_BADGES: EnumOption[] = [
  { value: "OK", label: "OK" },
  { value: "PARTIAL", label: "Partiel" },
  { value: "UNKNOWN", label: "Inconnu" },
];

const ICONS_HUB_SECURITY: EnumOption[] = [
  { value: "Siren", label: "Siren" },
  { value: "ShieldAlert", label: "ShieldAlert" },
  { value: "Rss", label: "Rss" },
  { value: "BookOpen", label: "BookOpen" },
  { value: "Headset", label: "Headset" },
  { value: "GraduationCap", label: "GraduationCap" },
  { value: "Star", label: "Star" },
];

const BADGE_KEYS_SECURITY: EnumOption[] = [
  { value: "", label: "— Pas de compteur —" },
  { value: "incidents", label: "incidents" },
  { value: "alerts", label: "alerts" },
  { value: "veille", label: "veille" },
  { value: "chartes", label: "chartes" },
  { value: "tickets", label: "tickets" },
];

const ICONS_HUB_WORK: EnumOption[] = [
  { value: "FileText", label: "FileText" },
  { value: "ClipboardEdit", label: "ClipboardEdit" },
  { value: "Newspaper", label: "Newspaper" },
  { value: "BookMarked", label: "BookMarked" },
  { value: "Users", label: "Users" },
  { value: "HardDrive", label: "HardDrive" },
  { value: "Search", label: "Search" },
  { value: "FileType", label: "FileType" },
];

const BADGE_KEYS_WORK: EnumOption[] = [
  { value: "", label: "— Pas de compteur —" },
  { value: "docs", label: "docs" },
  { value: "procs", label: "procs" },
  { value: "wiki", label: "wiki" },
  { value: "news", label: "news" },
];

const ICONS_ONBOARDING_STEPS: EnumOption[] = [
  { value: "User", label: "User (profil)" },
  { value: "Shield", label: "Shield (MFA)" },
  { value: "Layers", label: "Layers (espaces)" },
  { value: "FileSignature", label: "FileSignature (chartes)" },
  { value: "Sparkles", label: "Sparkles (IA)" },
  { value: "Search", label: "Search (recherche)" },
];

const STEP_STATUS_KEYS: EnumOption[] = [
  { value: "profile", label: "profile" },
  { value: "mfa", label: "mfa" },
  { value: "spaces", label: "spaces" },
  { value: "chartes", label: "chartes" },
  { value: "ai", label: "ai" },
];

const GRADIENTS_ONBOARDING: EnumOption[] = [
  { value: "from-purple-500 to-purple-600", label: "Violet" },
  { value: "from-emerald-500 to-emerald-600", label: "Vert" },
  { value: "from-blue-500 to-blue-600", label: "Bleu" },
  { value: "from-seal-bordeaux to-red-700", label: "Bordeaux" },
  { value: "from-[#F68D2E] to-[#e07d1f]", label: "Orange SEAL" },
];

const SIDEBAR_HUBS_OPTIONS: EnumOption[] = [
  { value: "monEspace", label: "Mon espace (perso)" },
  { value: "work", label: "Travail & Connaissance" },
  { value: "security", label: "Sécurité & Conformité" },
  { value: "admin", label: "Administration" },
  { value: "rssi", label: "RSSI" },
];

const ICONS_STIRLING: EnumOption[] = [
  { value: "Merge", label: "Merge (fusionner)" },
  { value: "Scissors", label: "Scissors (diviser)" },
  { value: "ScanText", label: "ScanText (OCR)" },
  { value: "FileDown", label: "FileDown (compresser)" },
  { value: "Droplets", label: "Droplets (filigraner)" },
  { value: "ArrowRightLeft", label: "ArrowRightLeft (convertir)" },
];

const TRUST_SCORE_BADGE_KEYS: EnumOption[] = [
  { value: "identities", label: "identities" },
  { value: "continuity", label: "continuity" },
  { value: "crypto", label: "crypto" },
  { value: "audit", label: "audit" },
];

// ---------------------------------------------------------------------------
// Schémas par clé
// ---------------------------------------------------------------------------

const CTA_FIELDS: FieldDef[] = [
  { name: "label", label: "Libellé", type: { kind: "string" }, required: true },
  { name: "href", label: "Lien", type: { kind: "string" }, required: true },
];

const SCHEMAS: BlockSchema[] = [
  // — Welcome ----------------------------------------------------------------
  {
    key: "welcome.hero.title",
    description: "Titre principal du hero de /welcome.",
    bodyIsContent: true,
  },
  {
    key: "welcome.hero.subtitle",
    description: "Sous-titre du hero de /welcome.",
    bodyIsContent: true,
  },
  {
    key: "welcome.hero.cta",
    description: "Bouton principal du hero de /welcome.",
    data: { kind: "object", fields: CTA_FIELDS },
  },
  {
    key: "welcome.steps",
    description: "4 étapes « Comment ça marche » sur /welcome.",
    data: {
      kind: "array",
      minItems: 1,
      item: {
        kind: "object",
        fields: [
          {
            name: "icon",
            label: "Icône",
            type: { kind: "icon", options: ICONS_WELCOME_STEPS },
            required: true,
          },
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "body",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Étape sans titre",
    },
  },
  {
    key: "welcome.services",
    description: "8 cartes services sur /welcome.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "icon",
            label: "Icône",
            type: { kind: "icon", options: ICONS_WELCOME_SERVICES },
            required: true,
          },
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "body",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "href",
            label: "Lien (optionnel)",
            type: { kind: "string" },
          },
        ],
      },
      itemTitle: (i) =>
        (i as { title?: string })?.title ?? "Service sans titre",
    },
  },
  {
    key: "welcome.faq",
    description: "Questions fréquentes sur /welcome.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "question",
            label: "Question",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "answer",
            label: "Réponse",
            type: { kind: "string", multiline: true },
            required: true,
          },
        ],
      },
      itemTitle: (i) =>
        (i as { question?: string })?.question ?? "Question sans titre",
    },
  },

  // — Welcome additions (PR-13) ----------------------------------------------
  {
    key: "welcome.banner",
    description:
      "Bandeau d'annonce affiché en tête de /welcome. Mettre `active: false` pour masquer sans dépublier (kill switch).",
    data: {
      kind: "object",
      fields: [
        {
          name: "message",
          label: "Message",
          type: { kind: "string", multiline: true },
          required: true,
          placeholder: "Maintenance prévue dimanche 18h-22h",
        },
        {
          name: "variant",
          label: "Style",
          type: {
            kind: "enum",
            options: [
              { value: "info", label: "Info (bleu)" },
              { value: "warn", label: "Avertissement (orange)" },
              { value: "success", label: "Succès (vert)" },
            ],
          },
          required: true,
        },
        {
          name: "active",
          label: "Actif (afficher la bannière)",
          type: {
            kind: "enum",
            options: [
              { value: "true", label: "Oui — afficher" },
              { value: "false", label: "Non — masquer" },
            ],
          },
          help: "Masquer sans dépublier le bloc.",
        },
        {
          name: "ctaLabel",
          label: "Libellé bouton (optionnel)",
          type: { kind: "string" },
        },
        {
          name: "ctaHref",
          label: "Lien bouton (optionnel)",
          type: { kind: "string" },
          placeholder: "/maintenance",
        },
      ],
    },
  },
  {
    key: "welcome.testimonials",
    description:
      "Témoignages utilisateurs affichés en bas de /welcome (3-6 idéaux).",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "quote",
            label: "Citation",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "author",
            label: "Auteur",
            type: { kind: "string" },
            required: true,
            placeholder: "Marie D.",
          },
          {
            name: "role",
            label: "Rôle / Fonction",
            type: { kind: "string" },
            required: true,
            placeholder: "Responsable RSSI",
          },
        ],
      },
      itemTitle: (i) => (i as { author?: string })?.author ?? "Témoignage",
    },
  },
  {
    key: "welcome.layout",
    description:
      "Ordre d'affichage des sections optionnelles autour du contenu principal de /welcome. Bloc vide → ordre par défaut (banner top, media+testimonials bottom). Une section non listée ne s'affiche pas.",
    data: {
      kind: "object",
      fields: [
        {
          name: "topSections",
          label: "Sections AVANT le contenu principal — JSON array ordonné",
          type: { kind: "string", multiline: true },
          help: 'Ex: ["banner"]. Clés valides : "banner", "media", "testimonials".',
        },
        {
          name: "bottomSections",
          label: "Sections APRÈS le contenu principal — JSON array ordonné",
          type: { kind: "string", multiline: true },
          help: 'Ex: ["testimonials", "media"].',
        },
      ],
    },
  },
  {
    key: "welcome.media",
    description:
      "Section image ou vidéo de présentation sur /welcome (entre le client et les témoignages).",
    data: {
      kind: "object",
      fields: [
        {
          name: "type",
          label: "Type de média",
          type: {
            kind: "enum",
            options: [
              { value: "image", label: "Image" },
              { value: "video", label: "Vidéo (HTML5 <video>)" },
            ],
          },
          required: true,
        },
        {
          name: "src",
          label: "URL du média",
          type: { kind: "string" },
          required: true,
          help: "Chemin relatif (/img/...) ou URL https://. Autres protocoles rejetés.",
        },
        {
          name: "caption",
          label: "Titre / Alt text (a11y)",
          type: { kind: "string" },
          required: true,
        },
        {
          name: "description",
          label: "Description (optionnel)",
          type: { kind: "string", multiline: true },
        },
      ],
    },
  },
  // — Trust ------------------------------------------------------------------
  {
    key: "trust.hero",
    description: "Hero du Centre de confiance /trust (badge + titres + 2 CTA).",
    data: {
      kind: "object",
      fields: [
        {
          name: "badge",
          label: "Badge supérieur",
          type: { kind: "string" },
          required: true,
        },
        {
          name: "titleLine1",
          label: "Titre — ligne 1",
          type: { kind: "string" },
          required: true,
        },
        {
          name: "titleHighlight",
          label: "Titre — ligne 2 (highlight)",
          type: { kind: "string" },
          required: true,
        },
        {
          name: "subtitle",
          label: "Sous-titre",
          type: { kind: "string", multiline: true },
          required: true,
        },
        {
          name: "primaryCta",
          label: "CTA principal — JSON `{label, href}`",
          type: { kind: "string", multiline: true },
          required: true,
          help: "JSON inline en attendant le support des objets imbriqués dans l'éditeur.",
        },
        {
          name: "secondaryCta",
          label: "CTA secondaire — JSON `{label, href}`",
          type: { kind: "string", multiline: true },
          required: true,
          help: "Idem CTA principal.",
        },
      ],
    },
  },
  {
    key: "trust.commitments",
    description: "7 engagements ISO/SOC2 affichés sur /trust.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_TRUST_COMMITMENTS },
            required: true,
          },
          {
            name: "accent",
            label: "Accent couleur",
            type: { kind: "enum", options: ACCENTS_TRUST },
            required: true,
          },
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "body",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Engagement",
    },
  },
  {
    key: "trust.certifications",
    description: "5 certifications affichées sur /trust avec leur statut.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "subtitle",
            label: "Sous-titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "description",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "status",
            label: "Statut",
            type: { kind: "enum", options: STATUS_CERTIFICATIONS },
            required: true,
          },
          {
            name: "lastAuditLabel",
            label: "Dernier audit",
            type: { kind: "string" },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Certification",
    },
  },
  {
    key: "trust.contact",
    description:
      "Emails de contact affichés dans la section Contact de /trust.",
    data: {
      kind: "array",
      maxItems: 2,
      item: {
        kind: "object",
        fields: [
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_TRUST_CONTACT },
            required: true,
          },
          {
            name: "accent",
            label: "Accent",
            type: { kind: "enum", options: ACCENTS_TRUST_CONTACT },
            required: true,
          },
          {
            name: "label",
            label: "Libellé",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "email",
            label: "Email",
            type: { kind: "string" },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { label?: string })?.label ?? "Contact",
    },
  },
  {
    key: "trust.score.badges",
    description:
      "4 badges placeholder de /trust (écrasés par l'API /trust/score si disponible).",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "key",
            label: "Clé (identifie l'icône)",
            type: { kind: "enum", options: TRUST_SCORE_BADGE_KEYS },
            required: true,
          },
          {
            name: "label",
            label: "Libellé",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "caption",
            label: "Légende",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "status",
            label: "Statut",
            type: { kind: "enum", options: STATUS_TRUST_BADGES },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { label?: string })?.label ?? "Badge",
    },
  },

  // — Dashboard --------------------------------------------------------------
  {
    key: "dashboard.daily_tips",
    description:
      "Tips quotidiens affichés sous le greeting du /dashboard (rotation UTC).",
    data: {
      kind: "array",
      minItems: 1,
      item: {
        kind: "string",
        multiline: true,
        placeholder: "Conseil court (1-2 phrases)",
      },
      itemTitle: (i) => {
        const s = typeof i === "string" ? i : "";
        return s.length > 60 ? s.slice(0, 57) + "…" : s || "Tip vide";
      },
    },
  },

  // — Hubs -------------------------------------------------------------------
  {
    key: "hub.security.cards",
    description: "7 cartes du hub /hub/security.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "description",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "href",
            label: "Lien",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_HUB_SECURITY },
            required: true,
          },
          {
            name: "badgeKey",
            label: "Compteur (badge dynamique)",
            type: { kind: "enum", options: BADGE_KEYS_SECURITY },
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Carte",
    },
  },
  {
    key: "hub.work.cards",
    description: "8 cartes du hub /hub/work.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "description",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "href",
            label: "Lien",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_HUB_WORK },
            required: true,
          },
          {
            name: "badgeKey",
            label: "Compteur (badge dynamique)",
            type: { kind: "enum", options: BADGE_KEYS_WORK },
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Carte",
    },
  },

  // — Onboarding -------------------------------------------------------------
  {
    key: "onboarding.steps",
    description: "5 étapes premiers pas sur /getting-started.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "id",
            label: "ID interne (statut)",
            type: { kind: "enum", options: STEP_STATUS_KEYS },
            required: true,
            help: "Détermine l'état coché/non-coché côté front. Ne pas inventer.",
          },
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_ONBOARDING_STEPS },
            required: true,
          },
          {
            name: "title",
            label: "Titre",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "description",
            label: "Description",
            type: { kind: "string", multiline: true },
            required: true,
          },
          {
            name: "href",
            label: "Lien CTA",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "actionLabel",
            label: "Libellé du bouton",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "gradient",
            label: "Couleur de carte (dégradé)",
            type: { kind: "enum", options: GRADIENTS_ONBOARDING },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { title?: string })?.title ?? "Étape",
    },
  },
  {
    key: "onboarding.shortcuts",
    description: "Raccourcis clavier affichés sur /getting-started.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "keys",
            label: "Combinaison de touches",
            type: { kind: "string" },
            required: true,
            placeholder: "⌘K",
          },
          {
            name: "label",
            label: "Description du raccourci",
            type: { kind: "string" },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { keys?: string })?.keys ?? "Raccourci",
    },
  },
  {
    key: "onboarding.welcome_message",
    description: "Card cybersécurité affichée en tête de /getting-started.",
    data: {
      kind: "object",
      fields: [
        {
          name: "title",
          label: "Titre",
          type: { kind: "string" },
          required: true,
        },
        {
          name: "body",
          label: "Texte",
          type: { kind: "string", multiline: true },
          required: true,
        },
      ],
    },
  },

  // — Auth + Kiosk + Tools ---------------------------------------------------
  {
    key: "auth.tagline",
    description:
      "Tagline affichée sous le logo OMNITECH sur /login (texte court).",
    bodyIsContent: true,
  },
  {
    key: "kiosk.labels",
    description: "Labels des 3 écrans rotatifs du kiosque + footer.",
    data: {
      kind: "object",
      fields: [
        {
          name: "news",
          label: "Écran Actualités — JSON `{title, empty}`",
          type: { kind: "string", multiline: true },
          required: true,
          help: 'Ex: {"title":"Actualités","empty":"Aucune actualité."}',
        },
        {
          name: "veille",
          label: "Écran Veille — JSON `{title, empty}`",
          type: { kind: "string", multiline: true },
          required: true,
        },
        {
          name: "indicators",
          label: "Écran Indicateurs — JSON `{title, empty}`",
          type: { kind: "string", multiline: true },
          required: true,
        },
        {
          name: "footer",
          label: "Footer (texte)",
          type: { kind: "string" },
          required: true,
        },
      ],
    },
  },
  // — Theme (couleurs/fontes/rayons) -----------------------------------------
  {
    key: "theme.tokens",
    description:
      "Surcharge des couleurs SEAL, fontes et rayons d'arrondi du design system. Format hex (#RRGGBB) pour les couleurs, longueur CSS (12px, 0.5rem) pour les rayons. Champ vide ou invalide → la valeur d'origine de globals.css est conservée.",
    data: {
      kind: "object",
      fields: [
        // Couleurs principales — section colors (l'éditeur structuré ne
        // supporte pas les sous-objets typés pour l'instant ; chaque champ
        // est documenté inline et le normalizer côté serveur ré-aplatit).
        {
          name: "colors",
          label: "Couleurs (JSON `{sealOrange, sealBlue, ...}` hex)",
          type: { kind: "string", multiline: true },
          help: 'Ex: {"sealOrange":"#f9964a","sealNavy":"#004469"}. Clés valides : sealOrange, sealOrangeLight, sealBlue, sealGreen, sealBordeaux, sealNavy, sealTaupe, primary, primaryDark.',
        },
        {
          name: "fonts",
          label: "Fontes (JSON `{body, display}` font stacks)",
          type: { kind: "string", multiline: true },
          help: 'Ex: {"body":"\\"Inter\\", system-ui, sans-serif"}. Caractères autorisés : lettres, chiffres, espaces, virgules, tirets, guillemets.',
        },
        {
          name: "radii",
          label: "Rayons d'arrondi (JSON `{card, button, input}` px/rem)",
          type: { kind: "string", multiline: true },
          help: 'Ex: {"card":"12px","button":"8px","input":"6px"}.',
        },
      ],
    },
  },
  // — Navigation -------------------------------------------------------------
  {
    key: "nav.sidebar.custom_items",
    description:
      "Items custom ajoutés à la sidebar (en plus de ceux hardcodés). L'item apparaît dans le hub choisi à la fin de la liste — utile pour des liens externes, des outils partenaires, des raccourcis temporaires.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "hub",
            label: "Hub d'accueil",
            type: { kind: "enum", options: SIDEBAR_HUBS_OPTIONS },
            required: true,
            help: "Détermine dans quel panneau de la sidebar l'item apparaît.",
          },
          {
            name: "label",
            label: "Libellé",
            type: { kind: "string" },
            required: true,
            placeholder: "Mon outil partenaire",
          },
          {
            name: "href",
            label: "Lien",
            type: { kind: "string" },
            required: true,
            placeholder: "/tools/external ou https://…",
            help: "Lien interne (commence par /) ou URL externe complète.",
          },
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: NAV_ICON_OPTIONS },
            required: true,
          },
          {
            name: "external",
            label: "Lien externe (s'ouvre dans un nouvel onglet)",
            type: {
              kind: "enum",
              options: [
                { value: "", label: "Non (lien interne)" },
                { value: "true", label: "Oui (nouvel onglet, rel noopener)" },
              ],
            },
          },
        ],
      },
      itemTitle: (i) => {
        const o = i as { label?: string; hub?: string };
        return o.label && o.hub ? `${o.label} [${o.hub}]` : "Item custom";
      },
    },
  },
  {
    key: "nav.sidebar.hidden",
    description:
      "Hrefs d'items de la sidebar à masquer. L'item disparaît de tous les panneaux (panel principal, épinglés, recents) — utile pour cacher des modules désactivés, des fonctionnalités en cours, ou des liens dépréciés.",
    data: {
      kind: "array",
      item: {
        kind: "string",
        placeholder: "/wiki",
      },
      itemTitle: (i) => (typeof i === "string" ? i : "Href"),
    },
  },
  {
    key: "nav.sidebar.overrides",
    description:
      "Renomme un item de la sidebar par son `href`. Laisser vide pour conserver le libellé hardcodé/i18n par défaut.",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "href",
            label: "Chemin (href de l'item de sidebar)",
            type: { kind: "string" },
            required: true,
            placeholder: "/documents",
            help: "Doit correspondre exactement au href défini dans sidebar.tsx (sensible aux slashes).",
          },
          {
            name: "label",
            label: "Nouveau libellé",
            type: { kind: "string" },
            required: true,
            placeholder: "GED OMNITECH",
          },
        ],
      },
      itemTitle: (i) => {
        const o = i as { href?: string; label?: string };
        return o.label && o.href ? `${o.label} (${o.href})` : "Override";
      },
    },
  },
  {
    key: "tools.pdf.shortcuts",
    description:
      "Raccourcis vers les outils Stirling PDF (barre d'accès rapide).",
    data: {
      kind: "array",
      item: {
        kind: "object",
        fields: [
          {
            name: "label",
            label: "Libellé bouton",
            type: { kind: "string" },
            required: true,
          },
          {
            name: "path",
            label: "Chemin Stirling (doit commencer par /)",
            type: { kind: "string" },
            required: true,
            placeholder: "/merge-pdfs",
          },
          {
            name: "iconKey",
            label: "Icône",
            type: { kind: "icon", options: ICONS_STIRLING },
            required: true,
          },
        ],
      },
      itemTitle: (i) => (i as { label?: string })?.label ?? "Raccourci",
    },
  },
];

// ---------------------------------------------------------------------------
// API publique du module
// ---------------------------------------------------------------------------

/**
 * Cherche le schéma associé à une clé CMS. Retourne `null` si la clé n'a pas
 * encore de schéma déclaré → l'éditeur retombe sur la textarea JSON brute.
 */
export function resolveSchema(key: string): BlockSchema | null {
  return SCHEMAS.find((s) => s.key === key) ?? null;
}

/** Liste les clés connues. Utile pour tests et debug. */
export function listKnownSchemaKeys(): string[] {
  return SCHEMAS.map((s) => s.key);
}

export { SCHEMAS };
