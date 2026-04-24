import { Mail, UserCog } from 'lucide-react';

export function TrustContact() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Contact
        </p>
        <h2
          id="contact-title"
          className="mt-1 font-display text-2xl font-bold text-[#004469] sm:text-3xl dark:text-white"
        >
          Une question sur la conformité&nbsp;?
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="mailto:compliance@omnitech-security.fr"
          className="group flex items-center gap-4 rounded-2xl border border-[#004469]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#f9964a]/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f9964a]/10 ring-1 ring-[#f9964a]/20">
            <Mail className="h-6 w-6 text-[#f9964a]" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#837274] dark:text-slate-400">
              Conformité
            </div>
            <div className="font-display text-base font-bold text-[#004469] group-hover:text-[#f9964a] dark:text-white">
              compliance@omnitech-security.fr
            </div>
          </div>
        </a>

        <a
          href="mailto:dpo@omnitech-security.fr"
          className="group flex items-center gap-4 rounded-2xl border border-[#004469]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#296dc1]/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#296dc1]/10 ring-1 ring-[#296dc1]/20">
            <UserCog className="h-6 w-6 text-[#296dc1]" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#837274] dark:text-slate-400">
              Délégué à la protection des données
            </div>
            <div className="font-display text-base font-bold text-[#004469] group-hover:text-[#296dc1] dark:text-white">
              dpo@omnitech-security.fr
            </div>
          </div>
        </a>
      </div>
    </section>
  );
}
