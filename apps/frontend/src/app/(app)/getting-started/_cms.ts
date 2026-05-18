import type { LucideIcon } from "lucide-react";
import {
  User,
  Shield,
  Layers,
  FileSignature,
  Sparkles,
  Search,
} from "lucide-react";

export type StepIconKey =
  | "User"
  | "Shield"
  | "Layers"
  | "FileSignature"
  | "Sparkles"
  | "Search";

export type StepStatusKey = "profile" | "mfa" | "spaces" | "chartes" | "ai";

export const STEP_ICON_REGISTRY: Record<StepIconKey, LucideIcon> = {
  User,
  Shield,
  Layers,
  FileSignature,
  Sparkles,
  Search,
};

const STATUS_KEYS: Record<StepStatusKey, true> = {
  profile: true,
  mfa: true,
  spaces: true,
  chartes: true,
  ai: true,
};

export interface OnboardingStep {
  id: StepStatusKey;
  iconKey: StepIconKey;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  /** Classe utilitaire Tailwind du dégradé — whitelist obligatoire (purge). */
  gradient: string;
}

export const ALLOWED_GRADIENTS: Record<string, true> = {
  "from-purple-500 to-purple-600": true,
  "from-emerald-500 to-emerald-600": true,
  "from-blue-500 to-blue-600": true,
  "from-seal-bordeaux to-red-700": true,
  "from-[#F68D2E] to-[#e07d1f]": true,
};

export const FALLBACK_STEPS: OnboardingStep[] = [
  {
    id: "profile",
    iconKey: "User",
    title: "Votre profil",
    description:
      "Completez votre profil et ajoutez une photo pour que vos collegues vous identifient facilement.",
    href: "/profile",
    actionLabel: "Modifier mon profil",
    gradient: "from-purple-500 to-purple-600",
  },
  {
    id: "mfa",
    iconKey: "Shield",
    title: "Activer le MFA",
    description:
      "Renforcez la sécurité de votre compte en activant l'authentification multi-facteurs (2FA).",
    href: "/mfa",
    actionLabel: "Configurer le MFA",
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    id: "spaces",
    iconKey: "Layers",
    title: "Explorer vos espaces",
    description:
      "Decouvrez les espaces de tickets : chaque equipe dispose de son propre espace avec des workflows adaptes.",
    href: "/tickets",
    actionLabel: "Voir les espaces",
    gradient: "from-blue-500 to-blue-600",
  },
  {
    id: "chartes",
    iconKey: "FileSignature",
    title: "Signer les chartes",
    description:
      "Consultez et signez les chartes obligatoires (charte informatique, RGPD, sécurité).",
    href: "/chartes",
    actionLabel: "Voir les chartes",
    gradient: "from-seal-bordeaux to-red-700",
  },
  {
    id: "ai",
    iconKey: "Sparkles",
    title: "Decouvrir l'assistant IA",
    description:
      "Utilisez la recherche intelligente pour trouver documents, tickets et procedures en un instant.",
    href: "/search",
    actionLabel: "Essayer la recherche",
    gradient: "from-[#F68D2E] to-[#e07d1f]",
  },
];

function isStepStatusKey(s: string): s is StepStatusKey {
  return s in STATUS_KEYS;
}

export function normalizeStep(raw: unknown): OnboardingStep | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && isStepStatusKey(o.id) ? o.id : null;
  const iconKey = typeof o.iconKey === "string" ? o.iconKey : null;
  const title = typeof o.title === "string" ? o.title : null;
  const description = typeof o.description === "string" ? o.description : null;
  const href = typeof o.href === "string" ? o.href : null;
  const actionLabel = typeof o.actionLabel === "string" ? o.actionLabel : null;
  const gradient = typeof o.gradient === "string" ? o.gradient : null;
  if (
    !id ||
    !iconKey ||
    !title ||
    !description ||
    !href ||
    !actionLabel ||
    !gradient
  ) {
    return null;
  }
  if (!(iconKey in STEP_ICON_REGISTRY)) return null;
  if (!(gradient in ALLOWED_GRADIENTS)) return null;
  return {
    id,
    iconKey: iconKey as StepIconKey,
    title,
    description,
    href,
    actionLabel,
    gradient,
  };
}

export interface KeyboardShortcut {
  keys: string;
  label: string;
}

export const FALLBACK_SHORTCUTS: KeyboardShortcut[] = [
  { keys: "⌘K", label: "Recherche rapide / palette de commandes" },
  { keys: "?", label: "Afficher tous les raccourcis clavier" },
  { keys: "Ctrl+Shift+D", label: "Nouveau document express" },
  { keys: "Alt", label: "Mode focus (masquer la sidebar)" },
  { keys: "Ctrl+Alt+1-4", label: "Naviguer entre les hubs" },
];

export function normalizeShortcut(raw: unknown): KeyboardShortcut | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const keys = typeof o.keys === "string" ? o.keys : null;
  const label = typeof o.label === "string" ? o.label : null;
  if (!keys || !label) return null;
  return { keys, label };
}
