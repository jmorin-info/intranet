// =============================================================================
// OMNITECH Security Intranet — CMS Seed
// Pose les blocs `welcome.*` initiaux pour la page d'accueil publique.
// Idempotent : `upsert` sur (key, locale). Re-run safe.
// cf. docs/cms/architecture.md § 7 — Page Welcome dynamique.
// =============================================================================

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env from project root if DATABASE_URL is not set (cohérent avec
// les autres seeders du package).
if (!process.env.DATABASE_URL) {
  try {
    const envPath = resolve(__dirname, "../../../.env");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type SeedBlock = {
  key: string;
  locale: string;
  title?: string | null;
  body: string;
  data?: Prisma.InputJsonValue | null;
};

// -----------------------------------------------------------------------------
// Contenu — extrait fidèlement de la version hardcodée historique de la page
// Welcome (`apps/frontend/src/app/(public)/welcome/page.tsx`). Tout changement
// éditorial passera désormais par l'admin /admin/content/blocks.
// -----------------------------------------------------------------------------

const BLOCKS: SeedBlock[] = [
  {
    key: "welcome.hero.title",
    locale: "fr",
    title: "Hero — titre",
    body: "Bienvenue sur l'intranet OMNITECH Security",
  },
  {
    key: "welcome.hero.subtitle",
    locale: "fr",
    title: "Hero — sous-titre",
    body: "Plateforme de gouvernance documentaire ISO 27001 — sécurisée, certifiée, française.",
  },
  {
    key: "welcome.hero.cta",
    locale: "fr",
    title: "Hero — bouton principal",
    body: "Accéder à mon espace",
    data: {
      label: "Accéder à mon espace",
      href: "/login",
    },
  },
  {
    key: "welcome.steps",
    locale: "fr",
    title: "Comment ça marche — 4 étapes",
    body: "Quatre étapes pour accéder à l'ensemble de vos outils métier",
    data: [
      {
        icon: "LogIn",
        title: "Connectez-vous",
        body: "Authentifiez-vous avec vos identifiants Active Directory — le même login que votre session Windows, renforcé par le MFA.",
      },
      {
        icon: "Layout",
        title: "Explorez votre espace",
        body: "Retrouvez en un coup d'oeil vos documents, tickets IT, actualités et indicateurs de conformité depuis votre tableau de bord personnalisé.",
      },
      {
        icon: "Share2",
        title: "Collaborez",
        body: "Rédigez, révisez, signez et partagez vos livrables en toute sécurité grâce au workflow documentaire intégré.",
      },
      {
        icon: "Bell",
        title: "Restez informé",
        body: "Recevez en temps réel les notifications, alertes cybersécurité CERT-FR et communications de la Direction.",
      },
    ],
  },
  {
    key: "welcome.services",
    locale: "fr",
    title: "Nos services — 8 cartes",
    body: "Les outils à disposition des collaborateurs",
    data: [
      {
        icon: "FileText",
        title: "GED / Base documentaire",
        body: "Cycle de vie complet des documents ISO 27001 : rédaction, revue, approbation, publication et archivage.",
        href: "",
      },
      {
        icon: "Shield",
        title: "Conformité sécurité",
        body: "Tableau de bord SMSI, suivi des contrôles ISO 27001 et NIS2, audits et revues périodiques.",
        href: "",
      },
      {
        icon: "Rss",
        title: "Veille cybersécurité",
        body: "Flux CERT-FR, ANSSI et CVE agrégés, classés par thème et sévérité, avec alertes en temps réel.",
        href: "",
      },
      {
        icon: "Ticket",
        title: "Tickets IT / Helpdesk",
        body: "Incidents et demandes centralisés avec SLA, priorités, chatbot d'assistance et portail self-service.",
        href: "",
      },
      {
        icon: "BookOpen",
        title: "Wiki interne",
        body: "Base de connaissances collaborative : runbooks, procédures opérationnelles et documentation équipe.",
        href: "",
      },
      {
        icon: "AlertTriangle",
        title: "Gestion des incidents",
        body: "Signalement, qualification et suivi des incidents de sécurité avec workflow d'escalade RSSI.",
        href: "",
      },
      {
        icon: "Newspaper",
        title: "Actualités internes",
        body: "Communications officielles, annonces RSSI, formations et événements internes OMNITECH.",
        href: "",
      },
      {
        icon: "Star",
        title: "Quiz et sensibilisation",
        body: "Quiz cybersécurité, enquêtes de satisfaction et programme de formation continue des collaborateurs.",
        href: "",
      },
    ],
  },
  {
    key: "welcome.faq",
    locale: "fr",
    title: "Questions fréquentes — 8 Q/R",
    body: "Questions fréquentes",
    data: [
      {
        question: "Comment accéder à l'intranet ?",
        answer:
          "Connectez-vous avec vos identifiants Active Directory — il s'agit du même login que votre session Windows. L'authentification multi-facteurs (MFA) peut être requise selon votre profil. En cas de difficulté, le support IT est joignable via le portail de tickets.",
      },
      {
        question: "Comment configurer le MFA ?",
        answer:
          "Depuis votre tableau de bord, rendez-vous dans Mon profil > Sécurité > MFA. Scannez le QR code affiché avec Microsoft Authenticator ou Google Authenticator, puis saisissez le code à 6 chiffres généré par l'application. Le MFA sera activé immédiatement et renforcé à chaque connexion.",
      },
      {
        question: "J'ai oublié mon mot de passe",
        answer:
          'Sur la page de connexion, cliquez sur "Mot de passe oublié". Un lien de réinitialisation sécurisé sera envoyé à votre adresse email professionnelle. Ce lien expire au bout de 30 minutes. Si vous ne recevez pas l\'email, vérifiez vos courriers indésirables ou contactez le support IT.',
      },
      {
        question: "Comment créer un ticket IT ?",
        answer:
          "Accédez à Tickets IT > Nouveau ticket depuis la barre latérale. Décrivez précisément votre problème, sélectionnez la catégorie et la priorité appropriées. Un technicien sera automatiquement assigné en fonction du SLA applicable et vous recevrez des notifications à chaque étape du traitement.",
      },
      {
        question: "Où trouver les procédures IT ?",
        answer:
          "L'ensemble des procédures opérationnelles est centralisé dans la section Documents de l'intranet, organisé par catégorie (sécurité, réseau, poste de travail, etc.). Chaque document est téléchargeable en PDF et soumis au workflow de validation ISO 27001.",
      },
      {
        question: "Comment publier un document confidentiel ?",
        answer:
          'Rédigez le document dans l\'éditeur intégré, attribuez-lui la classification "Confidentiel" (ISO 27001 A.5.12), puis soumettez-le en revue. Après validation du réviseur désigné, un approbateur habilité signe électroniquement le document pour publication restreinte aux seuls collaborateurs autorisés.',
      },
      {
        question: "Comment signaler un incident de sécurité ?",
        answer:
          "Utilisez le module Incidents accessible depuis la barre latérale, ou contactez directement le RSSI. Décrivez les faits constatés, l'impact estimé et les systèmes concernés. Le workflow d'éscalade intégré notifie automatiquement les parties prenantes selon la sévérité déclarée.",
      },
      {
        question: "Comment fonctionne la classification des documents ?",
        answer:
          "Le système repose sur quatre niveaux conformes à l'ISO 27001 A.5.12 : Public (diffusable sans restriction), Interne (réservé aux collaborateurs), Confidentiel (accès sur besoin d'en connaître uniquement) et Secret (cercle restreint, validation obligatoire du RSSI). Chaque niveau détermine les droits d'accès, de partage et de téléchargement.",
      },
    ],
  },
];

async function main() {
  console.log(`Démarrage seed CMS — ${BLOCKS.length} blocs welcome.* à poser.`);

  let upserts = 0;
  for (const block of BLOCKS) {
    await prisma.contentBlock.upsert({
      where: {
        key_locale: { key: block.key, locale: block.locale },
      },
      update: {
        title: block.title ?? null,
        body: block.body,
        // `data` peut être undefined (pas de JSON sur les blocs text-only).
        // On laisse Prisma écrire `null` côté DB si on lui passe null.
        data:
          block.data === undefined
            ? Prisma.JsonNull
            : (block.data as Prisma.InputJsonValue),
        status: "PUBLISHED",
        // updatedById laissé null : seed system, pas d'utilisateur applicatif.
      },
      create: {
        key: block.key,
        locale: block.locale,
        title: block.title ?? null,
        body: block.body,
        data:
          block.data === undefined
            ? Prisma.JsonNull
            : (block.data as Prisma.InputJsonValue),
        status: "PUBLISHED",
      },
    });
    upserts++;
    console.log(`  upsert ${block.key} [${block.locale}]`);
  }

  console.log(`OK ${upserts} blocs upsertés`);
}

main()
  .catch((e) => {
    console.error("ECHEC seed CMS :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
