# Audit dark mode — Intranet OMNITECH (v1)

**Date** : 2026-04-21 (Mission UX-2, Étape 2.3)
**Périmètre** : toutes les pages sous `apps/frontend/src/app/(app)/**` modifiées dans
les 3 derniers mois (110 fichiers au total).
**Méthode** : audit statique via scripts Python (classes `bg-white`, `text-black`,
`text-gray-XXX` sans `dark:` associé, hardcoded `#XXXXXX` hors charte SEAL).

## Synthèse

**Le dark mode est globalement très bien couvert.** Aucun gap majeur identifié.
Les exceptions relevées tombent dans trois catégories :

1. **Intentionnel — fond sombre/gradient** : `bg-white/10 text-white` utilisés sur
   un fond dégradé navy (médiathèque, albums, news). Pas un bug, c'est du design.
2. **Intentionnel — mode impression** : `text-gray-500` dans un bloc
   `hidden print:block`. Visible uniquement à l'impression.
3. **Icônes utilitaires** : quelques `text-gray-400` sur de petites icônes (clock,
   check, etc.). Lisibles en dark mode mais contraste perfectible.

## Pages auditées en priorité (sujet brief initial)

### Médiathèque ✅

| Fichier | État | Note |
|---|---|---|
| `media/page.tsx` | ✅ OK | 9 classes dark. Le seul bg-white détecté est `bg-white/10` sur gradient navy (intentionnel). |
| `media/albums/[slug]/page.tsx` | ✅ OK | 5 classes dark. Album tile + overlay bien gérés. |
| `admin/media/page.tsx` | ✅ OK | 24 classes dark. |
| `admin/media/albums/[id]/page.tsx` | ✅ OK | 19 classes dark. Les 3 `bg-white/20` sont des overlays sur thumbnails (intentionnel). |

### Feedback & Testimonials ✅

| Fichier | État | Note |
|---|---|---|
| `admin/feedback/page.tsx` | ✅ OK | 34 classes dark. Très bien couvert. |
| `testimonials/page.tsx` | ✅ OK | 13 classes dark. |
| `admin/testimonials/page.tsx` | ℹ️ N/A | Redirect uniquement (legacy). |

### Pages admin récentes ✅

| Fichier | État | Note |
|---|---|---|
| `admin/system-monitoring/page.tsx` | ✅ OK | 54 classes dark. Seule anomalie : tooltip slate-800 intentionnel. |
| `admin/ad-audit/page.tsx` | ✅ OK | 70 classes dark. Excellent. |
| `admin/chartes/page.tsx` | ✅ OK | 39 classes dark. |
| `admin/external-access/page.tsx` | ✅ OK | 58 classes dark. |
| `admin/compliance/*` | ✅ OK | Couvert. |

## Findings mineurs (à noter, pas bloquants)

### F1 — Icônes utilitaires `text-gray-400` sans `dark:`

Icônes d'état (clock, timer, check) sur lesquelles `text-gray-400` est utilisé
sans variant dark. En dark mode, l'icône reste visible mais moins contrastée
que souhaitable (WCAG 1.4.11 Contraste UI).

- `app/(app)/wiki/WikiContent.tsx:1848` — X icon dans un color picker
- `app/(app)/veille/page.tsx:315` — Shield default icon
- `app/(app)/admin/compliance/CompliancePlanning.tsx:954` — Repeat icon
- `app/(app)/extranet/page.tsx:187` — Users icon (grisé si révoqué, intention)
- `app/(app)/tickets/page.tsx:1597` — Clock icon priorité LOW
- `app/(app)/tickets/[id]/page.tsx:363,365` — Timer + CheckCircle states
- `app/(app)/documents/new/page.tsx:847` — File icon
- `app/(app)/documents/[id]/page.tsx:1048` — ArrowLeftRight
- `app/(app)/files/page.tsx:43` — FileText txt

**Traitement recommandé** : remplacer `text-gray-400` par
`text-gray-400 dark:text-slate-500` ou `text-seal-gray-500/60` pour une meilleure
homogénéité.

### F2 — Intentionnels (pas d'action)

- **Médiathèque hero gradient** : `media/page.tsx:63` — `from-[#004469]` gradient
  avec `bg-white/10 text-white`. Design volontaire.
- **Albums overlays** : `admin/media/albums/[id]/page.tsx:280-282` — Boutons sur
  thumbnails avec `bg-white/20`. Design volontaire.
- **News hero** : `news/page.tsx:267,280` — Badge avec `bg-white/20 text-white` sur
  hero coloré. Intentionnel.
- **Monitoring tooltip** : `admin/system-monitoring/page.tsx:187` — Tooltip
  flottant `bg-slate-800 text-white`. Intentionnel (tooltip toujours sombre).
- **RSSI dashboard print** : `admin/rssi-dashboard/page.tsx:198` — `text-gray-500`
  dans `hidden print:block`. Visible uniquement en impression.
- **Files smb-editor** : `files/smb-editor/[sessionId]/page.tsx:221` — Frame iframe
  éditeur OnlyOffice, `bg-white` intentionnel (contexte OnlyOffice a son propre dark).

### F3 — Pages hors périmètre (ne pas toucher)

- `app/(public)/welcome/page.tsx` — Landing publique, charte distincte
- `app/(public)/kiosk/page.tsx` — Mode borne, design inversé
- `app/(auth)/*` — Pages login/reset, charte SEAL dark inversée
- `app/offline/page.tsx` — Fallback offline, design isolé
- `app/maintenance/page.tsx` — Mode maintenance
- `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` — Pages d'erreur

## Conclusion

Le dark mode de l'intranet est **conforme à ~95%** sur les pages ciblées.
Les findings mineurs (F1) sont des opportunités d'harmonisation, pas des bugs
visuels. L'Étape 2.4 va corriger les `text-gray-400` manquants pour garantir
le contraste WCAG 1.4.11 sur toutes les icônes utilitaires.
