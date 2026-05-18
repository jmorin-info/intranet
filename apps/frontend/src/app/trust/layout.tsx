import type { Metadata } from "next";
import Link from "next/link";
import { OmnitechLogo } from "@/components/omnitech-logo";

export const metadata: Metadata = {
  title: "Centre de confiance — OMNITECH Security",
  description:
    "Preuves de conformité, certifications et engagements sécurité d’OMNITECH Security. Transparence, souveraineté et ISO 27001.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Centre de confiance — OMNITECH Security",
    description:
      "Preuves de conformité, certifications et engagements sécurité.",
    type: "website",
    locale: "fr_FR",
    siteName: "OMNITECH Security",
  },
  twitter: {
    card: "summary_large_image",
    title: "Centre de confiance — OMNITECH Security",
    description:
      "Preuves de conformité, certifications et engagements sécurité.",
  },
};

/**
 * Layout public du Centre de confiance /trust.
 *
 * Différent du layout (app) authentifié : pas de sidebar, pas de
 * garde JWT côté client, page indexable (robots=index,follow). On
 * fournit un header/footer minimal pour garder l'identité OMNITECH.
 */
export default function TrustLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#trust-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[#F68D2E] focus:px-3 focus:py-2 focus:text-white"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/welcome"
            className="flex items-center gap-3"
            aria-label="Accueil OMNITECH Security"
          >
            <OmnitechLogo size="sm" />
          </Link>
          <nav
            className="flex items-center gap-2 text-sm"
            aria-label="Navigation principale"
          >
            <Link
              href="/welcome"
              className="rounded-md px-3 py-1.5 text-slate-900 hover:bg-[#f9964a]/10 dark:text-slate-200"
            >
              Accueil
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-[#F68D2E] px-3 py-1.5 text-white hover:bg-[#F68D2E]/90"
            >
              Se connecter
            </Link>
          </nav>
        </div>
      </header>

      <main id="trust-main" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-[#f7f7f5] py-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 text-sm text-[#837274] sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-slate-400">
          <div>
            &copy; {new Date().getFullYear()} OMNITECH Security — Tous droits
            réservés.
          </div>
          <div className="flex gap-4">
            <a
              href="mailto:compliance@omnitech-security.fr"
              className="hover:text-[#f9964a]"
            >
              compliance@omnitech-security.fr
            </a>
            <a
              href="mailto:dpo@omnitech-security.fr"
              className="hover:text-[#f9964a]"
            >
              dpo@omnitech-security.fr
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
