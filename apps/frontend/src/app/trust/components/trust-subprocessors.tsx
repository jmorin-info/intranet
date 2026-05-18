interface Subprocessor {
  name: string;
  service: string;
  location: string;
  dpa: boolean;
}

const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Scaleway",
    service: "Hébergement (IaaS) & stockage objet",
    location: "France (Paris / Amsterdam)",
    dpa: true,
  },
  {
    name: "Sentry",
    service: "Observabilité & détection d’erreurs",
    location: "Union européenne",
    dpa: true,
  },
  {
    name: "Cloudflare",
    service: "DNS autoritaires & protection DDoS",
    location: "Union européenne",
    dpa: true,
  },
];

export function TrustSubprocessors() {
  return (
    <section
      id="sous-traitants"
      aria-labelledby="subprocessors-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Chaîne de traitement
        </p>
        <h2
          id="subprocessors-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Sous-traitants de rang 2
        </h2>
        <p className="mt-2 max-w-3xl text-[#837274] dark:text-slate-400">
          Tous nos sous-traitants sont localisés dans l’UE et liés par un Data
          Processing Agreement (DPA) conforme à l’article 28 du RGPD.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#F68D2E]/10 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#F68D2E]/10 text-sm dark:divide-slate-800">
            <caption className="sr-only">
              Liste des sous-traitants, services fournis, localisation et statut
              du DPA.
            </caption>
            <thead className="bg-[#f7f7f5] dark:bg-slate-800/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[#837274] dark:text-slate-400">
                <th scope="col" className="px-4 py-3">
                  Prestataire
                </th>
                <th scope="col" className="px-4 py-3">
                  Service
                </th>
                <th scope="col" className="px-4 py-3">
                  Localisation
                </th>
                <th scope="col" className="px-4 py-3">
                  DPA signé
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F68D2E]/5 dark:divide-slate-800">
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="text-slate-900 dark:text-slate-200">
                  <td className="px-4 py-3 font-semibold">{s.name}</td>
                  <td className="px-4 py-3 text-slate-900/80 dark:text-slate-300">
                    {s.service}
                  </td>
                  <td className="px-4 py-3 text-slate-900/80 dark:text-slate-300">
                    {s.location}
                  </td>
                  <td className="px-4 py-3">
                    {s.dpa ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#006233]/10 px-2.5 py-1 text-xs font-semibold text-[#006233] ring-1 ring-[#006233]/25">
                        Oui
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#837274]/10 px-2.5 py-1 text-xs font-semibold text-[#837274] ring-1 ring-[#837274]/25">
                        Non
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#837274] dark:text-slate-400">
        DPA disponible sur demande auprès de{" "}
        <a
          className="font-semibold text-[#296dc1] underline-offset-2 hover:underline"
          href="mailto:dpo@omnitech-security.fr"
        >
          dpo@omnitech-security.fr
        </a>
        .
      </p>
    </section>
  );
}
