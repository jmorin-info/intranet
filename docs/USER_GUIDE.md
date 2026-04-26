# Guide utilisateur — OMNITECH Intranet

> Public : collaborateurs OMNITECH Security (environ 100 personnes).
> Périmètre : usage quotidien de l'intranet (GED ISO 27001, ticketing,
> wiki, calendrier, signatures, PWA).
> Version : 1.0 — 2026-04-26.
> Documents complémentaires :
> [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md), [`FAQ.md`](./FAQ.md),
> runbooks ops dans [`runbooks/`](./runbooks/).

---

## Sommaire

1. [Bienvenue](#1-bienvenue)
2. [Première connexion](#2-première-connexion)
3. [Mon espace](#3-mon-espace)
4. [Documents (GED ISO 27001)](#4-documents-ged-iso-27001)
5. [Tickets et support IT](#5-tickets-et-support-it)
6. [Wiki et base de connaissances](#6-wiki-et-base-de-connaissances)
7. [Annuaire et organigramme](#7-annuaire-et-organigramme)
8. [Calendrier et synchronisation](#8-calendrier-et-synchronisation)
9. [Notifications](#9-notifications)
10. [Mode hors ligne et installation PWA](#10-mode-hors-ligne-et-installation-pwa)
11. [Mode focus et aperçu Glance](#11-mode-focus-et-aperçu-glance)
12. [Préférences NOA et mode humour](#12-préférences-noa-et-mode-humour)
13. [Sécurité personnelle](#13-sécurité-personnelle)
14. [Aide et raccourcis clavier](#14-aide-et-raccourcis-clavier)

---

## 1. Bienvenue

L'intranet OMNITECH centralise les outils internes du groupe :

- **Gestion documentaire (GED)** conforme ISO 27001:2022 — politiques,
  procédures, guides, enregistrements.
- **Ticketing** unifié pour le support IT, RH, généraux (helpdesk).
- **Wiki** alimenté par une recherche IA (RAG) avec citations.
- **Annuaire** et **organigramme** par département.
- **Calendrier** synchronisable (export ICS personnel).
- **Conformité** (chartes, formations, MFA, signatures électroniques).

L'application est conçue pour fonctionner sur poste fixe, mobile et
tablette, ainsi qu'en mode hors ligne (PWA).

### Prérequis

- Compte LDAP OMNITECH actif (créé par le service informatique).
- Navigateur récent : Chrome / Edge / Firefox / Safari (versions de
  moins de 18 mois).
- Adresse e-mail interne `prenom.nom@omnitech-security.fr`.
- Téléphone compatible TOTP (Google Authenticator, Microsoft
  Authenticator, FreeOTP, 1Password, Bitwarden, etc.) — voir § 13.

### Rôles et permissions

Votre rôle conditionne ce que vous voyez. Sept rôles existent :

| Rôle             | Description courte                                        |
|------------------|-----------------------------------------------------------|
| `COLLABORATEUR`  | Utilisateur standard (lecture, dépôt de tickets, signatures).|
| `REVIEWER`       | Approbateur de documents et workflows (N+1, RH, RSSI).    |
| `ADMIN`          | Administrateur fonctionnel (utilisateurs, contenus, audit).|
| `SUPER_ADMIN`    | Configuration globale, sauvegardes, accès 360°.           |
| `AUDITEUR`       | Lecture seule des journaux et exports (auditeur externe). |
| `PRESTATAIRE`    | Accès restreint (espace simplifié, périmètre contrôlé).   |
| `DIRECTION`      | Vue agrégée + tableaux de bord direction.                 |

Si certaines sections de ce guide ne sont pas visibles dans votre menu,
votre rôle ne le permet pas — c'est normal.

---

## 2. Première connexion

### 2.1 Se connecter

1. Ouvrez l'URL communiquée par votre service informatique (par exemple
   `https://intranet.omnitech-security.fr`).
2. Sur la page **Connexion**, saisissez votre adresse e-mail interne et
   votre mot de passe LDAP.
3. Cochez « Se souvenir de moi » uniquement sur un poste personnel et
   sécurisé.
4. Cliquez sur **Se connecter**.

> Astuce : en cas d'oubli de mot de passe, utilisez le lien
> « Mot de passe oublié » sur la page de connexion. Un e-mail de
> réinitialisation est envoyé sous 5 minutes maximum.

### 2.2 Activer le double facteur (MFA)

L'authentification à deux facteurs est **obligatoire** pour la majorité
des rôles. Si elle n'est pas encore configurée, vous êtes redirigé vers
la page **MFA** dès la connexion.

1. Ouvrez votre application d'authentification (Google Authenticator,
   Microsoft Authenticator, etc.).
2. Scannez le QR code affiché à l'écran.
3. Saisissez le code à 6 chiffres généré par l'application.
4. Cliquez sur **Activer**.

### 2.3 Sauvegarder les codes de secours

Une fois le MFA activé, **10 codes de secours** sont générés. Ces codes
permettent de vous reconnecter si vous perdez votre téléphone.

1. Téléchargez le fichier texte ou copiez les codes dans un gestionnaire
   de mots de passe.
2. Stockez-les hors ligne ou dans un coffre-fort numérique.
3. Chaque code n'est utilisable qu'une seule fois.

> En cas de perte des codes, contactez le support IT via un ticket
> physique (ou par téléphone). Le RSSI peut réinitialiser votre MFA après
> vérification d'identité — voir [`runbooks/MFA_ENROLLMENT.md`](./runbooks/MFA_ENROLLMENT.md).

### 2.4 Signer les chartes obligatoires

Lors de la première connexion, certaines chartes peuvent vous être
présentées (charte informatique, charte éthique, RGPD). Une **modale
bloquante** apparaît tant que les signatures ne sont pas effectuées.

1. Lisez attentivement chaque charte.
2. Cliquez sur **Je signe** pour valider.
3. Un horodatage signé SHA-256 est enregistré dans votre dossier.

L'historique de vos signatures est consultable à tout moment depuis
`/signatures` (rubrique **Mes signatures** dans l'espace personnel).

---

## 3. Mon espace

`/dashboard` est la page d'accueil après connexion. Elle agrège vos
informations clés.

### 3.1 Tableau de bord

Vous y trouvez :

- Salutation personnalisée et date du jour.
- Compteurs : **documents à valider**, **tickets ouverts**, **signatures
  en attente**, **chartes à signer**.
- Documents récents et actualités.
- Widget **NOA** : raccourci vers la recherche IA.

### 3.2 Profil — `/profile`

Depuis l'icône avatar (en bas à gauche) ou via le raccourci `G P` :

- **Informations personnelles** : nom, e-mail, téléphone, photo (avatar).
- **Préférences** : thème clair/sombre, langue, mode compact.
- **Sécurité** : voir § 13.
- **Calendrier** : génération du jeton iCal personnel (§ 8).
- **Mode humour NOA** : opt-in décrit en § 12.

### 3.3 Mode sombre

Activez le **mode sombre** depuis le profil ou via la palette de
commandes (`Ctrl/Cmd + K` → « Thème »). Le choix est persistant par
appareil.

### 3.4 Sidebar Rail + Panel

La barre latérale gauche se compose de deux zones :

- **Rail** (étroit) : icônes des cinq hubs (Mon espace, Travail,
  Sécurité, Administration, RSSI).
- **Panel** (240 px) : items du hub sélectionné, avec recherche locale,
  épingles et historique récent.

Manipulations :

- Clic simple sur une icône du rail → change de hub.
- Double-clic sur l'icône active → masque/affiche le panel.
- Recherche locale dans le panel : `Ctrl/Cmd + .`.
- Épingler un item : survol → cliquer sur l'icône épingle.

---

## 4. Documents (GED ISO 27001)

`/documents` regroupe la gestion électronique de documents (politiques,
procédures, guides, enregistrements, formulaires).

### 4.1 Naviguer dans les documents

- Filtres : catégorie, statut, classification, propriétaire.
- Tri : par date, par référence, par prochaine revue.
- Vue liste ou tableau (selon préférence).

Les documents respectent une **classification** :

| Classification    | Diffusion                                 |
|-------------------|-------------------------------------------|
| `PUBLIC`          | Externe possible (site, partenaires).     |
| `INTERNE`         | Tous les collaborateurs OMNITECH.         |
| `CONFIDENTIEL`    | Périmètre métier identifié.               |
| `STRICT`          | Direction / RSSI uniquement.              |

### 4.2 Créer un document — `/documents/new`

Le formulaire de création utilise un **stepper en 3 étapes** :

1. **Étape 1 — Identification** : titre (≥ 3 caractères), domaine,
   description courte.
2. **Étape 2 — Classification** : catégorie ISO (Politique, Procédure,
   Guide, Enregistrement…), classification (Public / Interne / Confidentiel
   / Strict), contrôles ISO 27001 associés.
3. **Étape 3 — Validation** : choix du relecteur N+1, dépôt du fichier
   (PDF, DOCX, XLSX, MD), prochaine date de revue, soumission.

À la soumission, le document entre dans le workflow d'approbation
configuré pour sa catégorie (voir § 4.4).

> Astuce : la page `/documents/new-inline` propose une saisie en
> ligne (sans fichier joint) pour les courts mémos.

### 4.3 Modifier ou versionner un document

1. Ouvrez le document : `/documents/[id]`.
2. Cliquez sur **Modifier** : `/documents/[id]/edit` (formulaire) ou
   sur **Éditeur** : `/documents/[id]/editor` (édition en ligne, mode
   wysiwyg).
3. Toute modification crée une **nouvelle version**, conservée dans
   l'historique. Les versions antérieures restent consultables (audit).

### 4.4 Workflow d'approbation

Selon la catégorie, un workflow associé déclenche :

- **N+1** automatique pour les procédures métier.
- **RSSI** pour les politiques de sécurité.
- **DPO** pour les documents traitant de données personnelles.
- **Direction** pour les documents stratégiques.

Suivi des documents en attente : `/documents/pending`.

Chaque approbateur reçoit une notification (in-app + e-mail) et peut
**Approuver**, **Demander des modifications** ou **Rejeter** depuis la
fiche document.

### 4.5 Signature électronique (DocuSeal)

Certains documents nécessitent une **signature électronique**. Le
système s'appuie sur **DocuSeal** pour les signatures qualifiées.

1. Ouvrez le document : un encart « Signature requise » apparaît si
   nécessaire.
2. Cliquez sur **Signer** → vous êtes redirigé vers DocuSeal.
3. Signez (souris, stylet, ou en tapant votre nom selon la
   configuration).
4. De retour sur l'intranet, la signature est enregistrée et horodatée.

Vos signatures sont consultables dans `/signatures` et exportables au
format PDF.

### 4.6 Rétention et archivage

- Tous les documents ISO 27001 sont conservés **7 ans minimum** (durée
  fixée par la politique de rétention).
- Les documents archivés restent consultables en lecture seule.
- Aucune suppression définitive n'est possible côté utilisateur ; seul
  le SUPER_ADMIN peut purger après validation RSSI.

---

## 5. Tickets et support IT

`/tickets` est l'outil unifié pour toutes les demandes internes.

### 5.1 Créer un ticket

1. Cliquez sur **Nouveau ticket** (ou utilisez `Ctrl/Cmd + Shift + T`
   depuis n'importe quelle page).
2. Choisissez l'**espace de ticketing** : IT, RH, Généraux, Sécurité.
3. Renseignez :
   - Titre clair (« Imprimante 2e étage HS »).
   - Description détaillée.
   - Priorité : Basse, Normale, Haute, Critique.
   - Pièces jointes éventuelles (captures, logs).
   - Échéance souhaitée (optionnelle, synchronisée au calendrier).
4. Soumettez : un identifiant unique vous est attribué (`TKT-2026-00123`
   par exemple).

### 5.2 Suivre un ticket

- Liste personnelle : `/tickets` → onglet **Mes tickets**.
- Vue **Kanban** par statut : Nouveau → En cours → En attente → Résolu.
- Vue **Calendrier** : tickets avec date d'échéance affichés sur la
  vue mensuelle (`/calendar`).
- Notifications à chaque changement de statut, commentaire ou
  réassignation.

### 5.3 Commenter et clôturer

- Ajoutez des commentaires depuis la fiche ticket (`/tickets/[id]`).
- L'agent en charge peut demander des informations complémentaires.
- Une fois résolu, vous recevez une demande de **satisfaction** (note
  + commentaire) avant la clôture définitive.

### 5.4 Helpdesk dédié

`/helpdesk` propose un point d'entrée orienté support avec :

- Articles de connaissance fréquents.
- Recherche IA (NOA) sur la base wiki + tickets résolus.
- Création rapide de ticket si l'IA ne trouve pas la réponse.

---

## 6. Wiki et base de connaissances

`/wiki` centralise les articles internes (procédures rapides,
mémo techniques, FAQ métier).

### 6.1 Recherche globale

- Raccourci universel : `Ctrl/Cmd + K` ouvre la **palette de commandes**
  type Spotlight.
- La palette indexe : pages, documents, tickets, articles wiki,
  utilisateurs, raccourcis, actions rapides.
- Catégorie **Raccourcis** : navigation `G + lettre` (voir § 14).

### 6.2 Recherche IA — NOA

L'option **« Rechercher avec l'IA »** (`Ctrl/Cmd + Shift + K`) ouvre le
chat NOA, alimenté par un moteur RAG :

1. Posez une question en langage naturel
   (« Quelle est la procédure de déclaration d'incident ? »).
2. NOA répond en français avec **citations** vers les documents sources.
3. Les réponses sont validées contre le périmètre interne uniquement
   (les données restent on-prem).

NOA s'appuie sur :

- Les documents GED publiés.
- Le wiki interne.
- Les runbooks (selon votre rôle).
- Les actualités.

> Si NOA répond « Je ne sais pas », c'est que la réponse n'est pas
> trouvable dans le périmètre indexé. Créez alors un ticket IT ou un
> article wiki pour combler la lacune.

### 6.3 Contribuer au wiki

- Tout `COLLABORATEUR` peut proposer un article (rôle d'auteur).
- L'article passe par un workflow de **revue éditoriale** (REVIEWER ou
  ADMIN selon la catégorie).
- Les versions précédentes sont conservées, comme pour la GED.

---

## 7. Annuaire et organigramme

### 7.1 Annuaire — `/directory`

- Liste des collaborateurs avec photo, fonction, e-mail, téléphone.
- Recherche par nom ou e-mail (champ en haut).
- Filtre par département.
- Cliquez sur une fiche pour voir les coordonnées complètes.

### 7.2 Organigramme — `/directory/organigramme`

Vue arborescente par département. Chaque collaborateur affiche :

- Son **manager hiérarchique** (relation `User.managerId`).
- Son département et fonction.
- Un raccourci vers sa fiche annuaire.

### 7.3 Contacts externes — `/directory/contacts`

Carnet d'adresses partagé pour les contacts hors OMNITECH (clients,
prestataires, partenaires). Maintenu par le rôle `ADMIN`.

---

## 8. Calendrier et synchronisation

`/calendar` propose une vue mensuelle multi-sources.

### 8.1 Sources d'événements

- **Tickets** avec date d'échéance (synchronisation bidirectionnelle).
- **Documents** : prochaine date de revue ISO.
- **Workflows** : échéances d'approbation.
- **Actualités** programmées.
- **Revues d'accès** trimestrielles.

Légende couleur affichée en bas de la vue.

### 8.2 Synchronisation iCal personnelle

Pour intégrer le calendrier dans Outlook, Google Calendar, Thunderbird,
ou un agenda mobile :

1. Allez dans `/profile` → onglet **Calendrier**.
2. Cliquez sur **Générer mon jeton iCal**.
3. Copiez l'URL `https://intranet.../api/calendar/export.ics?token=...`.
4. Collez-la comme **Calendrier internet** dans votre client.

> Le jeton est personnel et révocable à tout moment depuis le profil.
> Ne le partagez avec personne.

### 8.3 Astuces calendrier

- Cliquez sur un jour pour voir la liste des événements de la journée.
- Bouton **Aujourd'hui** : recentre la vue sur la date du jour.
- Filtrage par type : actualités, conformité, revues.

---

## 9. Notifications

`/notifications` affiche tout l'historique de vos notifications, avec
recherche et filtre par type.

### 9.1 Types de notifications

- **Documents** : approbation requise, validation, rejet, version mise
  à jour.
- **Tickets** : assignation, commentaire, changement de statut,
  satisfaction demandée.
- **Workflows** : étape à valider.
- **Sécurité** : MFA à revalider, charte à signer, alerte CERT-FR.
- **Système** : maintenance planifiée, bannière d'annonce.
- **NOA** : suggestions personnalisées (opt-out possible).

### 9.2 Préférences — `/notifications/preferences`

Pour chaque type, vous choisissez le canal :

- **In-app** uniquement (défaut).
- **In-app + e-mail**.
- **In-app + e-mail + push** (PWA).
- **Aucune** (sauf les notifications obligatoires de sécurité).

Les notifications similaires sont **regroupées** automatiquement
(« 5 nouvelles approbations en attente »).

### 9.3 Notifications push (PWA)

Si l'application est installée en PWA (§ 10), vous pouvez activer les
notifications push système :

1. Préférences → activez **Push**.
2. Acceptez l'autorisation système du navigateur.
3. Les notifications critiques (incidents, MFA) apparaissent même
   quand l'onglet est fermé.

---

## 10. Mode hors ligne et installation PWA

L'intranet est une **Progressive Web App** (PWA) :

- Manifest : icônes, raccourcis, mode standalone.
- Service worker : cache des ressources statiques + pages visitées.
- Page hors ligne : `/offline` (consultable même sans réseau).

### 10.1 Installer l'application

- **Chrome / Edge desktop** : icône d'installation dans la barre
  d'adresse → **Installer**.
- **Android (Chrome)** : menu navigateur → **Ajouter à l'écran
  d'accueil**.
- **iOS (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.

L'application apparaît alors avec son icône OMNITECH et fonctionne en
mode plein écran.

### 10.2 Raccourcis de l'application installée

Le manifest expose 5 raccourcis (clic droit ou appui long sur
l'icône) :

- Documents
- Tickets
- Incidents
- Wiki
- Outils PDF

### 10.3 Comportement hors ligne

- Les pages déjà visitées s'affichent depuis le cache.
- Les actions de modification (création, édition) sont **bloquées** hors
  ligne pour éviter les conflits ; un message vous invite à réessayer
  une fois connecté.
- Une bannière d'état réseau s'affiche en haut quand la connexion est
  perdue.

---

## 11. Mode focus et aperçu Glance

### 11.1 Aperçu Glance — `Alt + Clic`

Inspiré de Zen Browser, le **Glance** ouvre un aperçu en surimpression
d'un lien interne sans quitter la page courante.

1. Maintenez **Alt** (ou **Option** sur macOS).
2. Cliquez sur un lien interne (`<a>` same-origin).
3. Une fenêtre flottante s'ouvre avec la page cible.
4. Fermez-la avec **Échap** ou en cliquant à l'extérieur.

> Pratique pour vérifier rapidement une fiche utilisateur ou un
> document depuis un ticket sans perdre votre contexte.

### 11.2 Mode focus

Le **mode focus** masque la sidebar et le header pour offrir un
affichage plein écran (utile pour la lecture ou la rédaction longue).

- Activation : depuis la palette `Ctrl/Cmd + K` → « Mode focus », ou
  bouton dédié dans le header.
- Désactivation : **Échap** ou clic sur l'icône retour.

---

## 12. Préférences NOA et mode humour

NOA est l'assistant interne (chatbot RAG + raccourcis). Par défaut, il
adopte un ton **professionnel et sobre**, conforme à la charte
OMNITECH.

### 12.1 Mode humour (opt-in)

Un mode humour cadré peut être activé pour ajouter des touches
d'humour (citations courtes, salutations légères) **en dehors des
contextes sensibles**.

1. Ouvrez `/profile`.
2. Section **Préférences** → toggle **Mode humour NOA**.
3. Validez.

Le mode humour est désactivé d'office sur :

- Toute interaction liée à la sécurité, RGPD, audit, RSSI.
- Les flux MFA, signatures, chartes.
- Les vues `AUDITEUR`.
- Tout document classé `CONFIDENTIEL` ou `STRICT`.

> Le mode humour requiert également l'activation globale par un
> administrateur (`AppConfig.noa.humor.enabled=true`). S'il est
> désactivé globalement, votre opt-in est ignoré.

### 12.2 Désactiver NOA

Si vous ne souhaitez pas voir l'assistant NOA :

1. `/profile` → **Préférences NOA** → **Désactiver NOA**.
2. Le badge et le widget disparaissent de votre interface.

Les fonctionnalités RAG (recherche `Ctrl/Cmd + Shift + K`) restent
néanmoins disponibles, sans mascotte.

---

## 13. Sécurité personnelle

### 13.1 Réinitialiser le MFA

Cas n° 1 : vous avez encore accès à votre application TOTP.

1. `/profile` → onglet **Sécurité** → **Réinitialiser MFA**.
2. Validez avec un code TOTP courant.
3. Scannez le nouveau QR code et regénérez les codes de secours.

Cas n° 2 : vous avez perdu votre téléphone.

1. Utilisez un **code de secours** sur la page MFA pour vous connecter.
2. Réinitialisez immédiatement le MFA (cas n° 1).

Cas n° 3 : vous n'avez plus ni téléphone ni codes.

1. Contactez le support IT par téléphone ou en personne.
2. Le RSSI ou l'ADMIN désigné réinitialise votre MFA après vérification
   d'identité (procédure tracée — voir
   [`runbooks/MFA_ENROLLMENT.md`](./runbooks/MFA_ENROLLMENT.md)).

### 13.2 Revalidation MFA fraîche (12 h)

Pour les actions sensibles (changement de mot de passe, modification de
permissions, accès aux exports IT), une **revalidation TOTP** est
demandée si votre dernière validation date de plus de **12 heures**.

Vous êtes redirigé vers `/mfa/revalidate`. Saisissez un code TOTP ou un
code de secours, puis poursuivez l'action.

### 13.3 Signaler un e-mail suspect

Si vous recevez un e-mail de phishing présumé :

1. **Ne cliquez sur aucun lien**.
2. Transférez l'e-mail à `phishing@omnitech-security.fr` (boîte
   surveillée par le RSSI).
3. Créez un ticket dans l'espace **Sécurité** avec la capture d'écran.
4. Supprimez l'e-mail de votre boîte.

Une alerte est éventuellement publiée dans `/alerts` si l'incident
concerne d'autres collaborateurs.

### 13.4 Formations KnowBe4

Les **campagnes de sensibilisation** (KnowBe4) sont intégrées :

- Notifications en cas de simulation de phishing échouée.
- Suivi de votre **score sécurité** dans le profil.
- Renvoi automatique vers la formation correspondante en cas d'erreur.

### 13.5 Mes certifications — `/certificates`

Liste des formations suivies, certifications obtenues, dates
d'expiration. Téléchargement des justificatifs au format PDF.

### 13.6 Bonnes pratiques

- Verrouillez votre poste à chaque absence (`Win + L` ou
  `Ctrl + Cmd + Q` sur macOS).
- Ne partagez jamais votre mot de passe ni vos codes de secours.
- Ne stockez aucun document classé `CONFIDENTIEL` ou `STRICT` sur un
  support amovible non chiffré.
- Signalez toute anomalie via `/incidents` (incident de sécurité) ou
  `/helpdesk` (incident IT).

---

## 14. Aide et raccourcis clavier

### 14.1 Modal d'aide

À tout moment, appuyez sur **`?`** (en dehors d'un champ texte) pour
ouvrir la liste des raccourcis disponibles selon votre rôle.

### 14.2 Palette de commandes

`Ctrl/Cmd + K` ouvre la palette de commandes (Spotlight). Elle indexe :

| Catégorie       | Exemples                                               |
|-----------------|--------------------------------------------------------|
| Récents         | Vos 5 dernières pages.                                 |
| Contenu         | Documents, articles wiki, tickets, utilisateurs.       |
| Pages           | Toutes les routes accessibles selon votre rôle.        |
| Actions         | Créer un ticket, créer un document, lancer la recherche IA. |
| Raccourcis      | Sauts directs `G + lettre`.                            |
| Admin           | (Visible uniquement pour `ADMIN` / `SUPER_ADMIN`)      |
| Aide            | Raccourcis clavier, à propos.                          |

### 14.3 Raccourcis `G + lettre` (go-to)

Appuyez sur `G`, puis dans les 1,5 s, sur la lettre cible :

| Raccourci | Destination               |
|-----------|---------------------------|
| `G D`     | Tableau de bord           |
| `G T`     | Tickets                   |
| `G S`     | Recherche                 |
| `G W`     | Wiki                      |
| `G H`     | Support IT (helpdesk)     |
| `G N`     | Actualités                |
| `G V`     | Veille cyber              |
| `G A`     | Annuaire                  |
| `G P`     | Mon profil                |
| `G K`     | Calendrier                |
| `G I`     | Incidents                 |
| `G Y`     | Santé système (ADMIN)     |
| `G L`     | Validation LDAP (ADMIN)   |
| `G R`     | Dashboard RSSI (SUPER_ADMIN) |
| `G C`     | Conformité (REVIEWER+)    |

### 14.4 Raccourcis directs (modificateurs)

| Raccourci                | Action                                         |
|--------------------------|------------------------------------------------|
| `Ctrl/Cmd + K`           | Ouvrir la palette de commandes.                |
| `Ctrl/Cmd + Shift + K`   | Ouvrir la recherche IA NOA.                    |
| `Ctrl/Cmd + Shift + N`   | Créer un document.                             |
| `Ctrl/Cmd + Shift + T`   | Créer un ticket.                               |
| `Ctrl/Cmd + .`           | Focus sur la recherche locale du panel.        |
| `Ctrl/Cmd + Alt + 1`     | Aller au hub Mon espace.                       |
| `Ctrl/Cmd + Alt + 2`     | Aller au hub Travail & Connaissance.           |
| `Ctrl/Cmd + Alt + 3`     | Aller au hub Sécurité & Conformité.            |
| `Ctrl/Cmd + Alt + 4`     | Aller au hub Administration (ADMIN+).          |
| `Ctrl/Cmd + Alt + 5`     | Aller au hub Supervision RSSI (SUPER_ADMIN).   |
| `Alt + Clic`             | Aperçu Glance d'un lien interne.               |
| `Échap`                  | Annuler / fermer la modale ou le mode focus.   |
| `?`                      | Ouvrir l'aide raccourcis.                      |

### 14.5 Obtenir de l'aide

- Tutoriel d'onboarding : `/getting-started`.
- Nouveautés produit : `/changelog`.
- Bandeau d'astuces : `/tips`.
- Page de confiance et conformité : `/trust`.
- Support IT : `/helpdesk` ou ouverture directe de ticket
  (`Ctrl/Cmd + Shift + T`).
- Avis sur l'intranet (formulaire libre) : `/testimonials` (visible aussi
  via le profil).

> En cas de blocage critique (impossibilité de se connecter, suspicion
> de compromission), contactez immédiatement le service informatique et
> consultez la procédure d'incident dans
> [`runbooks/PRODUCTION_INCIDENT_RESPONSE.md`](./runbooks/PRODUCTION_INCIDENT_RESPONSE.md).

---

*Document maintenu par le pôle Système d'Information OMNITECH Security
(SI/RSSI). Dernière mise à jour : 2026-04-26.*
