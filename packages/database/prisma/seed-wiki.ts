// =============================================================================
// OMNITECH Security Intranet — Wiki Seed
// Base de connaissances starter pour ESN cybersécurité
// =============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = resolve(__dirname, '../../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface WikiArticle {
  title: string;
  slug: string;
  category: string;
  content: string;
}

const articles: WikiArticle[] = [
  {
    title: 'Politique de mots de passe',
    slug: 'politique-mots-de-passe',
    category: 'Sécurité',
    content: `
<h2>Politique de mots de passe OMNITECH</h2>
<p>Cette politique définit les exigences minimales en matière de mots de passe pour l'ensemble des collaborateurs d'OMNITECH Security, conformément à la norme ISO 27001:2022 et aux recommandations de l'ANSSI.</p>

<h3>Exigences minimales</h3>
<ul>
  <li><strong>Longueur minimale :</strong> 14 caractères pour les comptes utilisateurs, 20 caractères pour les comptes à privilèges</li>
  <li><strong>Complexité :</strong> au moins une majuscule, une minuscule, un chiffre et un caractère spécial</li>
  <li><strong>Renouvellement :</strong> tous les 90 jours (comptes standards), 60 jours (comptes admin)</li>
  <li><strong>Historique :</strong> les 12 derniers mots de passe ne peuvent pas être réutilisés</li>
</ul>

<h3>Gestionnaire de mots de passe</h3>
<p>L'utilisation de <strong>KeePassXC</strong> est obligatoire pour stocker vos identifiants professionnels. Le fichier de base de données doit être stocké exclusivement sur le partage réseau sécurisé. L'utilisation de gestionnaires de mots de passe en ligne (LastPass, 1Password, etc.) est interdite sauf dérogation écrite du RSSI.</p>

<h3>Authentification multifacteur (MFA)</h3>
<p>Le MFA est obligatoire pour tous les accès suivants :</p>
<ul>
  <li>VPN et accès distants</li>
  <li>Messagerie professionnelle</li>
  <li>Consoles d'administration</li>
  <li>Applications critiques (SIEM, EDR, ticketing)</li>
</ul>

<h3>Interdictions</h3>
<p>Il est strictement interdit de : partager un mot de passe par email ou messagerie instantanée, utiliser le même mot de passe pour un usage personnel et professionnel, écrire un mot de passe sur un support physique visible.</p>
`,
  },
  {
    title: 'Procédure VPN et accès distant',
    slug: 'procedure-vpn-acces-distant',
    category: 'Infrastructure',
    content: `
<h2>Accès distant sécurisé — VPN OMNITECH</h2>
<p>Tout accès au système d'information d'OMNITECH depuis l'extérieur du réseau d'entreprise doit passer par le VPN. Cette procédure décrit la configuration et les règles d'utilisation.</p>

<h3>Prérequis</h3>
<ul>
  <li>Poste de travail OMNITECH avec agent EDR actif</li>
  <li>Client WireGuard installé et configuré par la DSI</li>
  <li>Token MFA (application TOTP ou clé FIDO2)</li>
  <li>Autorisation managériale validée dans le portail RH</li>
</ul>

<h3>Procédure de connexion</h3>
<ul>
  <li>Lancer le client WireGuard et sélectionner le profil <strong>OMNITECH-PROD</strong></li>
  <li>Saisir vos identifiants Active Directory</li>
  <li>Valider le second facteur (TOTP ou clé physique)</li>
  <li>Vérifier que le tunnel est actif (icône verte dans la barre système)</li>
</ul>

<h3>Règles d'utilisation</h3>
<p>Le split-tunneling est désactivé : tout le trafic réseau passe par le VPN une fois connecté. La déconnexion automatique intervient après 8 heures d'inactivité. Les sessions actives sont journalisées et auditées.</p>

<h3>Dépannage</h3>
<p>En cas de problème de connexion, vérifiez que votre poste est à jour (Windows Update / apt upgrade), que l'agent EDR fonctionne, et que votre horloge système est synchronisée (NTP). Si le problème persiste, contactez le support IT via le portail ou par téléphone au poste 4242.</p>
`,
  },
  {
    title: 'Bonnes pratiques email et anti-phishing',
    slug: 'bonnes-pratiques-email-phishing',
    category: 'Sécurité',
    content: `
<h2>Bonnes pratiques email et protection contre le phishing</h2>
<p>Le phishing reste le vecteur d'attaque numéro un. En tant que professionnels de la cybersécurité, nous devons montrer l'exemple. Voici les règles à appliquer au quotidien.</p>

<h3>Identifier un email suspect</h3>
<ul>
  <li><strong>Expéditeur :</strong> vérifiez l'adresse complète, pas seulement le nom affiché</li>
  <li><strong>Urgence artificielle :</strong> « Votre compte sera bloqué dans 24h » est un signal d'alarme</li>
  <li><strong>Liens :</strong> survolez avant de cliquer, vérifiez que le domaine est légitime</li>
  <li><strong>Pièces jointes :</strong> n'ouvrez jamais un fichier .exe, .scr, .js ou macro Office non attendu</li>
  <li><strong>Fautes d'orthographe :</strong> souvent présentes mais de moins en moins avec l'IA générative</li>
</ul>

<h3>Que faire en cas de doute ?</h3>
<ul>
  <li>Ne cliquez sur aucun lien et n'ouvrez aucune pièce jointe</li>
  <li>Transférez l'email à <strong>security@omnitech-security.fr</strong></li>
  <li>Signalez-le via le bouton « Report Phishing » dans Outlook</li>
  <li>Si vous avez cliqué : déconnectez-vous du réseau et appelez le SOC immédiatement (poste 4200)</li>
</ul>

<h3>Campagnes de sensibilisation</h3>
<p>OMNITECH réalise des campagnes de phishing simulé chaque trimestre. Les résultats sont anonymisés et servent à améliorer notre posture de sécurité. Tout collaborateur ayant cliqué sur un lien de test bénéficie d'une session de formation complémentaire.</p>
`,
  },
  {
    title: 'Onboarding IT — Nouvel arrivant',
    slug: 'onboarding-it-nouvel-arrivant',
    category: 'RH / Onboarding',
    content: `
<h2>Onboarding IT — Guide du nouvel arrivant</h2>
<p>Bienvenue chez OMNITECH Security ! Ce guide vous accompagne dans vos premiers pas informatiques au sein de l'entreprise.</p>

<h3>Jour 1 — Récupération du matériel</h3>
<ul>
  <li>Rendez-vous à la DSI (bureau 201) pour récupérer votre poste de travail</li>
  <li>Votre laptop est pré-configuré avec Windows 11 Pro ou Ubuntu 22.04 LTS selon votre poste</li>
  <li>Un casque, une souris et un écran externe vous seront fournis</li>
</ul>

<h3>Jour 1 — Activation des comptes</h3>
<ul>
  <li><strong>Active Directory :</strong> identifiants fournis par la DSI dans une enveloppe scellée</li>
  <li><strong>Messagerie :</strong> prenom.nom@omnitech-security.fr (Outlook / Exchange Online)</li>
  <li><strong>Intranet :</strong> connectez-vous sur intranet.omnitech-security.fr avec vos identifiants AD</li>
  <li><strong>VPN :</strong> configuré automatiquement, activez le MFA via l'application TOTP</li>
</ul>

<h3>Semaine 1 — Formations obligatoires</h3>
<ul>
  <li>Sensibilisation à la sécurité de l'information (e-learning, 2h)</li>
  <li>Charte informatique — lecture et signature électronique</li>
  <li>Formation aux outils internes (JIRA, Confluence, Git)</li>
</ul>

<h3>Contacts utiles</h3>
<p>Support IT : poste 4242 ou support@omnitech-security.fr. Manager direct pour les droits applicatifs spécifiques. RSSI pour toute question relative à la politique de sécurité.</p>
`,
  },
  {
    title: 'FAQ Support IT — Problèmes courants',
    slug: 'faq-support-it-problemes-courants',
    category: 'Support',
    content: `
<h2>FAQ Support IT — Problèmes courants</h2>
<p>Retrouvez ici les réponses aux questions les plus fréquemment posées au support informatique.</p>

<h3>Mon mot de passe a expiré, que faire ?</h3>
<p>Rendez-vous sur le portail de réinitialisation <strong>password.omnitech-security.fr</strong>. Vous devrez valider votre identité via MFA. Si vous n'avez plus accès au MFA, contactez le support avec une pièce d'identité.</p>

<h3>Mon poste est très lent</h3>
<ul>
  <li>Redémarrez votre poste (ne pas simplement fermer/ouvrir le capot)</li>
  <li>Vérifiez qu'un scan antivirus n'est pas en cours</li>
  <li>Fermez les onglets de navigateur inutilisés</li>
  <li>Si le problème persiste, ouvrez un ticket catégorie « Performance »</li>
</ul>

<h3>Je n'arrive pas à imprimer</h3>
<p>Vérifiez que vous êtes connecté au réseau d'entreprise (VPN si en télétravail). L'impression via VPN n'est pas supportée — utilisez « Imprimer en PDF » et imprimez à votre retour au bureau.</p>

<h3>Je ne reçois plus d'emails</h3>
<ul>
  <li>Vérifiez votre connexion réseau</li>
  <li>Consultez le webmail (mail.omnitech-security.fr) pour confirmer</li>
  <li>Vérifiez vos règles de filtrage et dossier spam</li>
  <li>Contactez le support si le problème concerne tout le service</li>
</ul>

<h3>Comment demander un logiciel ?</h3>
<p>Toute demande d'installation de logiciel doit passer par le portail de demandes IT. Le délai de traitement est de 48h ouvrées. Les logiciels non approuvés ne peuvent pas être installés (droits administrateur désactivés).</p>
`,
  },
  {
    title: 'Gestion des incidents de sécurité',
    slug: 'gestion-incidents-securite',
    category: 'Sécurité',
    content: `
<h2>Procédure de gestion des incidents de sécurité</h2>
<p>Cette procédure s'applique à tout événement susceptible de compromettre la confidentialité, l'intégrité ou la disponibilité du système d'information d'OMNITECH.</p>

<h3>Classification des incidents</h3>
<ul>
  <li><strong>P1 — Critique :</strong> compromission avérée, ransomware, fuite de données massive</li>
  <li><strong>P2 — Majeur :</strong> tentative d'intrusion détectée, malware isolé, indisponibilité service critique</li>
  <li><strong>P3 — Mineur :</strong> phishing reçu sans clic, anomalie de log, vulnérabilité non exploitée</li>
</ul>

<h3>Circuit de déclaration</h3>
<ul>
  <li><strong>Étape 1 :</strong> Déclarer immédiatement l'incident via le portail ITSM ou par téléphone au SOC (poste 4200)</li>
  <li><strong>Étape 2 :</strong> Ne pas tenter de corriger seul — isoler le poste si compromission suspectée</li>
  <li><strong>Étape 3 :</strong> Le SOC qualifie et escalade selon la criticité</li>
  <li><strong>Étape 4 :</strong> Cellule de crise activée pour les P1 (RSSI, DG, juridique, communication)</li>
</ul>

<h3>Obligations légales</h3>
<p>Conformément au RGPD, toute violation de données personnelles doit être notifiée à la CNIL sous 72 heures. Le DPO (dpo@omnitech-security.fr) doit être informé sans délai. Un registre des incidents est maintenu et audité annuellement.</p>

<h3>Post-incident</h3>
<p>Chaque incident P1/P2 fait l'objet d'un retour d'expérience (REX) dans les 5 jours ouvrés. Les actions correctives sont suivies dans le plan de traitement des risques.</p>
`,
  },
  {
    title: 'Chiffrement et protection des données',
    slug: 'chiffrement-protection-donnees',
    category: 'Sécurité',
    content: `
<h2>Chiffrement et protection des données</h2>
<p>OMNITECH applique le principe de chiffrement par défaut pour protéger les données de l'entreprise et de ses clients, conformément aux exigences ISO 27001 et RGPD.</p>

<h3>Chiffrement des postes de travail</h3>
<ul>
  <li><strong>Windows :</strong> BitLocker activé avec clé de récupération centralisée dans Active Directory</li>
  <li><strong>Linux :</strong> LUKS sur la partition système, phrase de passe au démarrage</li>
  <li><strong>Clés USB :</strong> seules les clés chiffrées fournies par la DSI sont autorisées</li>
</ul>

<h3>Chiffrement des communications</h3>
<ul>
  <li>Emails sensibles : chiffrement S/MIME ou PGP obligatoire pour les données classifiées</li>
  <li>Messagerie instantanée : utilisation exclusive de la plateforme interne (chiffrement E2E)</li>
  <li>Transferts de fichiers : via le portail sécurisé (SFTP ou HTTPS uniquement)</li>
</ul>

<h3>Classification des données</h3>
<p>Les données sont classées en quatre niveaux :</p>
<ul>
  <li><strong>C0 — Public :</strong> information diffusable sans restriction</li>
  <li><strong>C1 — Interne :</strong> réservé aux collaborateurs OMNITECH</li>
  <li><strong>C2 — Confidentiel :</strong> accès restreint, chiffrement obligatoire au repos et en transit</li>
  <li><strong>C3 — Secret :</strong> accès nominatif, chiffrement renforcé, journalisation complète</li>
</ul>

<h3>Destruction des données</h3>
<p>Les supports de stockage en fin de vie sont détruits physiquement (broyeur certifié). Les données numériques font l'objet d'un effacement sécurisé (NIST SP 800-88).</p>
`,
  },
  {
    title: 'Utilisation du matériel personnel (BYOD)',
    slug: 'utilisation-materiel-byod',
    category: 'Sécurité',
    content: `
<h2>Politique BYOD — Bring Your Own Device</h2>
<p>L'utilisation d'appareils personnels pour accéder au système d'information d'OMNITECH est encadrée par cette politique. Le BYOD est toléré sous conditions strictes.</p>

<h3>Appareils autorisés</h3>
<ul>
  <li><strong>Smartphones :</strong> consultation de la messagerie et du calendrier uniquement</li>
  <li><strong>Tablettes :</strong> accès en lecture aux documents non classifiés (C0, C1)</li>
  <li><strong>Ordinateurs portables personnels :</strong> interdits sauf dérogation écrite du RSSI</li>
</ul>

<h3>Conditions obligatoires</h3>
<ul>
  <li>Système d'exploitation à jour (dernière version majeure supportée)</li>
  <li>Verrouillage par code PIN (6 chiffres minimum) ou biométrie</li>
  <li>Chiffrement natif activé (FileVault, chiffrement Android)</li>
  <li>Installation de l'application MDM OMNITECH (gestion à distance)</li>
  <li>Pas de root / jailbreak</li>
</ul>

<h3>Responsabilités</h3>
<p>L'utilisateur reste responsable de son appareil personnel. En cas de perte ou de vol, il doit immédiatement prévenir la DSI pour déclenchement de l'effacement à distance des données professionnelles. OMNITECH ne peut être tenu responsable de la perte de données personnelles lors de cet effacement.</p>

<h3>Désinscription</h3>
<p>En cas de départ de l'entreprise ou de retrait du programme BYOD, le MDM sera désinstallé et les données professionnelles effacées de l'appareil sous 48 heures.</p>
`,
  },
  {
    title: 'Sauvegarde et restauration',
    slug: 'sauvegarde-restauration',
    category: 'Infrastructure',
    content: `
<h2>Politique de sauvegarde et restauration</h2>
<p>La sauvegarde des données est un pilier de la continuité d'activité chez OMNITECH. Cette page décrit la stratégie de sauvegarde et les procédures de restauration.</p>

<h3>Stratégie de sauvegarde (règle 3-2-1)</h3>
<ul>
  <li><strong>3 copies</strong> de chaque donnée critique</li>
  <li><strong>2 supports</strong> de stockage différents (NAS + bande LTO)</li>
  <li><strong>1 copie</strong> externalisée dans un datacenter distant (chiffrement AES-256)</li>
</ul>

<h3>Fréquence des sauvegardes</h3>
<ul>
  <li><strong>Bases de données :</strong> sauvegarde incrémentale toutes les heures, complète quotidienne</li>
  <li><strong>Serveurs de fichiers :</strong> snapshot quotidien, sauvegarde complète hebdomadaire</li>
  <li><strong>Postes de travail :</strong> les données doivent être stockées sur le partage réseau (non sauvegardées localement)</li>
  <li><strong>Configuration infrastructure :</strong> export automatisé quotidien (IaC dans Git)</li>
</ul>

<h3>Procédure de restauration</h3>
<p>Pour demander une restauration, ouvrez un ticket ITSM catégorie « Restauration de données » en précisant : le fichier ou système concerné, la date de la version souhaitée, et la justification. La DSI s'engage à restaurer sous 4 heures (RTO) pour les systèmes critiques, 24 heures pour les autres.</p>

<h3>Tests de restauration</h3>
<p>Des tests de restauration sont réalisés chaque trimestre sur un échantillon aléatoire. Les résultats sont documentés et présentés en revue de direction.</p>
`,
  },
  {
    title: 'Contact IT et procédure d\'escalade',
    slug: 'contact-it-escalade',
    category: 'Support',
    content: `
<h2>Contact IT et procédure d'escalade</h2>
<p>Cette page centralise les coordonnées du support informatique et décrit la procédure d'escalade en cas de problème non résolu.</p>

<h3>Canaux de support</h3>
<ul>
  <li><strong>Portail ITSM :</strong> support.omnitech-security.fr — canal privilégié pour le suivi des demandes</li>
  <li><strong>Téléphone :</strong> poste 4242 (support général) / poste 4200 (SOC — incidents de sécurité)</li>
  <li><strong>Email :</strong> support@omnitech-security.fr</li>
  <li><strong>Chat :</strong> canal #support-it sur la messagerie interne</li>
</ul>

<h3>Horaires</h3>
<ul>
  <li><strong>Support N1 :</strong> lundi au vendredi, 8h-18h</li>
  <li><strong>SOC :</strong> 24/7 (astreinte nuit et week-end pour incidents P1)</li>
  <li><strong>Astreinte infrastructure :</strong> joignable via le numéro d'astreinte (communiqué par votre manager)</li>
</ul>

<h3>Niveaux d'escalade</h3>
<ul>
  <li><strong>N1 — Support utilisateur :</strong> résolution sous 4h ouvrées (mot de passe, accès, poste de travail)</li>
  <li><strong>N2 — Administration système :</strong> escalade si non résolu en N1, résolution sous 8h ouvrées</li>
  <li><strong>N3 — Ingénierie / Architecture :</strong> problèmes complexes, changements d'infrastructure</li>
  <li><strong>N4 — Direction DSI / RSSI :</strong> escalade managériale si SLA dépassé ou impact critique</li>
</ul>

<h3>SLA par priorité</h3>
<p><strong>P1 :</strong> prise en charge immédiate, résolution sous 4h. <strong>P2 :</strong> prise en charge sous 1h, résolution sous 8h. <strong>P3 :</strong> prise en charge sous 4h, résolution sous 24h. <strong>P4 :</strong> prise en charge sous 8h, résolution sous 5 jours ouvrés.</p>
`,
  },
];

async function main() {
  console.log('🔍 Recherche du premier SUPER_ADMIN...');
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });

  if (!admin) {
    throw new Error('Aucun SUPER_ADMIN trouvé en base. Lancez le seed principal d\'abord.');
  }
  console.log(`✅ SUPER_ADMIN trouvé : ${admin.email} (${admin.id})`);

  let created = 0;
  let skipped = 0;

  for (const article of articles) {
    const existing = await prisma.wikiPage.findUnique({
      where: { slug: article.slug },
    });

    if (existing) {
      console.log(`⏭️  "${article.title}" existe déjà (slug: ${article.slug})`);
      skipped++;
      continue;
    }

    await prisma.wikiPage.create({
      data: {
        title: article.title,
        slug: article.slug,
        content: article.content,
        category: article.category,
        authorId: admin.id,
        isPublished: true,
        visibility: 'PUBLIC',
      },
    });
    console.log(`✅ Créé : "${article.title}" [${article.category}]`);
    created++;
  }

  console.log(`\n📊 Résultat : ${created} créé(s), ${skipped} ignoré(s) (déjà existant)`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
