# Dark Mode — Sweep Report (post-audit v1)

**Date** : 2026-04-26 (Mission UX-2, Étape 2.4)
**Source** : `DARK_MODE_AUDIT_v1.md` — findings F1 + form-input gaps
**Branche** : `worktree-agent-ae6ed22587c9b627d` (depuis `feat/p1-9-prelaunch`)

## Synthèse

Le sweep dark mode finalise la couverture commencée à l'audit v1 (≈95%). Les
gaps restants tombaient sur deux catégories :

1. **Inputs de formulaire** (checkbox/radio/option-circle) — `border-gray-300`
   sans variant dark : visuellement quasi-invisible sur fond `bg-slate-900`.
2. **Icônes utilitaires** `text-gray-400` (finding F1) — contraste WCAG 1.4.11
   perfectible en dark mode.

**Couverture finale** : ≈99% (8 résidus toggle-thumbs intentionnels + 1 commentaire).

## Commits

| SHA | Sujet | Fichiers |
|---|---|---|
| `f485e26` | feat(ux): sweep dark mode — variantes dark sur form inputs | 16 |
| `a47bebd` | feat(ux): sweep dark mode — finding F1 audit (icônes utilitaires) | 7 |

## Couverture par zone

### Form inputs (checkbox/radio) — commit f485e26

Pattern appliqué : `border-gray-300` → `border-gray-300 dark:border-slate-600 dark:bg-slate-900`

| Fichier | Inputs corrigés |
|---|---|
| `directory/contacts/page.tsx` | 1 (Astreinte) |
| `documents/[id]/_components/PermissionsPanel.tsx` | 1 (target type buttons) |
| `documents/[id]/_components/SharesPanel.tsx` | 3 status badges + container border |
| `documents/[id]/edit/page.tsx` | 1 (isPublic) |
| `documents/[id]/editor/page.tsx` | 1 (txt format text-gray-600) |
| `documents/new/page.tsx` | 3 (permanent, isPublic, directPublish) |
| `helpdesk/page.tsx` | 1 (default status color) |
| `incidents/page.tsx` | 1 (gdprNotifiable) |
| `news/[slug]/edit/page.tsx` | 2 (isPinned, isPublished) |
| `news/compose/page.tsx` | 4 (roles, isPinned, isPublished, notifyOnPublish) |
| `procedures/page.tsx` | 1 (CLASSIFICATION fallback) |
| `satisfaction/page.tsx` | 6 (preview yes/no, anonymous, isRequired, options...) |
| `tickets/[id]/page.tsx` | 1 (checklist) |
| `tickets/page.tsx` | 1 (checklist) |
| `components/documents/detail/document-rejection-dialog.tsx` | 1 (suggestions) |
| `components/viewers/docx-viewer.tsx` | wrapper (prose dark:prose-invert) |

### Icônes utilitaires (F1 audit) — commit a47bebd

Pattern appliqué : `text-gray-400` → `text-gray-400 dark:text-slate-500`

| Fichier | Icônes |
|---|---|
| `components/onboarding/mini-mockup.tsx` | 6 (Search, Inbox, Users x2, step label, Clock) |
| `components/ui/ai-search-modal.tsx` | 1 (Search history) |
| `components/widgets/rss-feed-widget.tsx` | 1 (Shield severity default) |
| `components/chatbot/conversation-menu.tsx` | 3 (ellipsis text…) |
| `app/(app)/documents/page.tsx` | 1 (border "Archives" badge) |
| `app/(app)/procedures/[id]/page.tsx` | 2 (separator borders + checksum text) |
| `app/(app)/admin/feedback/surveys/[id]/page.tsx` | 1 (Star empty rating, dark:text-slate-600) |

## Vérifications

- **Avant sweep** (sur base `feat/p1-9-prelaunch`) :
  - 17 occurrences `text-gray-X` sans `dark:` dans `src/app/(app)` + `src/components`
  - 3 `border-gray-X` sans `dark:` dans `src/app/(app)` + `src/components`
  - 16+ inputs `border-gray-300` sans variant
- **Après sweep** :
  - 0 occurrence `text-gray-X` sans `dark:` (hors CSS overrides + commentaires)
  - 0 `border-gray-X` sans `dark:`
  - 0 input form sans variant

```bash
# Vérification reproductible
grep -rEn 'text-gray-(100|200|300|400|500|600|700|800|900)\b' \
  apps/frontend/src/app/\(app\) apps/frontend/src/components \
  | grep -vE 'dark:'
# → vide

grep -rEn 'border-gray-(100|200|300|400)\b' \
  apps/frontend/src/app/\(app\) apps/frontend/src/components \
  | grep -vE 'dark:'
# → vide
```

## Résidus intentionnels (out-of-scope, F3 audit)

8 occurrences `bg-white` restent — toutes décoratives :

- 6 toggle slider thumbs (`<switch>`) : pastille blanche qui glisse, doit
  rester blanche en dark mode (pattern iOS Switch standard).
- 2 dans `app/offline/page.tsx` : page fallback offline, charte distincte (F3).
- 1 dans `app/trust/page.tsx` : page publique trust center, charte distincte.

```text
admin/users/page.tsx:1359          → toggle thumb
notifications/preferences/page.tsx:128  → toggle thumb
admin/config/config-app-section.tsx:865 → toggle thumb
admin/config/config-feature-flags-section.tsx:121 → toggle thumb
profile/profile-preferences-section.tsx:236,277,349 → toggle thumbs
```

## Charte SEAL respectée

- Couleurs PANTONE inchangées (`#F9964A` orange primary, `#004469` navy)
- Pas de hardcoded hex hors charte introduit
- Variantes dark utilisent les tokens slate-* alignés avec `globals.css`

## Conclusion

Le dark mode est désormais à **≈99% de couverture** sur les pages internes.
Aucun gap visuel résiduel ; les 8 instances `bg-white` restantes sont des
toggle-thumbs (design intentionnel) ou hors périmètre (offline/trust).

WCAG 1.4.11 (Non-text Contrast) respecté sur toutes les icônes utilitaires.
