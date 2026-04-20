# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T13:16:58.096Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 962 |
| `hover:text-navy` | 49 |
| `bg-navy` | 23 |
| `bg-navy/10` | 12 |
| `bg-navy/5` | 8 |
| `text-navy/80` | 4 |
| `hover:bg-navy/90` | 4 |
| `border-navy` | 3 |
| `border-navy/20` | 3 |
| `from-navy` | 3 |
| `bg-taupe/50` | 3 |
| `border-navy/10` | 2 |
| `from-navy/5` | 2 |
| `prose-headings:text-navy` | 2 |
| `text-navy/20` | 2 |
| `border-navy/30` | 1 |
| `dark:bg-navy/20` | 1 |
| `via-navy/80` | 1 |
| `dark:text-navy` | 1 |

## Par fichier

### `apps/frontend/src/app/(app)/wiki/WikiContent.tsx` — 67 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 1388 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">` |
| 1450 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 1468 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">` |
| 1486 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 1531 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 1570 | `text-navy` | `className="flex-1 bg-transparent text-sm text-navy dark:text-white outline-none placeholder:text-taupe dark:placeholder:text-slate-500"` |
| 1600 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white truncate">` |
| 1623 | `text-navy` | `: 'border-gray-200 dark:border-slate-700 text-navy dark:text-white hover:border-primary/40 hover:bg-primary/5'` |
| 1702 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">{t('wiki.categoryLabel')}</label>` |
| 1708 | `text-navy` | `className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-3 py-2 focus:border-pr` |
| 1745 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">{t('wiki.contentLabel')}</label>` |
| 1747 | `text-navy` | `<button type="button" onClick={toggleEditorFullscreen} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white" title="Quit` |
| 1755 | `text-navy` | `<button type="button" title="Annuler (Ctrl+Z)" onClick={() => execCmd('undo')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 ` |
| 1758 | `text-navy` | `<button type="button" title="Rétablir (Ctrl+Y)" onClick={() => execCmd('redo')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700` |
| 1767 | `text-navy` | `className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white font-semibold"` |
| 1770 | `text-navy` | `<button type="button" title="Normal" onClick={() => execCmd('formatBlock', 'P')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 ` |
| 1774 | `text-navy` | `<button type="button" title="Gras (Ctrl+B)" onClick={() => execCmd('bold')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-` |
| 1775 | `text-navy` | `<button type="button" title="Italique (Ctrl+I)" onClick={() => execCmd('italic')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700` |
| 1776 | `text-navy` | `<button type="button" title="Souligné (Ctrl+U)" onClick={() => execCmd('underline')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-` |
| 1777 | `text-navy` | `<button type="button" title="Barré" onClick={() => execCmd('strikeThrough')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text` |
| 1784 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white flex items-center gap-0.5"` |
| 1805 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white flex items-center gap-0.5"` |
| 1824 | `text-navy` | `<button type="button" title="Liste à puces" onClick={() => execCmd('insertUnorderedList')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-` |
| 1825 | `text-navy` | `<button type="button" title="Liste numérotée" onClick={() => execCmd('insertOrderedList')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-` |
| 1829 | `text-navy` | `<button type="button" title="Citation" onClick={() => execCmd('formatBlock', 'BLOCKQUOTE')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:` |
| 1840 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white"` |
| 1852 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white"` |
| 1861 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white flex items-center gap-1"` |
| 1869 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white flex items-center gap-1"` |
| 1878 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white"` |
| 1891 | `text-navy` | `className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-navy dark:text-white flex items-center gap-2"` |
| 1900 | `text-navy` | `<button type="button" title="Séparateur horizontal" onClick={() => execCmd('insertHorizontalRule')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dar` |
| 1908 | `text-navy` | `className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white ml-auto"` |
| 1918 | `text-navy` | `className={`w-full rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-4 py-3 focus:border` |
| 1953 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white truncate">` |
| 2088 | `text-navy` | `<span className="font-semibold text-navy dark:text-white truncate max-w-[40ch]">{viewingPage.title}</span>` |
| 2106 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 2191 | `text-navy` | `<h1 className="text-[34px] leading-tight font-semibold text-navy dark:text-white tracking-tight flex-1 min-w-0">` |
| 2311 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 2351 | `text-navy` | `<a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-navy dark:text-white hover:text-primary truncate block">{att.nam` |
| 2384 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white mb-3">` |
| 2394 | `text-navy` | `: 'bg-white dark:bg-slate-800 text-navy dark:text-white border-gray-200 dark:border-slate-700 hover:border-emerald-300 hover:text-emerald-600'` |
| 2405 | `text-navy` | `: 'bg-white dark:bg-slate-800 text-navy dark:text-white border-gray-200 dark:border-slate-700 hover:border-red-300 hover:text-red-600'` |
| 2420 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Poser une question sur cet article</h3>` |
| 2438 | `text-navy` | `className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:t` |
| 2486 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-primary line-clamp-2 mb-1.5">` |
| 2517 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-primary mt-1 line-clamp-1">` |
| 2532 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-primary mt-1 line-clamp-1">` |
| 2687 | `text-navy` | `className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-navy dark:text-white hover:bg-primary/` |
| 2699 | `text-navy` | `<span className="text-navy dark:text-white font-semibold">{pages.length}</span> article{pages.length !== 1 ? 's' : ''}` |
| 2701 | `text-navy` | `<span> — <span className="text-navy dark:text-white font-semibold">{sorted.length}</span> résultat{sorted.length !== 1 ? 's' : ''}</span>` |
| 2749 | `text-navy` | `className="text-sm font-medium text-navy dark:text-white truncate [&>em]:bg-yellow-200 [&>em]:dark:bg-yellow-700/50 [&>em]:not-italic [&>em]:rounded-sm [&>em]:p` |
| 2753 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">` |
| 2803 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 2814 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 2830 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'` |
| 2840 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'` |
| 2874 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white'` |
| 2907 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white'` |
| 2984 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white truncate group-hover:text-primary transition-colors">` |
| 3061 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-1">` |
| 3082 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-primary transition-colors">` |
| 3136 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white text-[15px] truncate">` |
| 3247 | `text-navy` | `<span className="flex-1 text-left text-sm font-semibold text-navy dark:text-white">` |
| 3269 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white group-hover:text-primary transition-colors truncate">` |
| 3405 | `text-navy` | `className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-3 py-2 focus:border-pr` |
| 3433 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{cat}</span>` |

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
| 963 | `hover:text-navy` | `className="w-full text-left px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-wh` |
| 1041 | `text-navy` | `<h1 className="text-xl font-medium text-navy dark:text-white">{doc.title}</h1>` |
| 1059 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Question sur ce document</span>` |
| 1068 | `text-navy` | `className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |
| 1089 | `text-navy` | `<p className="text-sm leading-relaxed text-navy dark:text-slate-200 whitespace-pre-wrap">{aiAnswer}</p>` |
| 1110 | `text-navy` | `Proprietaire : <span className="text-navy dark:text-white font-medium">{doc.owner.firstName} {doc.owner.lastName}</span>` |
| 1118 | `text-navy` | `Mis à jour : <span className="text-navy dark:text-white font-medium">{formatDate(doc.updatedAt)}</span>` |
| 1168 | `text-navy` | `<h3 className="text-lg font-medium text-navy dark:text-white mb-4">Demander une signature</h3>` |
| 1223 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1267 | `text-navy` | `step.status === 'pending' ? 'text-seal-gray-500 dark:text-slate-500' : 'text-navy dark:text-white'` |
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
| 2411 | `text-navy` | `<span className={`text-xs leading-snug ${checked ? 'text-navy dark:text-white font-medium' : 'text-seal-gray-500 dark:text-slate-400'}`}>` |

### `apps/frontend/src/app/(app)/dashboard/page.tsx` — 59 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 197 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Espace Prestataire — Tableau de bord</h1>` |
| 210 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Accès limité</p>` |
| 222 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{data?.tickets?.length \|\| 0}</p>` |
| 229 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{data?.documents?.length \|\| 0}</p>` |
| 236 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3">Mes tickets</h2>` |
| 243 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">{ticket.reference} — {ticket.title}</span>` |
| 265 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3">Documents contractuels</h2>` |
| 273 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">{doc.title}</span>` |
| 595 | `text-navy` | `color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent', href: '/documents',` |
| 595 | `bg-navy/10` | `color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent', href: '/documents',` |
| 595 | `from-navy/5` | `color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent', href: '/documents',` |
| 662 | `text-navy` | `value: stats?.totalDocuments ?? '-', icon: FileText, color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent',` |
| 662 | `bg-navy/10` | `value: stats?.totalDocuments ?? '-', icon: FileText, color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent',` |
| 662 | `from-navy/5` | `value: stats?.totalDocuments ?? '-', icon: FileText, color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent',` |
| 680 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 695 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 730 | `text-navy` | `<h1 className="text-[26px] font-medium text-navy dark:text-white tracking-tight leading-tight">` |
| 840 | `from-navy` | `<div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-navy to-primary/60 p-5">` |
| 875 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Premiers pas</h2>` |
| 880 | `hover:text-navy` | `className="p-1.5 rounded-lg text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white transition focus-visible:outline-none foc` |
| 897 | `text-navy` | `<Icon className="h-4.5 w-4.5 text-navy dark:text-white" />` |
| 899 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white group-hover:text-primary transition-colors">{label}</p>` |
| 938 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Actions requises</h3>` |
| 948 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Alertes P1</span>` |
| 964 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Documents à approuver</span>` |
| 974 | `text-navy/80` | `<Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">` |
| 990 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Chartes à signer</span>` |
| 1003 | `text-navy/80` | `<span key={d.id} className="block text-[11px] text-navy/80 dark:text-slate-300 truncate">` |
| 1018 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Signatures en attente</span>` |
| 1033 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Tickets assignés</span>` |
| 1043 | `text-navy/80` | `<Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">` |
| 1059 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Documents à revoir</span>` |
| 1069 | `text-navy/80` | `<Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">` |
| 1083 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Notifications non lues</span>` |
| 1157 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{c.value}</p>` |
| 1187 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{c.value}</p>` |
| 1241 | `bg-navy/10` | `<div className="h-12 w-12 rounded-xl bg-navy/10 dark:bg-slate-700 flex items-center justify-center">` |
| 1242 | `text-navy` | `<ShieldCheck className="h-6 w-6 text-navy dark:text-blue-400" />` |
| 1246 | `text-navy` | `<p className="text-xl font-medium text-navy dark:text-white">{compliance.coveragePercent}%</p>` |
| 1264 | `text-navy` | `<p className="text-xl font-medium text-navy dark:text-white">{ticketStats.open + ticketStats.inProgress}</p>` |
| 1280 | `text-navy` | `<p className="text-xl font-medium text-navy dark:text-white">{veilleStats.unprocessed}</p>` |
| 1297 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{t('dashboard.recentDocs')}</h2>` |
| 1322 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{doc.title}</p>` |
| 1338 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{t('dashboard.news')}</h2>` |
| 1346 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white line-clamp-1">{n.title}</p>` |
| 1370 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Enquête de satisfaction</p>` |
| 1396 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Mon activité</h3>` |
| 1503 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white truncate">{actionLabel}</p>` |
| 1528 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Mes favoris</h3>` |
| 1547 | `text-navy` | `<span className="text-xs font-medium text-navy dark:text-white truncate group-hover:text-primary transition">{b.title}</span>` |
| 1587 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{t('dashboard.recentActivity')}</h3>` |
| 1629 | `text-navy` | `<span className="text-navy dark:text-white font-medium truncate">{label}</span>` |
| 1664 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Suggestions pour vous</h3>` |
| 1674 | `text-navy` | `<span className="font-medium text-navy dark:text-white">Vous avez {data.wiki.length} article{data.wiki.length > 1 ? 's' : ''} wiki non lu{data.wiki.length > 1 ?` |
| 1690 | `text-navy` | `<span className="font-medium text-navy dark:text-white">{action}</span>` |
| 1705 | `text-navy` | `<span className="text-navy dark:text-white truncate group-hover:text-primary transition">{doc.title}</span>` |
| 1720 | `text-navy` | `<span className="text-navy dark:text-white truncate group-hover:text-primary transition">{page.title}</span>` |
| 1809 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 1834 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white leading-snug mt-1">{insight.title}</p>` |

### `apps/frontend/src/app/(app)/admin/config/page.tsx` — 49 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 636 | `text-navy` | `<Server className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 637 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Informations système</h2>` |
| 651 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.version \|\| 'N/A'}</p>` |
| 661 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.database \|\| 'N/A'}</p>` |
| 672 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.redis \|\| 'N/A'}</p>` |
| 677 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.totalUsers ?? 'N/A'}</p>` |
| 681 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.totalDocuments ?? 'N/A'}</p>` |
| 685 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.uptime \|\| 'N/A'}</p>` |
| 689 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{systemInfo.memoryUsage \|\| 'N/A'}</p>` |
| 700 | `text-navy` | `<Megaphone className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 701 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Bannières prioritaires</h2>` |
| 725 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white focus:outline-n` |
| 770 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{b.title}</p>` |
| 783 | `hover:text-navy` | `className="text-seal-gray-500 hover:text-navy dark:hover:text-white transition-colors"` |
| 809 | `text-navy` | `<Search className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 810 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Meilisearch</h2>` |
| 839 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 899 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{currentGroup.label}</h3>` |
| 934 | `border-navy/20` | `<div className="mb-6 rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-4">` |
| 934 | `bg-navy/5` | `<div className="mb-6 rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-4">` |
| 937 | `text-navy` | `<Mail className="h-6 w-6 text-navy dark:text-white" />` |
| 939 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Configuration SMTP</h3>` |
| 968 | `border-navy/20` | `<div key={def.id} className="rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-5 space-y-4">` |
| 968 | `bg-navy/5` | `<div key={def.id} className="rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-5 space-y-4">` |
| 972 | `text-navy` | `<def.icon className="h-6 w-6 text-navy dark:text-white" />` |
| 974 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{def.label}</h3>` |
| 999 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">{field.label}</p>` |
| 1020 | `text-navy` | `<label className="block text-xs font-semibold text-navy dark:text-white mb-1">{field.label}</label>` |
| 1032 | `hover:text-navy` | `className="absolute right-3 top-1/2 -translate-y-1/2 text-seal-gray-500 hover:text-navy dark:hover:text-white transition-colors"` |
| 1090 | `border-navy/20` | `<div className="mb-6 rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-4">` |
| 1090 | `bg-navy/5` | `<div className="mb-6 rounded-lg border-2 border-navy/20 bg-navy/5 dark:bg-slate-800 p-4">` |
| 1093 | `text-navy` | `<Shield className="h-6 w-6 text-navy dark:text-white" />` |
| 1095 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">` |
| 1124 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">` |
| 1192 | `border-navy/10` | `<div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-navy/10">` |
| 1298 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{key}</p>` |
| 1340 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{key}</p>` |
| 1403 | `text-navy` | `<CardHeader><h3 className="font-semibold text-navy dark:text-white">Confirmer les modifications</h3></CardHeader>` |
| 1409 | `text-navy` | `<span className="text-navy dark:text-white font-semibold truncate ml-2 max-w-[200px]">` |
| 1432 | `text-navy` | `<ShieldCheck className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 1433 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Matrice des accès</h2>` |
| 1458 | `text-navy` | `<th className="text-left py-2 pr-4 font-semibold text-navy dark:text-white whitespace-nowrap">` |
| 1461 | `text-navy` | `<th className="text-left py-2 pr-4 font-semibold text-navy dark:text-white whitespace-nowrap min-w-[180px]">` |
| 1467 | `text-navy` | `className="px-2 py-2 font-semibold text-navy dark:text-white text-center whitespace-nowrap group relative"` |
| 1469 | `border-navy/30` | `<span className="cursor-help border-b border-dotted border-navy/30 dark:border-slate-500">` |
| 1474 | `bg-navy` | `<div className="bg-navy dark:bg-slate-900 text-white text-[10px] font-normal leading-snug rounded-lg px-3 py-2 shadow-lg text-left whitespace-normal">` |
| 1477 | `bg-navy` | `<div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-navy dark:bg-slate-900" />` |
| 1497 | `text-navy` | `<td className="py-2.5 pr-4 font-semibold text-navy dark:text-white whitespace-nowrap">` |
| 1624 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{Object.keys(changes).length}</span> paramètre{Object.keys(changes).length > 1 ? 's' : ''} modifié{Obj` |

### `apps/frontend/src/app/(app)/profile/page.tsx` — 41 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 116 | `text-navy` | `className="w-full text-sm text-navy dark:text-white bg-transparent border-b border-primary outline-none py-0.5 placeholder:text-taupe/40 focus:ring-2 focus:ring` |
| 122 | `text-navy` | `className="text-sm text-navy dark:text-white text-left w-full truncate flex items-center gap-1.5 cursor-text"` |
| 437 | `from-navy` | `<div className="h-24 bg-gradient-to-r from-navy via-navy/80 to-primary/60 relative">` |
| 437 | `via-navy/80` | `<div className="h-24 bg-gradient-to-r from-navy via-navy/80 to-primary/60 relative">` |
| 492 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">` |
| 557 | `text-navy` | `<span key={lang} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-navy dark:text-white ` |
| 569 | `text-navy` | `<p className="text-3xl font-bold text-navy dark:text-white">{myDocs}</p>` |
| 576 | `text-navy` | `<p className="text-3xl font-bold text-navy dark:text-white">{unreadNotifCount}</p>` |
| 583 | `text-navy` | `<p className="text-lg font-bold text-navy dark:text-white">{user.createdAt ? formatDate(user.createdAt) : '—'}</p>` |
| 599 | `text-navy` | `<h3 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 686 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 698 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 709 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 725 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 758 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 769 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{user.departmentName}</p>` |
| 790 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Notifications</p>` |
| 809 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 819 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{charte.title}</p>` |
| 838 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Sécurité du compte</h2>` |
| 856 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white flex items-center gap-1.5">` |
| 881 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Dernière connexion</p>` |
| 891 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Session active</p>` |
| 906 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Chartes obligatoires</p>` |
| 923 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1017 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1044 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white">{formatDate(quizHistory.lastDate)}</p>` |
| 1066 | `text-navy` | `<CardHeader><h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Mon activité</h2` |
| 1074 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">{myDocs}</p>` |
| 1083 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">{myOpenTickets}</p>` |
| 1111 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white capitalize">{actionLabel}</p>` |
| 1130 | `text-navy` | `<CardHeader><h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2"><Keyboard className="h-5 w-5 text-primary" /> Raccourcis clavi` |
| 1138 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{desc}</span>` |
| 1149 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1160 | `text-navy` | `<span className="text-2xl font-bold text-navy dark:text-white">{gedSummary.total}</span>` |
| 1175 | `text-navy` | `<span className="text-sm font-bold text-navy dark:text-white w-8 text-right tabular-nums">{value}</span>` |
| 1204 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1220 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{pref.label}</p>` |
| 1241 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1261 | `text-navy` | `className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visib` |
| 1277 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |

### `apps/frontend/src/app/(app)/admin/rssi-dashboard/page.tsx` — 39 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 202 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Tableau de bord RSSI</h1>` |
| 256 | `text-navy` | `<span className="text-xl font-medium text-navy dark:text-white leading-none">{pct}%</span>` |
| 263 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Conformité ISO 27001</h2>` |
| 294 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white">` |
| 323 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{recentIncidents.filter(i => i.status !== 'CLOSED').length}</p>` |
| 333 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{data.tickets.open + data.tickets.inProgress}</p>` |
| 346 | `text-navy` | `<p className={`text-2xl font-medium tabular-nums ${mfaAdoption != null ? thresholdColor(mfaAdoption) : 'text-navy dark:text-white'}`}>{mfaAdoption != null ? `${` |
| 394 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{m.value}</p>` |
| 411 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{data.veille.unprocessed}</p>` |
| 424 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{complianceOverdue}</p>` |
| 437 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{mfaAdoption != null ? `${mfaAdoption}%` : '—'}</p>` |
| 454 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Accès prestataires</h3>` |
| 458 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{data.externalAccess.total}</p>` |
| 480 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Chartes</h3>` |
| 484 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{data.chartes.total}</p>` |
| 500 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">Bulletin cyber</h3>` |
| 504 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{data.latestBulletin.title}</p>` |
| 523 | `text-navy` | `<h2 className="font-medium text-navy dark:text-white flex items-center gap-2">` |
| 539 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{inc.title}</p>` |
| 561 | `text-navy` | `<h2 className="font-medium text-navy dark:text-white flex items-center gap-2">` |
| 576 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{v.title}</p>` |
| 599 | `text-navy` | `<CardHeader><h2 className="font-medium text-navy dark:text-white">Analytique tickets</h2></CardHeader>` |
| 603 | `text-navy` | `<p className="text-3xl font-medium text-navy dark:text-white">{ticketAnalytics.total}</p>` |
| 630 | `text-navy` | `<span className="text-navy dark:text-white font-medium w-6 text-right">{c.count}</span>` |
| 641 | `text-navy` | `<CardHeader><h2 className="font-medium text-navy dark:text-white">Classification documents</h2></CardHeader>` |
| 644 | `text-navy` | `<p className="text-3xl font-medium text-navy dark:text-white">{docStats.total}</p>` |
| 657 | `text-navy` | `<span className="text-navy dark:text-white font-medium w-6 text-right">{c.count}</span>` |
| 671 | `text-navy` | `<span className="text-navy dark:text-white font-medium w-6 text-right">{s.count}</span>` |
| 684 | `text-navy` | `<CardHeader><h2 className="font-medium text-navy dark:text-white flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Répartition par département` |
| 692 | `text-navy` | `<span className="w-32 text-navy dark:text-white font-medium truncate">{dept.name}</span>` |
| 708 | `text-navy` | `<CardHeader><h2 className="font-medium text-navy dark:text-white">Couverture par domaine</h2></CardHeader>` |
| 716 | `text-navy` | `<span className="text-navy dark:text-white font-medium">{domain}</span>` |
| 733 | `text-navy` | `<h2 className="font-medium text-navy dark:text-white flex items-center gap-2">` |
| 750 | `text-navy` | `<p className="flex-1 text-sm font-medium text-navy dark:text-white truncate">{alert.title}</p>` |
| 766 | `text-navy` | `<Link href="/admin/compliance"><Card hoverable><CardContent className="text-center py-6"><ShieldCheck className="h-8 w-8 text-primary mx-auto mb-2" /><p classNa` |
| 767 | `text-navy` | `<Link href="/veille"><Card hoverable><CardContent className="text-center py-6"><Rss className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-m` |
| 768 | `text-navy` | `<Link href="/admin/audit-log"><Card hoverable><CardContent className="text-center py-6"><BarChart3 className="h-8 w-8 text-primary mx-auto mb-2" /><p className=` |
| 769 | `text-navy` | `<Link href="/admin/signatures"><Card hoverable><CardContent className="text-center py-6"><PenLine className="h-8 w-8 text-primary mx-auto mb-2" /><p className="` |
| 770 | `text-navy` | `<Link href="/alerts"><Card hoverable><CardContent className="text-center py-6"><AlertTriangle className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text` |

### `apps/frontend/src/app/(app)/search/page.tsx` — 36 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 23 | `text-navy` | `regex.test(part) ? <mark key={i} className="bg-primary/20 text-navy dark:text-white px-0.5 rounded">{part}</mark> : part` |
| 329 | `border-navy` | `showFilters ? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'` |
| 329 | `bg-navy/5` | `showFilters ? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'` |
| 362 | `bg-navy` | `dateRange === opt.value ? 'bg-navy text-white dark:bg-slate-600' : 'bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200'` |
| 384 | `bg-navy` | `classificationFilter === opt.value ? 'bg-navy text-white dark:bg-slate-600' : 'bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200'` |
| 404 | `bg-navy` | `sortBy === opt.value ? 'bg-navy text-white dark:bg-slate-600' : 'bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200'` |
| 420 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 434 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{action.label}</p>` |
| 474 | `text-navy` | `className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-sm text-navy dark:text-white hover:bg-primary hover:text-white transition"` |
| 523 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 531 | `text-navy` | `<FileText className="h-5 w-5 text-navy dark:text-blue-400 flex-shrink-0" />` |
| 533 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(doc.title, debouncedQuery)}</p>` |
| 550 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 560 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(page.title, debouncedQuery)}</p>` |
| 577 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 587 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(t.title, debouncedQuery)}</p>` |
| 604 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 613 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white flex-1">{highlightMatch(n.title, debouncedQuery)}</p>` |
| 628 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 638 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(rb.title, debouncedQuery)}</p>` |
| 655 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 665 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(v.title, debouncedQuery)}</p>` |
| 688 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 698 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(item.question, debouncedQuery)}</p>` |
| 717 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white mb-2 flex items-center gap-1.5">` |
| 735 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white mb-2 flex items-center gap-1.5">` |
| 763 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white mb-1">{t('search.intranet')}</p>` |
| 791 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 799 | `text-navy` | `<FileText className="h-5 w-5 text-navy dark:text-blue-400 flex-shrink-0" />` |
| 801 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(doc.title, debouncedQuery)}</p>` |
| 828 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 838 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(n.title, debouncedQuery)}</p>` |
| 861 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 871 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(w.title, debouncedQuery)}</p>` |
| 890 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 900 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{highlightMatch(tk.title, debouncedQuery)}</p>` |

### `apps/frontend/src/app/(app)/admin/certificates/page.tsx` — 32 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 507 | `text-navy` | `<span className="font-medium text-navy dark:text-white">{cert.name}</span>` |
| 650 | `text-navy` | `{ label: 'Total', value: stats.total, icon: FileText, color: 'text-navy dark:text-white', bg: 'bg-gray-100 dark:bg-slate-800' },` |
| 660 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stat.value}</p>` |
| 734 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Type de titulaire</label>` |
| 764 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Utilisateur</label>` |
| 779 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Personne externe</label>` |
| 803 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Nom de la formation *</label>` |
| 813 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Type de certification *</label>` |
| 830 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Date d&apos;obtention *</label>` |
| 838 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Date d&apos;expiration</label>` |
| 849 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Fichier (PDF/image)</label>` |
| 868 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Notes</label>` |
| 874 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:outline-n` |
| 900 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Prenom *</label>` |
| 904 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Nom *</label>` |
| 909 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Entreprise *</label>` |
| 913 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Email</label>` |
| 941 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white">Personnes externes</h2>` |
| 958 | `text-navy` | `<td className="px-4 py-3 text-navy dark:text-white">{ep.firstName} {ep.lastName}</td>` |
| 995 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Prenom</label>` |
| 1002 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Nom</label>` |
| 1010 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Entreprise</label>` |
| 1017 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Email</label>` |
| 1051 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white">KnowBe4</h2>` |
| 1073 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 1098 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Compte KnowBe4</h3>` |
| 1104 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white mt-0.5">{kb4Account.name}</p>` |
| 1108 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white mt-0.5">{kb4Account.type}</p>` |
| 1112 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white mt-0.5">{kb4Account.number_of_seats}</p>` |
| 1116 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white mt-0.5">` |
| 1130 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Campagnes de formation</h3>` |
| 1146 | `text-navy` | `<td className="px-4 py-3 text-navy dark:text-white font-medium">{campaign.name}</td>` |

### `apps/frontend/src/app/(app)/tickets/page.tsx` — 32 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 72 | `text-navy` | `REQUEST: <FileText className="h-5 w-5 text-navy dark:text-sky-300" />,` |
| 801 | `text-navy` | `<span className="font-mono text-xs font-semibold text-navy dark:text-white">{ticket.reference}</span>` |
| 807 | `text-navy` | `{ key: 'title', header: t('tickets.column.title'), sortable: true, render: (t) => <span className="text-sm font-semibold text-navy dark:text-white truncate max-` |
| 843 | `text-navy` | `return client ? <span className="text-xs font-medium text-navy dark:text-white">{client}</span> : <span className="text-taupe/40 dark:text-slate-600 text-xs">--` |
| 847 | `text-navy` | `return sn ? <span className="font-mono text-xs text-navy dark:text-white">{sn}</span> : <span className="text-taupe/40 dark:text-slate-600 text-xs">--</span>;` |
| 872 | `hover:text-navy` | `className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-taupe hover:text-navy dark:hover:text-white transition"` |
| 889 | `text-navy` | `className="w-full text-left px-3 py-1.5 text-xs text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition"` |
| 923 | `hover:text-navy` | `className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-taupe hover:text-navy dark:hover:text-white transition"` |
| 979 | `bg-navy` | `? 'bg-navy text-white dark:bg-white dark:text-navy shadow-sm'` |
| 979 | `dark:text-navy` | `? 'bg-navy text-white dark:bg-white dark:text-navy shadow-sm'` |
| 1052 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{contextualStats.open}</p>` |
| 1063 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{contextualStats.inProgress}</p>` |
| 1074 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{contextualStats.resolved}</p>` |
| 1153 | `bg-navy/10` | `className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-` |
| 1153 | `text-navy` | `className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-` |
| 1163 | `bg-navy` | `className={`rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visib` |
| 1332 | `text-navy` | `<label className="text-xs font-semibold text-navy dark:text-white">Type de demande</label>` |
| 1362 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">{rt.label}</p>` |
| 1371 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-white">Template</label>` |
| 1389 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white truncate">Vide</p>` |
| 1418 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white truncate">{tpl.label}</p>` |
| 1439 | `text-navy` | `className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-navy dark:text-white hover:bg-blue-100/50 dark:hover:bg-blue-800/20 transition"` |
| 1459 | `text-navy` | `<span className="text-navy dark:text-white truncate">{tk.title}</span>` |
| 1481 | `text-navy` | `<span className="text-navy dark:text-white truncate">{article.title}</span>` |
| 1509 | `text-navy` | `💡 Assignation suggérée : <span className="font-semibold text-navy dark:text-white">{CATEGORY_ASSIGNEES[form.category]}</span>` |
| 1581 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Checklist deploiement</span>` |
| 1595 | `text-navy` | `<span className="text-xs text-navy dark:text-white group-hover:text-primary transition">{item.label}</span>` |
| 1643 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white">Analyse IA</span>` |
| 1684 | `text-navy` | `<span className="font-mono font-semibold text-navy dark:text-white">{rt.reference}</span>` |
| 1842 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">` |
| 1955 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-2 group-hover:text-primary transition-colors duration-200">` |
| 2046 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{col.label}</h3>` |

### `apps/frontend/src/app/(app)/satisfaction/page.tsx` — 27 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 79 | `bg-navy` | `<div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom w-0.5 h-12 rounded-full bg-navy dark:bg-white transition-transform duration-700"` |
| 81 | `bg-navy` | `<div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-navy dark:bg-white" />` |
| 83 | `text-navy` | `<span className="text-lg font-bold text-navy dark:text-white">{clamped > 0 ? '+' : ''}{clamped}</span>` |
| 132 | `text-navy` | `<h4 className="text-sm font-medium text-navy dark:text-white">{title \|\| 'Sans titre'}</h4>` |
| 142 | `text-navy` | `<span className="text-xs text-navy dark:text-white font-medium">` |
| 387 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white">` |
| 408 | `text-navy` | `className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-3 py-2 min-h-[80px] fo` |
| 420 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{opt}</span>` |
| 468 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('satisfaction.title')}</h1>` |
| 488 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.globalAverage.toFixed(1)}</p>` |
| 499 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.totalSurveys}</p>` |
| 510 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.totalResponses}</p>` |
| 521 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.totalResponses > 0 ? Math.round((stats.totalResponses / Math.max(1, stats.totalSurveys)) * ` |
| 533 | `text-navy` | `<h4 className="text-xs font-semibold text-navy dark:text-white uppercase tracking-wide mb-3">Score NPS estime</h4>` |
| 544 | `text-navy` | `<h4 className="text-xs font-semibold text-navy dark:text-white uppercase tracking-wide mb-3">Repartition globale par enquete</h4>` |
| 552 | `text-navy` | `<span className="text-navy dark:text-white font-medium truncate mr-2">{s.title}</span>` |
| 627 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">{survey.title}</h3>` |
| 709 | `text-navy` | `<strong className="text-navy dark:text-white">{surveyResults[survey.id].stats.totalResponses}</strong> réponse{surveyResults[survey.id].stats.totalResponses !==` |
| 713 | `text-navy` | `Note moy. <strong className="text-navy dark:text-white">{surveyResults[survey.id].stats.averageRating}/5</strong>` |
| 721 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white">{qr.label}</p>` |
| 744 | `text-navy` | `<text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" className="text-navy dark:text-white">{qr.aggregation.average}</text>` |
| 803 | `text-navy` | `<span className="text-navy dark:text-white font-medium truncate mr-2">{c.label}</span>` |
| 822 | `text-navy` | `<div key={i} className="text-xs text-navy dark:text-slate-300 bg-gray-50 dark:bg-slate-900 rounded p-2 border-l-2 border-primary/40">` |
| 853 | `text-navy` | `<text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" className="text-navy dark:text-white">{surveyResults[survey.id].stats` |
| 893 | `text-navy` | `<label className="block text-[13px] font-medium text-navy dark:text-white mb-1">Date d&apos;expiration</label>` |
| 902 | `text-navy` | `<span className="text-sm text-navy dark:text-white">Réponses anonymes</span>` |
| 910 | `text-navy` | `<label className="text-[13px] font-medium text-navy dark:text-white">Questions</label>` |

### `apps/frontend/src/app/(app)/admin/it-exports/page.tsx` — 25 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 267 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">` |
| 287 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">` |
| 297 | `text-navy` | `<label className="block text-xs font-medium text-navy dark:text-slate-200 mb-1">` |
| 305 | `text-navy` | `className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |
| 313 | `text-navy` | `<label className="block text-xs font-medium text-navy dark:text-slate-200 mb-1">` |
| 321 | `text-navy` | `className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |
| 402 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white">` |
| 428 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white">` |
| 467 | `text-navy` | `<h2 className="text-base font-semibold text-navy dark:text-white">` |
| 550 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white mt-0.5">` |
| 558 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white mt-0.5">` |
| 569 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white mt-0.5">` |
| 577 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white mt-0.5">` |
| 610 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white uppercase tracking-wider mb-2">` |
| 648 | `text-navy` | `<td className="px-3 py-2 font-medium text-navy dark:text-white">` |
| 839 | `text-navy` | `<h2 className="text-xl font-medium text-navy dark:text-white">` |
| 879 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white">` |
| 907 | `text-navy` | `className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white placeholde` |
| 917 | `text-navy` | `className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white placeholder:text-` |
| 950 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">` |
| 1088 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 1100 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">` |
| 1106 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">` |
| 1112 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">` |
| 1151 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate group-hover:text-primary transition-colors">` |

### `apps/frontend/src/app/(app)/quiz/page.tsx` — 24 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 306 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Questions ({questions.length})</p>` |
| 609 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 636 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.participationRate}%</p>` |
| 648 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.averageScore}%</p>` |
| 676 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white group-hover:text-primary transition-colors">` |
| 742 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white group-hover:text-primary transition-colors truncate">` |
| 826 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 851 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white mt-1 truncate">` |
| 854 | `text-navy` | `<p className="text-lg font-bold text-navy dark:text-white">{pct}%</p>` |
| 873 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white flex-1">` |
| 894 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 913 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white flex-1 truncate">` |
| 977 | `text-navy` | `<h2 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 996 | `text-navy` | `<h2 className="text-xl font-medium text-navy dark:text-white mb-2">` |
| 1013 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 1028 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white flex-1">` |
| 1087 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">` |
| 1123 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{option}</span>` |
| 1172 | `text-navy` | `<h2 className="text-xl font-medium text-navy dark:text-white mb-2">` |
| 1193 | `text-navy` | `<span className="text-3xl font-semibold text-navy dark:text-white">{result.percentage}%</span>` |
| 1228 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white">{cat}</span>` |
| 1261 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white">{qi + 1}. {q.question}</p>` |
| 1306 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 1321 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white flex-1">` |

### `apps/frontend/src/app/(app)/tickets/[id]/page.tsx` — 23 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 324 | `text-navy` | `<span className="font-mono text-sm font-semibold text-navy dark:text-blue-300">{ticket.reference}</span>` |
| 360 | `text-navy` | `<span className="text-navy dark:text-white">{statusLabel[s] \|\| s}</span>` |
| 379 | `text-navy` | `<h1 className="text-xl font-medium text-navy dark:text-white mt-1">{ticket.title}</h1>` |
| 382 | `text-navy` | `<span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-navy dark:text-white">` |
| 426 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{t('tickets.detail.description')}</h3>` |
| 464 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Historique du statut</h3>` |
| 475 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Ticket créé</p>` |
| 488 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{statusLabel[ticket.status] \|\| ticket.status}</p>` |
| 500 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Résolu</p>` |
| 516 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Merci pour votre retour !</p>` |
| 523 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Évaluez la résolution</h3>` |
| 575 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 633 | `text-navy` | `<span className="text-[11px] font-semibold text-navy dark:text-white">` |
| 692 | `text-navy` | `className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary $` |
| 716 | `text-navy` | `<CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white">{t('tickets.detail.info')}</h3></CardHeader>` |
| 720 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{ticket.creator.firstName} {ticket.creator.lastName}</span>` |
| 724 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : t('tickets.detail.unas` |
| 728 | `text-navy` | `<span className="text-navy dark:text-white">{formatDateTime(ticket.createdAt)}</span>` |
| 733 | `text-navy` | `<span className="text-navy dark:text-white">{formatDateTime(ticket.resolvedAt)}</span>` |
| 744 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 772 | `text-navy` | `<span className={`text-xs ${checked ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-navy dark:text-white'}`}>{item.label}</span>` |
| 785 | `text-navy` | `<span className="font-semibold text-navy dark:text-white font-mono">{val}</span>` |
| 814 | `text-navy` | `<CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{t('tickets.` |

### `apps/frontend/src/app/(app)/documents/new/page.tsx` — 22 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 31 | `bg-navy` | `<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-lg bg-navy dark:bg-slate-700 text-white text-[11px]` |
| 160 | `text-navy` | `state === 'upcoming' ? 'text-seal-gray-500 dark:text-slate-500' : 'text-navy dark:text-white',` |
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

### `apps/frontend/src/app/(app)/veille/page.tsx` — 22 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 371 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Résumé hebdomadaire</h2>` |
| 390 | `text-navy` | `<span className="text-2xl font-medium text-navy dark:text-white">{weeklySummary.total}</span>` |
| 421 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-1">{item.title}</p>` |
| 444 | `bg-navy/10` | `<span key={product} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-navy/10 text-navy dark:bg-blue-900/30 dark:text-bl` |
| 444 | `text-navy` | `<span key={product} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-navy/10 text-navy dark:bg-blue-900/30 dark:text-bl` |
| 467 | `text-navy` | `<Rss className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 468 | `text-navy` | `<div><p className="text-[11px] text-taupe dark:text-slate-400">Total</p><p className="text-xl font-medium text-navy dark:text-white">{stats.total}</p></div>` |
| 511 | `bg-navy` | `!severityFilter ? 'bg-navy text-white dark:bg-primary' : 'bg-gray-100 dark:bg-slate-700 text-taupe dark:text-slate-300 hover:bg-gray-200'` |
| 564 | `text-navy` | `<Rss className="h-4 w-4 text-navy dark:text-blue-400" />` |
| 565 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Gérer les sources RSS</span>` |
| 593 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{source.name}</p>` |
| 626 | `text-navy` | `className="flex-1 min-w-[140px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-navy dark:text-white` |
| 634 | `text-navy` | `className="flex-[2] min-w-[200px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-navy dark:text-whi` |
| 694 | `text-navy` | `<Newspaper className="h-5 w-5 text-navy dark:text-blue-400 flex-shrink-0 mt-0.5" />` |
| 696 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white line-clamp-2">{bulletin.title}</h3>` |
| 734 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{selectedBulletin.title}</h2>` |
| 759 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Alertes liées ({bulletinItems.length})</h3>` |
| 768 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white flex-1 line-clamp-1">{item.title}</span>` |
| 821 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white line-clamp-1">{item.title}</h3>` |
| 896 | `bg-navy` | `className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${!productFilter ? 'bg-navy text-white' : 'bg-gray-100 dark:bg-slate-700 text-taupe da` |
| 910 | `bg-navy` | `className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${productFilter === prod ? 'bg-navy text-white' : 'bg-gray-100 dark:bg-slate-700 text-` |
| 970 | `text-navy` | `className="text-sm font-medium text-navy dark:text-white hover:text-primary transition duration-200 line-clamp-1 block">` |

### `apps/frontend/src/app/(app)/news/compose/page.tsx` — 20 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 165 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('newsCompose.title')}</h1>` |
| 171 | `text-navy` | `className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${showPreview ? 'border-primary bg-primary/10 text-primary'` |
| 198 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">{t('newsCompose.label.category')}</label>` |
| 229 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Image de couverture</label>` |
| 260 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white mb-1">Modèle</label>` |
| 270 | `text-navy` | `className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slat` |
| 280 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">{t('newsCompose.label.content')}</label>` |
| 296 | `text-navy` | `className={`px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white ${style \|\| 'font-semibold'}`}` |
| 303 | `text-navy` | `className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white"` |
| 312 | `text-navy` | `className="w-full min-h-[200px] rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-4 py-3` |
| 329 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 347 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{role}</span>` |
| 360 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{t('newsCompose.pinTop')}</span>` |
| 368 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{t('newsCompose.publishNow')}</span>` |
| 377 | `text-navy` | `<span className="text-sm text-navy dark:text-white">Publier et notifier</span>` |
| 403 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 420 | `text-navy` | `<h2 className="text-xl font-medium text-navy dark:text-white">` |
| 431 | `prose-headings:text-navy` | `className="prose prose-sm max-w-none prose-headings:text-navy dark:prose-headings:text-white prose-a:text-primary dark:prose-p:text-slate-300 dark:prose-li:text` |
| 456 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white mb-1">URL de l&apos;image</label>` |
| 462 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white mb-1">Texte alternatif</label>` |

### `apps/frontend/src/app/(app)/helpdesk/SelfServicePortal.tsx` — 18 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 189 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3 flex items-center gap-2">` |
| 201 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white">{tpl.title}</p>` |
| 219 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">{tpl.title}</h3>` |
| 231 | `text-navy` | `<label className="text-xs font-medium text-navy dark:text-slate-300 flex items-center gap-2">` |
| 255 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3 flex items-center gap-2">` |
| 269 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white truncate">{ticket.title.replace('[Self-Service] ', '')}</p>` |
| 290 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white text-sm">{t('selfservice.serviceStatus')}</h2>` |
| 325 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{s.name}</p>` |
| 337 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{t('selfservice.guidedDiagnostics')}</h2>` |
| 347 | `text-navy` | `className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-navy dark:text-white placeho` |
| 382 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">{guide.title}</h3>` |
| 391 | `text-navy` | `<p className="text-xs text-navy dark:text-white">{step}</p>` |
| 420 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-1">Pas trouvé de réponse ?</h3>` |
| 433 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Informations système</h3>` |
| 437 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{systemInfo.status === 'ok' ? 'Opérationnel' : 'Dégradé'}</span>` |
| 454 | `text-navy` | `<CardHeader><h2 className="font-semibold text-navy dark:text-white text-sm">{t('selfservice.usefulLinks')}</h2></CardHeader>` |
| 464 | `text-navy` | `<l.icon className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-navy dark:text-white">{l.label}</span>` |
| 468 | `text-navy` | `<l.icon className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-navy dark:text-white">{l.label}</span>` |

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
| 1107 | `hover:text-navy` | `: 'border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 1128 | `text-navy` | `className="bg-transparent text-xs text-navy dark:text-white focus:outline-none"` |
| 1299 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white line-clamp-2 mb-2">{doc.title}</h3>` |
| 1557 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{col.label}</h3>` |
| 1593 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white line-clamp-2 group-hover:text-primary transition-colors">` |

### `apps/frontend/src/app/(app)/admin/compliance/CompliancePlanning.tsx` — 16 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 229 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Planning de conformité</h1>` |
| 258 | `border-navy/10` | `<div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy/10 bg-navy/5 dark:bg-slate-800/60 px-4 py-3">` |
| 258 | `bg-navy/5` | `<div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy/10 bg-navy/5 dark:bg-slate-800/60 px-4 py-3">` |
| 259 | `text-navy` | `<Calendar className="h-5 w-5 text-navy dark:text-blue-400" />` |
| 260 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Résumé :</span>` |
| 280 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stats.total}</p>` |
| 324 | `bg-navy` | `? 'bg-navy text-white dark:bg-slate-600'` |
| 383 | `text-navy` | `<div className={`mt-1 ${overdue ? 'text-red-500' : 'text-navy dark:text-white'}`}>` |
| 394 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">{task.title}</h3>` |
| 491 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1.5">Fréquence</label>` |
| 500 | `border-navy` | `? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'` |
| 500 | `bg-navy/5` | `? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'` |
| 638 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{col.label}</h3>` |
| 679 | `text-navy` | `<p className={`text-xs font-semibold line-clamp-2 mb-2 ${overdue ? 'text-red-700 dark:text-red-400' : 'text-navy dark:text-white'}`}>` |
| 828 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">` |
| 878 | `text-navy` | `<p className="text-[11px] font-semibold text-navy dark:text-white truncate" title={task.title}>` |

### `apps/frontend/src/app/(app)/admin/workflows/[id]/page.tsx` — 15 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 216 | `text-navy` | `<h1 className="text-xl font-bold text-navy dark:text-white">` |
| 220 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 231 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 242 | `text-navy` | `<label className="flex items-center gap-2 text-sm text-navy dark:text-white">` |
| 250 | `text-navy` | `<label className="flex items-center gap-2 text-sm text-navy dark:text-white">` |
| 271 | `text-navy` | `<h2 className="text-lg font-bold text-navy dark:text-white">` |
| 285 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white mb-1">` |
| 324 | `text-navy` | `<div className="font-medium text-navy dark:text-white">` |
| 366 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 380 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 399 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 418 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 434 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 447 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 463 | `text-navy` | `<label className="flex items-center gap-2 text-sm text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/access-reviews/page.tsx` — 14 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 334 | `text-navy` | `<p className="text-xl text-navy dark:text-white">{activeCount}</p>` |
| 343 | `text-navy` | `<p className="text-xl text-navy dark:text-white">{pendingCount}</p>` |
| 349 | `text-navy` | `<Users className="h-5 w-5 text-navy dark:text-slate-300" />` |
| 352 | `text-navy` | `<p className="text-xl text-navy dark:text-white">{campaigns.length}</p>` |
| 469 | `text-navy` | `<h3 className="text-navy dark:text-white">{c.name}</h3>` |
| 627 | `text-navy` | `<span className="text-navy dark:text-white">{fullName(u)}</span>` |
| 671 | `text-navy` | `className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |
| 785 | `text-navy` | `className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:bord` |
| 795 | `text-navy` | `className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:bord` |
| 806 | `text-navy` | `className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:bord` |
| 814 | `text-navy` | `className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:bord` |
| 864 | `text-navy` | `<h2 className="text-navy dark:text-white">` |
| 1004 | `text-navy` | `<span className="text-sm text-navy dark:text-white truncate">{fullName(u)}</span>` |
| 1038 | `text-navy` | `className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:tex` |

### `apps/frontend/src/app/(app)/admin/ad-audit/page.tsx` — 14 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 226 | `text-navy` | `<span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium` |
| 243 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 288 | `text-navy` | `{ label: 'Total', value: report.summary.total, icon: ShieldAlert, color: 'text-navy dark:text-white', bg: 'bg-navy/10 dark:bg-slate-700' },` |
| 288 | `bg-navy/10` | `{ label: 'Total', value: report.summary.total, icon: ShieldAlert, color: 'text-navy dark:text-white', bg: 'bg-navy/10 dark:bg-slate-700' },` |
| 309 | `text-navy` | `<span className="font-medium text-navy dark:text-white ml-auto">{report.checks.filter(c => c.source === 'ad').length}</span>` |
| 314 | `text-navy` | `<span className="font-medium text-navy dark:text-white ml-auto">{report.checks.filter(c => c.source === 'intranet').length}</span>` |
| 353 | `bg-navy` | `className={`px-3 py-1 text-xs font-medium rounded-full transition ${filterSource === f.value ? 'bg-navy text-white dark:bg-slate-500' : 'bg-gray-100 dark:bg-sla` |
| 375 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Points de contrôle</h2>` |
| 396 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">{category}</h3>` |
| 418 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">{check.name}</span>` |
| 453 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 471 | `text-navy` | `<span className="font-medium text-navy dark:text-white">{check.name}</span>` |
| 493 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">` |
| 529 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/compliance/ComplianceOverview.tsx` — 14 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 176 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('compliance.title')}</h1>` |
| 195 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 203 | `hover:text-navy` | `<button onClick={() => setScanResult(null)} className="text-seal-gray-500 hover:text-navy dark:hover:text-white">` |
| 278 | `bg-navy/5` | `<div className="flex items-center gap-3 rounded-xl bg-navy/5 dark:bg-slate-800/60 p-3">` |
| 279 | `bg-navy/10` | `<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/10">` |
| 280 | `text-navy` | `<Shield className="h-5 w-5 text-navy" />` |
| 284 | `text-navy` | `<p className="text-xl font-medium text-navy dark:text-white">{summary.total}</p>` |
| 316 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-3">{t('compliance.globalCoverage')}</h3>` |
| 324 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white w-8 text-right">{summary.covered}</span>` |
| 332 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white w-8 text-right">{summary.partial}</span>` |
| 340 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white w-8 text-right">{summary.uncovered}</span>` |
| 361 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white mb-2 truncate">{domain}</p>` |
| 387 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">{t('compliance.detailTitle')}</h2>` |
| 455 | `text-navy` | `<span className="font-mono text-sm font-semibold text-navy dark:text-white">{gap.controlCode}</span>` |

### `apps/frontend/src/app/(app)/admin/audit-timeline/page.tsx` — 13 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 341 | `bg-navy/10` | `<div className="p-2 rounded-lg bg-navy/10 dark:bg-slate-800">` |
| 342 | `text-navy` | `<Activity className="h-6 w-6 text-navy dark:text-white" />` |
| 345 | `text-navy` | `<h1 className="text-2xl font-bold text-navy dark:text-white">Frise d'audit</h1>` |
| 359 | `text-navy` | `className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium tex` |
| 377 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-navy dark:text-white"` |
| 422 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-navy dark:text-white"` |
| 431 | `text-navy` | `Total : <strong className="text-navy dark:text-white">{stats.total}</strong>` |
| 440 | `text-navy` | `Échecs login : <strong className="text-navy dark:text-white">{stats.failedLogins}</strong>` |
| 469 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white capitalize">` |
| 495 | `bg-navy/10` | `<span className="inline-flex items-center px-2 py-0.5 rounded bg-navy/10 dark:bg-slate-800 text-[11px] font-mono text-navy dark:text-white">` |
| 495 | `text-navy` | `<span className="inline-flex items-center px-2 py-0.5 rounded bg-navy/10 dark:bg-slate-800 text-[11px] font-mono text-navy dark:text-white">` |
| 523 | `text-navy` | `className="inline-flex items-center gap-1 text-[11px] text-navy dark:text-slate-300 hover:underline"` |
| 556 | `text-navy` | `className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-` |

### `apps/frontend/src/app/(app)/incidents/[id]/page.tsx` — 13 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 371 | `text-navy` | `<h1 className="mt-2 text-xl font-medium text-navy dark:text-white">` |
| 426 | `text-navy` | `<p className="text-sm text-navy dark:text-white whitespace-pre-wrap">` |
| 433 | `text-navy` | `<p className="text-navy dark:text-white font-semibold">` |
| 439 | `text-navy` | `<p className="text-navy dark:text-white font-semibold">` |
| 447 | `text-navy` | `<p className="text-navy dark:text-white font-semibold">` |
| 455 | `text-navy` | `<p className="text-navy dark:text-white font-semibold">` |
| 471 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">` |
| 499 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 590 | `bg-navy/10` | `: { bg: 'bg-navy/10 dark:bg-slate-700', icon: <MessageSquare className="h-3.5 w-3.5 text-navy dark:text-slate-300" /> };` |
| 590 | `text-navy` | `: { bg: 'bg-navy/10 dark:bg-slate-700', icon: <MessageSquare className="h-3.5 w-3.5 text-navy dark:text-slate-300" /> };` |
| 607 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white">` |
| 629 | `text-navy` | `<p className="mt-1 text-xs text-navy dark:text-slate-200 whitespace-pre-wrap">` |
| 677 | `text-navy` | `<label className="flex items-center gap-2 text-xs text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/departments/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 212 | `text-navy` | `render: (d) => <span className="font-mono font-semibold text-navy dark:text-white">{d.code}</span>,` |
| 217 | `text-navy` | `render: (d) => <span className="text-sm font-semibold text-navy dark:text-white">{d.name}</span>,` |
| 232 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 347 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">{dept.name}</h3>` |
| 354 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 378 | `text-navy` | `<p className="text-xs font-medium text-navy dark:text-white truncate">{manager.firstName} {manager.lastName}</p>` |
| 388 | `text-navy` | `<span className="text-lg font-medium text-navy dark:text-white">{userCount}</span>` |
| 438 | `text-navy` | `{roleLabels[role] \|\| role.replace(/_/g, ' ')} <span className="font-semibold text-navy dark:text-white">{count}</span>` |
| 473 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{u.firstName} {u.lastName}</p>` |
| 497 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">{users.length} utilisateurs</p>` |
| 502 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">Documents</p>` |
| 507 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white">Tickets</p>` |

### `apps/frontend/src/app/(app)/admin/users/import/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 127 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Importer des utilisateurs (CSV)</h1>` |
| 144 | `text-navy` | `<p className="text-sm text-navy dark:text-white">Télécharger le modèle CSV avec les en-têtes attendues</p>` |
| 176 | `text-navy` | `<p className="text-sm text-navy dark:text-white">` |
| 197 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{validRows.length}</p>` |
| 206 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{errors.length}</p>` |
| 217 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white text-sm">Utilisateurs a importer</h2>` |
| 235 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">{row.email}</td>` |
| 236 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">{row.firstName}</td>` |
| 237 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">{row.lastName}</td>` |
| 272 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">{err.line}</td>` |
| 273 | `text-navy` | `<td className="py-2 px-3 text-navy dark:text-white">{err.field}</td>` |
| 304 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Import terminé</h2>` |

### `apps/frontend/src/app/(app)/admin/users/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 498 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">` |
| 576 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 583 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 590 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 597 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 604 | `hover:text-navy` | `className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 680 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Adoption MFA</span>` |
| 682 | `text-navy` | `<span className="text-lg font-bold text-navy dark:text-white">{mfaPercent}%</span>` |
| 708 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Synchronisation LDAP</span>` |
| 747 | `text-navy` | `className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white lg:w-36 focus:border-p` |
| 790 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">` |
| 994 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{space.label}</p>` |

### `apps/frontend/src/app/(app)/alerts/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 201 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{alertStats.read}/{alertStats.total}</p>` |
| 212 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">Accusés de lecture - Vue admin</h3>` |
| 216 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">{readRateStats.totalActive}</p>` |
| 220 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">` |
| 228 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">` |
| 238 | `hover:text-navy` | `<summary className="cursor-pointer text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors">` |
| 281 | `bg-navy` | `? (tab.color \|\| 'bg-navy text-white dark:bg-slate-600')` |
| 293 | `bg-navy` | `? 'bg-navy text-white dark:bg-slate-600'` |
| 345 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">{alert.title}</h3>` |
| 380 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1.5">Criticité</label>` |
| 393 | `border-navy` | `? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'` |
| 393 | `bg-navy/5` | `? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'` |

### `apps/frontend/src/app/(app)/procedures/[id]/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 227 | `text-navy` | `<h1 className="text-2xl font-medium text-navy">{doc.title}</h1>` |
| 302 | `text-navy` | `<span className="font-semibold text-navy">{doc.owner.firstName} {doc.owner.lastName}</span>` |
| 308 | `text-navy` | `<span className="font-semibold text-navy">v{currentVersion.versionNumber}</span>` |
| 312 | `text-navy` | `<span className="text-navy">{formatFileSize(currentVersion.fileSizeBytes)}</span>` |
| 318 | `text-navy` | `<span className="text-navy">{formatDate(doc.updatedAt)}</span>` |
| 353 | `text-navy` | `<h2 className="text-lg font-medium text-navy">{t('procedureDetail.preview')}</h2>` |
| 388 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Historique des versions</h2>` |
| 407 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">v{ver.versionNumber}</span>` |
| 439 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Contrôles ISO associés</h2>` |
| 450 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{isoControl.code}</p>` |
| 468 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Procédures connexes</h2>` |
| 483 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate group-hover:text-primary transition-colors">{rel.title}</p>` |

### `apps/frontend/src/app/(app)/admin/onboarding/page.tsx` — 11 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 159 | `text-navy` | `<p className="text-sm text-navy dark:text-white">` |
| 169 | `text-navy` | `<CardHeader><h2 className="font-medium text-navy dark:text-white text-sm">Démarrer un processus</h2></CardHeader>` |
| 204 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{pending.length}</p>` |
| 215 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{pending.filter(p => p.steps.every(s => s.isCompleted)).length}</p>` |
| 226 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">` |
| 245 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeho` |
| 271 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white text-sm">{p.user.firstName} {p.user.lastName}</h3>` |
| 311 | `text-navy` | `<span className={`text-[10px] font-medium ${progress === 100 ? 'text-emerald-500' : 'text-navy dark:text-white'}`}>{progress}%</span>` |
| 341 | `text-navy` | `<p className={`text-sm ${step.isCompleted ? 'text-seal-gray-500 line-through' : 'font-medium text-navy dark:text-white'}`}>{step.stepName}</p>` |
| 364 | `text-navy` | `<h2 className="font-medium text-navy dark:text-white text-sm">Checklist d&apos;intégration (modèle)</h2>` |
| 394 | `text-navy` | `<span className="text-xs text-navy dark:text-white">{s.label}</span>` |

### `apps/frontend/src/app/(app)/admin/signatures/page.tsx` — 11 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 149 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Document</label>` |
| 153 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:outline-n` |
| 166 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">` |
| 194 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-navy dark:text-white focus:outl` |
| 206 | `text-navy` | `className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${isSelected ? 'bg-primary/5 text-primary' : 'text-navy dark:` |
| 238 | `text-navy` | `{ key: 'ALL' as const, label: t('signatures.total'), icon: FileText, color: 'text-navy dark:text-white', bg: 'bg-gray-100 dark:bg-slate-800' },` |
| 253 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{counts[stat.key]}</p>` |
| 267 | `text-navy` | `<span className="text-xs font-semibold text-navy dark:text-white">` |
| 354 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white">` |
| 378 | `text-navy` | `className="text-sm font-semibold text-navy dark:text-white hover:text-primary transition-colors"` |
| 419 | `text-navy` | `className="text-sm font-semibold text-navy dark:text-white hover:text-primary transition-colors"` |

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
| 350 | `text-navy` | `<div><span className="text-seal-gray-500 dark:text-slate-400">Version :</span> <span className="text-navy dark:text-white font-semibold">{doc?.currentVersion?.v` |

### `apps/frontend/src/app/(app)/helpdesk/HelpdeskChat.tsx` — 11 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 409 | `text-navy` | `className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-12 pr-4 py-3.5 text-sm text-navy dark:text-white placeho` |
| 415 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3 uppercase tracking-wide">Actions rapides</h2>` |
| 433 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white mb-3 uppercase tracking-wide">` |
| 451 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white line-clamp-2">{article.question}</p>` |
| 560 | `text-navy` | `<p className={`text-sm whitespace-pre-wrap ${msg.role === 'assistant' ? 'text-navy dark:text-white' : ''}`}>{msg.content}</p>` |
| 595 | `text-navy` | `className="block w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 text-xs text-navy dark:text-` |
| 644 | `text-navy` | `className="w-full text-left p-2 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-primary/5 transition text-xs text-navy dark:text-white">` |
| 653 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '0ms' }} />` |
| 654 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '150ms' }} />` |
| 655 | `bg-taupe/50` | `<div className="h-2 w-2 rounded-full bg-taupe/50 animate-bounce" style={{ animationDelay: '300ms' }} />` |
| 672 | `text-navy` | `className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-3 text-sm bg-white dark:bg-slate-800 text-navy dark:text-white placeholder:tex` |

### `apps/frontend/src/app/(app)/news/[slug]/page.tsx` — 11 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 149 | `hover:text-navy` | `<button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white">` |
| 154 | `text-navy` | `<button onClick={() => router.push(`/news/${slug}/edit`)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-2` |
| 184 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{post.title}</h1>` |
| 210 | `prose-headings:text-navy` | `className="prose prose-sm max-w-none prose-headings:text-navy dark:prose-headings:text-white prose-a:text-primary dark:prose-p:text-slate-300 dark:prose-li:text` |
| 267 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 291 | `text-navy` | `<p className="text-xl font-medium text-navy dark:text-white mt-1">` |
| 327 | `text-navy` | `<p className="text-navy dark:text-white font-medium">{v.firstName} {v.lastName}</p>` |
| 352 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white group-hover:text-primary transition line-clamp-1">{related[0].title}</p>` |
| 358 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white group-hover:text-primary transition line-clamp-1">{related[1].title}</p>` |
| 367 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">Articles similaires</h2>` |
| 376 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white line-clamp-2">` |

### `apps/frontend/src/app/(app)/admin/audit-log/page.tsx` — 10 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 246 | `text-navy` | `<span className="text-xs font-mono text-navy dark:text-white">{formatDateTime(e.createdAt)}</span>` |
| 253 | `text-navy` | `<span className="text-sm text-navy dark:text-white">` |
| 364 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Exporter le journal d&apos;audit</h3>` |
| 373 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white"` |
| 382 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white"` |
| 393 | `hover:text-navy` | `className="text-xs text-seal-gray-500 hover:text-navy dark:hover:text-white transition-colors ml-auto"` |
| 455 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white w-full sm:w-auto"` |
| 462 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white w-full sm:w-auto"` |
| 529 | `text-navy` | `<span className="text-xs font-medium text-navy dark:text-white flex-shrink-0 hidden md:inline">` |
| 551 | `text-navy` | `<span className="text-xs text-navy dark:text-white font-medium">{page} / {entries.meta.totalPages}</span>` |

### `apps/frontend/src/app/(app)/calendar/page.tsx` — 10 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 391 | `text-navy` | `className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-600 text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slat` |
| 409 | `text-navy` | `<ChevronLeft className="h-5 w-5 text-navy dark:text-white" />` |
| 411 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">` |
| 419 | `text-navy` | `<ChevronRight className="h-5 w-5 text-navy dark:text-white" />` |
| 464 | `text-navy` | `: 'text-navy dark:text-white',` |
| 533 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 580 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{ev.title}</p>` |
| 619 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white">` |
| 653 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{ev.title}</p>` |
| 700 | `text-navy` | `<label className="flex items-center gap-2 text-sm text-navy dark:text-white cursor-pointer">` |

### `apps/frontend/src/app/(app)/files/page.tsx` — 10 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 238 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('nav.networkFiles')}</h1>` |
| 264 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white mb-1">Serveur de fichiers inaccessible</h2>` |
| 286 | `text-navy` | `}} className={i === pathParts.length - 1 ? 'text-navy dark:text-white font-semibold' : 'text-primary hover:underline'}>` |
| 300 | `hover:text-navy` | `className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-taupe dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy ` |
| 324 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">{selected.size} sélectionné(s)</span>` |
| 343 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white mb-1">Connexion au serveur de fichiers</h2>` |
| 387 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{share.label}</p>` |
| 401 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Nextcloud</p>` |
| 446 | `text-navy` | `<span className={`text-sm ${file.type === 'directory' ? 'font-semibold text-navy dark:text-white' : 'text-navy dark:text-slate-200'}`}>` |
| 446 | `text-navy` | `<span className={`text-sm ${file.type === 'directory' ? 'font-semibold text-navy dark:text-white' : 'text-navy dark:text-slate-200'}`}>` |

### `apps/frontend/src/app/(app)/admin/external-access/page.tsx` — 9 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 172 | `text-navy` | `<p className="text-sm text-navy dark:text-white">` |
| 204 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">Nouveau prestataire</h3>` |
| 308 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">Identifiants du prestataire</h3>` |
| 313 | `text-navy` | `<div><span className="text-seal-gray-500 dark:text-slate-400">Email :</span> <span className="text-navy dark:text-white font-semibold">{createdCredentials.email` |
| 314 | `text-navy` | `<div><span className="text-seal-gray-500 dark:text-slate-400">Mot de passe :</span> <span className="text-navy dark:text-white font-semibold">{createdCredential` |
| 344 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">Revue mensuelle requise</h3>` |
| 372 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Accès actifs ({activeAccesses.length})</h2>` |
| 383 | `text-navy` | `<span className="font-semibold text-navy dark:text-white text-sm">{access.companyName}</span>` |
| 424 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Accès révoqués ({revokedAccesses.length})</h2>` |

### `apps/frontend/src/app/(app)/notifications/page.tsx` — 9 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 298 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{t('notifications.admin')}</h3>` |
| 326 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1">{t('notifications.form.type')}</label>` |
| 341 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1">{t('notifications.form.recipients')}</label>` |
| 354 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1">Rôle cible</label>` |
| 372 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1">Département cible</label>` |
| 388 | `text-navy` | `<label className="block text-sm font-semibold text-navy dark:text-white mb-1">Apercu</label>` |
| 395 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{broadcastForm.title}</p>` |
| 535 | `text-navy` | `!notif.isRead ? 'font-semibold text-navy dark:text-white' : 'text-navy dark:text-white'` |
| 535 | `text-navy` | `!notif.isRead ? 'font-semibold text-navy dark:text-white' : 'text-navy dark:text-white'` |

### `apps/frontend/src/app/(app)/tools/pdf/page.tsx` — 9 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 280 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 334 | `hover:text-navy` | `: 'bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-navy dark:hover:text-white border border-tr` |
| 345 | `hover:text-navy` | `className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-g` |
| 378 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white mb-2">` |
| 386 | `text-navy` | `<p className="mb-2 font-semibold text-navy dark:text-white not-italic">` |
| 422 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white mb-2">` |
| 451 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white truncate">` |
| 470 | `hover:text-navy` | `className="p-1 rounded text-taupe hover:text-navy dark:hover:text-white transition-colors"` |
| 535 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(auth)/login/page.tsx` — 9 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 174 | `text-navy` | `<p className="text-2xl font-light text-navy dark:text-white tracking-tight">OMNITECH</p>` |
| 187 | `text-navy` | `<h2 className="text-2xl font-semibold text-navy dark:text-white">{t('auth.mfaTitle')}</h2>` |
| 198 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white py-3 text-center text-2xl font-m` |
| 205 | `hover:text-navy` | `<button onClick={() => { setMfaRequired(false); setMfaCode(''); }} className="w-full text-xs text-seal-gray-500 dark:text-slate-400 hover:text-navy dark:hover:t` |
| 220 | `text-navy` | `<h2 className="text-2xl font-semibold text-navy dark:text-white">{t('auth.login')}</h2>` |
| 228 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 237 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeh` |
| 248 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |
| 257 | `text-navy` | `className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeh` |

### `apps/frontend/src/app/(app)/incidents/page.tsx` — 8 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 209 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white tabular-nums">` |
| 362 | `text-navy` | `<span className="font-mono text-xs text-navy dark:text-white">` |
| 372 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">` |
| 506 | `bg-navy/10` | `<span className="inline-flex items-center gap-1 rounded-full bg-navy/10 dark:bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-navy dark:text-sky-300">` |
| 506 | `text-navy` | `<span className="inline-flex items-center gap-1 rounded-full bg-navy/10 dark:bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-navy dark:text-sky-300">` |
| 638 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-3 flex items-center gap-2">` |
| 646 | `text-navy` | `className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-navy dark:text-sky-300 px-2 py-1 text-[11px] font-semibold"` |
| 724 | `text-navy` | `<label className="flex items-center gap-2 text-xs text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/not-found.tsx` — 8 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 13 | `bg-navy/10` | `<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-navy/10 dark:bg-navy/20">` |
| 13 | `dark:bg-navy/20` | `<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-navy/10 dark:bg-navy/20">` |
| 14 | `text-navy` | `<FileQuestion className="h-10 w-10 text-navy dark:text-white/70" />` |
| 17 | `text-navy/20` | `<h1 className="text-8xl font-semibold text-navy/20 dark:text-white/10">` |
| 20 | `text-navy` | `<h2 className="text-2xl font-semibold text-navy dark:text-white -mt-2">` |
| 31 | `text-navy` | `className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold tex` |
| 38 | `bg-navy` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |
| 38 | `hover:bg-navy/90` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |

### `apps/frontend/src/app/(app)/procedures/page.tsx` — 8 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 147 | `text-navy` | `className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-taupe dark:text-slate-4` |
| 147 | `hover:text-navy` | `className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-taupe dark:text-slate-4` |
| 155 | `text-navy` | `className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-taupe dark:text-slate-4` |
| 155 | `hover:text-navy` | `className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-taupe dark:text-slate-4` |
| 205 | `text-navy` | `className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-xs font-medium text-navy dark:text-white flex-shrink-0"` |
| 265 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white line-clamp-2">` |
| 315 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white mb-1">{proc.title}</p>` |
| 338 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">{proc.title}</p>` |

### `apps/frontend/src/app/(app)/admin/system-health/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 174 | `text-navy` | `<h1 className="text-2xl text-navy dark:text-white">Santé système</h1>` |
| 199 | `text-navy` | `className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium tex` |
| 211 | `text-navy` | `<p className="text-xl font-light text-navy dark:text-white">{health.version \|\| '—'}</p>` |
| 215 | `text-navy` | `<p className="text-xl font-light text-navy dark:text-white">` |
| 221 | `text-navy` | `<p className="text-xl font-light text-navy dark:text-white">` |
| 227 | `text-navy` | `<p className="text-xl font-light text-navy dark:text-white">` |
| 271 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{svc.label}</p>` |

### `apps/frontend/src/app/(app)/directory/contacts/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 151 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 158 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 174 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Nouveau contact externe</h3>` |
| 175 | `hover:text-navy` | `<button onClick={() => setShowAddForm(false)} className="text-taupe hover:text-navy dark:hover:text-white">` |
| 187 | `text-navy` | `<label htmlFor="onCall" className="text-xs font-semibold text-navy dark:text-white">Astreinte</label>` |
| 226 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">Aucun contact trouvé</p>` |
| 265 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm leading-tight">` |

### `apps/frontend/src/app/(app)/directory/organigramme/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 105 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">{dept.name}</h3>` |
| 184 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">` |
| 264 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 283 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 294 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 325 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">Aucun département</p>` |
| 349 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white text-sm">OMNITECH Security</h2>` |

### `apps/frontend/src/app/(app)/directory/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 192 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 199 | `hover:text-navy` | `className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white border-b-2 border-tran` |
| 236 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'` |
| 247 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'` |
| 344 | `text-navy` | `<p className="text-lg font-medium text-navy dark:text-white">{t('common.noResults')}</p>` |
| 380 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white text-sm leading-tight">` |
| 465 | `text-navy` | `<p className="font-medium text-navy dark:text-white text-sm truncate">` |

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

### `apps/frontend/src/app/(app)/mfa/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 114 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Authentification MFA</h1>` |
| 125 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white mb-2">Protégez votre compte</h2>` |
| 197 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white flex items-center gap-2">` |
| 225 | `text-navy` | `<p className="font-mono text-sm text-navy dark:text-white break-all flex-1">{secret}</p>` |
| 266 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white mb-2">MFA actif</h2>` |
| 301 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-1">Codes de secours</h3>` |
| 324 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">Codes de secours</h3>` |

### `apps/frontend/src/app/(app)/news/page.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 182 | `text-navy` | `<h3 className="text-lg font-medium text-navy dark:text-white group-hover:text-primary transition line-clamp-2">{topArticle.title}</h3>` |
| 256 | `from-navy` | `<div className="absolute inset-0 bg-gradient-to-br from-navy to-primary/80" />` |
| 315 | `text-navy` | `<h2 className="text-sm font-medium text-navy dark:text-white flex items-center gap-1.5">` |
| 333 | `text-navy` | `<h2 className="text-sm font-medium text-navy dark:text-white">{t('news.recent')}</h2>` |
| 359 | `text-navy` | `<CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white">Articles populaires</h3></CardHeader>` |
| 362 | `text-navy` | `<Link key={article.id} href={`/news/${article.slug}`} className="block text-xs text-navy dark:text-white hover:text-primary transition line-clamp-2 font-medium"` |
| 431 | `text-navy` | `<h3 className="text-sm font-medium text-navy dark:text-white line-clamp-2 transition duration-200 group-hover:text-primary">{post.title}</h3>` |

### `apps/frontend/src/app/(app)/wiki/RunbooksContent.tsx` — 7 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 322 | `text-navy` | `<h2 className="font-semibold text-navy dark:text-white">{executingRunbook.title}</h2>` |
| 348 | `text-navy` | `<p className={`text-sm font-semibold ${completedSteps.has(i) ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-navy dark:text-white'}`}>` |
| 365 | `text-navy` | `<h3 className="text-xs font-semibold text-navy dark:text-white mb-2 flex items-center gap-1.5">` |
| 379 | `text-navy` | `<span className="text-navy dark:text-white font-medium">` |
| 410 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white mb-1">Templates prêts à l'emploi</h3>` |
| 432 | `text-navy` | `<h4 className="text-sm font-semibold text-navy dark:text-white">{tpl.title}</h4>` |
| 456 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">{rb.title}</h3>` |

### `apps/frontend/src/app/(app)/admin/chartes/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 195 | `text-navy` | `<CardHeader><h3 className="font-medium text-navy dark:text-white">Créer une charte</h3></CardHeader>` |
| 220 | `text-navy` | `<CardHeader><h3 className="font-medium text-navy dark:text-white">Importer une charte depuis un document existant</h3></CardHeader>` |
| 286 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white">{charte.title}</h3>` |
| 370 | `text-navy` | `<span className={`text-xs font-medium ${vi === 0 ? 'text-navy dark:text-white' : 'text-seal-gray-500 dark:text-slate-400'}`}>` |
| 416 | `text-navy` | `<h4 className="text-sm font-medium text-navy dark:text-white mb-3">Uploader une nouvelle version PDF</h4>` |
| 462 | `text-navy` | `<h2 className="text-lg font-medium text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/compliance/ComplianceFrameworks.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 258 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Référentiels de conformité</h1>` |
| 333 | `text-navy` | `<h3 className="text-lg font-medium text-navy dark:text-white truncate">` |
| 349 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">{fw._count.controls}</span> contrôles` |
| 391 | `text-navy` | `<p className="text-xs font-semibold text-navy dark:text-white truncate mb-1">{domain}</p>` |
| 418 | `text-navy` | `<h4 className="text-sm font-semibold text-navy dark:text-white mb-2 flex items-center gap-2">` |
| 433 | `text-navy` | `<p className="text-sm text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/ldap-pending/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 223 | `hover:text-navy` | `: 'border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 267 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white">` |
| 332 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white"` |
| 354 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white"` |
| 400 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white mb-2">` |
| 411 | `text-navy` | `className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white focus:outline-n` |

### `apps/frontend/src/app/(app)/admin/workflows/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 195 | `text-navy` | `<td className="p-3 text-navy dark:text-slate-200">` |
| 198 | `text-navy` | `<td className="p-3 text-navy dark:text-slate-200">` |
| 217 | `text-navy` | `<td className="p-3 text-navy dark:text-slate-200">` |
| 255 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 267 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |
| 280 | `text-navy` | `<label className="block text-sm font-medium text-navy dark:text-white mb-1">` |

### `apps/frontend/src/app/(app)/getting-started/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 176 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">` |
| 218 | `text-navy` | `<h4 className={`text-sm font-semibold ${done ? 'text-taupe dark:text-slate-400 line-through' : 'text-navy dark:text-white'}`}>` |
| 231 | `hover:text-navy` | `? 'text-taupe dark:text-slate-500 hover:text-navy dark:hover:text-white'` |
| 252 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |
| 288 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-[#F68D2E] transition-colors">` |
| 306 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white group-hover:text-[#F68D2E] transition-colors">` |

### `apps/frontend/src/app/(app)/news/[slug]/edit/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 135 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Modifier l&apos;article</h1>` |
| 166 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">Contenu</label>` |
| 181 | `text-navy` | `className={`px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-white ${style \|\| 'font-semibold'}`}` |
| 189 | `text-navy` | `className="w-full min-h-[250px] rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white px-4 py-3` |
| 201 | `text-navy` | `<span className="text-sm text-navy dark:text-white">Épingler en haut</span>` |
| 205 | `text-navy` | `<span className="text-sm text-navy dark:text-white">Publié</span>` |

### `apps/frontend/src/app/(app)/search/v2/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 54 | `text-navy` | `document: 'text-navy dark:text-blue-400',` |
| 199 | `text-navy` | `<div className="min-h-screen bg-white dark:bg-slate-900 text-navy dark:text-white p-6 animate-fade-in-up">` |
| 217 | `text-navy` | `className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white focus:outline-none foc` |
| 300 | `text-navy` | `const iconColor = TYPE_ICON_COLOR[group.hitType] ?? 'text-navy';` |
| 313 | `text-navy` | `const hitIconColor = TYPE_ICON_COLOR[hit.type] ?? 'text-navy';` |
| 326 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/compliance/ComplianceControls.tsx` — 5 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 179 | `text-navy` | `<span className="font-mono text-sm font-semibold text-navy dark:text-white">{c.code}</span>` |
| 187 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{c.titleFr \|\| c.title}</span>` |
| 252 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('isoControls.title')}</h1>` |
| 372 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">` |
| 388 | `text-navy` | `<span className="font-mono text-sm font-medium text-navy dark:text-white w-16">{c.code}</span>` |

### `apps/frontend/src/app/not-found.tsx` — 5 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 15 | `text-navy/20` | `<h1 className="text-8xl font-semibold text-navy/20 dark:text-white/10">404</h1>` |
| 16 | `text-navy` | `<h2 className="text-xl font-semibold text-navy dark:text-white -mt-4">Page introuvable</h2>` |
| 24 | `text-navy` | `className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold tex` |
| 31 | `bg-navy` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |
| 31 | `hover:bg-navy/90` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |

### `apps/frontend/src/app/(app)/admin/reports/page.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 187 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('reports.title')}</h1>` |
| 213 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{stat.value}</p>` |
| 236 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">Rapports automatiques</p>` |
| 265 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">{t(report.titleKey)}</h3>` |

### `apps/frontend/src/app/(app)/admin/spaces/page.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 193 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">` |
| 252 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">` |
| 294 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">` |
| 323 | `text-navy` | `<span className="font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/en-construction/page.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 19 | `text-navy` | `<h1 className="text-2xl font-semibold text-navy dark:text-white">` |
| 30 | `text-navy` | `className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold tex` |
| 37 | `bg-navy` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |
| 37 | `hover:bg-navy/90` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |

### `apps/frontend/src/app/(app)/signatures/page.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 87 | `text-navy` | `<p className="text-2xl font-medium text-navy dark:text-white">{totalCount}</p>` |
| 104 | `text-navy` | `? 'bg-white dark:bg-slate-700 text-navy dark:text-white shadow-sm'` |
| 105 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
| 147 | `text-navy` | `className="text-sm font-medium text-navy dark:text-white hover:text-primary transition duration-200 line-clamp-1">` |

### `apps/frontend/src/app/error.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 36 | `text-navy` | `<h1 className="text-2xl font-semibold text-navy dark:text-white">Une erreur est survenue</h1>` |
| 50 | `bg-navy` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |
| 50 | `hover:bg-navy/90` | `className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-t` |
| 56 | `text-navy` | `className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold tex` |

### `apps/frontend/src/app/maintenance/page.tsx` — 4 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 87 | `text-navy` | `<h1 className="text-3xl md:text-4xl font-semibold text-navy dark:text-white text-center animate-fade-in-up">` |
| 112 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{t('maintenance.estimatedReturn')}</p>` |
| 128 | `text-navy` | `<span className="inline-flex items-center justify-center min-w-[2.2rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1` |
| 132 | `text-navy` | `<span className="inline-flex items-center justify-center min-w-[2.2rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1` |

### `apps/frontend/src/app/(app)/admin/dark-mode-audit/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 191 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Audit dark mode</h1>` |
| 209 | `text-navy` | `className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-medium text-navy dark:text-white hover:` |
| 249 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/chat/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 42 | `text-navy` | `<h1 className="text-2xl text-navy dark:text-white">{t('chat.title')}</h1>` |
| 68 | `text-navy` | `<h2 className="text-2xl text-navy dark:text-white">{t('chat.title')}</h2>` |
| 98 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white">{t('chat.title')}</h2>` |

### `apps/frontend/src/app/(app)/documents/[id]/editor/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 588 | `text-navy` | `<h3 className="text-base font-semibold text-navy dark:text-white mb-2">` |
| 628 | `text-navy` | `<p className="font-semibold text-navy dark:text-white not-italic mb-2">` |
| 679 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white truncate">` |

### `apps/frontend/src/app/(app)/extranet/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 117 | `text-navy` | `<div><p className="text-xs text-taupe dark:text-slate-400">Total</p><p className="text-xl font-medium text-navy dark:text-white">{accesses.length}</p></div>` |
| 167 | `text-navy` | `<p className="text-lg font-semibold text-navy dark:text-white">Aucun accès prestataire</p>` |
| 194 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white text-sm truncate">{access.name}</h3>` |

### `apps/frontend/src/app/(app)/certificates/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 212 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white line-clamp-2">` |
| 335 | `text-navy` | `<label className="block text-[13px] font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/files/smb-editor/[sessionId]/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 181 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white mb-2">` |
| 209 | `text-navy` | `<div className="text-sm text-navy dark:text-white font-medium truncate max-w-md">` |

### `apps/frontend/src/app/(app)/timeline/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 205 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Timeline</h1>` |
| 292 | `text-navy` | `<p className="text-sm font-medium text-navy dark:text-white truncate">{entry.title}</p>` |

### `apps/frontend/src/app/(app)/tips/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 132 | `text-navy` | `<h3 className="mt-1 text-base font-semibold text-navy dark:text-white">` |
| 191 | `text-navy` | `<h3 className="mt-2 text-sm font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/chartes/page.tsx` — 2 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 273 | `text-navy` | `<span className="text-sm text-navy dark:text-white font-medium">` |
| 339 | `text-navy` | `<h3 className="text-lg font-semibold text-navy dark:text-white">Charte signee</h3>` |

### `apps/frontend/src/app/(app)/admin/compliance/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 84 | `hover:text-navy` | `: 'text-seal-gray-500 hover:text-navy dark:hover:text-white border-b-2 border-transparent'` |

### `apps/frontend/src/app/(app)/admin/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 203 | `text-navy` | `<p className="text-xl font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/helpdesk/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 67 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |

### `apps/frontend/src/app/(app)/wiki/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 76 | `hover:text-navy` | `: 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |

### `apps/frontend/src/app/(auth)/forgot-password/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 91 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white mb-2">{t('forgotPassword.sentTitle')}</h2>` |

### `apps/frontend/src/app/(auth)/logout/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 58 | `text-navy` | `<Button className="bg-white text-navy hover:bg-white/90 font-semibold px-6">` |

### `apps/frontend/src/app/(auth)/reset-password/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 119 | `text-navy` | `<h2 className="text-lg font-semibold text-navy dark:text-white mb-2">{t('resetPassword.successTitle')}</h2>` |
