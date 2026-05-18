import { CheckCircle2, Rocket, CalendarClock } from "lucide-react";

type CertStatus = "conforme" | "en_cours" | "planifie";

interface Certification {
  title: string;
  subtitle: string;
  description: string;
  status: CertStatus;
  lastAuditLabel: string;
}

const CERTIFICATIONS: Certification[] = [
  {
    title: "ISO 27001:2022",
    subtitle: "SMSI certifié",
    description: "93 contrôles Annex A implémentés et audités.",
    status: "conforme",
    lastAuditLabel: "Dernier audit interne : Q1 2026",
  },
  {
    title: "RGPD",
    subtitle: "Règlement UE 2016/679",
    description: "DPO désigné, registre des traitements, procédures DSAR.",
    status: "conforme",
    lastAuditLabel: "Revue annuelle : 2026",
  },
  {
    title: "ANSSI",
    subtitle: "Recommandations R-SI",
    description:
      "Alignement sur le guide d’hygiène informatique et les référentiels SecNumCloud.",
    status: "conforme",
    lastAuditLabel: "Auto-évaluation : 2026",
  },
  {
    title: "HDS",
    subtitle: "Hébergeur de données de santé",
    description:
      "Préparation de l’audit de certification pour les clients du secteur santé.",
    status: "en_cours",
    lastAuditLabel: "Cible : Q4 2026",
  },
  {
    title: "SOC 2 Type II",
    subtitle: "AICPA Trust Services",
    description:
      "Cadrage des contrôles et sélection de l’auditeur externe en cours.",
    status: "planifie",
    lastAuditLabel: "Cible : 2027",
  },
];

const STATUS_META: Record<
  CertStatus,
  { label: string; icon: typeof CheckCircle2; cls: string }
> = {
  conforme: {
    label: "Conforme",
    icon: CheckCircle2,
    cls: "bg-[#006233]/10 text-[#006233] ring-[#006233]/25",
  },
  en_cours: {
    label: "En cours",
    icon: Rocket,
    cls: "bg-[#f9964a]/10 text-[#f9964a] ring-[#f9964a]/25",
  },
  planifie: {
    label: "Planifié",
    icon: CalendarClock,
    cls: "bg-[#296dc1]/10 text-[#296dc1] ring-[#296dc1]/25",
  },
};

export function TrustCertifications() {
  return (
    <section
      id="certifications"
      aria-labelledby="certifications-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Preuves
        </p>
        <h2
          id="certifications-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Certifications et conformités
        </h2>
        <p className="mt-2 max-w-3xl text-[#837274] dark:text-slate-400">
          Nos cadres de référence, leur état d’avancement et la date du dernier
          contrôle. Les preuves détaillées sont fournies sur demande sous NDA.
        </p>
      </div>

      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CERTIFICATIONS.map((cert) => {
          const meta = STATUS_META[cert.status];
          const StatusIcon = meta.icon;
          return (
            <li
              key={cert.title}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#F68D2E]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#f9964a]/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F68D2E] via-[#f9964a] to-[#892034] opacity-80"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {cert.title}
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[#837274] dark:text-slate-400">
                    {cert.subtitle}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${meta.cls}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {meta.label}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-900/80 dark:text-slate-300">
                {cert.description}
              </p>
              <div className="mt-4 text-xs text-[#837274] dark:text-slate-500">
                {cert.lastAuditLabel}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
