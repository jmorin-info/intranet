/**
 * Sections additionnelles de la page Welcome — toutes Server Components,
 * rendues uniquement si le bloc CMS correspondant a du contenu valide.
 *
 * Voir `_cms.ts` pour les schémas et normalizers.
 */

import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getBlockData, type ContentBlocksMap } from "@/lib/cms";
import {
  normalizeWelcomeBanner,
  normalizeWelcomeMedia,
  normalizeTestimonial,
  type TestimonialItem,
} from "./_cms";

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

const BANNER_VARIANT_STYLES = {
  info: {
    bg: "bg-[#296dc1]/10",
    border: "border-[#296dc1]/30",
    text: "text-[#0b5482]",
    icon: Info,
  },
  warn: {
    bg: "bg-[#f9964a]/10",
    border: "border-[#f9964a]/30",
    text: "text-[#9a4f0e]",
    icon: AlertTriangle,
  },
  success: {
    bg: "bg-[#006233]/10",
    border: "border-[#006233]/30",
    text: "text-[#04432a]",
    icon: CheckCircle2,
  },
};

export function WelcomeBannerSection({ blocks }: { blocks: ContentBlocksMap }) {
  const raw = getBlockData<unknown>(blocks, "welcome.banner", null);
  const banner = normalizeWelcomeBanner(raw);
  if (!banner || !banner.active) return null;
  const v = BANNER_VARIANT_STYLES[banner.variant];
  const Icon = v.icon;
  return (
    <div
      className={`border-b ${v.border} ${v.bg}`}
      role="region"
      aria-label="Annonce"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-center gap-3 flex-wrap text-center">
        <Icon className={`h-4 w-4 shrink-0 ${v.text}`} aria-hidden="true" />
        <p className={`text-sm font-medium ${v.text}`}>{banner.message}</p>
        {banner.ctaLabel && banner.ctaHref && (
          <a
            href={banner.ctaHref}
            className={`inline-flex items-center text-xs font-semibold underline underline-offset-2 ${v.text}`}
          >
            {banner.ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export function WelcomeTestimonialsSection({
  blocks,
}: {
  blocks: ContentBlocksMap;
}) {
  const raw = getBlockData<unknown[]>(blocks, "welcome.testimonials", []);
  const items = Array.isArray(raw)
    ? raw
        .map(normalizeTestimonial)
        .filter((t): t is TestimonialItem => t !== null)
    : [];
  if (items.length === 0) return null;
  return (
    <section
      className="bg-white py-16 sm:py-20"
      aria-labelledby="testimonials-title"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2
          id="testimonials-title"
          className="text-2xl sm:text-3xl font-light text-seal-navy text-center mb-12"
        >
          Ils utilisent l&apos;intranet au quotidien
        </h2>
        <ul role="list" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <li
              key={`${t.author}-${t.role}`}
              className="rounded-2xl border border-gray-200 bg-[#F5F5F5] p-6 shadow-sm"
            >
              <p className="text-sm leading-relaxed text-[#454955] italic before:content-['“'] before:mr-1 after:content-['”'] after:ml-1">
                {t.quote}
              </p>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-seal-navy">
                  {t.author}
                </p>
                <p className="text-xs text-[#837274]">{t.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Media (image / vidéo hero secondaire)
// ---------------------------------------------------------------------------

export function WelcomeMediaSection({ blocks }: { blocks: ContentBlocksMap }) {
  const raw = getBlockData<unknown>(blocks, "welcome.media", null);
  const media = normalizeWelcomeMedia(raw);
  if (!media) return null;
  return (
    <section
      className="bg-[#F5F5F5] py-16 sm:py-20"
      aria-labelledby="media-title"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <figure className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          {media.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.src}
              alt={media.caption}
              className="w-full h-auto"
              loading="lazy"
            />
          ) : (
            <video
              src={media.src}
              controls
              preload="metadata"
              aria-label={media.caption}
              className="w-full h-auto"
            />
          )}
          <figcaption className="p-5 text-center">
            <p
              id="media-title"
              className="text-sm font-semibold text-seal-navy"
            >
              {media.caption}
            </p>
            {media.description && (
              <p className="mt-1 text-xs text-[#837274]">{media.description}</p>
            )}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
