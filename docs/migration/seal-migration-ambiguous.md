# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:48:05.153Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 3 |

## Par fichier

### `apps/frontend/src/lib/ui/tokens.ts` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 41 | `text-navy` | `pageTitle: 'text-xl md:text-2xl font-semibold text-navy dark:text-white',` |
| 42 | `text-navy` | `sectionTitle: 'text-sm font-semibold text-navy dark:text-white',` |
| 46 | `text-navy` | `mono: 'font-mono text-xs text-navy dark:text-white',` |
