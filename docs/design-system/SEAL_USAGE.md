# Design System SEAL — Guide d'usage

> **Statut** : document vivant, v1.0 (2026-04-20)
> **Public** : contributeurs frontend de l'intranet OMNITECH.
> **Source de vérité (tokens)** : `apps/frontend/tailwind.config.ts` et `apps/frontend/src/app/globals.css`.

---

## 1. Pourquoi SEAL ?

Le design system **SEAL** (nommage historique du produit de sécurité physique OMNITECH) formalise la **charte graphique PANTONE** officielle :

| Token | Hex | PANTONE | Usage principal |
|---|---|---|---|
| `seal-orange` | `#F9964A` | 715C | Primary CTA, hover, focus ring |
| `seal-orange-light` | `#FFCC99` | — | Backgrounds doux, halos |
| `seal-blue` | `#296DC1` | 660C | Badges info, état "en ligne", liens secondaires |
| `seal-green` | `#006233` | 349C | Succès, statuts positifs |
| `seal-bordeaux` | `#892034` | 202C | Audit, alarmes, hub security |
| `seal-navy` | `#004469` | — | Titres, headers, body text (évolution de `navy` legacy) |
| `seal-gray-{100,300,400,500,600}` | `#dadde2` → `#3c3f4a` | — | Texte secondaire, bordures, fonds neutres |

**Tokens alarme** (`seal-alarm-{new,normal,ack,ended}`) pour les états de sécurité physique.

## 2. Règles fondamentales

1. **Toujours préférer un token SEAL à une classe arbitraire**. Éviter `text-slate-600`, `bg-gray-50`, etc. quand un `seal-*` existe.
2. **Ne jamais écrire de nouvelles classes legacy** (`text-navy`, `text-taupe`, `bg-navy/10`). Ces classes fonctionnent encore (dual-targeting CSS dans `globals.css`) mais sont **à retirer** au fil du temps.
3. **Les variantes dark mode** sont généralement `dark:text-white` pour les textes primaires et `dark:text-slate-400` pour les secondaires. Pas de `dark:text-seal-*` nécessaire dans 90 % des cas (le thème dark CSS override déjà).
4. **Pas de nouveau token sans discussion** : ajouter une couleur à `tailwind.config.ts` doit faire l'objet d'une PR explicite avec justification.

## 3. Table de correspondance legacy → SEAL

| Legacy | SEAL | Contexte type |
|---|---|---|
| `text-navy` | `text-seal-navy` | Titres, body principal |
| `bg-navy` | `bg-seal-navy` | Fonds d'accent |
| `bg-navy/10` | `bg-seal-navy/10` | Halos colorés |
| `border-navy` | `border-seal-navy` | Bordures accent |
| `text-taupe` | `text-seal-gray-500` | Texte secondaire, captions |
| `border-taupe` | `border-seal-gray-500` | Bordures douces |
| `bg-taupe/50` | `bg-seal-gray-400/60` | Animations, dots |

Automatisable via `node scripts/seal-migrate.mjs --apply`.

## 4. Convention d'en-tête de page — `PageHeader`

**Composant** : `apps/frontend/src/components/layout/page-header.tsx`.

**API** :
```tsx
<PageHeader
  title="Administration"            // Titre <h1> principal
  subtitle="Gestion des utilisateurs, conformité et configuration système."
  icon={Cog}                        // Icône lucide (optionnelle)
  hub="admin"                       // Couleur d'accent selon le hub
  actions={<Button>Nouveau</Button>} // Actions à droite (optionnel)
/>
```

**`hub` disponibles** : `monEspace`, `work`, `security`, `admin`, `rssi`, `neutral`. Chacun pose son accent couleur charte (voir `page-header.tsx:7-15`).

### Pourquoi ?

- **Accessibilité** : 1 seul `<h1>` sémantique par page.
- **Cohérence** : typographie, spacing, dark mode gérés au même endroit.
- **Maintenabilité** : toute évolution du header (ex: breadcrumb auto) se fait au composant, pas dans 62 fichiers.

### Anti-patterns à éviter

❌ **H1 maison** avec classes custom :
```tsx
<h1 className="text-2xl font-medium text-navy dark:text-white">Utilisateurs</h1>
```

❌ **2 `<h1>` dans la même page** (dashboard, rssi-dashboard, quiz, it-exports) — mauvais pour SEO et lecteurs d'écran.

❌ **Tailles incohérentes** (`text-[26px]`, `text-3xl font-semibold`, `text-xl font-medium` — 6 variantes coexistent dans le repo). Utiliser PageHeader garantit une seule taille.

✅ **Toujours** :
```tsx
<PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={Users} hub="admin" />
```

## 5. Boutons, badges, status

- **Button** : `<Button variant="primary" />` par défaut (orange SEAL). Variants : `secondary`, `ghost`, `destructive`, `navy-outline`.
- **Badge** : `<Badge variant="seal-blue" />` (info), `variant="seal-green"` (succès), `variant="seal-bordeaux"` (critique).
- **StatusBadge** : pour les statuts métier (DRAFT, APPROVED, OBSOLETE).
- **Card** : `variant="orange" | "blue" | "green" | "bordeaux"` pour teinter un hub entier.

## 6. Process de contribution

1. **Avant de PR** : `node scripts/seal-migrate.mjs` en dry-run pour t'assurer qu'aucune classe legacy n'est introduite.
2. **Linter** : `.eslintrc.json` contient une règle `no-restricted-syntax` qui **warn** sur les classes legacy. Ignorer = commit propre.
3. **Test dark mode** sur chaque page touchée (utiliser `/admin/dark-mode-audit` pour checker toutes les pages rapidement).
4. **1 nouveau token ?** Ouvrir une issue avec justification + impact visuel avant la PR.

## 7. Références

- Audit fonctionnel intranet : `docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md`
- Rapports migration : `docs/migration/seal-migration-session-{1,2}-report.md`
- Table de mapping : `docs/migration/seal-mapping.md`
- Cas ambigus : `docs/migration/seal-migration-ambiguous.md`
- Charte utilisateur MEMORY : `/root/.claude/projects/-root/memory/seal_charter.md`

---

*Dernière mise à jour : 2026-04-20 — session 3 de la migration SEAL.*
