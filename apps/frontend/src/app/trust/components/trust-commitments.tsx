import type { LucideIcon } from "lucide-react";
import {
  Flag,
  Lock,
  KeyRound,
  ListChecks,
  FlaskConical,
  ShieldCheck,
  PhoneCall,
} from "lucide-react";

interface Commitment {
  icon: LucideIcon;
  accent: "orange" | "blue" | "green" | "bordeaux" | "taupe";
  title: string;
  body: string;
}

const ACCENTS: Record<
  Commitment["accent"],
  { tile: string; ring: string; text: string }
> = {
  orange: {
    tile: "bg-[#f9964a]/10",
    ring: "ring-[#f9964a]/30",
    text: "text-[#f9964a]",
  },
  blue: {
    tile: "bg-[#296dc1]/10",
    ring: "ring-[#296dc1]/30",
    text: "text-[#296dc1]",
  },
  green: {
    tile: "bg-[#006233]/10",
    ring: "ring-[#006233]/30",
    text: "text-[#006233]",
  },
  bordeaux: {
    tile: "bg-[#892034]/10",
    ring: "ring-[#892034]/30",
    text: "text-[#892034]",
  },
  taupe: {
    tile: "bg-[#837274]/10",
    ring: "ring-[#837274]/30",
    text: "text-[#837274]",
  },
};

const COMMITMENTS: Commitment[] = [
  {
    icon: Flag,
    accent: "bordeaux",
    title: "Souveraineté",
    body: "Hébergement en France (Scaleway), sous-traitants exclusivement dans l’Union européenne.",
  },
  {
    icon: Lock,
    accent: "blue",
    title: "Chiffrement en transit",
    body: "TLS 1.2+ obligatoire, HSTS 2 ans avec preload, bcrypt pour les mots de passe.",
  },
  {
    icon: KeyRound,
    accent: "orange",
    title: "MFA partout",
    body: "MFA obligatoire pour les administrateurs, disponible pour l’ensemble des utilisateurs.",
  },
  {
    icon: ListChecks,
    accent: "green",
    title: "93 contrôles ISO 27001",
    body: "L’intégralité des contrôles Annex A 2022 est implémentée et tracée dans l’intranet.",
  },
  {
    icon: FlaskConical,
    accent: "blue",
    title: "Backup testé chaque semaine",
    body: "Drill automatisé de restauration hebdomadaire avec rapport horodaté et alerting.",
  },
  {
    icon: ShieldCheck,
    accent: "bordeaux",
    title: "Protection WAF & observabilité",
    body: "BunkerWeb en bordure, Sentry pour la détection d’anomalies applicatives.",
  },
  {
    icon: PhoneCall,
    accent: "orange",
    title: "SLA incident",
    body: "Accusé réception < 4 h pour incident critique, 24 h pour incident majeur.",
  },
];

export function TrustCommitments() {
  return (
    <section
      id="engagements"
      aria-labelledby="engagements-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Nos engagements
        </p>
        <h2
          id="engagements-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Ce que nous garantissons
        </h2>
      </div>

      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMMITMENTS.map((c) => {
          const Icon = c.icon;
          const accent = ACCENTS[c.accent];
          return (
            <li
              key={c.title}
              className="rounded-2xl border border-[#F68D2E]/10 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${accent.tile} ${accent.ring}`}
              >
                <Icon className={`h-5 w-5 ${accent.text}`} aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-white">
                {c.title}
              </h3>
              <p className="mt-1 text-sm text-slate-900/80 dark:text-slate-300">
                {c.body}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
