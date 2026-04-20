# Audit fonctionnel Intranet OMNITECH — v1.0

> **Date** : 2026-04-20 · **Branche** : `audit/intranet-feature-inventory` · **Auteur** : audit IA
> **Scope** : tout l'intranet OMNITECH, lecture seule, aucune modification de code.
> **Prérequis** : `docs/UX-AUDIT.md` (2026-04-14) couvre déjà le détail des pages. Ce document ne le duplique pas mais s'y appuie.

---

## 0. Executive Summary

- **Modules backend** : 60 modules NestJS (`apps/backend/src/app.module.ts:72-150`), **66 controllers**, **~234 endpoints**.
- **Pages frontend** : **82 pages `page.tsx`** (UX-AUDIT §1), dont 5 redirects purs et 6 doublons structurels.
- **Intégrations** : **8 productives** (LDAP, DocuSeal, Ollama, Meilisearch, Push VAPID, OnlyOffice, Fileserver SMB, KnowBe4), **3 stubs** (Lucca widget-only, SMS OVH scaffold, Teams simple lien), **1 infra seule** (Rocket.Chat embed), **4 absentes** (Vaultwarden, M365 Graph, GLPI, Graylog).
- **Chatbot** : **2 systèmes orphelins qui ne se parlent pas** (modale RAG Ctrl+Shift+K et widget FAB contextuel) — **10/30 features présentes**, manques critiques : stop, copy, regenerate, export.
- **Dette** : 13 TODO actifs, 5 composants UI orphelins, 14 `console.log` en prod dans un éditeur. Score dette : **6/10** (prévisible, pas chaotique).
- **Score qualité global perçu : 6,5 / 10** — fondations très solides (PWA, command-palette, i18n, notifications multi-canal, RBAC hiérarchisé), UX hétérogène (charte SEAL pas propagée, 3 conventions de titres), features métier complètes mais monolithiques.

### Top 5 forces
1. **PWA production-ready** — service worker custom 258 l. avec stratégies cache fines (SWR, API never-cache sur auth/audit/notifications), manifest W3C complet, install-prompt et update-toasts (`apps/frontend/public/sw.js`).
2. **Notifications multi-canal intelligentes** — 4 canaux (in-app, email, push VAPID, SMS OVH fallback) + WebSocket temps réel, préférences par type (mutable vs always-send), conformité ISO 27001 A.5.13 (`apps/backend/src/notifications/notifications.service.ts:87-150`).
3. **Command palette & IA orchestrée** — fuzzy search maison sans dépendance, 4 modes IA (OFF/ASSISTED/AUTO/AGGRESSIVE), suggestions contextuelles module-aware, raccourcis documentés (`apps/frontend/src/components/layout/command-palette.tsx`).
4. **RBAC hiérarchisé 7 niveaux** + safeguards LDAP (seuil 10 comptes pour désactivation bulk), magic-bytes upload, signed URLs, rate-limiting ciblé — couverture sécurité très mûre.
5. **Dashboard à "faces"** — `DashboardFaceSelector` (Mes tâches / Vue d'ensemble / Veille / Analyse) avec persistance par user, widgets lazy-loaded, mode Prestataire distinct (`apps/frontend/src/app/(app)/dashboard/page.tsx`).

### Top 5 faiblesses
1. **Charte SEAL non propagée** — 616 occurrences `text-navy`/`text-taupe` legacy vs 34 `seal-*` (UX-AUDIT §7.1). La `MEMORY.md` charte utilisateur n'est pas appliquée.
2. **2 chatbots disjoints** — RAG modal et widget FAB ne partagent ni historique ni contexte, double courbe d'apprentissage.
3. **Hub Admin surchargé** — 17 items à plat sans regroupement, icônes dupliquées (4× `Users`, 3× `ShieldAlert`).
4. **Doublons structurels non résolus** — `audit-log`/`audit-timeline`, `search`/`search/v2`, `runbooks`/`wiki?tab=runbooks`, `documents/new`/`documents/new-inline` (UX-AUDIT §3.1).
5. **Formulaires sans validation native** — 11 `required` HTML sur tout le frontend, aucun `react-hook-form`+`zod` généralisé, erreurs via `toast.error` après submit.

### Top 10 quick wins recommandés
| # | Quick win | Effort | Module |
|---|---|---|---|
| 1 | Ajouter bouton **Stop génération** chatbot (AbortController déjà instancié) | 🟢 < 1j | Chatbot |
| 2 | Ajouter **Copy réponse** + **Regenerate** dans ai-search-modal | 🟢 < 1j | Chatbot |
| 3 | Corriger lien mort `/admin/audit` → `/admin/audit-log` (`dashboard/page.tsx:1167`) | 🟢 < 1h | Nav |
| 4 | Migrer les 5 redirects-pages en `redirects` dans `next.config.js` | 🟢 < 1j | Nav |
| 5 | Supprimer `/runbooks/page.tsx` (doublon wiki) | 🟢 < 1h | Wiki |
| 6 | Retirer les 14 `console.log` de `documents/[id]/editor/page.tsx` | 🟢 < 1h | GED |
| 7 | Nettoyer 5 composants UI orphelins (`bulk-actions-bar`, `keyboard-shortcuts-dialog`, `classification-badge`, `skeleton-page`, `saved-filters-bar`) | 🟢 < 1j | UI |
| 8 | Regrouper Hub Admin en 4 sous-sections (Users / Compliance / Infra / Audit) | 🟢 1j | Nav |
| 9 | Ajouter **feedback négatif avec raison** au chatbot (textarea modal) | 🟡 1-2j | Chatbot |
| 10 | Fusionner `/admin/audit-log` + `/admin/audit-timeline` en 2 onglets `/admin/audit` | 🟡 2j | Audit |

---

## 1. Sommaire

- [1. Inventaire modules fonctionnels](#1-inventaire-modules-fonctionnels)
- [2. Audit UI/UX/Design](#2-audit-uiuxdesign)
- [3. Focus chatbot](#3-focus-chatbot)
- [4. Intranet global](#4-intranet-global)
- [5. Intégrations externes](#5-intégrations-externes)
- [6. PWA & performance](#6-pwa--performance)
- [7. Code mort & dette](#7-code-mort--dette)
- [8. Synthèse & opportunités](#8-synthèse--opportunités)
- [Annexes](#annexes)

---

## 1. Inventaire modules fonctionnels

### 1.1 Pages frontend Next.js (rappel)

Inventaire exhaustif déjà produit dans [`docs/UX-AUDIT.md §2`](../UX-AUDIT.md) (82 pages, URL, rôle, lignes, remarques). Ne pas dupliquer ici.

### 1.2 Backend API — 66 controllers, ~234 endpoints

Voir [Annexe A — Tableau complet des controllers](#annexe-a--tableau-complet-des-controllers).

**Statistiques** :
- 66 controllers répartis sur 60 modules NestJS (`apps/backend/src/app.module.ts:72-150`).
- ~234 endpoints HTTP.
- 12 endpoints publics (`/health`, `/public`, `/kiosk`, `/storage`, webhook DocuSeal, webhook KnowBe4).
- 48 endpoints avec `RolesGuard` obligatoire.
- **8 endpoints orphelins** (peu ou pas appelés côté frontend) :
  - `POST /api/v1/search/reindex` (Meilisearch) — admin debug seul
  - `GET/POST /api/v1/data-retention` — UI admin à vérifier
  - `GET /api/v1/sms/status`, `POST /api/v1/sms/test` — stub
  - `GET /api/v1/stirling/*` — feature toggle off en prod
  - `POST /api/v1/knowbe4/webhook` — entrant externe, OK par design
- **3 controllers sans `@UseGuards` explicite** : `webhook.controller.ts:22` (signatures DocuSeal), `storage.controller.ts:19`, `storage.controller.ts:39` — validation par signature/token, OK mais à documenter.

### 1.3 Fiches modules métier (13)

> Note : format compact par fiche, qualité scorée 1-5.

#### Module 1 — Authentification / SSO / MFA
- **Frontend** : `app/(auth)/login/page.tsx` (277l), `app/(app)/mfa/page.tsx` (368l)
- **Backend** : `auth/`, `mfa/`, `ldap/`
- **Features** : ✅ email/password + zod, ✅ MFA TOTP + backup codes, ✅ LDAP sync + pending approval, ✅ refresh token cookie httpOnly, 🟡 SSO OIDC/SAML (non trouvé)
- **Qualité** : UI 4/5 · Complétude 4/5 · Stabilité 5/5
- **Forts** : validation zod, MFA multi-canal, safeguards LDAP (`ldap.service.ts`, cron 2:30 AM, seuil 10 comptes)
- **Lacunes** : pas de SSO externe, TODO refresh-token fallback body à retirer 2026-05-16 (`auth.controller.ts:99`)

#### Module 2 — Dashboard & Widgets
- **Frontend** : `app/(app)/dashboard/page.tsx` (1409l), `components/widgets/` (16 widgets)
- **Backend** : `dashboard/` (GET /init)
- **Features** : ✅ 11 widgets actifs (clock, lucca, weather, quick-links, rss, recent-pages, notifications, docs-due, system-health, ldap-pending, rssi-summary), ✅ face selector, ✅ lazy-load admin widgets, ✅ mode Prestataire, ✅ tips quotidiens
- **Qualité** : UI 4/5 · Complétude 4/5 · Stabilité 4/5
- **Forts** : personnalisation par user (localStorage), code-splitting intelligent, prestataire UX isolée
- **Lacunes** : page monolithique 1409l, widgets redondants avec pages dédiées (MyNotifications + /notifications, SystemHealth + /admin/system-health)

#### Module 3 — Annuaire / Profils / Organigramme
- **Frontend** : `app/(app)/directory/page.tsx` (432l) + contacts (317l) + organigramme (344l), `profile/page.tsx` (1248l)
- **Backend** : `users/`, `departments/`
- **Features** : ✅ annuaire grille/liste, ✅ organigramme par dept, ✅ profil éditable, ❌ statut présence, ❌ messagerie interne (chat iframe Rocket séparé), ❌ feed activité
- **Qualité** : UI 4/5 · Complétude 3/5 · Stabilité 4/5
- **Forts** : avatars auto-colorés, recherche/filtres
- **Lacunes** : 3 pages à fusionner en onglets, profile.tsx monolithique (1248l, 10 `console.error`), pas de présence/IM

#### Module 4 — Wiki / Runbooks / Procédures
- **Frontend** : `wiki/page.tsx` (119l, onglets), `procedures/page.tsx` (338l), `runbooks/page.tsx` (20l, doublon)
- **Backend** : `wiki/`, `runbooks/`
- **Features** : ✅ wiki + runbooks onglets, ✅ procédures révisées, ✅ recherche fulltext, 🟡 `/runbooks` doublon pur
- **Qualité** : UI 4/5 · Complétude 3/5 · Stabilité 4/5
- **Lacunes** : `/runbooks/page.tsx` à supprimer, pas de table-of-contents auto, pas de versioning côté wiki visible

#### Module 5 — Documents / GED
- **Frontend** : `documents/page.tsx` (1472l), `[id]/page.tsx` (1888l), `new/page.tsx` (717l), `new-inline/page.tsx` (182l orpheline)
- **Backend** : `documents/` (controllers multiples : main, workflow, acknowledgments, ged-dashboard)
- **Features** : ✅ listing DataTable + saved-filters, ✅ viewer multi-format (PDF/DOCX via OnlyOffice), ✅ versioning + diff, ✅ workflow Draft→Review→Approved→Obsolete, ✅ signatures DocuSeal, ✅ commentaires, ✅ audit trail, 🟡 `/documents/new-inline` orpheline
- **Qualité** : UI 4/5 · Complétude 5/5 · Stabilité 4/5
- **Forts** : couverture cycle de vie complet, intégration OnlyOffice co-édition, 103 `text-navy` dans [id]/page.tsx (gros concentré legacy)
- **Lacunes** : fichier [id]/page.tsx à 1888l, dupliqué classification options entre new/new-inline

#### Module 6 — News / Changelog / Tips / Veille
- **Frontend** : `news/page.tsx` (380l), `news/compose/page.tsx` (386l), `tips/page.tsx` (165l), `veille/page.tsx` (962l), `changelog/page.tsx` (202l)
- **Backend** : `news/`, `tips/`, `veille/`
- **Features** : ✅ articles + workflow draft/published, ✅ WYSIWYG compose, ✅ categories, ✅ tips quotidiens dismissables, ✅ bulletins veille générés, ✅ changelog versionné
- **Qualité** : UI 3/5 · Complétude 4/5 · Stabilité 3/5
- **Lacunes** : 4 modules proches candidates à "Centre Information" unique, veille 4 `console.error` + 962l, changelog `text-3xl` (hors convention)

#### Module 7 — Helpdesk / Tickets / Selfservice
- **Frontend** : `helpdesk/page.tsx` (80l onglets), `tickets/page.tsx` (1393l), `[id]/page.tsx` (561l), `selfservice/page.tsx` (5l redirect)
- **Backend** : `helpdesk/`, `tickets/`
- **Features** : ✅ chatbot intégré helpdesk, ✅ self-service templates, ✅ 6 statuts tickets, ✅ 7 templates (INCIDENT/SECURITY/HARDWARE/...), ✅ bulk actions, ✅ smart filters
- **Qualité** : UI 4/5 · Complétude 4/5 · Stabilité 4/5
- **Lacunes** : page tickets monolithique 1393l, `/selfservice` redirect à migrer en `next.config`

#### Module 8 — Incidents / Alerts
- **Frontend** : `incidents/page.tsx` (695l), `[id]/page.tsx` (774l), `alerts/page.tsx` (406l)
- **Backend** : `incidents/` (+ remediations controller), `alerts/`
- **Features** : ✅ priorités + workflow, ✅ timeline, ✅ sévérité INFO/WARN/CRITICAL, ✅ countup animé, ✅ remediations
- **Qualité** : UI 4/5 · Complétude 4/5 · Stabilité 4/5
- **Lacunes** : filtre severity dupliqué dans 3 pages sans composant mutualisé

#### Module 9 — Signatures / Chartes / DocuSeal
- **Frontend** : `signatures/page.tsx` (202l), `admin/signatures/page.tsx` (458l orpheline sidebar), `chartes/page.tsx` (358l, double routing)
- **Backend** : `signatures/` (+ webhook + campaigns)
- **Features** : ✅ signatures individuelles, ✅ campagnes, ✅ webhook DocuSeal, ✅ chartes obligatoires
- **Qualité** : UI 3/5 · Complétude 4/5 · Stabilité 4/5
- **Lacunes** : `/admin/signatures` orpheline, `/chartes` layout probablement buggé (page root + (app) coexistent), webhook SANS `@UseGuards` (validation secret env seule, pas HMAC — voir §7 anomalies)

#### Module 10 — Conformité ISO / Access-reviews / Audit
- **Frontend** : `admin/compliance/page.tsx` (109l onglets), `access-reviews/page.tsx` (1052l), `audit-log/page.tsx` (576l), `audit-timeline/page.tsx` (567l doublon), `rssi-dashboard/page.tsx` (535l 2 H1 8 consoles)
- **Backend** : `compliance-tasks/`, `audit/`, `iso-controls/`, `iso-analyzer/`, `frameworks/`, `access-reviews/`, `rssi-dashboard/`, `ad-audit/`
- **Features** : ✅ 4 onglets compliance, ✅ ISO controls mapping, ✅ access reviews certifications, ✅ audit-log + timeline (doublons), ✅ dashboard RSSI
- **Qualité** : UI 3/5 · Complétude 5/5 · Stabilité 3/5
- **Lacunes** : audit-log/audit-timeline à fusionner, rssi-dashboard 2 H1 + 8 `console.error`, 3 pages redirects (compliance-tasks, frameworks, iso-controls) à migrer en `next.config`

#### Module 11 — Calendar / Satisfaction / Quiz
- **Frontend** : `calendar/page.tsx` (640l), `satisfaction/page.tsx` (839l), `quiz/page.tsx` (1141l 2 H1)
- **Backend** : `calendar/`, `satisfaction/`, `quiz/`
- **Features** : ✅ events (interne uniquement, pas Outlook/Google), ✅ enquêtes multi-types (rating/text/choice/scale/yesno), ✅ quiz gamifié Trophy, ✅ stats globales
- **Qualité** : UI 3/5 · Complétude 4/5 · Stabilité 3/5
- **Lacunes** : quiz 1141l + 2 H1, satisfaction/quiz à fusionner, calendar ne sync pas M365/Google

#### Module 12 — Admin
- **Pages** : users (1003l), users/import (340l), ldap-pending (428l), departments (609l), config (1214l), spaces (373l), system-health (291l), ad-audit (564l), onboarding (419l feature-flagged), it-exports (1184l 2 H1), reports (304l), dark-mode-audit (283l outil dev)
- **Features** : ✅ CRUD users + import CSV, ✅ validation LDAP async, ✅ config centralisée DB, ✅ spaces & modules par user, ✅ health indicators, ✅ AD audit sync, ✅ onboarding feature-flag
- **Qualité** : UI 3/5 · Complétude 5/5 · Stabilité 4/5
- **Lacunes** : `admin/config/page.tsx` "tentaculaire" 1214l, hub 17 items sans regroupement, `dark-mode-audit` = outil dev à retirer

#### Module 13 — Extranet / External-access
- **Frontend** : `extranet/page.tsx` (225l), `admin/external-access/page.tsx` (437l), `admin/it-exports/page.tsx` (1184l)
- **Backend** : `external-access/`, `external-persons/`, `it-exports/`
- **Features** : ✅ vue accès + expiry countdown, ✅ scopes granulaires, ✅ admin CRUD, ✅ mode prestataire dashboard distinct
- **Qualité** : UI 4/5 · Complétude 3/5 · Stabilité 4/5
- **Lacunes** : audit trail accès limité, pas d'alerte pré-expiration visible

---

## 2. Audit UI/UX/Design

### 2.1 Système de design

- **Librairie interne** : `packages/ui/` (18 composants, 1204 lignes total) — pas de shadcn/Radix/Headless-UI importé, stack maison légère basée sur Tailwind.
- **Design tokens** : `apps/frontend/tailwind.config.ts` + `apps/frontend/src/app/globals.css` — **toutes les couleurs PANTONE OMNITECH** (orange 715C, bleu 660C, vert 349C, bordeaux 202C) sont déclarées en tokens `--seal-*` + classes `seal-*`.
- **Typographie** : `Century Gothic` (système) avec fallback `AppleGothic → Nunito → Trebuchet`, + `Verdana` pour compat SEAL legacy. Nunito chargé via Google Fonts (`globals.css:5`). **JetBrains Mono** pour le code.
- **Radius / shadows** : card 12px, btn 8px, seal 6px — tokens `--shadow-card`, `--shadow-seal` etc.

### 2.2 Application de la charte (problème majeur)

| Indicateur | Valeur | Commentaire |
|---|---|---|
| Occurrences `text-navy` / `text-taupe` | **616** | Classes legacy encore largement utilisées |
| Occurrences `seal-*` | **34** sur 11 fichiers | Charte SEAL quasi non propagée |
| `PageHeader` partagé utilisé | **7 pages** | Vs 62 H1 maison |
| Variantes de taille H1 | **6** | `text-2xl font-medium`, `text-2xl font-bold`, `text-[26px]`, `text-xl`, `text-3xl font-semibold`, `text-2xl` nu |
| Pages avec plusieurs H1 | **5** | dashboard, chat, rssi-dashboard, quiz, it-exports |

### 2.3 Patterns UX (résumé UX-AUDIT)

- **Loading states** : 14 pages `Skeleton` + 25 `Loader2` — cohabitation incohérente.
- **Boutons** : 90 `<button>` bruts pour seulement 28 `aria-label`.
- **Microcopy** : 3 conventions de titres coexistent ("Utilisateurs" / "Gestion des chartes" / "Validation LDAP"), 4 libellés "créer" ("Créer", "+ Nouveau", "Ajouter", "Importer").
- **Formulaires** : 11 `required` HTML sur tout le frontend, aucun `react-hook-form+zod` généralisé, validation ad hoc via `toast.error`.
- **Empty/error states** : pas de standard — `if (loading) return null` produit des flashs blancs.

### 2.4 Thème & personnalisation

- **Dark mode** : **partiellement implémenté**. 151 fichiers `.tsx` contiennent des classes `dark:`, `DarkModeInit` est un composant minimal qui toggle `document.documentElement.classList`. Outil d'audit `/admin/dark-mode-audit` existe (283l, outil dev). Pas de système de preview côté UI utilisateur.
- **i18n** : **home-made**. `apps/frontend/src/lib/i18n.ts` = 2288 lignes, un seul dictionnaire `fr`/`en` (incomplet), 95 fichiers utilisent `useTranslation`. Pas de next-intl / i18next. Clés hétérogènes (`nav.*`, `dashboard.*`, `helpdesk.supportTitle`...). **Pas de sélecteur langue côté user** visible.
- **Préférences user** : density/avatar via profile, layout dashboard via `dashboard-face-selector`.

---

## 3. Focus chatbot

### 3.1 Emplacements (2 systèmes disjoints)

| Système | Fichier | Déclencheur | Backend | Persistance |
|---|---|---|---|---|
| **RAG modal** | `components/ui/ai-search-modal.tsx` (567l) | `Ctrl+Shift+K` via `ai-search-trigger.tsx:34-36` | `POST /api/v1/rag/ask-stream` SSE | localStorage 5 questions |
| **Chatbot FAB** | `components/ai/ai-chatbot.tsx` (543l) | Bouton flottant bas-droite | `POST /api/v1/ai/*` (heuristique locale) | localStorage 50 messages |

Deux interfaces qui ne partagent ni historique ni contexte.

### 3.2 Tableau des 30 features

| # | Feature | Statut | Fichier:ligne |
|---|---|---|---|
| 1 | Streaming progressif texte | ✅ | `ai-search-modal.tsx:241-297` (SSE + fallback simulation 3ch/16ms) |
| 2 | Bouton arrêter génération | ❌ | `AbortController` instancié `:238` mais pas de UI |
| 3 | Citations cliquables | ✅ | `ai-search-modal.tsx:496-517` (par type DOC/WIKI/PROCEDURE/RUNBOOK/FAQ) |
| 4 | Preview source au hover | ❌ | — |
| 5 | Feedback thumbs up/down | ✅ | `ai-search-modal.tsx:446-485` → `/rag/{id}/feedback` |
| 6 | Raison du feedback négatif | ❌ | Rating seul, pas de textarea |
| 7 | Historique conversations | ✅ | `chatbot-store.ts:38` + `ai-search-modal.tsx:522-541` |
| 8 | Renommage conversation | ❌ | — |
| 9 | Recherche dans historique | 🟡 | Affichage sans filtre |
| 10 | Archivage / suppression | ✅ | `ai-chatbot.tsx:374` (trash → clearHistory) |
| 11 | Favoris | ❌ | — |
| 12 | Copy réponse | ❌ | — |
| 13 | Regenerate réponse | ❌ | — |
| 14 | Edit & resend question | ❌ | — |
| 15 | Questions suggérées (accueil) | ✅ | `ai-chatbot.tsx:428-447` (4 par module) |
| 16 | Questions suggérées (follow-up) | ✅ | `ai-chatbot.tsx:505-517` (2 post-réponse) |
| 17 | Commandes slash | ❌ | — |
| 18 | Raccourci clavier global | 🟡 | `Ctrl+Shift+K` (modal RAG) / `Cmd+K` (palette), pas de shortcut dédié chatbot FAB |
| 19 | Mode focus / plein écran | 🟡 | `focus-mode.tsx` existe (global), pas de variante chatbot |
| 20 | Export conversation (PDF/MD) | ❌ | — |
| 21 | Partage conversation | ❌ | — |
| 22 | Indicateur typing / réflexion | ✅ | `ai-chatbot.tsx:491-501` (3 dots) + `ai-search-modal.tsx:419` (curseur blink) |
| 23 | Avatars user / assistant | 🟡 | Icône bot header seulement (`ai-chatbot.tsx:356`) |
| 24 | Markdown rendering | ✅ | `ai-search-modal.tsx:28-57` (bold/italic/code/headings/lists/links) |
| 25 | Code blocks syntax highlighting | 🟡 | `<pre><code>` rendu sans Prism/highlight.js |
| 26 | Liens cliquables réponses | ✅ | `ai-search-modal.tsx:52` (target=_blank) |
| 27 | Images dans réponses | ❌ | Markdown maison ne supporte pas |
| 28 | Multi-session simultanées | ❌ | 1 instance FAB montée au layout |
| 29 | Context window visualisé | ❌ | — |
| 30 | Sélection modèle | ❌ | LLM fixe Ollama |

**Score : 10 ✅ / 6 🟡 / 14 ❌**

### 3.3 UI, états, accessibilité

- **Responsive** : `w-[380px] max-w-[calc(100vw-2rem)]` (FAB), `w-full max-w-3xl` (modal). Adapté mobile.
- **États vides** : greeting + 4 suggestions (FAB), message "Posez une question…" (modal `:545`).
- **États d'erreur** : message texte rouge `:406-410`, timeout 120s `:22`. Pas de feedback RBAC spécifique.
- **Accessibilité** : ✅ `aria-label`, ✅ `role="dialog"`, ✅ `Escape` / `Enter` gérés, ❌ pas de `aria-live` pour streaming, ❌ pas de tab-trapping modale.

---

## 4. Intranet global

### 4.1 Navigation

| Élément | Présent | Fichier |
|---|---|---|
| Sidebar rail+panel macOS-like | ✅ | `sidebar.tsx` (1162l) — 5 hubs, filtrage fuzzy, pinning, recents |
| Header + breadcrumbs | ✅ | `header.tsx` (HUB_BY_SEGMENT), `entity-breadcrumb.tsx` |
| Command palette `Cmd+K` | ✅ | `command-palette.tsx` — fuzzy maison, 6 catégories, historique 5 items |
| Mobile bottom nav | ✅ | `mobile-bottom-nav.tsx` |
| Raccourcis clavier docs `?` | ✅ | `auth-provider.tsx` (affiche dialogue) |
| Focus mode global | ✅ | `focus-mode.tsx` |
| Ctrl+Shift+K recherche IA | ✅ | `ai-search-trigger.tsx:34` |
| Breadcrumbs dynamiques | ✅ | `header.tsx` (Accueil > Hub > …) |

### 4.2 Dashboard

- 1409 lignes, 11 widgets actifs, 4 supprimés récemment (MorningBriefing, QuoteWidget, SmsiIndicators, GedDashboard — voir dashboard/page.tsx:24).
- Face selector + persistance localStorage par user.
- Mode Prestataire distinct (`dashboard/page.tsx:140`).
- Code splitting : 4 widgets lazy-loaded `dynamic(..., { ssr:false })`.

### 4.3 Profils & collaboration

- ✅ Profils users avec metadata (role, dept, job, phone, location, avatar)
- ✅ Annuaire + organigramme + contacts (3 pages séparées)
- ❌ **Statut présence (online/busy/away)** — non trouvé
- ❌ **Messagerie interne native** — seul `/chat` iframe Rocket.Chat
- ❌ **Feed d'activité** — non trouvé
- ❌ **Mentions @user** — module backend `mentions/` existe mais usage UI non évident

### 4.4 Notifications — système très mûr

| Canal | Implémenté | Fichier |
|---|---|---|
| In-app (centre dédié) | ✅ | `notifications/page.tsx` + `notification-store.ts` Zustand |
| Widget dashboard | ✅ | `MyNotificationsWidget` |
| Email | ✅ | `notifications.service.ts:110-118` (non-blocking), `EMAIL_ALWAYS_SEND_TYPES` : 16 types |
| Web Push (VAPID) | ✅ | `push-notifications.service.ts`, 13 `PUSH_WORTHY_TYPES` |
| SMS fallback | 🟡 | stub OVH (`sms.service.ts:11` — classe structurée, fetch non câblé) |
| WebSocket temps réel | ✅ | `notifications.gateway.ts` |
| Préférences par type | ✅ | `EMAIL_MUTABLE_TYPES` vs `EMAIL_ALWAYS_SEND_TYPES` |

### 4.5 Search globale

- Meilisearch avec 4 index (wiki, documents, news, tickets) — `meilisearch.service.ts` wrapper HTTP maison.
- Fédération multi-index en un seul appel.
- Fuzzy maison dans command-palette avec normalisation d'accents (`command-palette.tsx:69-71`).
- Historique localStorage (5 items).
- **Deux pages search coexistent** : `/search` (787l v1 Postgres) + `/search/v2` (213l Meilisearch, orpheline sidebar).
- Pas d'autocomplete visible, pas de filtres avancés unifiés.

---

## 5. Intégrations externes

| # | Intégration | État | Direction | Fichier principal | UI |
|---|---|---|---|---|---|
| 1 | **LDAP / AD** | prod | →in | `backend/ldap/ldap.service.ts` | `/admin/ldap-pending` |
| 2 | **DocuSeal** | prod | ↔ | `backend/signatures/signatures.service.ts:54` | `/signatures` |
| 3 | **Ollama LLM** | prod | →in | `backend/rag/llm/llm.service.ts:35-38` (fallback 3 modèles) | via RAG/chatbot |
| 4 | **Meilisearch** | prod | →in | `backend/search/meilisearch.service.ts` | `/search` |
| 5 | **Web Push VAPID** | prod | →out | `backend/push-notifications/push-notifications.service.ts` | PWA prompts |
| 6 | **OnlyOffice** | prod | ↔ | `backend/office/office.service.ts:76` (JWT signé) | documents inline editor |
| 7 | **Fileserver SMB/CIFS** | prod | →in | `backend/fileserver/fileserver.service.ts` | `/files` |
| 8 | **KnowBe4** | prod | →in | `backend/knowbe4/knowbe4.service.ts` (cache 5min) | espace dédié |
| 9 | Stirling PDF | dev | →out | `backend/stirling/stirling.service.ts` | `/tools/pdf` (feature toggle) |
| 10 | Rocket.Chat | infra | ↔ | `infra/rocketchat-compose.yml` | `/chat` iframe |
| 11 | **Lucca RH** | **stub** | — | `frontend/widgets/lucca-widget.tsx:7` (URL hardcodée) | widget dashboard |
| 12 | **SMS OVH** | **stub** | →out | `backend/sms/sms.service.ts:11` (scaffold, fetch non câblé) | — |
| 13 | **Teams** | **stub** | — | `ai.service.ts:36` mention + `users.service.ts:440` lien profil | — |
| 14 | Vaultwarden | ❌ absent | — | — | — |
| 15 | M365 / Graph API | ❌ absent | — | — | — |
| 16 | GLPI | ❌ absent | — | — | — |
| 17 | Graylog | ❌ absent | — | — | — |
| 18 | Calendar externe (Outlook/Google) | ❌ absent | — | `backend/calendar/` = interne pur | `/calendar` |

**Variables d'env intégration** : voir [Annexe B](#annexe-b--variables-denv-intégration).

---

## 6. PWA & performance

### 6.1 PWA — production-ready

| Aspect | État | Fichier |
|---|---|---|
| Manifest W3C | ✅ complet | `public/manifest.json` — standalone, 5 shortcuts, icons maskable |
| Service worker custom | ✅ 258l | `public/sw.js` — SWR, API never-cache (auth/audit/notifications), precache offline |
| Install prompt discret | ✅ | `components/pwa/install-prompt.tsx` — beforeinstallprompt + sessionStorage |
| Update notifications | ✅ | `components/pwa/update-notification.tsx` (toast nouvelle version) |
| Offline indicator | ✅ | `components/pwa/offline-indicator.tsx` (banner haut + cache state IndexedDB) |
| Page `/offline` | ✅ | `app/offline/page.tsx` (99l) |
| Push VAPID | ✅ | `push-notification-manager.tsx` (subscribe/re-subscribe auto, 410 Gone handled) |

### 6.2 Performance (signaux)

- **next.config.js** : `transpilePackages: ['@omnitech/shared', '@omnitech/ui']`, `images.remotePatterns: HTTPS **` (large mais OK), redirects pour anciennes URLs.
- **Code splitting** : `dynamic(..., { ssr: false })` sur 4 widgets admin + sections chatbot.
- **Images** : `sharp` présent. `next/image` import rare — à vérifier sur news covers & avatars.
- **Bundle analyzer** : ❌ non configuré.
- **ESLint build** : `ignoresDuringBuilds` activé — risque de régressions silencieuses.
- **TS strict** : `typescript.ignoreBuildErrors: false` — bonne hygiène.

---

## 7. Code mort & dette

### 7.1 TODOs actifs (13)

| Fichier:ligne | Type | Résumé |
|---|---|---|
| `backend/auth/auth.service.ts:185` | TODO ANSSI | Migrer refresh token vers cookie httpOnly + Secure + SameSite=Strict |
| `backend/auth/auth.controller.ts:99, :134` | TODO daté | Retirer fallback body refresh token **2026-05-16** |
| `backend/auth/dto/refresh.dto.ts:4` | TODO daté | Idem |
| `backend/approval-workflows/workflows.service.ts:423, :462` | TODO | Modes `PARALLEL_ALL` / `PARALLEL_ANY` non implantés, validation approverRole/userId/deptId manquante |
| `backend/signature-campaigns/campaigns.service.ts:200, :589`, `campaigns.controller.ts:118` | TODO | API DocuSeal à tester, webhook HMAC-SHA256 à vérifier |
| `backend/sms/sms.service.ts:117, :178` | TODO | Tester en conditions réelles, champ phoneNumber E.164 manquant |
| `frontend/dashboard/page.tsx:434` | TODO | Backend period support pour trend comparison |
| `frontend/ui/ai-search-modal.tsx:13` | TODO | Passer à SSE EventSource réel quand LLM prêt (actuellement fetch + manual parsing) |

### 7.2 `console.*` en prod (top 10)

| Fichier | log | error | warn | Total |
|---|---|---|---|---|
| `documents/[id]/editor/page.tsx` | 11 | 1 | 2 | **14** |
| `veille/page.tsx` | 0 | 4 | 0 | 4 |
| `app/error.tsx` | 0 | 2 | 0 | 2 |
| `(public)/welcome/page.tsx` | 0 | 2 | 0 | 2 |
| `alerts/page.tsx` | 0 | 2 | 0 | 2 |
| `helpdesk/HelpdeskChat.tsx`, `widgets/rss-feed-widget.tsx`, `widgets/lucca-widget.tsx`, `quiz/page.tsx`, `error-boundary.tsx` | — | 1 | — | 1 chacun |

Global UX-AUDIT : **62 `console.error` sur 30 fichiers**, dont **10 dans `profile/page.tsx`**.

### 7.3 Composants orphelins (0 imports hors self)

- `components/ui/bulk-actions-bar.tsx`
- `components/ui/keyboard-shortcuts-dialog.tsx`
- `components/ui/classification-badge.tsx`
- `components/ui/skeleton-page.tsx`
- `components/ui/saved-filters-bar.tsx`
- `components/layout/quick-nav.tsx` — `@deprecated`, 1 seul usage (rétro-compat command-palette)

**Hooks orphelins sondés** : `use-recent-pages.ts`, `use-user-search.ts`, `use-refetch-on-focus.ts` (à revérifier manuellement).

### 7.4 Incohérences & features partielles

- **Page `/en-construction`** (`(app)/en-construction/page.tsx`) — placeholder actif.
- **Lien mort `/admin/audit`** (`dashboard/page.tsx:1167`) — route inexistante (UX-AUDIT §6.2).
- **Probable bug layout `/chartes`** : route ambiguë entre `(app)/chartes` et `app/chartes` root (sidebar pointe sur `/chartes`).
- **Widgets supprimés** mais imports résiduels à vérifier (MorningBriefing, Quote, Smsi, Ged — voir `dashboard/page.tsx:24`).
- **5 pages-redirects 5 lignes** : `selfservice`, `admin/compliance-tasks`, `admin/frameworks`, `admin/iso-controls`, `runbooks` (20l).

### 7.5 Anomalies sécurité notables

| # | Fichier:ligne | Anomalie | Sévérité |
|---|---|---|---|
| 1 | `backend/signatures/webhook.controller.ts:22` | Webhook DocuSeal sans `@UseGuards`, validation par secret env simple (pas HMAC crypto) | **HAUTE** |
| 2 | `backend/auth/auth.controller.ts:99-100` | Fallback body refresh token à retirer 2026-05-16 (leakage risk) | **MOYENNE** |
| 3 | `backend/config/config.controller.ts:26-29` | `maskValue()` retourne `****` pour ≤4 chars (API keys courts non masqués) | **MOYENNE** |
| 4 | `backend/storage/storage.controller.ts:26` | Regex filename `/^[\w-]+\.(jpg|...)$/` acceptable mais à durcir | **BASSE** |
| 5 | `backend/health/health.controller.ts:90-96` | SMTP localhost = degraded (correct pour dev) | **BASSE** |

### 7.6 Score dette

**6 / 10** — dette prévisible et datée, pas chaotique. Points positifs : zéro `FIXME`/`HACK`, dépendances toutes utilisées, migrations propres. Points négatifs : 13 TODO (dont 3 refresh-token convergent vers 2026-05-16), 14 `console.log` dans l'éditeur OnlyOffice, 5 composants UI orphelins, modes workflow parallèles non implantés.

---

## 8. Synthèse & opportunités

### 8.1 Forces — à ne pas refaire

1. PWA custom sophistiquée (sw.js 258l, cache strategies fines).
2. Command palette maison avec fuzzy + historique.
3. Notifications multi-canal (4 canaux + WebSocket) avec préférences.
4. RBAC hiérarchisé 7 niveaux + safeguards LDAP.
5. Intégrations productives mûres (LDAP, DocuSeal, OnlyOffice, Meilisearch, KnowBe4, Ollama).
6. Dashboard "faces" avec persistance user.
7. Sidebar rail+panel intelligent (pinning, recents, badges).
8. Design tokens PANTONE complets en CSS vars + Tailwind.

### 8.2 Faiblesses (priorisées)

**🔴 Critique**
- Chatbot sans Stop / Copy / Regenerate / Export (10/30 features seulement).
- Charte SEAL non propagée (616 vs 34 — 95 % du code legacy).
- Lien mort `/admin/audit` en page d'accueil.
- Webhook DocuSeal sans validation HMAC.
- 14 `console.log` dans editor/page.tsx en prod.

**🟡 Gênant**
- 6 doublons structurels de pages non résolus.
- Hub Admin = 17 items à plat.
- Formulaires sans `required` natif, sans zod.
- 2 systèmes chatbot qui ne partagent rien.
- Profile/page.tsx 1248l, 10 `console.error`.
- Pas de statut présence / feed activité / mentions UI.

**🟢 Cosmétique**
- 6 variantes de taille H1.
- 3 conventions de titres coexistent.
- 4 libellés "créer" différents.
- Incohérence Skeleton/Loader2.
- 28 `aria-label` pour 90 `<button>` bruts.

### 8.3 Opportunités (features à construire)

#### 🟢 Quick wins (< 1 jour)

| Feature | Module | Impact |
|---|---|---|
| Bouton Stop génération chatbot | Chatbot | Critique — user bloqué actuellement |
| Copy réponse | Chatbot | Élevé — attendu par défaut |
| Corriger `/admin/audit` mort | Nav | Moyen — crédibilité |
| Migrer 5 redirects-pages vers `next.config` | Nav | Moyen — dette |
| Supprimer 5 composants UI orphelins | UI | Faible — ménage |
| Retirer 14 `console.log` editor | Dette | Moyen — prod hygiene |

#### 🟡 Medium (2-5 jours)

| Feature | Module | Impact |
|---|---|---|
| **Fusion 2 chatbots** (historique partagé, stop, regenerate, export MD) | Chatbot | Très élevé |
| Feedback négatif avec raison + catégorisation | Chatbot | Élevé (qualité RAG) |
| Slash commands chatbot (`/doc`, `/wiki`, `/ticket`) | Chatbot | Moyen (power users) |
| Fusion `audit-log` + `audit-timeline` en onglets | Compliance | Moyen |
| Fusion `search` + `search/v2` (Meilisearch) | Search | Moyen |
| Regroupement Hub Admin en 4 sections | Nav | Élevé UX |
| Composant `SignerPicker` mutualisé | Signatures | Moyen |
| Composant `SeverityFilter` mutualisé | Incidents/Alerts/Audit | Moyen |

#### 🔴 Gros chantier (semaines)

| Feature | Module | Impact |
|---|---|---|
| **Migration complète charte SEAL** (616 occurrences legacy → `seal-*`) | Design | Très élevé (identité visuelle) |
| **Statut présence + messagerie interne native** (remplacer iframe Rocket ?) | Collab | Très élevé (feature collab majeure) |
| **Feed d'activité** (mentions, commentaires cross-module) | Collab | Élevé |
| **Sync calendar M365/Google** bi-directionnelle | Calendar | Élevé |
| **Intégration Teams** (webhooks Power Automate, cards, notifications) | Intégrations | Élevé |
| **react-hook-form + zod généralisé** sur 15 formulaires | UX | Élevé |
| **Refactor dashboard/page.tsx** (1409l → composants) | Dashboard | Moyen |
| **Export chatbot PDF/Markdown** avec branding | Chatbot | Moyen |
| **Syntax highlighting** code blocks (Prism) dans chatbot | Chatbot | Moyen |
| **Vaultwarden intégration** (SSO mot de passe équipe) | Sec | Moyen |

### 8.4 Top 10 quick wins prioritaires (récap)

1. Stop génération chatbot (AbortController déjà là).
2. Copy + Regenerate chatbot.
3. Fix lien mort `/admin/audit`.
4. Supprimer 5 composants UI orphelins.
5. Retirer 14 `console.log` editor page.
6. Migrer 5 redirects-pages en `next.config.js`.
7. Regrouper Hub Admin (17 → 4 sections).
8. Raison feedback négatif chatbot.
9. Fusion `/admin/audit-log`+`/admin/audit-timeline` en onglets.
10. Uniformiser `PageHeader` partout (62 H1 maison → 0).

---

## Annexes

### Annexe A — Tableau complet des controllers

| # | Module | Controller | Route base | Guards |
|---|---|---|---|---|
| 1 | Auth | `auth.controller.ts:21` | `/api/v1/auth` | JwtAuthGuard + Public |
| 2 | Users | `users.controller.ts:41` | `/api/v1/users` | Jwt+Roles |
| 3 | Users CSV | `csv-import.controller.ts:21` | `/api/v1/users/import/*` | Jwt+Roles ADMIN |
| 4 | Health | `health.controller.ts:36` | `/api/v1/health` | Public / Jwt+Roles |
| 5 | Public | `public.controller.ts:6` | `/api/v1/public` | Public |
| 6 | Dashboard | `dashboard.controller.ts:5` | `/api/v1/dashboard` | Jwt |
| 7 | MFA | `mfa.controller.ts:12` | `/api/v1/mfa` | Jwt+Roles |
| 8 | Kiosk | `kiosk.controller.ts:14` | `/api/v1/kiosk` | Public |
| 9 | News | `news.controller.ts:31` | `/api/v1/news` | Jwt+Roles |
| 10 | Signatures Webhook | `webhook.controller.ts:13` | `/api/v1/signatures/webhook` | **Secret env seul** ⚠ |
| 11 | Documents | `documents.controller.ts:25` | `/api/v1/documents` | Jwt+Roles |
| 12 | Tickets | `tickets.controller.ts:16` | `/api/v1/tickets` | Jwt+Roles |
| 13 | Approval Workflows | `workflows.controller.ts:24` | `/api/v1/approval-workflows` | Jwt+Roles |
| 14 | Incidents | `incidents.controller.ts:29` | `/api/v1/incidents` | Jwt+Roles |
| 15 | Search | `search.controller.ts:13` | `/api/v1/search` | Jwt |
| 16 | Audit | `audit.controller.ts:20` | `/api/v1/audit` | Jwt+Roles ADMIN |
| 17 | Config | `config.controller.ts:31` | `/api/v1/config` | Jwt+Roles SUPER_ADMIN |
| 18 | Backup | `backup.controller.ts:27` | `/api/v1/backup` | Jwt+Roles SUPER_ADMIN |
| 19 | LDAP | `ldap.controller.ts:12` | `/api/v1/ldap` | Jwt+Roles |
| 20 | External Access | `external-access.controller.ts:12` | `/api/v1/external-access` | Jwt+Roles |
| 21 | Storage | `storage.controller.ts:15` | `/api/v1/storage` | Signed URL |
| 22 | Push Notifications | `push-notifications.controller.ts:12` | `/api/v1/push` | Jwt+Roles |
| 23 | Wiki | `wiki.controller.ts` | `/api/v1/wiki` | Jwt |
| 24 | Veille | `veille.controller.ts` | `/api/v1/veille` | Jwt+Roles ADMIN |
| 25 | Notifications | `notifications.controller.ts` | `/api/v1/notifications` | Jwt |
| 26 | Chartes | `chartes.controller.ts` | `/api/v1/chartes` | Jwt |
| 27 | Certificates | `certificates.controller.ts` | `/api/v1/certificates` | Jwt+Roles |
| 28 | Departments | `departments.controller.ts` | `/api/v1/departments` | Jwt+Roles |
| 29 | Alerts | `alerts.controller.ts` | `/api/v1/alerts` | Jwt |
| 30 | Helpdesk | `helpdesk.controller.ts` | `/api/v1/helpdesk` | Jwt |
| 31 | Compliance Tasks | `compliance-tasks.controller.ts` | `/api/v1/compliance-tasks` | Jwt+Roles |
| 32 | Satisfaction | `satisfaction.controller.ts` | `/api/v1/satisfaction` | Jwt+Roles |
| 33 | Quiz | `quiz.controller.ts` | `/api/v1/quiz` | Jwt+Roles |
| 34 | Tips | `tips.controller.ts` | `/api/v1/tips` | Jwt |
| 35 | Saved Filters | `saved-filters.controller.ts` | `/api/v1/saved-filters` | Jwt |
| 36 | RAG | `rag.controller.ts` | `/api/v1/rag` | Jwt |
| 37 | AI | `ai.controller.ts` | `/api/v1/ai` | Jwt |
| 38 | Calendar | `calendar.controller.ts` | `/api/v1/calendar` | Jwt |
| 39 | Runbooks | `runbooks.controller.ts` | `/api/v1/runbooks` | Jwt |
| 40 | Spaces | `spaces.controller.ts` | `/api/v1/spaces` | Jwt |
| 41 | Fileserver | `fileserver.controller.ts` | `/api/v1/fileserver` | Jwt |
| 42 | Fileserver SMB Office | `smb-office.controller.ts` | `/api/v1/fileserver/smb-office/*` | Jwt |
| 43 | Extranet | `external-persons.controller.ts` | `/api/v1/extranet` | Jwt+Roles |
| 44 | Signatures | `signatures.controller.ts` | `/api/v1/signatures` | Jwt |
| 45 | Signature Campaigns | `campaigns.controller.ts` | `/api/v1/signature-campaigns` | Jwt+Roles |
| 46 | RSSI Dashboard | `rssi-dashboard.controller.ts` | `/api/v1/rssi-dashboard` | Jwt+Roles |
| 47 | ISO Controls | `iso-controls.controller.ts` | `/api/v1/iso-controls` | Jwt+Roles |
| 48 | ISO Analyzer | `iso-analyzer.controller.ts` | `/api/v1/iso-analyzer` | Jwt+Roles |
| 49 | Frameworks | `frameworks.controller.ts` | `/api/v1/frameworks` | Jwt+Roles |
| 50 | Access Reviews | `access-reviews.controller.ts` | `/api/v1/access-reviews` | Jwt+Roles |
| 51 | AD Audit | `ad-audit.controller.ts` | `/api/v1/ad-audit` | Jwt+Roles |
| 52 | IT Exports | `it-exports.controller.ts` | `/api/v1/it-exports` | Jwt+Roles |
| 53 | Meilisearch | `meilisearch.controller.ts` | `/api/v1/search/*` | Jwt+Roles |
| 54 | Onboarding | `onboarding.controller.ts` | `/api/v1/onboarding` | Jwt |
| 55 | Banner | `banner.controller.ts` | `/api/v1/banners` | Jwt+Roles |
| 56 | Exports | `exports.controller.ts` | `/api/v1/exports` | Jwt+Roles |
| 57 | Remediations | `remediations.controller.ts` | `/api/v1/incidents/*/remediations` | Jwt |
| 58 | Knowbe4 | `knowbe4.controller.ts` | `/api/v1/knowbe4` | Jwt + Public webhook |
| 59 | Data Retention | `data-retention.controller.ts` | `/api/v1/data-retention` | Jwt+Roles SUPER_ADMIN |
| 60 | SMS | `sms.controller.ts` | `/api/v1/sms` | Jwt+Roles |
| 61 | Stirling | `stirling.controller.ts` | `/api/v1/stirling` | Jwt+Roles |
| 62 | Reports | `reports.controller.ts` | `/api/v1/reports` | Jwt+Roles |
| 63 | GED Dashboard | `ged-dashboard.controller.ts` | `/api/v1/documents/ged-dashboard` | Jwt |
| 64 | Documents Workflow | `workflow.controller.ts` | `/api/v1/documents/workflow/*` | Jwt+Roles |
| 65 | Acknowledgments | `acknowledgments.controller.ts` | `/api/v1/documents/acknowledgments` | Jwt |
| 66 | Office | dans `office/` module | `/api/v1/office` | Jwt (JWT signé callback) |

### Annexe B — Variables d'env intégration

```env
# LDAP/AD — configuration en DB (table appConfig)
# DocuSeal
DOCUSEAL_URL, DOCUSEAL_API_URL, DOCUSEAL_API_KEY, DOCUSEAL_WEBHOOK_SECRET, DOCUSEAL_TEMPLATE_ID, NEXT_PUBLIC_DOCUSEAL_URL
# Ollama
OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED
# Meilisearch (config code)
MEILISEARCH_URL, MEILISEARCH_MASTER_KEY, MEILISEARCH_ENABLED
# Push VAPID
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
# OnlyOffice
ONLYOFFICE_ENABLED, ONLYOFFICE_DOCUMENT_SERVER_URL, ONLYOFFICE_INTERNAL_URL, ONLYOFFICE_JWT_SECRET
# Stirling PDF
STIRLING_PDF_ENABLED, STIRLING_PDF_URL
# Fileserver SMB
FILESERVER_HOST, FILESERVER_USER, FILESERVER_SERVICE_PASSWORD, FILESERVER_PASSWORD
# SMS OVH (stub)
OVH_SMS_ENABLED, OVH_SMS_APP_KEY, OVH_SMS_APP_SECRET, OVH_SMS_CONSUMER_KEY, OVH_SMS_SERVICE_NAME, OVH_SMS_SENDER
# KnowBe4 (config DB)
# Infra
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
RAG_ENABLED, RBAC_RAG_ENABLED
THROTTLE_TTL, THROTTLE_LIMIT, TRUST_PROXY, CORS_ORIGINS, LOG_LEVEL, HOST
RETENTION_DOC_ARCHIVE_DAYS, RETENTION_AUTO_APPLY
```

### Annexe C — Endpoints orphelins (pas d'appel frontend détecté)

- `POST /api/v1/search/reindex` (Meilisearch admin)
- `GET/POST /api/v1/data-retention/*`
- `GET /api/v1/sms/status`, `POST /api/v1/sms/test`
- `GET /api/v1/stirling/*` (feature toggle)
- `POST /api/v1/knowbe4/webhook` (entrant externe, OK)
- `POST /api/v1/push/test` (SUPER_ADMIN test)

### Annexe D — Pages / composants à supprimer ou fusionner

- `app/(app)/runbooks/page.tsx` (20l) → redirect `/wiki?tab=runbooks`
- `app/(app)/selfservice/page.tsx` (5l) → `next.config` redirect
- `app/(app)/admin/compliance-tasks/page.tsx` (5l) → idem
- `app/(app)/admin/frameworks/page.tsx` (5l) → idem
- `app/(app)/admin/iso-controls/page.tsx` (5l) → idem
- `app/(app)/admin/dark-mode-audit/page.tsx` (283l) — outil dev à retirer de sidebar
- `app/(app)/search/v2/page.tsx` (213l) → fusion dans `/search`
- `app/(app)/admin/audit-timeline/page.tsx` (567l) → fusion onglet `/admin/audit`
- `components/ui/bulk-actions-bar.tsx` — 0 imports
- `components/ui/keyboard-shortcuts-dialog.tsx` — 0 imports
- `components/ui/classification-badge.tsx` — 0 imports
- `components/ui/skeleton-page.tsx` — 0 imports
- `components/ui/saved-filters-bar.tsx` — 0 imports

### Annexe E — Rappel conventions documentées

- **Rôles hiérarchisés** : `SUPER_ADMIN` (100) > `ADMIN` (80) > `DIRECTION` (70) > `REVIEWER` (50) > `AUDITEUR` (40) > `COLLABORATEUR` (20) > `PRESTATAIRE` (10).
- **Décorateur** : `@Roles()` + `RolesGuard` comparent `ROLE_HIERARCHY[userRole] >= required`.
- **Throttle** : 60 req/min global, overrides sur login (10/min), password-reset (5/min), MFA-setup (3/min).
- **Audit** : `AuditService` centralisé (userId, action, resourceType, resourceId, severity, metadata, IP, UA) — sévérité INFO/WARN/CRITICAL.

---

*Fin du document — audit réalisé le 2026-04-20 par agent IA, branche `audit/intranet-feature-inventory`, aucune modification de code.*
