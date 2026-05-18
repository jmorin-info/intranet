import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";

/**
 * Hero full-width du Centre de confiance.
 * Fond dégradé navy → orange SEAL, motif radial subtil.
 */
export function TrustHero() {
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
          Centre de confiance public
        </div>
        <h1
          id="trust-hero-title"
          className="font-display text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl"
        >
          Centre de confiance
          <br />
          <span className="bg-gradient-to-r from-[#f9964a] to-[#ffcc99] bg-clip-text text-transparent">
            OMNITECH Security
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/85 sm:text-xl">
          La transparence comme socle de la confiance. Découvrez nos
          certifications, nos engagements et la preuve de nos pratiques
          sécurité.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/api/trust/compliance-pack.pdf"
            className="inline-flex items-center gap-2 rounded-xl bg-[#f9964a] px-5 py-3 font-semibold text-white shadow-lg shadow-[#f9964a]/30 transition hover:bg-[#f9964a]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger le dossier de conformité
          </Link>
          <a
            href="#certifications"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-5 py-3 font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
          >
            Voir nos certifications
          </a>
        </div>
      </div>
    </section>
  );
}
