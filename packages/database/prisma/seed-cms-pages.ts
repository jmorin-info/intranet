// =============================================================================
// OMNITECH Security Intranet — CMS Pages Seed
// Pose les 4 ContentPages juridiques initiales (DPA + mentions légales +
// politique de confidentialité + politique cookies). Le HTML est extrait
// du fallback hardcodé des composants frontend (zéro régression).
//
// Idempotent : upsert sur (slug, locale). Re-run safe.
// =============================================================================

import { readFileSync } from "fs";
import { resolve } from "path";

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

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedPage = {
  slug: string;
  locale: string;
  title: string;
  excerpt: string;
  content: string;
  seoTitle?: string;
  seoDescription?: string;
};

// HTML compatible avec la whitelist `sanitize-html` côté backend (cf.
// apps/backend/src/common/sanitize.ts § 27 tags autorisés). Pas de classes
// Tailwind : le style est appliqué côté front via le wrapper `seal-prose`.

const PAGES: SeedPage[] = [
  {
    slug: "mentions-legales",
    locale: "fr",
    title: "Mentions légales",
    excerpt:
      "Informations relatives à l'éditeur, au directeur de la publication, à l'hébergement et à la propriété intellectuelle de l'intranet.",
    seoTitle: "Mentions légales — OMNITECH Security",
    seoDescription:
      "Mentions légales de l'intranet OMNITECH Security : éditeur, directeur de la publication, hébergeur et propriété intellectuelle.",
    content: `
<h2>1. Éditeur du site</h2>
<ul>
  <li><strong>Raison sociale :</strong> OMNITECH Security</li>
  <li><strong>Forme juridique :</strong> [à compléter]</li>
  <li><strong>Siège social :</strong> [à compléter]</li>
  <li><strong>SIRET :</strong> [à compléter]</li>
  <li><strong>Affiliation :</strong> filiale du groupe SFPI</li>
  <li><strong>Activité :</strong> conception, intégration et exploitation de systèmes de sûreté pour sites à risques (contrôle d'accès, vidéosurveillance, hypervision SEAL System).</li>
</ul>

<h2>2. Directeur de la publication</h2>
<p>La direction de la publication de l'intranet est assurée par la Direction d'OMNITECH Security. Le contenu éditorial est placé sous la responsabilité du Responsable de la sécurité des systèmes d'information (RSSI).</p>

<h2>3. Hébergement</h2>
<p>L'intranet est hébergé en interne sur l'infrastructure d'OMNITECH Security : machine virtuelle Linux dédiée, administrée par la Direction des systèmes d'information (DSI) et supervisée par le RSSI. Aucun service de cloud public n'intervient dans l'hébergement, le stockage ou le traitement des données.</p>
<p><strong>Contact technique :</strong> DSI / RSSI — <a href="mailto:dpo@omnitech-security.fr">dpo@omnitech-security.fr</a></p>

<h2>4. Contact</h2>
<ul>
  <li><strong>Support interne :</strong> tickets via le module Helpdesk de l'intranet.</li>
  <li><strong>Contact général :</strong> [à compléter]</li>
  <li><strong>Délégué à la protection des données :</strong> <a href="mailto:dpo@omnitech-security.fr">dpo@omnitech-security.fr</a></li>
</ul>

<h2>5. Propriété intellectuelle</h2>
<p>L'ensemble des éléments composant l'intranet — code source, interface, identité graphique (charte SEAL), logos, illustrations, textes éditoriaux, documents internes — constitue une œuvre protégée au titre du Code de la propriété intellectuelle. La propriété de ces éléments demeure exclusivement celle d'OMNITECH Security ou de ses concédants.</p>
<p>Toute reproduction, représentation, diffusion ou exploitation, partielle ou totale, est interdite sans autorisation écrite préalable. Les marques OMNITECH Security, SEAL System et celles du groupe SFPI sont des marques déposées.</p>

<h2>6. Conditions d'utilisation</h2>
<p>L'accès à l'intranet est strictement réservé aux collaborateurs et prestataires habilités d'OMNITECH Security. Son utilisation est encadrée par le règlement intérieur, la charte informatique et les chartes de sécurité publiées dans la rubrique <a href="/chartes">Chartes</a>.</p>

<h2>7. Droit applicable</h2>
<p>Les présentes mentions légales sont régies par le droit français. Tout litige relatif à leur interprétation ou à leur exécution relève de la compétence des juridictions françaises compétentes.</p>
`.trim(),
  },
  {
    slug: "politique-confidentialite",
    locale: "fr",
    title: "Politique de confidentialité",
    excerpt:
      "Comment OMNITECH Security collecte, utilise et protège vos données personnelles dans le cadre de l'utilisation de l'intranet, conformément au RGPD.",
    seoTitle: "Politique de confidentialité — OMNITECH Security",
    seoDescription:
      "Politique de confidentialité de l'intranet OMNITECH Security : données collectées, bases légales, conservation, droits RGPD.",
    content: `
<h2>1. Responsable de traitement</h2>
<p>Le responsable de traitement des données collectées via l'intranet est la société <strong>OMNITECH Security</strong>. Toute demande relative à la protection des données peut être adressée au Délégué à la protection des données (DPO) à l'adresse <a href="mailto:dpo@omnitech-security.fr">dpo@omnitech-security.fr</a>.</p>

<h2>2. Données collectées</h2>
<p>L'intranet collecte uniquement les données strictement nécessaires à son fonctionnement et à la sécurité du système d'information :</p>
<ul>
  <li>identifiants d'annuaire (LDAP / Active Directory) ;</li>
  <li>adresse de messagerie professionnelle ;</li>
  <li>photographie de profil et rôle hiérarchique ;</li>
  <li>journaux d'activité applicative (audit logs) horodatés ;</li>
  <li>secret partagé d'authentification multi-facteurs (TOTP) ;</li>
  <li>contenus produits par les utilisateurs (tickets, documents, wiki, commentaires).</li>
</ul>

<h2>3. Bases légales</h2>
<ul>
  <li><strong>Exécution du contrat de travail</strong> (article 6.1.b du RGPD) pour l'ensemble des fonctions métier.</li>
  <li><strong>Obligation légale et réglementaire</strong> (article 6.1.c du RGPD) au titre de la conformité ISO 27001:2022 et de la directive NIS2.</li>
  <li><strong>Intérêt légitime</strong> (article 6.1.f du RGPD) pour la protection du système d'information et la traçabilité des accès.</li>
</ul>

<h2>4. Durées de conservation</h2>
<ul>
  <li>Journaux d'audit de sécurité : trois ans à compter de leur création (recommandation ANSSI).</li>
  <li>Sauvegardes système : quatre-vingt-dix jours glissants, en stockage chiffré.</li>
  <li>Comptes utilisateurs désactivés : purge automatique quatre-vingt-dix jours après la fin du contrat de travail.</li>
  <li>Contenus métier (tickets, documents) : durée nécessaire à la gestion documentaire ISO 27001 et au respect des obligations de conservation propres au secteur.</li>
</ul>

<h2>5. Destinataires et sous-traitants</h2>
<p>L'intranet est intégralement hébergé sur l'infrastructure auto-hébergée d'OMNITECH Security (machine virtuelle Linux dédiée). Aucune donnée n'est transférée à un prestataire cloud externe. Les composants logiciels open source utilisés (DocuSeal pour la signature électronique, OnlyOffice pour l'édition collaborative, Stirling-PDF pour la manipulation documentaire, Meilisearch pour la recherche, Ollama pour les modèles de langage locaux) s'exécutent sur la même infrastructure et ne donnent lieu à aucun transfert vers un pays tiers.</p>

<h2>6. Droits des personnes concernées</h2>
<p>Conformément aux articles 15 à 22 du RGPD, chaque utilisateur dispose des droits suivants :</p>
<ul>
  <li><strong>Droit d'accès</strong> : un export complet des données personnelles est disponible depuis la rubrique <em>Mon profil &gt; Confidentialité &gt; Export RGPD</em> (route applicative <code>/me/gdpr-export</code>).</li>
  <li><strong>Droit de rectification</strong> des informations inexactes ou obsolètes.</li>
  <li><strong>Droit à l'effacement</strong>, sous réserve des obligations légales de conservation (notamment audit logs et obligations comptables).</li>
  <li><strong>Droit à la portabilité</strong> des données fournies par l'utilisateur, dans un format structuré et lisible par machine.</li>
  <li><strong>Droit d'opposition</strong> aux traitements fondés sur l'intérêt légitime.</li>
</ul>
<p>Toute demande peut être adressée au DPO à l'adresse <a href="mailto:dpo@omnitech-security.fr">dpo@omnitech-security.fr</a>. Une réponse motivée est apportée dans un délai maximal de trente jours. En cas de désaccord persistant, l'utilisateur peut introduire une réclamation auprès de la Commission nationale de l'informatique et des libertés (CNIL).</p>

<h2>7. Sécurité</h2>
<p>L'intranet applique les contrôles de sécurité prévus par l'ISO 27001:2022 : chiffrement des flux (TLS 1.3), authentification multi-facteurs, cloisonnement des rôles, journalisation des accès et revues périodiques par le RSSI.</p>

<h2>8. Évolution de la présente politique</h2>
<p>La présente politique peut être mise à jour pour refléter les évolutions techniques, légales ou organisationnelles. La date de dernière mise à jour figure en tête de page. Les modifications substantielles font l'objet d'une information dédiée sur le tableau de bord de l'intranet.</p>
`.trim(),
  },
  {
    slug: "politique-cookies",
    locale: "fr",
    title: "Politique cookies",
    excerpt:
      "L'intranet OMNITECH Security utilise exclusivement des cookies techniques nécessaires à son fonctionnement. Aucun cookie publicitaire, aucun traceur tiers, aucun outil de mesure d'audience.",
    seoTitle: "Politique cookies — OMNITECH Security",
    seoDescription:
      "Politique cookies de l'intranet OMNITECH Security : cookies strictement techniques, aucun traceur, aucun analytics tiers.",
    content: `
<h2>1. Pourquoi aucun bandeau de consentement ?</h2>
<p>Conformément à l'article 82 de la loi Informatique et Libertés et aux lignes directrices de la CNIL, les cookies strictement nécessaires à la fourniture d'un service expressément demandé par l'utilisateur (ici : se connecter à l'intranet et conserver ses préférences d'affichage) sont exemptés du recueil du consentement.</p>
<p>L'intranet n'utilise <strong>aucun cookie tiers</strong>, <strong>aucun outil d'analytics</strong> et <strong>aucun pixel publicitaire</strong>. Aucun bandeau de consentement n'est donc nécessaire.</p>

<h2>2. Liste exhaustive des éléments stockés</h2>
<table>
  <thead>
    <tr>
      <th>Nom</th>
      <th>Type</th>
      <th>Finalité</th>
      <th>Durée</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>accessToken</code></td>
      <td>Stockage local (localStorage, n'est pas un cookie)</td>
      <td>Maintenir la session authentifiée pendant la durée d'utilisation.</td>
      <td>Effacé à la déconnexion ou à l'expiration de la session.</td>
    </tr>
    <tr>
      <td><code>refreshToken</code></td>
      <td>Cookie technique httpOnly, SameSite=Strict, Secure</td>
      <td>Renouvellement sécurisé du jeton d'accès sans réauthentification, conformément aux exigences ISO 27001.</td>
      <td>7 jours glissants — révoqué à la déconnexion.</td>
    </tr>
    <tr>
      <td><code>locale</code></td>
      <td>Cookie technique de préférence</td>
      <td>Mémoriser la langue d'affichage choisie par l'utilisateur.</td>
      <td>12 mois.</td>
    </tr>
    <tr>
      <td><code>darkMode</code></td>
      <td>Cookie technique de préférence</td>
      <td>Mémoriser le thème d'affichage (clair / sombre).</td>
      <td>12 mois.</td>
    </tr>
  </tbody>
</table>

<h2>3. Sécurité des cookies</h2>
<p>Le cookie <code>refreshToken</code> est un cookie <strong>httpOnly</strong> (inaccessible au JavaScript de la page), <strong>Secure</strong> (transmis uniquement en HTTPS) et <strong>SameSite=Strict</strong> (non envoyé en cas de requête inter-sites). Cette configuration prévient les attaques de type vol de jeton et CSRF.</p>

<h2>4. Gérer ou supprimer les cookies</h2>
<p>L'utilisateur peut à tout moment supprimer les cookies depuis les paramètres de son navigateur. Le cookie <code>refreshToken</code> étant indispensable au maintien de la session, sa suppression entraîne une nouvelle authentification. La suppression des cookies <code>locale</code> et <code>darkMode</code> n'a pour conséquence que la réinitialisation des préférences d'affichage par défaut.</p>

<h2>5. Engagement de transparence</h2>
<p>Toute évolution de la liste des cookies utilisés sera reflétée dans la présente page et signalée aux utilisateurs si elle implique un changement de finalité.</p>
`.trim(),
  },
  {
    slug: "accord-traitement-donnees",
    locale: "fr",
    title: "Accord de traitement des données",
    excerpt:
      "Résumé pédagogique de l'accord encadrant le traitement des données personnelles dans le cadre de l'utilisation de l'intranet par les collaborateurs d'OMNITECH Security.",
    seoTitle: "Accord de traitement des données — OMNITECH Security",
    seoDescription:
      "Résumé du Data Processing Agreement (DPA) encadrant l'usage de l'intranet par les salariés et prestataires d'OMNITECH Security.",
    content: `
<h2>1. Cadre du présent accord</h2>
<p>Le présent document récapitule les engagements réciproques d'OMNITECH Security, en tant qu'employeur et responsable de traitement, et de chaque collaborateur, en tant qu'utilisateur de l'intranet. Il complète, sans s'y substituer, le contrat de travail, le règlement intérieur et la charte informatique signés à l'embauche, consultables dans la rubrique <a href="/chartes">Chartes</a>.</p>

<h2>2. Parties</h2>
<ul>
  <li><strong>Responsable de traitement :</strong> OMNITECH Security, représentée par sa Direction et son RSSI.</li>
  <li><strong>Personne concernée :</strong> tout salarié, alternant, stagiaire ou prestataire disposant d'un compte sur l'intranet.</li>
</ul>

<h2>3. Finalités strictes du traitement</h2>
<ul>
  <li>exécution des missions professionnelles et collaboration entre services ;</li>
  <li>gestion documentaire conforme à l'ISO 27001:2022 (cycle de vie, classification, validation) ;</li>
  <li>traçabilité des accès et opérations sensibles aux fins d'audit interne et de réponse aux incidents de sécurité ;</li>
  <li>production des indicateurs de conformité requis par la directive NIS2 et les référentiels ANSSI.</li>
</ul>

<h2>4. Limites et garanties</h2>
<p>OMNITECH Security s'engage à ne pas mettre en place de dispositif de surveillance individuelle disproportionnée. La consultation des journaux d'activité est strictement encadrée :</p>
<ul>
  <li>accès restreint aux profils RSSI et auditeurs habilités ;</li>
  <li>exploitation justifiée par un incident de sécurité, une enquête interne formalisée ou une obligation légale ;</li>
  <li>journalisation des consultations elles-mêmes (méta-traçabilité) ;</li>
  <li>information préalable des représentants du personnel conformément au Code du travail.</li>
</ul>

<h2>5. Mesures de sécurité</h2>
<ul>
  <li>authentification forte (MFA TOTP) pour les profils sensibles ;</li>
  <li>chiffrement des flux (TLS 1.3) et des sauvegardes ;</li>
  <li>cloisonnement des rôles et principe du moindre privilège ;</li>
  <li>gestion centralisée des incidents et plan de continuité d'activité.</li>
</ul>

<h2>6. Engagements de l'utilisateur</h2>
<ul>
  <li>utiliser l'intranet uniquement à des fins professionnelles ;</li>
  <li>respecter la classification documentaire et les règles de partage ;</li>
  <li>signaler sans délai tout incident, faille ou comportement suspect via le module Incidents ;</li>
  <li>ne pas tenter de contourner les mesures de sécurité ni d'accéder à des ressources non autorisées.</li>
</ul>

<h2>7. Exercice des droits et contact</h2>
<p>Les modalités d'exercice des droits d'accès, de rectification, d'effacement, d'opposition et de portabilité sont décrites dans la <a href="/privacy-policy">politique de confidentialité</a>. Toute question peut être adressée au DPO à l'adresse <a href="mailto:dpo@omnitech-security.fr">dpo@omnitech-security.fr</a>.</p>

<h2>8. Articulation avec les chartes</h2>
<p>Le présent résumé s'articule avec la charte informatique, la charte de sécurité et le règlement intérieur. En cas de divergence, les documents contractuels signés par l'utilisateur prévalent. La consultation est accessible depuis la page <a href="/chartes">Chartes</a>.</p>
`.trim(),
  },
];

async function main() {
  console.log(`Démarrage seed ContentPages — ${PAGES.length} pages à poser.`);

  // Le schéma ContentPage exige un `author` (audit ISO 27001 A.5.33). On
  // rattache aux pages le premier SUPER_ADMIN trouvé ; si aucun n'existe,
  // on échoue avec un message clair (le seeder est réservé à un env seedé).
  const systemAuthor = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!systemAuthor) {
    throw new Error(
      "Aucun utilisateur SUPER_ADMIN en base — exécute d'abord `pnpm seed` pour créer les comptes système.",
    );
  }
  console.log(`Rattachement aux ContentPages : author = ${systemAuthor.email}`);

  let upserts = 0;
  for (const page of PAGES) {
    await prisma.contentPage.upsert({
      where: {
        slug_locale: { slug: page.slug, locale: page.locale },
      },
      update: {
        title: page.title,
        excerpt: page.excerpt,
        content: page.content,
        seoTitle: page.seoTitle ?? null,
        seoDescription: page.seoDescription ?? null,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      create: {
        slug: page.slug,
        locale: page.locale,
        title: page.title,
        excerpt: page.excerpt,
        content: page.content,
        seoTitle: page.seoTitle ?? null,
        seoDescription: page.seoDescription ?? null,
        status: "PUBLISHED",
        publishedAt: new Date(),
        author: { connect: { id: systemAuthor.id } },
      },
    });
    upserts++;
    console.log(`  upsert ${page.slug} [${page.locale}]`);
  }

  console.log(`OK ${upserts} pages upsertées`);
}

main()
  .catch((e) => {
    console.error("ECHEC seed ContentPages :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
