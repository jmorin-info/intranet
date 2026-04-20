# OMNITECH Intranet — Roadmap V3 Complète

## État actuel (V2.5 — 07/04/2026)
- 52 pages frontend, 37 controllers, 43 services
- 132 tests, 0 erreur TypeScript, 6 services UP
- 219 items veille (6 sources), 99 users, 51 docs, 4 wiki pages
- SMTP opérationnel, 12 crons, PWA basique
- Éditeur WYSIWYG (contentEditable) sur wiki, news compose, news edit
- Bannières P1/P2/P3 implémentées
- Profil enrichi (phone, jobTitle, location, manager, skills, languages, teams)

---

## BLOC 1 — INFRASTRUCTURE (Priorité haute)

### 1.1 Migration Next.js 16
- Mise à niveau 15.5 → 16
- Adapter les breaking changes React
- Optimiser SSR/ISR pages publiques (welcome, news)
- Tester les 52 pages

### 1.2 PWA complète
- **Service Worker avancé** : cache offline pages critiques (dashboard, profil, documents récents)
- **Web Push VAPID** : générer clés, endpoint subscribe/unsubscribe, push depuis backend
- **Gestion abonnements** : table PushSubscription par user, opt-in au login
- **Installation** : bouton "Installer" dans header, beforeinstallprompt
- **Splash screens** : icônes 180/192/512 depuis le logo OMNITECH
- **Offline queue** : IndexedDB pour tickets/commentaires offline, sync au retour

### 1.3 SSO Kerberos/NTLM
- passport-negotiate ou node-sspi
- Auth transparente depuis postes Windows du domaine
- Fallback login/password si SSO échoue
- Détection automatique poste du domaine vs externe

---

## BLOC 2 — AD AVANCÉ & DROITS (Priorité haute)

### 2.1 Mapping OUs → Départements
- Parser les 45 OUs via LDAP searchBase
- Créer automatiquement les départements manquants
- Associer les users selon leur OU
- Sync automatique à chaque cron LDAP

### 2.2 Mapping GPOs
- Lister les 56 GPOs via GroupPolicy module
- Afficher dans /admin/config
- Vérifier l'application des GPOs critiques

### 2.3 PSOs FGPP → Tiers
- Mapper les 3 PSOs aux niveaux T0/T1/T2
- Afficher la politique MDP applicable dans le profil
- Alerter si user T0 sans FGPP strict

### 2.4 Manager/Subordonné (Partiellement fait)
- ✅ Schema managerId + relation — FAIT
- ✅ Extraction 'manager' DN dans LDAP sync — FAIT
- À faire : Résolution robuste DN → userId (actuellement par nom, améliorer par email/SAN)
- À faire : Organigramme dynamique depuis les vraies relations manager

### 2.5 thumbnailPhoto AD
- Extraire attribut binaire lors du sync LDAP
- Convertir en JPEG, stocker dans storage/avatars/
- Utiliser comme avatar par défaut

### 2.6 Gestion droits granulaire
- Modèle Permission (module, action, departmentId?, roleMin?, classificationMax?)
- Middleware NestJS vérifiant permissions par route
- Admin UI pour configurer droits par département
- Héritage AD (OU + groupes) → permissions intranet

---

## BLOC 3 — PROFIL & ANNUAIRE (Partiellement fait)

### 3.1 Profil enrichi (Partiellement fait)
- ✅ Schema phone, jobTitle, location, managerId, skills, languages, teamsLink — FAIT
- ✅ LDAP sync title, telephoneNumber, manager — FAIT
- ✅ Photo upload — FAIT
- À faire : Formulaire d'édition des champs manuels (compétences, langues, bureau)
- À faire : Bouton Teams `ms-teams://` sur chaque fiche
- À faire : Afficher le manager et les subordonnés dans le profil

### 3.2 Annuaire (Partiellement fait)
- ✅ /directory avec filtres département/rôle — FAIT
- À faire : Contacts externes (prestataires, CHEOPS/Zakaria TEGUIA)
- À faire : Badges on-call/astreinte
- À faire : Modification directe sur l'intranet (inline edit)
- À faire : Filtres par site géographique

### 3.3 Organigramme (Partiellement fait)
- ✅ /directory/organigramme arbre CSS — FAIT
- À faire : Génération depuis relations manager/subordonné AD
- À faire : Navigation interactive par département
- À faire : Mise à jour automatique à chaque sync AD

---

## BLOC 4 — COMMUNICATION & CONTENU

### 4.1 News et annonces (Fait)
- ✅ Compose, edit, cover image, pin, catégories — FAIT
- ✅ Broadcast notification à la publication — FAIT
- ✅ Éditeur WYSIWYG (contentEditable) — FAIT
- À faire : Notifications push PWA à la publication

### 4.2 Bannières P1/P2/P3 (Fait)
- ✅ Backend Banner CRUD — FAIT
- ✅ Frontend BannerBar en haut de chaque page — FAIT
- ✅ Admin UI dans /admin/config — FAIT
- ✅ P1 rouge pulsant, P2 ambre, P3 bleu — FAIT

### 4.3 Accusé de lecture
- ✅ DocumentAcknowledgment existant pour les documents — FAIT
- À faire : Accusé de lecture sur les alertes sécurité
- À faire : Accusé de lecture sur les nouvelles politiques
- À faire : Taux de lecture visible admin
- À faire : Relances automatiques aux non-lecteurs (cron)

---

## BLOC 5 — BASE DE CONNAISSANCES & IA

### 5.1 Wiki intelligent (Partiellement fait)
- ✅ Wiki CRUD avec WYSIWYG — FAIT
- ✅ 4 pages seedées (Accueil, VPN, MDP, Onboarding) — FAIT
- À faire : Enrichissement auto depuis tickets résolus
- À faire : Catégorisation auto par département

### 5.2 FAQ dynamique (Partiellement fait)
- ✅ 12 articles KB dans le helpdesk — FAIT
- ✅ Suggestions follow-up dans le chatbot — FAIT
- À faire : Génération auto depuis tickets récurrents
- À faire : Mise à jour auto selon recherches utilisateurs

### 5.3 Suggestions contextuelles (Fait)
- ✅ Tips système (20 astuces par rôle/contexte) — FAIT
- À faire : Suggestions wiki/runbooks basées sur la page courante

### 5.4 Recherche IA en langage naturel
- Intégrer un moteur sémantique (embedding + vector search)
- Multi-sources : documents, wiki, runbooks, tickets, annuaire
- Filtrage par droits utilisateur
- Interface conversationnelle

---

## BLOC 6 — PLANIFICATION & CONFORMITÉ

### 6.1 Gestionnaire planning conformité
- Nouveau modèle ComplianceTask (responsable, fréquence, échéance, statut)
- Tâches récurrentes ISO 27001 :
  - Mise à jour PSSI/politiques (annuelle)
  - Tests restauration VM
  - Sauvegardes configs Switch/Firewall
  - Revues accès/habilitations (trimestrielle)
  - Tests PCA/PRA
  - Audits internes ISO 27001
- Calendrier visuel des obligations

### 6.2 Rappels et alertes automatiques
- Notification push + email J-30, J-14, J-7, J-0
- Escalade au RSSI si tâche non complétée à l'échéance
- Intégration Teams pour les rappels

---

## BLOC 7 — MFA AVANCÉ

### 7.1 MFA TOTP (Fait)
- ✅ Setup, activate, verify, backup codes — FAIT
- ✅ Enrollment self-service — FAIT
- ✅ Bypass d'urgence (backup codes) — FAIT

### 7.2 WebAuthn/FIDO2
- @simplewebauthn/server + browser
- Enrollment clé physique depuis /mfa
- Vérification au login comme alternative TOTP
- Obligatoire pour SUPER_ADMIN et ADMIN

---

## Estimation globale

| Bloc | Effort | Sessions estimées |
|------|--------|-------------------|
| 1. Infrastructure | Fort | 2-3 sessions |
| 2. AD avancé | Moyen | 1-2 sessions |
| 3. Profil/Annuaire | Léger | 1 session |
| 4. Communication | Léger | Déjà fait |
| 5. IA/Recherche | Fort | 2-3 sessions |
| 6. Planification | Moyen | 1 session |
| 7. MFA avancé | Moyen | 1 session |
