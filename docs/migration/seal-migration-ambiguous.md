# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T18:22:00.253Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `bg-taupe/50` | 3 |

## Par fichier

### `apps/frontend/src/app/(app)/helpdesk/HelpdeskChat.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 653 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '0ms' }} />` |
| 654 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '150ms' }} />` |
| 655 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '300ms' }} />` |
