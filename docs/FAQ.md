# Foire aux questions — OMNITECH Intranet

> Réponses rapides aux questions les plus fréquentes des collaborateurs
> et administrateurs OMNITECH Security. Pour le détail, voir
> [`USER_GUIDE.md`](./USER_GUIDE.md) et [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md).
> Version : 1.0 — 2026-04-26.

---

## Sommaire

- [Connexion et compte](#connexion-et-compte)
- [MFA et codes de secours](#mfa-et-codes-de-secours)
- [Documents et GED](#documents-et-ged)
- [Tickets et support](#tickets-et-support)
- [Notifications](#notifications)
- [Recherche et NOA](#recherche-et-noa)
- [Calendrier](#calendrier)
- [PWA et hors ligne](#pwa-et-hors-ligne)
- [Confidentialité, RGPD et sécurité](#confidentialité-rgpd-et-sécurité)
- [Administration](#administration)

---

## Connexion et compte

### J'ai oublié mon mot de passe. Que faire ?

Sur la page de connexion, cliquez sur **Mot de passe oublié**, saisissez
votre adresse e-mail interne. Vous recevez un lien de réinitialisation
sous 5 minutes. Le lien est valable 30 minutes et à usage unique. Si
l'e-mail n'arrive pas, vérifiez vos spams puis créez un ticket support.

### Mon compte est verrouillé après plusieurs essais. Puis-je me débloquer seul ?

Le verrouillage automatique dure 15 minutes après 5 tentatives
infructueuses. Patientez, puis reconnectez-vous. Si vous êtes pressé,
contactez le support IT pour un déverrouillage manuel.

### Je ne reçois pas l'e-mail de connexion ou de réinitialisation.

1. Vérifiez vos spams et la quarantaine BunkerWeb.
2. Confirmez l'orthographe exacte de votre e-mail
   (`prenom.nom@omnitech-security.fr`).
3. Si rien après 10 minutes, ouvrez un ticket dans l'espace IT ou
   contactez votre administrateur.

### Pourquoi suis-je déconnecté toutes les heures ?

Les sessions ont une durée d'inactivité de **60 minutes** par défaut
(politique ISO 27001 A.8.5). En cas d'activité, la session est
prolongée. Pour les actions sensibles, une **revalidation MFA fraîche
de 12 h** peut être demandée.

---

## MFA et codes de secours

### J'ai perdu mon téléphone. Comment me connecter ?

Utilisez l'un de vos **codes de secours** (générés à l'activation MFA)
sur la page de challenge. Réinitialisez immédiatement votre MFA depuis
`/profile` → onglet **Sécurité**.

### Je n'ai plus ni téléphone ni codes de secours.

Contactez le support IT en personne ou par téléphone. Le RSSI ou un
ADMIN désigné réinitialise votre MFA après vérification d'identité,
selon la procédure
[`runbooks/MFA_ENROLLMENT.md`](./runbooks/MFA_ENROLLMENT.md).

### Mon MFA est cassé : il refuse tous mes codes.

1. Vérifiez l'**heure** de votre téléphone (le TOTP exige une horloge
   synchronisée à ± 30 s).
2. Désactivez puis réactivez la synchronisation NTP de votre téléphone.
3. Si le problème persiste, utilisez un code de secours et
   réinitialisez le MFA.

### Puis-je désactiver le MFA ?

Non. Pour la majorité des rôles (`COLLABORATEUR`, `ADMIN`, `RSSI`,
etc.), le MFA est imposé par la politique de sécurité OMNITECH (ISO
27001 A.5.17, A.8.5). Le rôle `PRESTATAIRE` peut faire l'objet d'une
politique allégée si décidé par le RSSI.

### Comment générer de nouveaux codes de secours ?

`/profile` → **Sécurité** → **Régénérer les codes de secours**. Les
codes précédents deviennent invalides. Conservez les nouveaux codes
hors ligne.

---

## Documents et GED

### Je viens d'uploader un document, mais il n'apparaît pas dans la liste.

- Vérifiez le filtre statut : un document soumis pour approbation
  apparaît avec le statut **En revue**, pas **Approuvé**.
- Vérifiez la classification : un document `CONFIDENTIEL` n'est visible
  que par le périmètre concerné.
- Si le document est introuvable, l'upload a peut-être échoué : ouvrez
  un ticket support en joignant l'identifiant attendu.

### Je ne peux pas modifier un document. Pourquoi ?

Trois causes possibles :

1. Vous n'êtes pas propriétaire du document.
2. Le document est en cours d'approbation (verrouillage en lecture
   seule jusqu'à validation).
3. Vous n'avez pas les droits sur le module **Documents** dans votre
   espace.

### Quelle est la différence entre Catégorie et Classification ?

- **Catégorie** : type ISO 27001 (Politique, Procédure, Guide,
  Enregistrement, Formulaire…). Détermine le workflow d'approbation.
- **Classification** : niveau de confidentialité (Public, Interne,
  Confidentiel, Strict). Détermine la diffusion.

### Combien de temps un document est-il conservé ?

7 ans minimum (politique de rétention ISO 27001 A.5.33). Aucun
collaborateur ne peut supprimer un document définitivement.

### Comment signer un document électroniquement ?

Ouvrez le document : un encart « Signature requise » apparaît si
nécessaire. Cliquez sur **Signer**, suivez le parcours DocuSeal, puis
revenez sur l'intranet. La signature est horodatée et auditable depuis
`/signatures`.

---

## Tickets et support

### Quelle est la différence entre Ticket, Incident et Helpdesk ?

- **Ticket** (`/tickets`) : demande structurée (IT, RH, généraux,
  sécurité) avec espace, priorité, échéance.
- **Incident** (`/incidents`) : événement de sécurité ou panne majeure
  nécessitant une intervention RSSI / DSI.
- **Helpdesk** (`/helpdesk`) : point d'entrée orienté support IT, avec
  recherche IA NOA et création rapide de ticket.

### Comment savoir où en est mon ticket ?

`/tickets` → onglet **Mes tickets**. Vous pouvez aussi consulter la
vue Kanban ou la vue calendrier (échéances). Une notification est
envoyée à chaque changement de statut.

### Je n'ai pas reçu de notification pour mon ticket.

Vérifiez vos préférences dans `/notifications/preferences`. Le canal
e-mail est désactivable, mais les notifications in-app le restent
toujours.

### Comment exporter mes tickets ?

L'export individuel n'est pas disponible côté collaborateur. Pour un
besoin RGPD ou audit, contactez le support qui produira l'extraction
via `/admin/it-exports` (signée).

---

## Notifications

### Je ne reçois pas les notifications par e-mail.

1. Vérifiez `/notifications/preferences` : le canal **E-mail** doit
   être activé pour le type concerné.
2. Vérifiez les filtres anti-spam de votre messagerie.
3. Vérifiez que votre adresse e-mail dans `/profile` est correcte.

### Comment activer les notifications push ?

Installez d'abord l'application en PWA (voir § PWA). Puis dans
`/notifications/preferences`, activez **Push** et acceptez
l'autorisation système du navigateur.

### Trop de notifications, comment réduire le bruit ?

`/notifications/preferences` permet de choisir **In-app uniquement**
pour la plupart des types. Les notifications similaires sont
regroupées automatiquement.

---

## Recherche et NOA

### Pourquoi NOA répond « Je ne sais pas » à ma question ?

NOA s'appuie uniquement sur le contenu indexé en interne (documents
publiés, wiki, runbooks selon votre rôle). Si la réponse n'y figure
pas, NOA ne **fabrique pas** d'information. Cas typiques :

- Document non encore approuvé (donc non indexé).
- Information stockée hors intranet (e-mail, fichier réseau non
  référencé).
- Article wiki manquant : créez-en un pour combler la lacune.

### NOA cite-t-il toujours ses sources ?

Oui. Chaque réponse RAG inclut les **citations** vers les documents
sources (numéro, titre, lien). C'est une exigence de traçabilité
ISO 27001 A.5.34.

### Mes données sont-elles envoyées à OpenAI ou ChatGPT ?

Non. NOA s'appuie sur un LLM local (Ollama) hébergé sur l'infrastructure
OMNITECH. Aucune donnée n'est transmise à un service tiers (déploiement
on-prem / air-gap compatible).

### Comment chercher rapidement n'importe où ?

`Ctrl/Cmd + K` ouvre la **palette de commandes** (recherche globale).
`Ctrl/Cmd + Shift + K` ouvre la **recherche IA** (NOA).

---

## Calendrier

### Mes tickets n'apparaissent pas dans le calendrier.

Seuls les tickets avec une **date d'échéance** sont synchronisés. Si
votre ticket n'a pas de date métier, il ne s'affiche pas.

### Comment intégrer le calendrier OMNITECH dans Outlook ou Google Agenda ?

`/profile` → onglet **Calendrier** → **Générer mon jeton iCal**.
Copiez l'URL générée et ajoutez-la comme **calendrier internet** dans
votre client.

### Mon jeton iCal est compromis. Comment le révoquer ?

`/profile` → onglet **Calendrier** → **Révoquer le jeton actuel**.
Générez-en un nouveau et mettez à jour vos clients.

---

## PWA et hors ligne

### Comment installer l'intranet sur mon poste ?

- Chrome / Edge desktop : icône d'installation dans la barre d'adresse.
- Android Chrome : menu → **Ajouter à l'écran d'accueil**.
- iOS Safari : **Partager** → **Sur l'écran d'accueil**.

### Puis-je travailler sans connexion ?

Partiellement. Les pages déjà visitées s'affichent depuis le cache.
**Toute modification** (création de document, ouverture de ticket)
nécessite une connexion. Une bannière indique l'état du réseau.

### Comment désinstaller la PWA ?

Sur desktop : clic droit sur l'icône → **Désinstaller**. Sur mobile :
appui long → **Supprimer**. Les données locales sont effacées.

---

## Confidentialité, RGPD et sécurité

### Qui voit ce que je publie ?

Cela dépend de la **classification** :

- `PUBLIC` : tous, y compris contacts externes éventuels.
- `INTERNE` : tous les collaborateurs OMNITECH.
- `CONFIDENTIEL` : périmètre métier identifié.
- `STRICT` : RSSI / Direction uniquement.

Vérifiez systématiquement le niveau choisi avant publication.

### Comment exporter mes données personnelles (RGPD) ?

Adressez votre demande au DPO via `dpo@omnitech-security.fr` ou ouvrez
un ticket dans l'espace **Sécurité**. La demande est traitée sous
**30 jours** maximum (article 12 RGPD), avec traçabilité dans le
journal d'audit.

### Comment signaler un e-mail de phishing ?

1. Ne cliquez sur aucun lien.
2. Transférez l'e-mail à `phishing@omnitech-security.fr`.
3. Créez un ticket dans l'espace Sécurité avec capture d'écran.
4. Supprimez l'e-mail.

### L'intranet est-il accessible depuis l'extérieur ?

Oui, via l'URL publique sécurisée (TLS, BunkerWeb, MFA obligatoire).
Le rôle `PRESTATAIRE` n'a accès qu'à un sous-ensemble restreint.
L'accès externe d'un partenaire passe par `/admin/external-access`
(périmètre limité, expiration obligatoire).

### Mes mots de passe sont-ils stockés dans l'intranet ?

Non. L'authentification s'appuie sur **LDAP** (annuaire d'entreprise).
L'intranet ne stocke aucun mot de passe en clair, et aucune copie
locale n'est conservée.

### L'intranet est-il auditable ?

Oui. Toute action sensible (connexion, modification, consultation
sensible, export) est tracée dans `/admin/audit` (immuable, append
only). Conservation 365 jours en base chaude, archivage froid au-delà.

---

## Administration

### Comment ajouter un nouveau collaborateur ?

Les comptes sont créés automatiquement par synchronisation **LDAP**.
Si le compte n'apparaît pas, vérifiez `/admin/ldap-pending` (compte en
attente de validation) ou exécutez la procédure
[`runbooks/LDAP_SYNC_MANUAL.md`](./runbooks/LDAP_SYNC_MANUAL.md).

### Comment forcer le MFA pour tous les utilisateurs ?

`/admin/users` → sélection multi → **Politique MFA → requis**. Les
utilisateurs concernés sont obligés d'enrôler leur MFA à la prochaine
connexion. Tracé dans `mfaEnforcedAt` / `mfaEnforcedById`.

### Comment activer la bannière d'annonce ?

`/admin/config` (SUPER_ADMIN) → clés `banner.enabled=true`,
`banner.message=...`, `banner.severity=info|warning|critical`.
La bannière apparaît instantanément sur toutes les pages.

### Comment activer le mode maintenance ?

`/admin/config` → `maintenance.mode=true` et
`maintenance.message=...`. Toutes les routes redirigent vers
`/maintenance`. À utiliser uniquement pendant les opérations à risque
documentées dans un ticket de change.

### Comment lancer une réindexation RAG manuelle ?

Voir
[`runbooks/RAG_REINDEX_NIGHTLY.md`](./runbooks/RAG_REINDEX_NIGHTLY.md).
Le cron nocturne suffit dans 99 % des cas ; un lancement manuel n'est
justifié qu'après ajout massif de contenu ou anomalie d'indexation.

### En cas d'incident production, par quoi commencer ?

Suivez la procédure
[`runbooks/PRODUCTION_INCIDENT_RESPONSE.md`](./runbooks/PRODUCTION_INCIDENT_RESPONSE.md) :

1. Évaluation de l'impact.
2. Communication interne (bannière `/admin/config`).
3. Mode maintenance si nécessaire.
4. Cellule de crise RSSI / DSI / DPO selon la matrice d'escalade.
5. Post-mortem sous 5 jours ouvrés.

---

*Document maintenu par le pôle Système d'Information OMNITECH Security
(SI/RSSI). Dernière mise à jour : 2026-04-26. Suggestions et corrections
via `/testimonials` ou ticket dans l'espace IT.*
