# SEAL Design System — Scope de migration (Session 1)

_Généré le 2026-04-20T12:44:33.784Z depuis `/root/omnitech-intranet/.claude/worktrees/agent-afebaf79`._

## Résumé

- **Total occurrences legacy** (navy / taupe) : **2850**
- **Fichiers impactés** : **152**

Regex utilisée (Grep tool) :
```
(text|bg|border|ring|from|to|via)-(navy|taupe)(\b|-|/|:)
```

## Totaux par famille

| Famille (préfixe + teinte) | Occurrences |
| --- | ---: |
| `text-taupe` | 1597 |
| `text-navy` | 1161 |
| `bg-navy` | 62 |
| `border-navy` | 12 |
| `border-taupe` | 6 |
| `from-navy` | 6 |
| `bg-taupe` | 3 |
| `via-navy` | 2 |
| `ring-navy` | 1 |

## Totaux par classe complète (avec opacity `/XX`)

| Classe | Occurrences |
| --- | ---: |
| `text-taupe` | 1507 |
| `text-navy` | 1153 |
| `bg-navy` | 28 |
| `text-taupe/40` | 23 |
| `text-taupe/70` | 22 |
| `text-taupe/60` | 21 |
| `bg-navy/10` | 17 |
| `text-taupe/30` | 17 |
| `bg-navy/5` | 10 |
| `border-taupe/30` | 5 |
| `text-navy/80` | 5 |
| `border-navy` | 4 |
| `border-navy/20` | 4 |
| `text-taupe/20` | 4 |
| `bg-navy/90` | 4 |
| `border-navy/10` | 3 |
| `from-navy` | 3 |
| `bg-taupe/50` | 3 |
| `from-navy/5` | 2 |
| `text-taupe/50` | 2 |
| `bg-navy/20` | 2 |
| `text-navy/20` | 2 |
| `border-navy/30` | 1 |
| `border-taupe` | 1 |
| `via-navy/80` | 1 |
| `text-navy/90` | 1 |
| `bg-navy/60` | 1 |
| `from-navy/20` | 1 |
| `via-navy/10` | 1 |
| `ring-navy/10` | 1 |
| `text-taupe/80` | 1 |

## Totaux par contexte

| Contexte | Occurrences |
| --- | ---: |
| app/(app) | 1622 |
| app/admin | 794 |
| components/layout | 102 |
| components/widgets | 89 |
| components/other | 66 |
| packages/ui | 47 |
| components/ui | 38 |
| app/(auth) | 35 |
| components/ai | 27 |
| app/root | 22 |
| lib | 7 |
| app/(public) | 1 |

## Top 10 des fichiers les plus "bruyants"

Ces fichiers concentrent une part significative des occurrences. Les migrer demande prudence (beaucoup de contextes sémantiques mélangés).

| Rang | Fichier | Occurrences |
| ---: | --- | ---: |
| 1 | `apps/frontend/src/app/(app)/wiki/WikiContent.tsx` | 145 |
| 2 | `apps/frontend/src/app/(app)/documents/[id]/page.tsx` | 132 |
| 3 | `apps/frontend/src/app/(app)/dashboard/page.tsx` | 129 |
| 4 | `apps/frontend/src/app/(app)/tickets/page.tsx` | 109 |
| 5 | `apps/frontend/src/app/(app)/profile/page.tsx` | 95 |
| 6 | `apps/frontend/src/app/(app)/admin/config/page.tsx` | 88 |
| 7 | `apps/frontend/src/app/(app)/admin/rssi-dashboard/page.tsx` | 82 |
| 8 | `apps/frontend/src/app/(app)/satisfaction/page.tsx` | 70 |
| 9 | `apps/frontend/src/app/(app)/documents/page.tsx` | 68 |
| 10 | `apps/frontend/src/app/(app)/search/page.tsx` | 65 |

## Tous les fichiers impactés (triés par occurrences décroissantes)

| Fichier | Occurrences |
| --- | ---: |
| `apps/frontend/src/app/(app)/wiki/WikiContent.tsx` | 145 |
| `apps/frontend/src/app/(app)/documents/[id]/page.tsx` | 132 |
| `apps/frontend/src/app/(app)/dashboard/page.tsx` | 129 |
| `apps/frontend/src/app/(app)/tickets/page.tsx` | 109 |
| `apps/frontend/src/app/(app)/profile/page.tsx` | 95 |
| `apps/frontend/src/app/(app)/admin/config/page.tsx` | 88 |
| `apps/frontend/src/app/(app)/admin/rssi-dashboard/page.tsx` | 82 |
| `apps/frontend/src/app/(app)/satisfaction/page.tsx` | 70 |
| `apps/frontend/src/app/(app)/documents/page.tsx` | 68 |
| `apps/frontend/src/app/(app)/search/page.tsx` | 65 |
| `apps/frontend/src/app/(app)/admin/it-exports/page.tsx` | 64 |
| `apps/frontend/src/app/(app)/veille/page.tsx` | 59 |
| `apps/frontend/src/app/(app)/quiz/page.tsx` | 58 |
| `apps/frontend/src/app/(app)/admin/certificates/page.tsx` | 55 |
| `apps/frontend/src/app/(app)/tickets/[id]/page.tsx` | 47 |
| `apps/frontend/src/app/(app)/documents/new/page.tsx` | 42 |
| `apps/frontend/src/app/(app)/admin/ad-audit/page.tsx` | 39 |
| `apps/frontend/src/app/(app)/admin/compliance/CompliancePlanning.tsx` | 38 |
| `apps/frontend/src/app/(app)/admin/users/import/page.tsx` | 38 |
| `apps/frontend/src/app/(app)/helpdesk/SelfServicePortal.tsx` | 35 |
| `apps/frontend/src/components/layout/header.tsx` | 35 |
| `apps/frontend/src/app/(app)/admin/access-reviews/page.tsx` | 34 |
| `apps/frontend/src/app/(app)/admin/departments/page.tsx` | 34 |
| `apps/frontend/src/app/(app)/admin/users/page.tsx` | 33 |
| `apps/frontend/src/app/(app)/news/[slug]/page.tsx` | 33 |
| `apps/frontend/src/app/(app)/files/page.tsx` | 32 |
| `apps/frontend/src/app/(app)/admin/compliance/ComplianceOverview.tsx` | 30 |
| `apps/frontend/src/app/(app)/admin/audit-log/page.tsx` | 28 |
| `apps/frontend/src/app/(app)/admin/external-access/page.tsx` | 28 |
| `apps/frontend/src/app/(app)/news/compose/page.tsx` | 28 |
| `apps/frontend/src/app/(app)/incidents/[id]/page.tsx` | 26 |
| `apps/frontend/src/app/(app)/admin/chartes/page.tsx` | 25 |
| `apps/frontend/src/app/(app)/alerts/page.tsx` | 25 |
| `apps/frontend/src/app/(app)/procedures/[id]/page.tsx` | 25 |
| `apps/frontend/src/app/(app)/admin/onboarding/page.tsx` | 24 |
| `apps/frontend/src/app/(app)/admin/signatures/page.tsx` | 24 |
| `apps/frontend/src/app/(app)/mfa/page.tsx` | 24 |
| `apps/frontend/src/app/(app)/tools/pdf/page.tsx` | 24 |
| `apps/frontend/src/app/(app)/calendar/page.tsx` | 23 |
| `apps/frontend/src/app/(app)/wiki/RunbooksContent.tsx` | 23 |
| `apps/frontend/src/app/(app)/directory/page.tsx` | 22 |
| `apps/frontend/src/app/(app)/helpdesk/HelpdeskChat.tsx` | 22 |
| `apps/frontend/src/app/(auth)/login/page.tsx` | 22 |
| `apps/frontend/src/app/(app)/directory/organigramme/page.tsx` | 20 |
| `apps/frontend/src/app/(app)/documents/[id]/edit/page.tsx` | 20 |
| `apps/frontend/src/app/(app)/notifications/page.tsx` | 19 |
| `apps/frontend/src/app/(app)/procedures/page.tsx` | 18 |
| `apps/frontend/src/components/documents/workflow-panel.tsx` | 18 |
| `apps/frontend/src/components/layout/auth-provider.tsx` | 18 |
| `apps/frontend/src/app/(app)/getting-started/page.tsx` | 17 |
| `apps/frontend/src/app/(app)/admin/compliance/ComplianceFrameworks.tsx` | 16 |
| `apps/frontend/src/app/(app)/admin/system-health/page.tsx` | 16 |
| `apps/frontend/src/app/(app)/admin/workflows/[id]/page.tsx` | 16 |
| `apps/frontend/src/app/(app)/documents/pending/page.tsx` | 16 |
| `apps/frontend/src/components/ai/ai-chatbot.tsx` | 16 |
| `apps/frontend/src/app/(app)/admin/workflows/page.tsx` | 15 |
| `apps/frontend/src/app/(app)/incidents/page.tsx` | 15 |
| `apps/frontend/src/app/(app)/directory/contacts/page.tsx` | 14 |
| `apps/frontend/src/app/(app)/news/page.tsx` | 14 |
| `apps/frontend/src/app/(app)/admin/audit-timeline/page.tsx` | 13 |
| `apps/frontend/src/app/(app)/admin/compliance/ComplianceControls.tsx` | 13 |
| `apps/frontend/src/app/(app)/admin/ldap-pending/page.tsx` | 13 |
| `apps/frontend/src/app/(app)/admin/spaces/page.tsx` | 13 |
| `apps/frontend/src/components/layout/command-palette.tsx` | 13 |
| `apps/frontend/src/components/layout/status-bar.tsx` | 13 |
| `apps/frontend/src/app/(app)/extranet/page.tsx` | 12 |
| `apps/frontend/src/app/(app)/timeline/page.tsx` | 12 |
| `apps/frontend/src/components/layout/annotations-drawer.tsx` | 12 |
| `apps/frontend/src/components/ux/ux-command-center.tsx` | 10 |
| `apps/frontend/src/app/(app)/documents/[id]/editor/page.tsx` | 9 |
| `apps/frontend/src/app/(app)/not-found.tsx` | 9 |
| `apps/frontend/src/app/(app)/signatures/page.tsx` | 9 |
| `apps/frontend/src/components/widgets/lucca-widget.tsx` | 9 |
| `apps/frontend/src/components/widgets/rssi-dashboard-summary.tsx` | 9 |
| `apps/frontend/src/app/(app)/admin/reports/page.tsx` | 8 |
| `apps/frontend/src/app/(app)/documents/new-inline/page.tsx` | 8 |
| `apps/frontend/src/app/(app)/news/[slug]/edit/page.tsx` | 8 |
| `apps/frontend/src/components/ui/ai-search-modal.tsx` | 8 |
| `apps/frontend/src/components/widgets/weather-widget.tsx` | 8 |
| `apps/frontend/src/app/(app)/search/v2/page.tsx` | 7 |
| `apps/frontend/src/app/(app)/tips/page.tsx` | 7 |
| `apps/frontend/src/app/(auth)/reset-password/page.tsx` | 7 |
| `apps/frontend/src/app/chartes/page.tsx` | 7 |
| `apps/frontend/src/components/viewers/pdf-viewer.tsx` | 7 |
| `apps/frontend/src/components/widgets/docs-due-review-widget.tsx` | 7 |
| `apps/frontend/src/components/widgets/ged-dashboard-widget.tsx` | 7 |
| `apps/frontend/src/lib/ui/tokens.ts` | 7 |
| `apps/frontend/src/app/(app)/certificates/page.tsx` | 6 |
| `apps/frontend/src/app/not-found.tsx` | 6 |
| `apps/frontend/src/components/tips/tip-banner.tsx` | 6 |
| `apps/frontend/src/components/ui/saved-filters-bar.tsx` | 6 |
| `apps/frontend/src/components/widgets/clock-widget.tsx` | 6 |
| `apps/frontend/src/components/widgets/my-notifications-widget.tsx` | 6 |
| `apps/frontend/src/components/widgets/recent-pages-widget.tsx` | 6 |
| `apps/frontend/src/components/widgets/system-health-compact.tsx` | 6 |
| `packages/ui/src/data-table.tsx` | 6 |
| `packages/ui/src/file-upload-zone.tsx` | 6 |
| `apps/frontend/src/app/(app)/chat/page.tsx` | 5 |
| `apps/frontend/src/app/(app)/en-construction/page.tsx` | 5 |
| `apps/frontend/src/app/(app)/files/smb-editor/[sessionId]/page.tsx` | 5 |
| `apps/frontend/src/app/(auth)/forgot-password/page.tsx` | 5 |
| `apps/frontend/src/app/error.tsx` | 5 |
| `apps/frontend/src/components/notifications/push-notification-manager.tsx` | 5 |
| `apps/frontend/src/components/pwa/install-prompt.tsx` | 5 |
| `apps/frontend/src/components/tips/tip-of-the-day.tsx` | 5 |
| `apps/frontend/src/components/ui/keyboard-shortcuts-dialog.tsx` | 5 |
| `apps/frontend/src/components/ui/mention-textarea.tsx` | 5 |
| `apps/frontend/src/components/widgets/morning-briefing-widget.tsx` | 5 |
| `apps/frontend/src/components/widgets/smsi-indicators-widget.tsx` | 5 |
| `apps/frontend/src/app/(app)/admin/dark-mode-audit/page.tsx` | 4 |
| `apps/frontend/src/app/(app)/wiki/page.tsx` | 4 |
| `apps/frontend/src/app/maintenance/page.tsx` | 4 |
| `apps/frontend/src/components/ai/ai-explainability-hints.tsx` | 4 |
| `apps/frontend/src/components/ai/ai-suggestion-bar.tsx` | 4 |
| `apps/frontend/src/components/layout/focus-mode.tsx` | 4 |
| `apps/frontend/src/components/onboarding-tour.tsx` | 4 |
| `apps/frontend/src/components/ui/smart-filter-bar.tsx` | 4 |
| `apps/frontend/src/components/widgets/dashboard-face-selector.tsx` | 4 |
| `apps/frontend/src/components/widgets/rss-feed-widget.tsx` | 4 |
| `packages/ui/src/empty-state.tsx` | 4 |
| `packages/ui/src/search-input.tsx` | 4 |
| `packages/ui/src/workflow-timeline.tsx` | 4 |
| `apps/frontend/src/components/ai/ai-control-toggle.tsx` | 3 |
| `apps/frontend/src/components/layout/admin-group-tabs.tsx` | 3 |
| `apps/frontend/src/components/ui/entity-breadcrumb.tsx` | 3 |
| `apps/frontend/src/components/widgets/quick-links.tsx` | 3 |
| `packages/ui/src/badge.tsx` | 3 |
| `packages/ui/src/button.tsx` | 3 |
| `packages/ui/src/dialog.tsx` | 3 |
| `packages/ui/src/input.tsx` | 3 |
| `packages/ui/src/iso-control-badge.tsx` | 3 |
| `packages/ui/src/select.tsx` | 3 |
| `packages/ui/src/tabs.tsx` | 3 |
| `apps/frontend/src/app/(app)/admin/compliance/page.tsx` | 2 |
| `apps/frontend/src/app/(app)/helpdesk/page.tsx` | 2 |
| `apps/frontend/src/components/error-boundary.tsx` | 2 |
| `apps/frontend/src/components/layout/hub-landing.tsx` | 2 |
| `apps/frontend/src/components/layout/page-header.tsx` | 2 |
| `apps/frontend/src/components/role-guard.tsx` | 2 |
| `apps/frontend/src/components/ui/export-button.tsx` | 2 |
| `apps/frontend/src/components/ui/inline-status-dropdown.tsx` | 2 |
| `apps/frontend/src/components/widgets/ldap-pending-widget.tsx` | 2 |
| `apps/frontend/src/components/widgets/quote-widget.tsx` | 2 |
| `packages/ui/src/textarea.tsx` | 2 |
| `apps/frontend/src/app/(app)/admin/page.tsx` | 1 |
| `apps/frontend/src/app/(auth)/logout/page.tsx` | 1 |
| `apps/frontend/src/app/(public)/welcome/page.tsx` | 1 |
| `apps/frontend/src/components/bookmark-button.tsx` | 1 |
| `apps/frontend/src/components/ui/bulk-actions-bar.tsx` | 1 |
| `apps/frontend/src/components/ui/focus-mode-toggle.tsx` | 1 |
| `apps/frontend/src/components/ui/pdf-export-button.tsx` | 1 |
| `apps/frontend/src/components/viewers/docx-viewer.tsx` | 1 |

## Notes

- Fichiers `.css` / `.mdx` / `.md` **non** inclus dans ce scope (migrer via PR séparée si besoin — les variables `--color-navy` / `--color-taupe` dans `globals.css` restent valides tant que les tokens Tailwind navy/taupe existent).
- La regex matche le préfixe `(text|bg|border|ring|from|to|via)` suivi de `-(navy|taupe)` et optionnellement une teinte `-50/500/700/...` et une opacity `/10/20/...`. Les utilitaires `decoration-*`, `placeholder-*`, `caret-*`, `divide-*`, `outline-*`, `accent-*`, `stroke-*`, `fill-*` ne sont **pas** scopés ici (à vérifier session 2 si présents).
