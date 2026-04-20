# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:53:53.124Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 2 |

## Par fichier

### `apps/frontend/src/app/chartes/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 273 | `text-navy` | `<span className="text-sm text-navy dark:text-white font-medium">` |
| 339 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white">Charte signee</h3>` |
