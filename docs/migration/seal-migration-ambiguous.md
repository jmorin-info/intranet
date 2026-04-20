# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:50:00.146Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 14 |
| `bg-navy/10` | 2 |
| `border-navy/20` | 1 |
| `border-navy` | 1 |
| `hover:bg-navy` | 1 |
| `hover:bg-navy/20` | 1 |
| `hover:text-navy` | 1 |

## Par fichier

### `packages/ui/src/badge.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 21 | `bg-navy/10` | `navy: 'bg-navy/10 text-navy border-navy/20 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',` |
| 21 | `text-navy` | `navy: 'bg-navy/10 text-navy border-navy/20 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',` |
| 21 | `border-navy/20` | `navy: 'bg-navy/10 text-navy border-navy/20 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',` |

### `packages/ui/src/button.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 14 | `border-navy` | `'bg-transparent border-2 border-navy text-navy hover:bg-navy hover:text-white rounded-btn',` |
| 14 | `text-navy` | `'bg-transparent border-2 border-navy text-navy hover:bg-navy hover:text-white rounded-btn',` |
| 14 | `hover:bg-navy` | `'bg-transparent border-2 border-navy text-navy hover:bg-navy hover:text-white rounded-btn',` |

### `packages/ui/src/iso-control-badge.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 17 | `bg-navy/10` | `'inline-flex items-center gap-1 rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy',` |
| 17 | `text-navy` | `'inline-flex items-center gap-1 rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy',` |
| 18 | `hover:bg-navy/20` | `onClick && 'cursor-pointer hover:bg-navy/20 transition-colors',` |

### `packages/ui/src/data-table.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 57 | `text-navy` | `<td key={col.key} className={cn('px-4 py-3.5 text-navy dark:text-slate-200', col.className)}>` |
| 179 | `text-navy` | `<span className="px-3 py-1 text-sm font-semibold text-navy dark:text-white rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 ta` |

### `packages/ui/src/file-upload-zone.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 62 | `text-navy` | `<p className="text-sm font-semibold text-navy truncate">{selectedFile.name}</p>` |
| 97 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |

### `packages/ui/src/dialog.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 75 | `text-navy` | `<h2 id="dialog-title" className="text-lg font-semibold text-navy dark:text-white">` |

### `packages/ui/src/empty-state.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 44 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white">{title}</h3>` |

### `packages/ui/src/input.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 18 | `text-navy` | `className="block text-[13px] font-semibold text-navy dark:text-white"` |

### `packages/ui/src/search-input.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 22 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white py-2 pl-10 pr-10 text-sm placeho` |

### `packages/ui/src/select.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 37 | `text-navy` | `<label htmlFor={selectId} className="block text-[13px] font-semibold text-navy dark:text-white">` |

### `packages/ui/src/tabs.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 31 | `hover:text-navy` | `: 'text-taupe hover:text-navy dark:hover:text-white',` |

### `packages/ui/src/textarea.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 15 | `text-navy` | `<label htmlFor={inputId} className="block text-[13px] font-semibold text-navy dark:text-white">` |

### `packages/ui/src/workflow-timeline.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 55 | `text-navy` | `step.status === 'pending' ? 'text-taupe' : 'text-navy',` |
