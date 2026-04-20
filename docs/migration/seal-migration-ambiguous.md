# SEAL Migration — Cas ambigus (Session 2+)

_Généré par `scripts/seal-migrate.mjs` le 2026-04-20T12:54:52.953Z._

Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.
Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.

## Familles refusées

- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).
- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d'équivalent `seal-gray-*` direct comme fond.
- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.

## Totaux par classe ambigüe

| Classe | Occurrences |
| --- | ---: |
| `text-navy` | 323 |
| `hover:text-navy` | 13 |
| `bg-navy/5` | 6 |
| `bg-navy/10` | 4 |
| `bg-navy` | 4 |
| `border-navy/20` | 3 |
| `border-navy/10` | 2 |
| `border-navy` | 1 |
| `border-navy/30` | 1 |

## Par fichier

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
| 783 | `hover:text-navy` | `className="text-taupe hover:text-navy dark:hover:text-white transition-colors"` |
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
| 1032 | `hover:text-navy` | `className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe hover:text-navy dark:hover:text-white transition-colors"` |
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
| 203 | `hover:text-navy` | `<button onClick={() => setScanResult(null)} className="text-taupe hover:text-navy dark:hover:text-white">` |
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

### `apps/frontend/src/app/(app)/admin/departments/page.tsx` — 12 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 212 | `text-navy` | `render: (d) => <span className="font-mono font-semibold text-navy dark:text-white">{d.code}</span>,` |
| 217 | `text-navy` | `render: (d) => <span className="text-sm font-semibold text-navy dark:text-white">{d.name}</span>,` |
| 232 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 347 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">{dept.name}</h3>` |
| 354 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
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
| 576 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 583 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 590 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 597 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 604 | `hover:text-navy` | `className="rounded-lg p-1.5 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white"` |
| 680 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Adoption MFA</span>` |
| 682 | `text-navy` | `<span className="text-lg font-bold text-navy dark:text-white">{mfaPercent}%</span>` |
| 708 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">Synchronisation LDAP</span>` |
| 747 | `text-navy` | `className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white lg:w-36 focus:border-p` |
| 790 | `text-navy` | `<span className="text-sm font-semibold text-navy dark:text-white">` |
| 994 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">{space.label}</p>` |

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
| 341 | `text-navy` | `<p className={`text-sm ${step.isCompleted ? 'text-taupe line-through' : 'font-medium text-navy dark:text-white'}`}>{step.stepName}</p>` |
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

### `apps/frontend/src/app/(app)/admin/audit-log/page.tsx` — 10 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 246 | `text-navy` | `<span className="text-xs font-mono text-navy dark:text-white">{formatDateTime(e.createdAt)}</span>` |
| 253 | `text-navy` | `<span className="text-sm text-navy dark:text-white">` |
| 364 | `text-navy` | `<h3 className="text-sm font-semibold text-navy dark:text-white">Exporter le journal d&apos;audit</h3>` |
| 373 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white"` |
| 382 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white"` |
| 393 | `hover:text-navy` | `className="text-xs text-taupe hover:text-navy dark:hover:text-white transition-colors ml-auto"` |
| 455 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white w-full sm:w-auto"` |
| 462 | `text-navy` | `className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-navy dark:text-white w-full sm:w-auto"` |
| 529 | `text-navy` | `<span className="text-xs font-medium text-navy dark:text-white flex-shrink-0 hidden md:inline">` |
| 551 | `text-navy` | `<span className="text-xs text-navy dark:text-white font-medium">{page} / {entries.meta.totalPages}</span>` |

### `apps/frontend/src/app/(app)/admin/external-access/page.tsx` — 9 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 172 | `text-navy` | `<p className="text-sm text-navy dark:text-white">` |
| 204 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">Nouveau prestataire</h3>` |
| 308 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white">Identifiants du prestataire</h3>` |
| 313 | `text-navy` | `<div><span className="text-taupe dark:text-slate-400">Email :</span> <span className="text-navy dark:text-white font-semibold">{createdCredentials.email}</span>` |
| 314 | `text-navy` | `<div><span className="text-taupe dark:text-slate-400">Mot de passe :</span> <span className="text-navy dark:text-white font-semibold">{createdCredentials.passwo` |
| 344 | `text-navy` | `<h3 className="font-semibold text-navy dark:text-white text-sm">Revue mensuelle requise</h3>` |
| 372 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Accès actifs ({activeAccesses.length})</h2>` |
| 383 | `text-navy` | `<span className="font-semibold text-navy dark:text-white text-sm">{access.companyName}</span>` |
| 424 | `text-navy` | `<h2 className="text-sm font-semibold text-navy dark:text-white">Accès révoqués ({revokedAccesses.length})</h2>` |

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

### `apps/frontend/src/app/(app)/admin/chartes/page.tsx` — 6 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 195 | `text-navy` | `<CardHeader><h3 className="font-medium text-navy dark:text-white">Créer une charte</h3></CardHeader>` |
| 220 | `text-navy` | `<CardHeader><h3 className="font-medium text-navy dark:text-white">Importer une charte depuis un document existant</h3></CardHeader>` |
| 286 | `text-navy` | `<h3 className="font-medium text-navy dark:text-white">{charte.title}</h3>` |
| 370 | `text-navy` | `<span className={`text-xs font-medium ${vi === 0 ? 'text-navy dark:text-white' : 'text-taupe dark:text-slate-400'}`}>` |
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
| 223 | `hover:text-navy` | `: 'border-transparent text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'` |
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

### `apps/frontend/src/app/(app)/admin/compliance/ComplianceControls.tsx` — 5 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 179 | `text-navy` | `<span className="font-mono text-sm font-semibold text-navy dark:text-white">{c.code}</span>` |
| 187 | `text-navy` | `<span className="text-sm text-navy dark:text-white">{c.titleFr \|\| c.title}</span>` |
| 252 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">{t('isoControls.title')}</h1>` |
| 372 | `text-navy` | `<span className="text-sm font-medium text-navy dark:text-white">` |
| 388 | `text-navy` | `<span className="font-mono text-sm font-medium text-navy dark:text-white w-16">{c.code}</span>` |

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

### `apps/frontend/src/app/(app)/admin/dark-mode-audit/page.tsx` — 3 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 191 | `text-navy` | `<h1 className="text-2xl font-medium text-navy dark:text-white">Audit dark mode</h1>` |
| 209 | `text-navy` | `className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-medium text-navy dark:text-white hover:` |
| 249 | `text-navy` | `<p className="text-sm font-semibold text-navy dark:text-white">` |

### `apps/frontend/src/app/(app)/admin/compliance/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 84 | `hover:text-navy` | `: 'text-taupe hover:text-navy dark:hover:text-white border-b-2 border-transparent'` |

### `apps/frontend/src/app/(app)/admin/page.tsx` — 1 occurrences

| Ligne | Classe | Contexte |
| ---: | --- | --- |
| 203 | `text-navy` | `<p className="text-xl font-semibold text-navy dark:text-white">` |
