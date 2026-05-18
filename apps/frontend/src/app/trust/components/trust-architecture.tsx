import {
  User,
  Shield,
  Server,
  Database,
  ArrowRight,
  CloudOff,
} from "lucide-react";

/**
 * Schéma textuel simple (pas de lib graphique) pour que le rendu reste
 * lisible en SEO et accessible aux lecteurs d'écran.
 */
export function TrustArchitecture() {
  const nodes = [
    { icon: User, label: "Utilisateur", caption: "Navigateur / mobile" },
    { icon: Shield, label: "WAF BunkerWeb", caption: "Filtrage bordure" },
    { icon: Server, label: "Intranet", caption: "NestJS / Next.js" },
    { icon: Database, label: "DB chiffrée", caption: "PostgreSQL AES" },
  ];

  return (
    <section
      id="architecture"
      aria-labelledby="architecture-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Architecture
        </p>
        <h2
          id="architecture-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Une architecture sécurisée par conception
        </h2>
      </div>

      <div className="rounded-3xl border border-[#F68D2E]/10 bg-gradient-to-br from-white via-[#f7f7f5] to-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <ol
          role="list"
          aria-label="Flux de données de l’utilisateur à la base chiffrée"
          className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-2"
        >
          {nodes.map((n, i) => {
            const Icon = n.icon;
            return (
              <li
                key={n.label}
                className="flex flex-1 items-center gap-3 md:flex-col md:text-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#F68D2E]/10 bg-white p-4 shadow-sm md:w-full md:flex-col md:items-center md:text-center dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F68D2E]/5 ring-1 ring-[#F68D2E]/15 md:h-14 md:w-14">
                    <Icon
                      className="h-5 w-5 text-slate-900 md:h-6 md:w-6 dark:text-slate-100"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {n.label}
                    </div>
                    <div className="text-xs text-[#837274] dark:text-slate-400">
                      {n.caption}
                    </div>
                  </div>
                </div>
                {i < nodes.length - 1 && (
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden h-5 w-5 shrink-0 text-[#f9964a] md:block"
                  />
                )}
                {i < nodes.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="mx-auto h-5 w-px bg-[#f9964a]/40 md:hidden"
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#006233]/20 bg-[#006233]/5 p-4">
          <CloudOff className="h-5 w-5 text-[#006233]" aria-hidden="true" />
          <p className="text-sm font-medium text-[#006233]">
            Zéro dépendance cloud externe : aucun service propriétaire américain
            dans le chemin critique des données clients.
          </p>
        </div>
      </div>
    </section>
  );
}
