import Link from "next/link";
import { ArrowLeft, Cookie } from "lucide-react";
import { OmnitechLogo } from "@/components/omnitech-logo";

export const metadata = {
  title: "Politique cookies — OMNITECH Security",
  description:
    "Politique cookies de l'intranet OMNITECH Security : cookies strictement techniques, sans traceur, sans analytics et sans bandeau de consentement.",
};

const LAST_UPDATED = "25 avril 2026";

interface CookieEntry {
  name: string;
  type: string;
  finalite: string;
  duree: string;
}

const ENTRIES: CookieEntry[] = [
  {
    name: "accessToken",
    type: "Stockage local (localStorage, n’est pas un cookie)",
    finalite:
      "Maintenir la session authentifiée pendant la durée d'utilisation.",
    duree: "Effacé à la déconnexion ou à l’expiration de la session.",
  },
  {
    name: "refreshToken",
    type: "Cookie technique httpOnly, SameSite=Strict, Secure",
    finalite:
      "Renouvellement sécurisé du jeton d'accès sans réauthentification, conformément aux exigences ISO 27001.",
    duree: "7 jours glissants — révoqué à la déconnexion.",
  },
  {
    name: "locale",
    type: "Cookie technique de préférence",
    finalite: "Mémoriser la langue d'affichage choisie par l'utilisateur.",
    duree: "12 mois.",
  },
  {
    name: "darkMode",
    type: "Cookie technique de préférence",
    finalite: "Mémoriser le thème d'affichage (clair / sombre).",
    duree: "12 mois.",
  },
];

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-slate-950">
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#004469]/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <OmnitechLogo size="sm" variant="full" className="text-white" />
          </Link>
          <Link
            href="/welcome"
            className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section
        className="bg-[#004469] dark:bg-slate-900 relative overflow-hidden"
        style={{ paddingTop: "8rem", paddingBottom: "4rem" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-6">
            <Cookie className="h-4 w-4 text-[#F68D2E]" />
            <span className="text-white/70 text-xs font-semibold tracking-wide">
              Cookies strictement techniques
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-white leading-tight">
            Politique{" "}
            <span className="text-[#F68D2E] font-semibold">cookies</span>
          </h1>
          <p className="text-white/60 mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">
            L&apos;intranet OMNITECH Security utilise exclusivement des cookies
            techniques nécessaires à son fonctionnement. Aucun cookie
            publicitaire, aucun traceur tiers, aucun outil de mesure
            d&apos;audience.
          </p>
          <p className="text-white/40 text-xs mt-6">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* CONTENU */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 shadow-sm p-6 sm:p-10 space-y-8 text-[15px] leading-relaxed text-[#454955] dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              1. Pourquoi aucun bandeau de consentement ?
            </h2>
            <p>
              Conformément à l&apos;article 82 de la loi Informatique et
              Libertés et aux lignes directrices de la CNIL, les cookies
              strictement nécessaires à la fourniture d&apos;un service
              expressément demandé par l&apos;utilisateur (ici : se connecter à
              l&apos;intranet et conserver ses préférences d&apos;affichage)
              sont exemptés du recueil du consentement.
            </p>
            <p className="mt-3">
              L&apos;intranet n&apos;utilise{" "}
              <strong className="text-seal-navy dark:text-white">
                aucun cookie tiers
              </strong>
              ,{" "}
              <strong className="text-seal-navy dark:text-white">
                aucun outil d&apos;analytics
              </strong>{" "}
              et{" "}
              <strong className="text-seal-navy dark:text-white">
                aucun pixel publicitaire
              </strong>
              . Aucun bandeau de consentement n&apos;est donc nécessaire.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              2. Liste exhaustive des éléments stockés
            </h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900/40 text-seal-navy dark:text-white">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Nom</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-left px-4 py-3 font-semibold">
                      Finalité
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {ENTRIES.map((c) => (
                    <tr
                      key={c.name}
                      className="border-t border-gray-100 dark:border-slate-700/60 align-top"
                    >
                      <td className="px-4 py-3 font-mono text-[13px] text-seal-navy dark:text-white">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-[13px]">{c.type}</td>
                      <td className="px-4 py-3 text-[13px]">{c.finalite}</td>
                      <td className="px-4 py-3 text-[13px]">{c.duree}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              3. Sécurité des cookies
            </h2>
            <p>
              Le cookie <code>refreshToken</code> est un cookie{" "}
              <strong className="text-seal-navy dark:text-white">
                httpOnly
              </strong>{" "}
              (inaccessible au JavaScript de la page),{" "}
              <strong className="text-seal-navy dark:text-white">Secure</strong>{" "}
              (transmis uniquement en HTTPS) et{" "}
              <strong className="text-seal-navy dark:text-white">
                SameSite=Strict
              </strong>{" "}
              (non envoyé en cas de requête inter-sites). Cette configuration
              prévient les attaques de type vol de jeton et CSRF.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              4. Gérer ou supprimer les cookies
            </h2>
            <p>
              L&apos;utilisateur peut à tout moment supprimer les cookies depuis
              les paramètres de son navigateur. Le cookie{" "}
              <code>refreshToken</code> étant indispensable au maintien de la
              session, sa suppression entraîne une nouvelle authentification. La
              suppression des cookies <code>locale</code> et{" "}
              <code>darkMode</code> n&apos;a pour conséquence que la
              réinitialisation des préférences d&apos;affichage par défaut.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              5. Engagement de transparence
            </h2>
            <p>
              Toute évolution de la liste des cookies utilisés sera reflétée
              dans la présente page et signalée aux utilisateurs si elle
              implique un changement de finalité.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-[#837274] dark:text-slate-400">
          <Link
            href="/welcome"
            className="inline-flex items-center gap-2 text-seal-navy dark:text-white hover:text-[#F68D2E] transition"
          >
            <ArrowLeft className="h-4 w-4" /> Retour à l&apos;accueil
          </Link>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/privacy-policy"
              className="hover:text-[#F68D2E] transition"
            >
              Confidentialité
            </Link>
            <Link href="/legal" className="hover:text-[#F68D2E] transition">
              Mentions légales
            </Link>
            <Link href="/dpa" className="hover:text-[#F68D2E] transition">
              DPA
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
