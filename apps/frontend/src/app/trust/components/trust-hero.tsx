import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { getContentBlocks, getBlockData } from "@/lib/cms";

interface HeroCta {
  label: string;
  href: string;
}

interface HeroContent {
  badge: string;
  titleLine1: string;
  titleHighlight: string;
  subtitle: string;
  primaryCta: HeroCta;
  secondaryCta: HeroCta;
}

/**
 * Fallback hardcodé du hero — affiché si le bloc CMS `trust.hero` est
 * absent ou mal formé. Sert aussi de référence au seeder Prisma.
 */
const FALLBACK_HERO: HeroContent = {
  badge: "Centre de confiance public",
  titleLine1: "Centre de confiance",
  titleHighlight: "OMNITECH Security",
  subtitle:
    "La transparence comme socle de la confiance. Découvrez nos certifications, nos engagements et la preuve de nos pratiques sécurité.",
  primaryCta: {
    label: "Télécharger le dossier de conformité",
    href: "/api/trust/compliance-pack.pdf",
  },
  secondaryCta: {
    label: "Voir nos certifications",
    href: "#certifications",
  },
};

function normalizeCta(raw: unknown): HeroCta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label : null;
  const href = typeof o.href === "string" ? o.href : null;
  if (!label || !href) return null;
  return { label, href };
}

/**
 * Valide la forme JSON du bloc `trust.hero`. Tout champ manquant ou non-string
 * fait basculer le composant sur FALLBACK_HERO — pas de rendu partiel.
 */
function normalizeHero(raw: unknown): HeroContent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const badge = typeof o.badge === "string" ? o.badge : null;
  const titleLine1 = typeof o.titleLine1 === "string" ? o.titleLine1 : null;
  const titleHighlight =
    typeof o.titleHighlight === "string" ? o.titleHighlight : null;
  const subtitle = typeof o.subtitle === "string" ? o.subtitle : null;
  const primaryCta = normalizeCta(o.primaryCta);
  const secondaryCta = normalizeCta(o.secondaryCta);
  if (
    !badge ||
    !titleLine1 ||
    !titleHighlight ||
    !subtitle ||
    !primaryCta ||
    !secondaryCta
  ) {
    return null;
  }
  return {
    badge,
    titleLine1,
    titleHighlight,
    subtitle,
    primaryCta,
    secondaryCta,
  };
}

/**
 * Hero full-width du Centre de confiance.
 * Fond dégradé navy → orange SEAL, motif radial subtil.
 * Contenu éditorial servi par le bloc CMS `trust.hero` avec fallback hardcodé.
 */
export async function TrustHero() {
  const blocks = await getContentBlocks(["trust.hero"], "fr");
  const raw = getBlockData<unknown>(blocks, "trust.hero", null);
  const content = normalizeHero(raw) ?? FALLBACK_HERO;

  return (
    <section
      aria-labelledby="trust-hero-title"
      className="relative mt-6 overflow-hidden rounded-3xl border border-[#F68D2E]/10 bg-gradient-to-br from-[#F68D2E] via-[#0b5482] to-[#892034] p-8 text-white shadow-xl sm:p-12 lg:p-16"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(249,150,74,0.9) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(41,109,193,0.9) 0%, transparent 40%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(transparent 95%, rgba(255,255,255,0.35) 95%), linear-gradient(90deg, transparent 95%, rgba(255,255,255,0.35) 95%)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider backdrop-blur-sm">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[#f9964a]"
            aria-hidden="true"
          />
          {content.badge}
        </div>
        <h1
          id="trust-hero-title"
          className="font-display text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl"
        >
          {content.titleLine1}
          <br />
          <span className="bg-gradient-to-r from-[#f9964a] to-[#ffcc99] bg-clip-text text-transparent">
            {content.titleHighlight}
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/85 sm:text-xl">
          {content.subtitle}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={content.primaryCta.href}
            className="inline-flex items-center gap-2 rounded-xl bg-[#f9964a] px-5 py-3 font-semibold text-white shadow-lg shadow-[#f9964a]/30 transition hover:bg-[#f9964a]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {content.primaryCta.label}
          </Link>
          <a
            href={content.secondaryCta.href}
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-5 py-3 font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
          >
            {content.secondaryCta.label}
          </a>
        </div>
      </div>
    </section>
  );
}

export { normalizeHero, FALLBACK_HERO };
export type { HeroContent, HeroCta };
