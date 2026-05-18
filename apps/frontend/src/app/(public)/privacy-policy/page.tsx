import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { OmnitechLogo } from "@/components/omnitech-logo";

export const metadata = {
  title: "Politique de confidentialité — OMNITECH Security",
  description:
    "Politique de confidentialité et information RGPD relative à l'intranet OMNITECH Security : finalités, bases légales, durées de conservation et droits des personnes concernées.",
};

const LAST_UPDATED = "25 avril 2026";

export default function PrivacyPolicyPage() {
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
            <ShieldCheck className="h-4 w-4 text-slate-900" />
            <span className="text-white/70 text-xs font-semibold tracking-wide">
              RGPD · Articles 13 et 14
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-white leading-tight">
            Politique de{" "}
            <span className="text-slate-900 font-semibold">
              confidentialité
            </span>
          </h1>
          <p className="text-white/60 mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">
            Information transparente sur les traitements de données à caractère
            personnel mis en œuvre dans le cadre de l&apos;intranet OMNITECH
            Security.
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
              1. Responsable de traitement
            </h2>
            <p>
              Le responsable de traitement des données collectées via
              l&apos;intranet est la société{" "}
              <strong className="text-seal-navy dark:text-white">
                OMNITECH Security
              </strong>
              . Toute demande relative à la protection des données peut être
              adressée au Délégué à la protection des données (DPO) à
              l&apos;adresse{" "}
              <a
                href="mailto:dpo@omnitech-security.fr"
                className="text-slate-900 hover:underline"
              >
                dpo@omnitech-security.fr
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              2. Données collectées
            </h2>
            <p>
              L&apos;intranet collecte uniquement les données strictement
              nécessaires à son fonctionnement et à la sécurité du système
              d&apos;information :
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>identifiants d&apos;annuaire (LDAP / Active Directory) ;</li>
              <li>adresse de messagerie professionnelle ;</li>
              <li>photographie de profil et rôle hiérarchique ;</li>
              <li>
                journaux d&apos;activité applicative (audit logs) horodatés ;
              </li>
              <li>
                secret partagé d&apos;authentification multi-facteurs (TOTP) ;
              </li>
              <li>
                contenus produits par les utilisateurs (tickets, documents,
                wiki, commentaires).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              3. Bases légales
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Exécution du contrat de travail
                </strong>{" "}
                (article 6.1.b du RGPD) pour l&apos;ensemble des fonctions
                métier.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Obligation légale et réglementaire
                </strong>{" "}
                (article 6.1.c du RGPD) au titre de la conformité ISO 27001:2022
                et de la directive NIS2.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Intérêt légitime
                </strong>{" "}
                (article 6.1.f du RGPD) pour la protection du système
                d&apos;information et la traçabilité des accès.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              4. Durées de conservation
            </h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                Journaux d&apos;audit de sécurité : trois ans à compter de leur
                création (recommandation ANSSI).
              </li>
              <li>
                Sauvegardes système : quatre-vingt-dix jours glissants, en
                stockage chiffré.
              </li>
              <li>
                Comptes utilisateurs désactivés : purge automatique
                quatre-vingt-dix jours après la fin du contrat de travail.
              </li>
              <li>
                Contenus métier (tickets, documents) : durée nécessaire à la
                gestion documentaire ISO 27001 et au respect des obligations de
                conservation propres au secteur.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              5. Destinataires et sous-traitants
            </h2>
            <p>
              L&apos;intranet est intégralement hébergé sur
              l&apos;infrastructure auto-hébergée d&apos;OMNITECH Security
              (machine virtuelle Linux dédiée). Aucune donnée n&apos;est
              transférée à un prestataire cloud externe. Les composants
              logiciels open source utilisés (DocuSeal pour la signature
              électronique, OnlyOffice pour l&apos;édition collaborative,
              Stirling-PDF pour la manipulation documentaire, Meilisearch pour
              la recherche, Ollama pour les modèles de langage locaux)
              s&apos;exécutent sur la même infrastructure et ne donnent lieu à
              aucun transfert vers un pays tiers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              6. Droits des personnes concernées
            </h2>
            <p>
              Conformément aux articles 15 à 22 du RGPD, chaque utilisateur
              dispose des droits suivants :
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Droit d&apos;accès
                </strong>{" "}
                : un export complet des données personnelles est disponible
                depuis la rubrique{" "}
                <em>Mon profil &gt; Confidentialité &gt; Export RGPD</em> (route
                applicative <code>/me/gdpr-export</code>).
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Droit de rectification
                </strong>{" "}
                des informations inexactes ou obsolètes.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Droit à l&apos;effacement
                </strong>
                , sous réserve des obligations légales de conservation
                (notamment audit logs et obligations comptables).
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Droit à la portabilité
                </strong>{" "}
                des données fournies par l&apos;utilisateur, dans un format
                structuré et lisible par machine.
              </li>
              <li>
                <strong className="text-seal-navy dark:text-white">
                  Droit d&apos;opposition
                </strong>{" "}
                aux traitements fondés sur l&apos;intérêt légitime.
              </li>
            </ul>
            <p className="mt-4">
              Toute demande peut être adressée au DPO à l&apos;adresse{" "}
              <a
                href="mailto:dpo@omnitech-security.fr"
                className="text-slate-900 hover:underline"
              >
                dpo@omnitech-security.fr
              </a>
              . Une réponse motivée est apportée dans un délai maximal de trente
              jours. En cas de désaccord persistant, l&apos;utilisateur peut
              introduire une réclamation auprès de la Commission nationale de
              l&apos;informatique et des libertés (CNIL).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              7. Sécurité
            </h2>
            <p>
              L&apos;intranet applique les contrôles de sécurité prévus par
              l&apos;ISO 27001:2022 : chiffrement des flux (TLS 1.3),
              authentification multi-facteurs, cloisonnement des rôles,
              journalisation des accès et revues périodiques par le RSSI.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-seal-navy dark:text-white mb-3">
              8. Évolution de la présente politique
            </h2>
            <p>
              La présente politique peut être mise à jour pour refléter les
              évolutions techniques, légales ou organisationnelles. La date de
              dernière mise à jour figure en tête de page. Les modifications
              substantielles font l&apos;objet d&apos;une information dédiée sur
              le tableau de bord de l&apos;intranet.
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
            <Link href="/legal" className="hover:text-[#F68D2E] transition">
              Mentions légales
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
