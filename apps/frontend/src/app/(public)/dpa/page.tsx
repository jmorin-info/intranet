import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { OmnitechLogo } from "@/components/omnitech-logo";

export const metadata = {
  title: "Accord de traitement des données — OMNITECH Security",
  description:
    "Résumé du Data Processing Agreement (DPA) encadrant l'usage de l'intranet par les salariés et prestataires d'OMNITECH Security.",
};

const LAST_UPDATED = "25 avril 2026";

export default function DpaPage() {
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
            <FileSignature className="h-4 w-4 text-[#F68D2E]" />
            <span className="text-white/70 text-xs font-semibold tracking-wide">
              Encadrement employeur ↔ employé
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-white leading-tight">
            Accord de traitement des{" "}
            <span className="text-[#F68D2E] font-semibold">données (DPA)</span>
          </h1>
          <p className="text-white/60 mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">
            Résumé pédagogique de l&apos;accord encadrant le traitement des
            données personnelles dans le cadre de l&apos;utilisation de
            l&apos;intranet par les collaborateurs d&apos;OMNITECH Security.
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
              1. Cadre du présent accord
            </h2>
            <p>
              Le présent document récapitule les engagements réciproques
              d&apos;OMNITECH Security, en tant qu&apos;employeur et responsable
              de traitement, et de chaque collaborateur, en tant
              qu&apos;utilisateur de l&apos;intranet. Il complète, sans s&apos;y
              substituer, le contrat de travail, le règlement intérieur et la
              charte informatique signés à l&apos;embauche, consultables dans la
              rubrique{" "}
              <Link href="/chartes" className="text-[#F68D2E] hover:underline">
                Chartes
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              2. Parties
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Responsable de traitement :
                </strong>{" "}
                OMNITECH Security, représentée par sa Direction et son RSSI.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Personne concernée :
                </strong>{" "}
                tout salarié, alternant, stagiaire ou prestataire disposant
                d&apos;un compte sur l&apos;intranet.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              3. Finalités strictes du traitement
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                exécution des missions professionnelles et collaboration entre
                services ;
              </li>
              <li>
                gestion documentaire conforme à l&apos;ISO 27001:2022 (cycle de
                vie, classification, validation) ;
              </li>
              <li>
                traçabilité des accès et opérations sensibles aux fins
                d&apos;audit interne et de réponse aux incidents de sécurité ;
              </li>
              <li>
                production des indicateurs de conformité requis par la directive
                NIS2 et les référentiels ANSSI.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              4. Limites et garanties
            </h2>
            <p>
              OMNITECH Security s&apos;engage à ne pas mettre en place de
              dispositif de surveillance individuelle disproportionnée. La
              consultation des journaux d&apos;activité est strictement encadrée
              :
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>accès restreint aux profils RSSI et auditeurs habilités ;</li>
              <li>
                exploitation justifiée par un incident de sécurité, une enquête
                interne formalisée ou une obligation légale ;
              </li>
              <li>
                journalisation des consultations elles-mêmes (méta-traçabilité)
                ;
              </li>
              <li>
                information préalable des représentants du personnel
                conformément au Code du travail.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              5. Mesures de sécurité
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                authentification forte (MFA TOTP) pour les profils sensibles ;
              </li>
              <li>chiffrement des flux (TLS 1.3) et des sauvegardes ;</li>
              <li>
                cloisonnement des rôles et principe du moindre privilège ;
              </li>
              <li>
                gestion centralisée des incidents et plan de continuité
                d&apos;activité.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              6. Engagements de l&apos;utilisateur
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                utiliser l&apos;intranet uniquement à des fins professionnelles
                ;
              </li>
              <li>
                respecter la classification documentaire et les règles de
                partage ;
              </li>
              <li>
                signaler sans délai tout incident, faille ou comportement
                suspect via le module Incidents ;
              </li>
              <li>
                ne pas tenter de contourner les mesures de sécurité ni
                d&apos;accéder à des ressources non autorisées.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              7. Exercice des droits et contact
            </h2>
            <p>
              Les modalités d&apos;exercice des droits d&apos;accès, de
              rectification, d&apos;effacement, d&apos;opposition et de
              portabilité sont décrites dans la{" "}
              <Link
                href="/privacy-policy"
                className="text-[#F68D2E] hover:underline"
              >
                politique de confidentialité
              </Link>
              . Toute question peut être adressée au DPO à l&apos;adresse{" "}
              <a
                href="mailto:dpo@omnitech-security.fr"
                className="text-[#F68D2E] hover:underline"
              >
                dpo@omnitech-security.fr
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              8. Articulation avec les chartes
            </h2>
            <p>
              Le présent résumé s&apos;articule avec la charte informatique, la
              charte de sécurité et le règlement intérieur. En cas de
              divergence, les documents contractuels signés par
              l&apos;utilisateur prévalent. La consultation est accessible
              depuis la page{" "}
              <Link href="/chartes" className="text-[#F68D2E] hover:underline">
                Chartes
              </Link>
              .
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
            <Link href="/cookies" className="hover:text-[#F68D2E] transition">
              Cookies
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
