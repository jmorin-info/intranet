/**
 * Schémas & normalizers pour les sections Welcome additionnelles
 * (banner / testimonials / media) — PR-13.
 *
 * Toutes les sections sont **optionnelles** : si le bloc CMS est absent
 * ou n'a pas de contenu valide, le composant retourne `null` et la page
 * Welcome historique (hero / steps / services / FAQ) reste inchangée.
 */

export interface WelcomeBanner {
  /** Message principal du bandeau (court, < 200 chars). */
  message: string;
  /** Style visuel : info (bleu) / warn (orange) / success (vert). */
  variant: "info" | "warn" | "success";
  /** CTA optionnel : si label et href sont fournis, on affiche un bouton. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Si "false", le bandeau ne s'affiche pas (kill switch sans dépublier). */
  active: boolean;
}

const VARIANT_KEYS: Record<WelcomeBanner["variant"], true> = {
  info: true,
  warn: true,
  success: true,
};

export function normalizeWelcomeBanner(raw: unknown): WelcomeBanner | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message : null;
  const variant =
    typeof o.variant === "string" && o.variant in VARIANT_KEYS
      ? (o.variant as WelcomeBanner["variant"])
      : null;
  const active = o.active !== false; // par défaut actif si défini
  if (!message || !variant) return null;
  return {
    message,
    variant,
    active,
    ctaLabel:
      typeof o.ctaLabel === "string" && o.ctaLabel.length > 0
        ? o.ctaLabel
        : undefined,
    ctaHref:
      typeof o.ctaHref === "string" && o.ctaHref.length > 0
        ? o.ctaHref
        : undefined,
  };
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role: string;
}

export function normalizeTestimonial(raw: unknown): TestimonialItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const quote = typeof o.quote === "string" ? o.quote : null;
  const author = typeof o.author === "string" ? o.author : null;
  const role = typeof o.role === "string" ? o.role : null;
  if (!quote || !author || !role) return null;
  return { quote, author, role };
}

export interface WelcomeMedia {
  type: "image" | "video";
  src: string;
  /** Alt text image / titre vidéo (a11y). */
  caption: string;
  /** Légende optionnelle. */
  description?: string;
}

const MEDIA_TYPES: Record<WelcomeMedia["type"], true> = {
  image: true,
  video: true,
};

export function normalizeWelcomeMedia(raw: unknown): WelcomeMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type =
    typeof o.type === "string" && o.type in MEDIA_TYPES
      ? (o.type as WelcomeMedia["type"])
      : null;
  const src = typeof o.src === "string" ? o.src : null;
  const caption = typeof o.caption === "string" ? o.caption : null;
  if (!type || !src || !caption) return null;
  // src doit être soit un chemin relatif (/img/...) soit une URL https
  if (!src.startsWith("/") && !src.startsWith("https://")) return null;
  return {
    type,
    src,
    caption,
    description:
      typeof o.description === "string" && o.description.length > 0
        ? o.description
        : undefined,
  };
}
