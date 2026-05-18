import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { OmnitechLogo } from "@/components/omnitech-logo";

export const metadata = {
  title: "Mentions légales — OMNITECH Security",
  description:
    "Mentions légales de l'intranet OMNITECH Security : éditeur, directeur de la publication, hébergeur et propriété intellectuelle.",
};

const LAST_UPDATED = "25 avril 2026";

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-slate-950">
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#F68D2E]/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-white/10">
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
        className="bg-[#F68D2E] dark:bg-slate-900 relative overflow-hidden"
        style={{ paddingTop: "8rem", paddingBottom: "4rem" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-6">
            <Scale className="h-4 w-4 text-slate-900" />
            <span className="text-white/70 text-xs font-semibold tracking-wide">
              Information légale
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-white leading-tight">
            Mentions{" "}
            <span className="text-slate-900 font-semibold">légales</span>
          </h1>
          <p className="text-white/60 mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">
            Informations relatives à l&apos;éditeur, au directeur de la
            publication, à l&apos;hébergement et à la propriété intellectuelle
            de l&apos;intranet.
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
              1. Éditeur du site
            </h2>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Raison sociale :
                </strong>{" "}
                OMNITECH Security
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Forme juridique :
                </strong>{" "}
                [à compléter]
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Siège social :
                </strong>{" "}
                [à compléter]
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  SIRET :
                </strong>{" "}
                [à compléter]
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Affiliation :
                </strong>{" "}
                filiale du groupe SFPI
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Activité :
                </strong>{" "}
                conception, intégration et exploitation de systèmes de sûreté
                pour sites à risques (contrôle d&apos;accès, vidéosurveillance,
                hypervision SEAL System).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              2. Directeur de la publication
            </h2>
            <p>
              La direction de la publication de l&apos;intranet est assurée par
              la Direction d&apos;OMNITECH Security. Le contenu éditorial est
              placé sous la responsabilité du Responsable de la sécurité des
              systèmes d&apos;information (RSSI).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              3. Hébergement
            </h2>
            <p>
              L&apos;intranet est hébergé en interne sur l&apos;infrastructure
              d&apos;OMNITECH Security : machine virtuelle Linux dédiée,
              administrée par la Direction des systèmes d&apos;information (DSI)
              et supervisée par le RSSI. Aucun service de cloud public
              n&apos;intervient dans l&apos;hébergement, le stockage ou le
              traitement des données.
            </p>
            <p className="mt-3">
              <strong className="text-seal-navy dark:text-white">
                Contact technique :
              </strong>{" "}
              DSI / RSSI —{" "}
              <a
                href="mailto:dpo@omnitech-security.fr"
                className="text-slate-900 hover:underline"
              >
                dpo@omnitech-security.fr
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              4. Contact
            </h2>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Support interne :
                </strong>{" "}
                tickets via le module Helpdesk de l&apos;intranet.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Contact général :
                </strong>{" "}
                [à compléter]
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Délégué à la protection des données :
                </strong>{" "}
                <a
                  href="mailto:dpo@omnitech-security.fr"
                  className="text-slate-900 hover:underline"
                >
                  dpo@omnitech-security.fr
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              5. Propriété intellectuelle
            </h2>
            <p>
              L&apos;ensemble des éléments composant l&apos;intranet — code
              source, interface, identité graphique (charte SEAL), logos,
              illustrations, textes éditoriaux, documents internes — constitue
              une œuvre protégée au titre du Code de la propriété
              intellectuelle. La propriété de ces éléments demeure exclusivement
              celle d&apos;OMNITECH Security ou de ses concédants.
            </p>
            <p className="mt-3">
              Toute reproduction, représentation, diffusion ou exploitation,
              partielle ou totale, est interdite sans autorisation écrite
              préalable. Les marques OMNITECH Security, SEAL System et celles du
              groupe SFPI sont des marques déposées.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              6. Conditions d&apos;utilisation
            </h2>
            <p>
              L&apos;accès à l&apos;intranet est strictement réservé aux
              collaborateurs et prestataires habilités d&apos;OMNITECH Security.
              Son utilisation est encadrée par le règlement intérieur, la charte
              informatique et les chartes de sécurité publiées dans la rubrique{" "}
              <Link href="/chartes" className="text-slate-900 hover:underline">
                Chartes
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              7. Droit applicable
            </h2>
            <p>
              Les présentes mentions légales sont régies par le droit français.
              Tout litige relatif à leur interprétation ou à leur exécution
              relève de la compétence des juridictions françaises compétentes.
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
            <Link href="/cookies" className="hover:text-[#F68D2E] transition">
              Cookies
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
