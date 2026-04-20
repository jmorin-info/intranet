# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:56:09.225Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 123 |
| `bg-navy` | 3 |
| `hover:text-navy` | 2 |

## Par fichier

### `apps/frontend/src/app/(app)/documents/[id]/page.tsx` — 61 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 583 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">Document introuvable</p>` |
| 822 | `text-navy` | `<span className="text-navy dark:text-white">Soumettre en revue</span>` |
| 828 | `text-navy` | `<span className="text-navy dark:text-white">Valider la revue</span>` |
| 834 | `text-navy` | `<span className="text-navy dark:text-white">Rejeter la revue</span>` |
| 840 | `text-navy` | `<span className="text-navy dark:text-white">Demander approbation</span>` |
| 846 | `text-navy` | `<span className="text-navy dark:text-white">Approuver</span>` |
| 852 | `text-navy` | `<span className="text-navy dark:text-white">Refuser</span>` |
| 858 | `text-navy` | `<span className="text-navy dark:text-white">Marquer obsolete</span>` |
| 864 | `text-navy` | `<span className="text-navy dark:text-white">Archiver</span>` |
| 963 | `hover:text-navy` | `className="w-full text-left px-3 py-2 text-xs text-taupe dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white firs` |
| 1041 | `text-navy` | `<h1 className="text-xl font-medium text-navy dark:text-white">{doc.title}</h1>` |
| 1059 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Question sur ce document</span>` |
| 1068 | `text-navy` | `className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |
| 1089 | `text-navy` | `<p className="text-sm leading-relaxed text-navy dark:text-slate-200 whitespace-pre-wrap">{aiAnswer}</p>` |
| 1110 | `text-navy` | `Proprietaire : <span className="text-navy dark:text-white font-medium">{doc.owner.firstName} {doc.owner.lastName}</span>` |
| 1118 | `text-navy` | `Mis à jour : <span className="text-navy dark:text-white font-medium">{formatDate(doc.updatedAt)}</span>` |
| 1168 | `text-navy` | `<h3 className="text-lg font-medium text-navy dark:text-white mb-4">Demander une signature</h3>` |
| 1223 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1267 | `text-navy` | `step.status === 'pending' ? 'text-taupe dark:text-slate-500' : 'text-navy dark:text-white'` |
| 1301 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white mb-1">Description</h3>` |
| 1313 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white">Résumé IA</h3>` |
| 1317 | `text-navy` | `<div className="text-sm leading-relaxed text-navy dark:text-slate-200 whitespace-pre-wrap wiki-content">` |
| 1326 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1332 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1338 | `text-navy` | `<p className="text-sm text-navy dark:text-white">{formatDateTime(doc.createdAt)}</p>` |
| 1342 | `text-navy` | `<p className="text-sm text-navy dark:text-white">{formatDateTime(doc.updatedAt)}</p>` |
| 1348 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white mb-2">Contrôles de sécurité</h3>` |
| 1363 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white mb-2">Version actuelle</h3>` |
| 1368 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1432 | `text-navy` | `Sélectionnez <span className="font-semibold text-navy dark:text-white">deux versions</span> à comparer` |
| 1457 | `text-navy` | `: 'border-gray-200 dark:border-slate-700 text-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'` |
| 1525 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1641 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1694 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1732 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1736 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1803 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">` |
| 1888 | `text-navy` | `<span className="ml-auto text-xs font-semibold text-navy dark:text-white">` |
| 1892 | `text-navy` | `<p className="text-sm text-navy dark:text-white font-semibold">{item.controlTitle}</p>` |
| 1916 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Cycle de vie</h3>` |
| 2038 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Métadonnées</h3>` |
| 2043 | `text-navy` | `<span className="font-mono font-semibold text-navy dark:text-white">{doc.reference}</span>` |
| 2063 | `text-navy` | `<span className="text-navy dark:text-white font-medium">{doc.owner.firstName} {doc.owner.lastName}</span>` |
| 2068 | `text-navy` | `<span className="text-navy dark:text-white font-medium">{doc.reviewer.firstName} {doc.reviewer.lastName}</span>` |
| 2074 | `text-navy` | `<span className="text-navy dark:text-white font-medium">{doc.approver.firstName} {doc.approver.lastName}</span>` |
| 2080 | `text-navy` | `<span className="text-navy dark:text-white">{formatDate(doc.createdAt)}</span>` |
| 2084 | `text-navy` | `<span className="text-navy dark:text-white">{formatDate(doc.updatedAt)}</span>` |
| 2089 | `text-navy` | `<span className={`font-semibold ${reviewInfo?.color \|\| 'text-navy dark:text-white'}`}>{formatDate(doc.nextReviewDate)}</span>` |
| 2104 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 2145 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 2160 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{signed} / {total}</span>` |
| 2181 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Statistiques</h3>` |
| 2186 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{versions.length}</span>` |
| 2190 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{sigs.length}</span>` |
| 2194 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{acks.length}</span>` |
| 2198 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{isos.length}</span>` |
| 2207 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 2235 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 2247 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-1">{rd.title}</p>` |
| 2369 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 2411 | `text-navy` | `<span className={`text-xs leading-snug ${checked ? 'text-navy dark:text-white font-medium' : 'text-taupe dark:text-slate-400'}`}>` |

### `apps/frontend/src/app/(app)/documents/new/page.tsx` — 22 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 31 | `bg-navy` | `<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-lg bg-navy dark:bg-slate-700 text-white text-[11px]` |
| 160 | `text-navy` | `state === 'upcoming' ? 'text-taupe dark:text-slate-500' : 'text-navy dark:text-white',` |
| 422 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('documents.new.title')}</h1>` |
| 437 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Choisir un modèle</h2>` |
| 467 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white leading-snug">{tpl.titlePrefix}</p>` |
| 500 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{t('documents.new.formTitle')}</h2>` |
| 509 | `text-navy` | `<p className="text-sm font-mono font-medium text-navy dark:text-white">` |
| 526 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.titleLabel')}</label>` |
| 570 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.domainLabel')}</label>` |
| 582 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.descriptionLabel')}</label>` |
| 594 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.nextReview')}</label>` |
| 612 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{t('documents.new.isPublic')}</span>` |
| 622 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.categoryLabel')}</label>` |
| 635 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.classificationLabel')}</label>` |
| 672 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Suggestion IA : </span>` |
| 675 | `text-navy` | `Categorie <span className="font-medium text-navy dark:text-white">{DOCUMENT_CATEGORY_LABELS[autoClassifySuggestion.category as DocumentCategory] \|\| autoClassify` |
| 681 | `text-navy` | `Classification <span className="font-medium text-navy dark:text-white">{autoClassifySuggestion.classification}</span>` |
| 705 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">Réviseur / Approbateur</label>` |
| 730 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.isoControls')}</label>` |
| 767 | `text-navy` | `<span className="font-mono font-medium text-navy dark:text-white">{ctrl.code}</span>` |
| 777 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white mb-1">` |
| 800 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{file.name}</p>` |

### `apps/frontend/src/app/(app)/documents/page.tsx` — 17 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 127 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white line-clamp-2 mb-2">{doc.title}</h3>` |
| 598 | `text-navy` | `<span className="font-mono text-xs text-navy dark:text-white font-semibold">{doc.reference}</span>` |
| 607 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate max-w-xs">{doc.title}</p>` |
| 848 | `text-navy` | `<span className="text-navy dark:text-white font-semibold w-6 text-right">{c.count}</span>` |
| 862 | `text-navy` | `<span className="text-navy dark:text-white font-semibold w-6 text-right">{s.count}</span>` |
| 878 | `text-navy` | `<span className="text-navy dark:text-white font-semibold w-6 text-right">{c.count}</span>` |
| 966 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Date début</label>` |
| 971 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white px-3 py-2 text-sm focus:border-p` |
| 975 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Date fin</label>` |
| 980 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white px-3 py-2 text-sm focus:border-p` |
| 993 | `bg-navy` | `className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!filters.classi` |
| 1026 | `bg-navy` | `className={`rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visib` |
| 1107 | `hover:text-navy` | `: 'border-transparent text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 1128 | `text-navy` | `className="bg-transparent text-xs text-navy dark:text-white focus:outline-none"` |
| 1299 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white line-clamp-2 mb-2">{doc.title}</h3>` |
| 1557 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{col.label}</h3>` |
| 1593 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-2 group-hover:text-primary transition-colors">` |

### `apps/frontend/src/app/(app)/documents/[id]/edit/page.tsx` — 11 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 192 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Modifier le document</h1>` |
| 217 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Prochaine révision</label>` |
| 221 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-navy dark:text-white focus:border-p` |
| 228 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Classification</label>` |
| 260 | `text-navy` | `<span className="text-sm text-navy dark:text-white">Document public</span>` |
| 265 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Contrôles de sécurité</label>` |
| 285 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-navy dark:text-white placeholder:te` |
| 299 | `text-navy` | `<span className="font-mono font-semibold text-navy dark:text-white">{ctrl.code}</span>` |
| 309 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-2">` |
| 348 | `text-navy` | `<CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white">Version actuelle</h3></CardHeader>` |
| 350 | `text-navy` | `<div><span className="text-taupe dark:text-slate-400">Version :</span> <span className="text-navy dark:text-white font-semibold">{doc?.currentVersion?.versionNu` |

### `apps/frontend/src/app/(app)/documents/new-inline/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 96 | `text-navy` | `<h1 className="text-xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 109 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">` |
| 119 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">` |
| 129 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">` |
| 144 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">` |
| 156 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">` |
| 168 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider mb-1 block">` |

### `apps/frontend/src/app/(app)/documents/pending/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 129 | `text-navy` | `<span className="font-mono text-xs text-navy dark:text-white font-semibold">{doc.reference}</span>` |
| 136 | `text-navy` | `render: (doc) => <span className="text-sm font-semibold text-navy dark:text-white">{doc.title}</span>,` |
| 152 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">` |
| 202 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('pending.title')}</h1>` |
| 237 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{reviewDocs.length}</p>` |
| 248 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{approvalDocs.length}</p>` |
| 264 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">{t('pending.allClear')}</p>` |

### `apps/frontend/src/app/(app)/documents/[id]/editor/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 588 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white mb-2">` |
| 628 | `text-navy` | `<p className="font-semibold text-navy dark:text-white not-italic mb-2">` |
| 679 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">` |
