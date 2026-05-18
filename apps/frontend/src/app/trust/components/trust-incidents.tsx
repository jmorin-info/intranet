import { CheckCircle2, FileLock2 } from "lucide-react";

export function TrustIncidents() {
  return (
    <section
      id="incidents"
      aria-labelledby="incidents-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Historique
        </p>
        <h2
          id="incidents-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Incidents majeurs
        </h2>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#006233]/20 bg-[#006233]/5 p-6 shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#006233]/10 blur-3xl"
        />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <CheckCircle2
              className="h-7 w-7 text-[#006233]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-[#006233]">
              Aucun incident majeur déclaré au cours des 12 derniers mois.
            </h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#006233]/85">
              <FileLock2 className="h-4 w-4" aria-hidden="true" />
              Historique complet disponible sur demande avec NDA.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
