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
  // ---------------------------------------------------------------------------
  // Trust center — engagements ISO/SOC2 (consommé par
  // apps/frontend/src/app/trust/components/trust-commitments.tsx).
  // Les iconKey doivent rester dans le ICON_REGISTRY du composant.
  // ---------------------------------------------------------------------------
  {
    key: "trust.commitments",
    locale: "fr",
    title: "Trust center — engagements",
    body: "Liste des engagements affichés sur /trust dans la section « Ce que nous garantissons ».",
    data: [
      {
        iconKey: "Flag",
        accent: "bordeaux",
        title: "Souveraineté",
        body: "Hébergement en France (Scaleway), sous-traitants exclusivement dans l’Union européenne.",
      },
      {
        iconKey: "Lock",
        accent: "blue",
        title: "Chiffrement en transit",
        body: "TLS 1.2+ obligatoire, HSTS 2 ans avec preload, bcrypt pour les mots de passe.",
      },
      {
        iconKey: "KeyRound",
        accent: "orange",
        title: "MFA partout",
        body: "MFA obligatoire pour les administrateurs, disponible pour l’ensemble des utilisateurs.",
      },
      {
        iconKey: "ListChecks",
        accent: "green",
        title: "93 contrôles ISO 27001",
        body: "L’intégralité des contrôles Annex A 2022 est implémentée et tracée dans l’intranet.",
      },
      {
        iconKey: "FlaskConical",
        accent: "blue",
        title: "Backup testé chaque semaine",
        body: "Drill automatisé de restauration hebdomadaire avec rapport horodaté et alerting.",
      },
      {
        iconKey: "ShieldCheck",
        accent: "bordeaux",
        title: "Protection WAF & observabilité",
        body: "BunkerWeb en bordure, Sentry pour la détection d’anomalies applicatives.",
      },
      {
        iconKey: "PhoneCall",
        accent: "orange",
        title: "SLA incident",
        body: "Accusé réception < 4 h pour incident critique, 24 h pour incident majeur.",
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // Trust center — hero (titre, sous-titre, CTA). Cf.
  // apps/frontend/src/app/trust/components/trust-hero.tsx (FALLBACK_HERO).
  // ---------------------------------------------------------------------------
  {
    key: "trust.hero",
    locale: "fr",
    title: "Trust center — hero",
    body: "Bloc affiché en tête de /trust : badge, titre principal et 2 CTA.",
    data: {
      badge: "Centre de confiance public",
      titleLine1: "Centre de confiance",
      titleHighlight: "OMNITECH Security",
      subtitle:
        "La transparence comme socle de la confiance. Découvrez nos certifications, nos engagements et la preuve de nos pratiques sécurité.",
      primaryCta: {
        label: "Télécharger le dossier de conformité",
        href: "/api/trust/compliance-pack.pdf",
      },
      secondaryCta: {
        label: "Voir nos certifications",
        href: "#certifications",
      },
    },
  },
  // ---------------------------------------------------------------------------
  // Trust center — certifications (5 cadres normatifs).
  // Cf. apps/frontend/src/app/trust/components/trust-certifications.tsx
  // (FALLBACK_CERTIFICATIONS). Les `status` doivent rester dans
  // {conforme,en_cours,planifie} — sinon le normalizer rejette l'item.
  // ---------------------------------------------------------------------------
  {
    key: "trust.certifications",
    locale: "fr",
    title: "Trust center — certifications",
    body: "Cartes de certifications affichées sur /trust avec leur statut.",
    data: [
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
    ],
  },
  // ---------------------------------------------------------------------------
  // Trust center — contacts (Conformité + DPO). iconKey doit rester dans
  // {Mail,UserCog} ; accent dans {orange,blue}.
  // ---------------------------------------------------------------------------
  {
    key: "trust.contact",
    locale: "fr",
    title: "Trust center — contacts",
    body: "Adresses e-mail affichées dans la section Contact de /trust.",
    data: [
      {
        iconKey: "Mail",
        accent: "orange",
        label: "Conformité",
        email: "compliance@omnitech-security.fr",
      },
      {
        iconKey: "UserCog",
        accent: "blue",
        label: "Délégué à la protection des données",
        email: "dpo@omnitech-security.fr",
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // Dashboard — tips quotidiens (41 entrées). Consommé par le hook
  // `useDailyTip` (apps/frontend/src/components/dashboard/dashboard-tips-banner.tsx).
  // Le fallback hardcodé du même fichier reste la source de vérité de secours.
  // ---------------------------------------------------------------------------
  {
    key: "dashboard.daily_tips",
    locale: "fr",
    title: "Dashboard — tips de sécurité quotidiens",
    body: "Liste rotative affichée sous le greeting dans /dashboard (un tip par jour UTC, mêmes pour tous les utilisateurs).",
    data: [
      "Vérifiez l'expéditeur réel d'un e-mail en survolant son nom : un domaine inconnu est suspect.",
      "Un e-mail urgent exigeant une action immédiate est souvent un signe de tentative de phishing.",
      "Ne cliquez jamais sur un lien raccourci reçu par e-mail sans l'avoir prévisualisé au préalable.",
      "Les pièces jointes inattendues (.zip, .xls, .html) doivent être signalées au support IT avant ouverture.",
      "Une demande de virement par e-mail hors process habituel impose une vérification téléphonique directe.",
      "Un mot de passe fort comporte au moins 14 caractères mêlant majuscules, chiffres et symboles.",
      "Activez l'authentification à deux facteurs sur tous vos comptes professionnels et personnels.",
      "Ne réutilisez jamais le même mot de passe sur plusieurs services. Utilisez un gestionnaire.",
      "Changez immédiatement un mot de passe si vous suspectez qu'il a été compromis.",
      "Préférez les phrases secrètes longues aux mots de passe complexes difficiles à mémoriser.",
      "Ne stockez aucune donnée personnelle sensible sur des clés USB non chiffrées.",
      "Les données RH et client sont classées Confidentiel : ne les diffusez pas hors des canaux autorisés.",
      "Pensez à verrouiller votre session (Windows + L) dès que vous quittez votre poste.",
      "Vérifiez les permissions des applications mobiles avant de leur accorder l'accès à vos contacts ou photos.",
      "Connectez-vous toujours au VPN OMNITECH avant d'accéder aux ressources internes en télétravail.",
      "Évitez les Wi-Fi publics non chiffrés pour toute activité professionnelle, même avec VPN.",
      "Gardez votre système d'exploitation et votre navigateur à jour en télétravail comme au bureau.",
      "Chiffrez votre smartphone et activez son verrouillage biométrique ou par code à 6 chiffres minimum.",
      "Ne connectez jamais un appareil personnel non approuvé au réseau interne OMNITECH.",
      "En déplacement, utilisez un filtre de confidentialité pour éviter la lecture d'écran dans les transports.",
      "Suivez la règle 3-2-1 : 3 copies, 2 supports différents, 1 copie hors site.",
      "Testez régulièrement la restauration de vos sauvegardes : une sauvegarde non testée n'en est pas une.",
      "Les documents critiques doivent être stockés sur les serveurs OMNITECH, pas sur le disque local.",
      "Ne publiez jamais de photo de votre badge ou de votre poste de travail sur les réseaux sociaux.",
      "Évitez de divulguer publiquement votre position exacte ou vos déplacements professionnels.",
      "Vérifiez les paramètres de confidentialité de vos comptes LinkedIn et Facebook au moins une fois par an.",
      "Toute donnée personnelle collectée doit avoir une finalité claire et une durée de conservation définie.",
      "La documentation ISO 27001 est accessible dans la base documentaire de l'intranet.",
      "Signalez toute violation de données personnelles au DPO dans les meilleurs délais (72h max RGPD).",
      "En cas d'incident de sécurité, contactez immédiatement le RSSI Julien MORIN via un ticket prioritaire.",
      "Ne tentez jamais de résoudre seul un incident cyber : la remontée immédiate limite la propagation.",
      "Signalez tout comportement anormal de votre poste (lenteur, pop-ups, fichiers inconnus) au support IT.",
      "Rangez votre bureau en fin de journée : aucun document sensible ne doit rester visible (clean desk).",
      "Vérifiez l'identité de tout visiteur inconnu dans les locaux et accompagnez-le jusqu'à son interlocuteur.",
      "Supprimez les documents imprimés oubliés sur l'imprimante partagée et utilisez l'impression sécurisée.",
      "Avant de transférer un fichier par e-mail, vérifiez sa classification : Confidentiel exige un canal chiffré.",
      "Mettez à jour vos logiciels dès qu'une notification apparaît : les correctifs corrigent des failles connues.",
      "Ne branchez jamais une clé USB trouvée dans les locaux : signalez-la au support IT sans l'ouvrir.",
      "Méfiez-vous des QR codes non sollicités collés sur du matériel ou reçus par e-mail (quishing).",
      "Après un incident, participez au retour d'expérience (REX) pour améliorer les procédures collectives.",
      "En télétravail, verrouillez votre poste même chez vous si d'autres personnes partagent votre espace.",
    ],
  },
];

async function main() {
  console.log(`Démarrage seed CMS — ${BLOCKS.length} blocs à poser.`);

  let upserts = 0;
  for (const block of BLOCKS) {
    await prisma.contentBlock.upsert({
      where: {
        key_locale: { key: block.key, locale: block.locale },
      },
      update: {
        title: block.title ?? null,
        body: block.body,
        // `data` peut être undefined (blocs text-only). On écrit alors SQL
        // NULL via `Prisma.DbNull`, aligné avec ce que produit le service
        // admin (`content.service.ts`).
        data:
          block.data === undefined
            ? Prisma.DbNull
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
            ? Prisma.DbNull
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
