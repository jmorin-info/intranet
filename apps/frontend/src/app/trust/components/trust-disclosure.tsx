import { Mail, KeyRound, Clock, Wrench } from "lucide-react";

export function TrustDisclosure() {
  return (
    <section
      id="divulgation"
      aria-labelledby="disclosure-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Sécurité
        </p>
        <h2
          id="disclosure-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Politique de divulgation responsable
        </h2>
        <p className="mt-2 max-w-3xl text-[#837274] dark:text-slate-400">
          Vous avez identifié une vulnérabilité&nbsp;? Contactez-nous de manière
          coordonnée. Nous ne poursuivons jamais un chercheur agissant de bonne
          foi dans le cadre de cette politique.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-[#F68D2E]/10 bg-gradient-to-br from-[#F68D2E] to-[#0b5482] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-[#f9964a]" aria-hidden="true" />
            <div>
              <div className="text-xs uppercase tracking-widest text-white/70">
                Contact sécurité
              </div>
              <a
                href="mailto:security@omnitech-security.fr"
                className="font-display text-xl font-bold underline-offset-4 hover:underline"
              >
                security@omnitech-security.fr
              </a>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <KeyRound className="h-5 w-5 text-[#f9964a]" aria-hidden="true" />
            <div className="text-sm">
              <div className="font-semibold">Clé publique PGP</div>
              <div className="text-white/80">
                [Clé publique PGP disponible sur demande]
              </div>
            </div>
          </div>
        </div>

        <ul role="list" className="grid gap-3">
          <li className="flex items-start gap-3 rounded-2xl border border-[#F68D2E]/10 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Clock
              className="mt-0.5 h-5 w-5 shrink-0 text-[#296dc1]"
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Accusé de réception &lt; 48&nbsp;h
              </div>
              <div className="text-sm text-[#837274] dark:text-slate-400">
                Toute déclaration reçoit une première réponse humaine sous
                2&nbsp;jours ouvrés.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-[#F68D2E]/10 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Wrench
              className="mt-0.5 h-5 w-5 shrink-0 text-[#006233]"
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Correctif &lt; 90&nbsp;jours
              </div>
              <div className="text-sm text-[#837274] dark:text-slate-400">
                Engagement de correction pour les vulnérabilités confirmées,
                délai ajustable selon la sévérité.
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
