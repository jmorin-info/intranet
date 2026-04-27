# I18N — Coverage Report

**Date** : 2026-04-26
**Branche** : depuis `feat/p1-9-prelaunch`
**Objectif** : suivi de la migration legacy → next-intl, état des chaînes FR
extraites, périmètre restant.

## Stack i18n actuelle (coexistence)

L'intranet a deux systèmes i18n en parallèle pendant la phase de migration :

### 1. Legacy (zustand store) — `apps/frontend/src/lib/i18n.ts`

- Fichier monolithique : ~2790 lignes, ~2370 clés FR + EN
- Hook : `useTranslation()` (custom)
- Utilisé par **106 fichiers** dans `src/`
- **Avantage** : déjà en place, traduction FR de qualité sur quasi-tout l'app
- **Inconvénient** : pas de namespace, store global, pas de SSR strict

### 2. next-intl (cible) — `apps/frontend/src/i18n/{config,request}.ts`

- Messages : `apps/frontend/messages/{fr,en}.json` (170 clés à ce jour)
- Hook : `useTranslations()` (next-intl)
- Utilisé par **4 fichiers** :
  - `app/(auth)/login/page.tsx`
  - `app/(app)/dashboard/page.tsx`
  - `app/(app)/profile/page.tsx`
  - `app/(app)/not-found.tsx` ← *cette session*
- **Avantage** : namespace hiérarchique, détection serveur via cookie/HTTP, ICU-friendly
- **Statut** : migration progressive

## Plan de migration en 8 zones

| # | Zone | Statut | Fichiers next-intl | Note |
|---|---|---|---|---|
| 1 | Login / Auth | Migré | `app/(auth)/login/page.tsx` | commit `360cefd` |
| 2 | Dashboard | Migré | `app/(app)/dashboard/page.tsx` | commit `360cefd` |
| 3 | Profile | Migré | `app/(app)/profile/page.tsx` | commit `360cefd` |
| 4 | Errors (404) | Migré | `not-found.tsx` | namespace `errors.*` créé |
| 5 | Helpdesk | Migré | `helpdesk/page.tsx` | 17 strings — **session 2026-04-26** |
| 5b | Tickets (partiel) | Partiel | `tickets/TicketSpacesHub.tsx` | 9 strings ; namespace `tickets.*` complet (70 clés) — pages `tickets/page.tsx` (2351 l) + `[id]/page.tsx` (1233 l) restent legacy |
| 6 | Documents / Procedures | Stub | — | namespace `documents.*` créé (clés base) — pages restent legacy (heavy : `[id]/page.tsx` = 1888 l reportée v1.2) |
| 7 | News (page principale) | Migré | `news/page.tsx` | 30 strings ; pages `news/[slug]`, `news/compose`, `[slug]/edit` restent legacy |
| 8 | Admin (landing) | Migré | `admin/page.tsx` | 60 strings ; namespace `admin.*` couvrant 4 sections + 24 items + stats + footer ; ~17 sous-pages restent legacy |

**Couverture next-intl (cette session 2026-04-26)** :
- 7/8 zones avec au moins une page migrée
- 116 nouvelles strings hardcoded → next-intl
- 7 fichiers migrés (helpdesk, news, admin landing, TicketSpacesHub, +
  les 4 antérieurs)

**Strings restantes par zone (legacy `useTranslation` non migré)** :
- helpdesk : `SelfServicePortal.tsx` (478 l), `HelpdeskChat.tsx` (984 l)
- tickets : `tickets/page.tsx` (2351 l, ~150 strings), `[id]/page.tsx` (1233 l, ~80 strings)
- documents : ~10 pages, dont `[id]/page.tsx` (1888 l) — REPORTÉ v1.2
- news : `[slug]/page.tsx` (734 l), `compose/page.tsx` (542 l), `[slug]/edit/page.tsx` (299 l)
- admin : ~17 sous-pages (audit, compliance, config, users, etc.)

## État des chaînes traduites

### Fichiers `messages/{fr,en}.json` (next-intl)

| Namespace | Clés (FR=EN) | Statut |
|---|---|---|
| `common` | 36 | Réutilisable partout |
| `navigation` | 26 | Couvre la sidebar |
| `auth.login` | 21 | Complet |
| `auth.mfa` | 6 | Complet |
| `auth.trust` | 3 | Complet |
| `profile` | 22 | Complet |
| `dashboard` | 11 | Complet |
| `header` | 14 | Complet |
| `sidebar` | 11 | Complet |
| `emptyState` | 9 | Complet |
| `errors.notFound` | 4 | Complet |
| `helpdesk` | 17 | **Cette session** — couvre `helpdesk/page.tsx` |
| `news` | 30 | **Cette session** — couvre `news/page.tsx` (page principale) |
| `tickets` | 70 | **Cette session** — namespace complet, couvre `TicketSpacesHub.tsx` |
| `admin` | 60 | **Cette session** — couvre `admin/page.tsx` (landing) |
| `documents` | 14 | **Cette session** — stub minimal, pages restent legacy |
| **Total** | **354** | +191 vs précédente session |

### Fichier legacy `lib/i18n.ts`

- 2370 entrées FR + 2370 entrées EN
- Couvre : nav, calendar, search, directory, navGroup, cyberScore,
  documents.* (full), tickets.*, news.*, helpdesk.*, runbooks.*,
  admin.* (partial)
- **Doublons attendus** avec next-intl : ~163 clés (à dédupliquer
  progressivement à mesure que les zones migrent)

## Console statements (non-i18n issue)

L'item brief mentionnait "109 console" — vérification :

```bash
grep -rl 'console\.' apps/frontend/src 2>/dev/null
# → 4 fichiers seulement
```

| Fichier | Type | Action |
|---|---|---|
| `lib/logger.ts` | Implémentation logger | OK (debug en EN) |
| `lib/observability/index.ts` | Wrapper observabilité | OK (debug en EN) |
| `lib/ui-os/governance-debug.ts` | Debug interne | OK (EN) |
| `app/(app)/admin/cyber-score/page.tsx` | `console.error('cyber-score load error', err)` | OK (EN) |

**Aucun message FR hardcodé** dans les `console.*`. Cible "zéro console FR" : déjà atteinte.

Note : le chiffre "109" du brief référait probablement les **109 fichiers
appelant `useTranslation` legacy** (vérifié `grep -rl "useTranslation\b"` →
106 résultats à présent — variation du grep selon les exports/types annotés).

## Pattern de migration (référence pour les zones restantes)

### 1. Identifier les chaînes FR dans la page cible

```bash
# Chaînes JSX en français (avec accents)
grep -nE '>\s*[A-ZÀ-Üa-zà-ü]' apps/frontend/src/app/\(app\)/<zone>/page.tsx
```

### 2. Ajouter le namespace dans messages/fr.json

```json
{
  "<zone>": {
    "title": "Centre d'assistance",
    "subtitle": "Posez votre question à l'IA…",
    "tabs": { "hub": "Hub support", "selfservice": "Self-service" }
  }
}
```

### 3. Répliquer dans messages/en.json (anglais professionnel)

### 4. Remplacer dans le composant

```tsx
import { useTranslations } from 'next-intl';

export default function MyPage() {
  const t = useTranslations('zone');
  return <h1>{t('title')}</h1>;
}
```

### 5. Vérifications avant commit

- `pnpm --filter frontend typecheck` → 0 erreur
- `pnpm --filter frontend lint` → état inchangé vs base
- Switcher langue dans /profile → vérifier rendu EN

## Périmètre restant — estimation grossière

| Zone | Pages | Strings (estim.) | Effort |
|---|---|---|---|
| Helpdesk + Tickets | 5 | 600 | 1 jour |
| Documents + Procedures | 12 | 1200 | 2 jours |
| News + Calendar | 8 | 400 | 1 jour |
| Admin complet | 30+ | 3000+ | 3-5 jours |
| **Total** | **55+** | **5000+** | **7-9 jours** |

Recommandation : créer un ticket épique dédié, planifier zone par zone,
itérer sur 1 zone / semaine.

## Pages sans aucune i18n (28 fichiers)

Pages qui n'utilisent ni `useTranslation` legacy ni `useTranslations`
next-intl — chaînes 100% hardcodées (du français inline) :

```text
app/(app)/admin/audit/page.tsx
app/(app)/admin/access/page.tsx
app/(app)/admin/feedback/page.tsx
app/(app)/admin/feedback/surveys/[id]/page.tsx
app/(app)/admin/media/page.tsx
app/(app)/admin/media/albums/[id]/page.tsx
app/(app)/admin/pca/page.tsx
app/(app)/admin/pca/runs/[id]/page.tsx
app/(app)/admin/rssi-dashboard/page.tsx
app/(app)/admin/system-monitoring/page.tsx
app/(app)/admin/testimonials/page.tsx (redirect legacy)
app/(app)/admin/ticket-spaces/page.tsx
app/(app)/admin/workflow-rules/page.tsx
app/(app)/admin/compliance/ComplianceFrameworks.tsx
app/(app)/admin/compliance/CompliancePlanning.tsx
app/(app)/documents/[id]/_components/PermissionsPanel.tsx
app/(app)/documents/[id]/_components/SharesPanel.tsx
app/(app)/helpdesk/page.tsx ← migré 2026-04-26
app/(app)/layout.tsx
app/(app)/media/page.tsx
app/(app)/media/albums/page.tsx
app/(app)/media/albums/[slug]/page.tsx
app/(app)/notifications/preferences/page.tsx
app/(app)/runbooks/[slug]/page.tsx
app/(app)/testimonials/page.tsx
app/(app)/tickets/TicketSpacesHub.tsx ← migré 2026-04-26
app/(app)/tips/page.tsx
app/(app)/not-found.tsx ← migré
```

## Conclusion

- Session 2026-04-26 (Item 14 suite) : **+5 zones partiellement migrées** vers next-intl :
  - helpdesk : page principale (17 strings)
  - news : page principale (30 strings)
  - tickets : `TicketSpacesHub.tsx` + namespace complet (9 strings + 70 clés namespace)
  - admin : landing page (60 strings)
  - documents : namespace stub seulement (14 clés base)
- **Total : 116 strings hardcoded migrées + 191 nouvelles clés i18n**
- Couverture next-intl : 7/8 zones avec au moins une page migrée
- Console FR hardcoded : **zéro** (cible atteinte).
- Pages lourdes restantes (legacy `useTranslation`) :
  - `tickets/page.tsx` (2351 l), `tickets/[id]/page.tsx` (1233 l)
  - `documents/[id]/page.tsx` (1888 l) — REPORTÉ v1.2
  - news : `[slug]`, `compose`, `[slug]/edit`
  - admin : ~17 sous-pages
- Effort restant estimé : ~5-7 jours (les pages restent fonctionnelles via legacy)
