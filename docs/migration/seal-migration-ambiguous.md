# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:51:10.408Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 34 |
| `hover:text-navy` | 1 |
| `bg-navy` | 1 |

## Par fichier

### `apps/frontend/src/components/layout/header.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 219 | `text-navy` | `if (!hub) return 'text-navy dark:text-white';` |
| 225 | `text-navy` | `default: return 'text-navy dark:text-white';` |
| 480 | `text-navy` | `!activeSpaceId ? 'text-seal-blue dark:text-seal-orange font-semibold' : 'text-navy dark:text-slate-200'` |
| 493 | `text-navy` | `activeSpaceId === space.id ? 'text-seal-blue dark:text-seal-orange font-semibold' : 'text-navy dark:text-slate-200'` |
| 568 | `text-navy` | `className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:ou` |
| 614 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Notifications</h3>` |
| 639 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-1">{n.title}</p>` |
| 693 | `text-navy` | `<span className="text-[13px] font-semibold text-navy dark:text-white">` |
| 714 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{user.firstName} {user.lastName}</p>` |
| 726 | `text-navy` | `className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:ou` |
| 736 | `text-navy` | `className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:ou` |
| 747 | `text-navy` | `className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:ou` |

### `apps/frontend/src/components/layout/auth-provider.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 272 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">OMNITECH Security</p>` |
| 294 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white">Raccourcis clavier</h3>` |
| 323 | `text-navy` | `<ShortcutRow keys={['G', 'D']} description="Tableau de bord" icon={<Home className="h-3.5 w-3.5 text-navy dark:text-white" />} />` |
| 351 | `text-navy` | `Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-[10px] font-mono font-semibold text-navy dark:text-white">Esc</kbd> pour fe` |
| 362 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white">Session bientôt expirée</h3>` |
| 400 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{description}</span>` |
| 406 | `text-navy` | `<kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slat` |

### `apps/frontend/src/components/layout/annotations-drawer.tsx` — 5 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 147 | `bg-navy` | `<span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center shadow">` |
| 170 | `text-navy` | `<h2 className="text-sm font-medium text-navy dark:text-white truncate max-w-[240px]">` |
| 200 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white truncate">` |
| 213 | `text-navy` | `<p className="text-xs text-navy dark:text-slate-200 whitespace-pre-wrap leading-relaxed">` |
| 231 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-navy dark:text-white placeholder:tex` |

### `apps/frontend/src/components/layout/status-bar.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 112 | `text-navy` | `<h3 className="text-[13px] font-semibold text-navy dark:text-white truncate">{title}</h3>` |
| 450 | `text-navy` | `<p className="text-[12px] font-semibold text-navy dark:text-white line-clamp-1">` |
| 506 | `text-navy` | `<span className="text-[12px] font-semibold text-navy dark:text-white">` |
| 633 | `text-navy` | `<p className="text-[12px] font-semibold text-navy dark:text-white line-clamp-1">` |

### `apps/frontend/src/components/layout/command-palette.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 434 | `text-navy` | `className="flex-1 bg-transparent text-sm text-navy dark:text-white placeholder:text-taupe dark:placeholder:text-slate-500 outline-none"` |
| 447 | `text-navy` | `Aucun résultat pour <span className="font-semibold text-navy dark:text-white">&quot;{query}&quot;</span>` |
| 495 | `text-navy` | `<p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-navy dark:text-white'}`}>` |

### `apps/frontend/src/components/layout/hub-landing.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 44 | `text-navy` | `<h1 className="text-2xl md:text-3xl font-semibold text-navy dark:text-white" style={{ color: 'var(--tw-text-opacity,1) ' }}>` |
| 67 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white truncate">` |

### `apps/frontend/src/components/layout/admin-group-tabs.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 128 | `hover:text-navy` | `: 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-taupe dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-na` |

### `apps/frontend/src/components/layout/focus-mode.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 218 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/components/layout/page-header.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 62 | `text-navy` | `<h1 className="text-xl md:text-2xl font-semibold text-navy dark:text-white truncate">` |
