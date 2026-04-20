# SEAL Migration — Table de correspondance (Session 1)

## 1. Décisions structurantes

### 1.1 `navy` (#004469) et `seal-blue` (#296DC1) sont **deux tokens distincts**

- `navy.DEFAULT = #004469` → bleu profond "OMNITECH" (hérité). Usage actuel : titres, headers, mono, gradients d'accent.
- `seal-blue = #296DC1` (PANTONE 660C) → bleu signalétique SEAL System (alarmes, badges).
- Les deux sont préservés dans `tailwind.config.ts:40-56`.
- Le composant `packages/ui/src/badge.tsx` déclare **explicitement** `variant: 'navy'` ET `variant: 'seal-blue'` comme deux variantes différentes.

**Conséquence — Décision Session 1 :**

> `navy` n'est **PAS** migré automatiquement. Chaque occurrence de `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `ring-navy`, etc. est **flaggée ambigüe** (session 2+ décidera au cas par cas si remplacer par `seal-blue` ou conserver le token navy).

Justification :
1. Navy (#004469) et seal-blue (#296DC1) sont **visuellement très différents** (luminance, saturation). Un remplacement massif changerait l'identité visuelle des titres/headers.
2. La charte OMNITECH conserve explicitement les deux tokens — la migration n'a pas vocation à supprimer navy.
3. Les 1 241 occurrences navy (`text-navy`, `bg-navy`, etc.) demandent un arbitrage designer (par section / rôle sémantique).

### 1.2 `taupe` (#837274) → `seal-gray-500` (#454955)

- `taupe.DEFAULT = #837274` → gris chaud historique, utilisé pour body/caption/labels dans `apps/frontend/src/lib/ui/tokens.ts:43-47`.
- `seal-gray-500 = #454955` → gris neutre SEAL, plus contrasté, aligné charte.
- `seal-gray-400 = #676d7f` → variante plus claire pour placeholders/micro-labels.

**Décision Session 1 :**

> `taupe` → **`seal-gray-500`** par défaut (automatisé). Les `text-taupe/XX` (opacity) deviennent `text-seal-gray-500/XX`. Les variantes préfixées (`hover:`, `dark:`, `focus:`, `group-hover:`, `focus-visible:`) sont préservées à l'identique devant le remplacement (`hover:text-taupe` → `hover:text-seal-gray-500`).

Justification :
1. Taupe et seal-gray-500 jouent le même rôle sémantique (texte secondaire, labels, caption).
2. Contraste amélioré → bonus accessibilité.
3. Le design system cible (`seal-gray-*`) existe déjà en token Tailwind (config ligne 58-64) et en CSS var (`globals.css:54-58`).

Cas particulier : `bg-taupe` (3 occurrences) → flagger comme ambigü. Taupe comme fond n'a pas d'équivalent seal-gray évident (les `seal-gray-100/500` ont un rôle différent). Revue manuelle.

## 2. Table de mapping (cas triviaux)

Les classes suivantes sont migrables automatiquement par le script :

| Classe legacy | Classe cible | Notes |
| --- | --- | --- |
| `text-taupe` | `text-seal-gray-500` | Body/caption/labels par défaut |
| `text-taupe/10` à `text-taupe/90` | `text-seal-gray-500/<N>` | Opacity préservée |
| `border-taupe` | `border-seal-gray-500` | |
| `border-taupe/10` à `border-taupe/90` | `border-seal-gray-500/<N>` | |

Les variantes de préfixes Tailwind (avant `text-taupe`) sont préservées :

| Pattern legacy | Pattern cible |
| --- | --- |
| `hover:text-taupe` | `hover:text-seal-gray-500` |
| `focus:text-taupe` | `focus:text-seal-gray-500` |
| `focus-visible:text-taupe` | `focus-visible:text-seal-gray-500` |
| `dark:text-taupe` | `dark:text-seal-gray-500` |
| `group-hover:text-taupe` | `group-hover:text-seal-gray-500` |
| `md:text-taupe`, `lg:…`, `sm:…` | idem |
| `placeholder:text-taupe` | `placeholder:text-seal-gray-500` |
| Chaînage `md:hover:text-taupe` etc. | Préservé |

## 3. Cas explicitement **non migrés** (flaggés ambigus pour session 2)

| Pattern | Raison |
| --- | --- |
| `text-navy`, `text-navy/XX` | Ambiguïté navy OMNITECH vs seal-blue — revue designer |
| `bg-navy`, `bg-navy/XX` | Idem |
| `border-navy`, `border-navy/XX` | Idem |
| `from-navy`, `to-navy`, `via-navy`, `ring-navy` | Idem (gradients / ring — session 2) |
| `bg-taupe`, `bg-taupe/XX` | Pas d'équivalent clair en seal-gray (background) |
| `dark:text-navy` et variantes | Dépend de la décision navy |
| Classes hors préfixes scopés (`decoration-navy`, `accent-navy`, etc.) | Hors regex inventaire — session 2 si présents |

## 4. Règles d'application (script)

1. Le script **remplace uniquement `taupe`** (text/border), pas `navy`.
2. **Refuse `bg-taupe`** (flaggé ambigu — pas d'équivalent semantic direct).
3. Préserve toute opacity `/N` (regex capture le segment).
4. Préserve tout préfixe Tailwind (`hover:`, `dark:`, `focus:`, `group-hover:`, breakpoints, `placeholder:`…).
5. Ne touche **aucun fichier** `.css`, `.mdx`, `.md`, `.json` (les variables CSS `--color-taupe` / `--color-navy` dans `globals.css` restent).
6. **Refuse** les matches à l'intérieur d'une chaîne dynamique type `classNames[\`text-${color}\`]` — si détecté (pattern `${`, `text-${`), on flagge ambigü.
7. Dry-run par défaut. `--apply` requis pour écrire.
8. Écrit un diff lisible par fichier dans la sortie dry-run.

## 5. Cible quantitative de la session 1

Classes migrables automatiquement (calcul depuis `seal-migration-scope.md`) :

| Classe | Occurrences |
| --- | ---: |
| `text-taupe` | 1507 |
| `text-taupe/40` | 23 |
| `text-taupe/70` | 22 |
| `text-taupe/60` | 21 |
| `text-taupe/30` | 17 |
| `text-taupe/20` | 4 |
| `text-taupe/50` | 2 |
| `text-taupe/80` | 1 |
| `border-taupe/30` | 5 |
| `border-taupe` | 1 |
| **Total taupe trivialement migrable** | **≈ 1603** |

Sur 2 850 occurrences totales → cible **≈ 56 %** de la dette migrée en session 1 (cas "sans ambiguïté").

Reste pour session 2 (à arbitrer humainement) :
- `navy` famille : ~1 241 occurrences (text/bg/border/from/via/ring)
- `bg-taupe` : 6 occurrences
- Appels dynamiques éventuels (détectés par le script)

## 6. Impact CSS / tokens

Aucune modification des tokens Tailwind ou des variables CSS `--color-*` / `--seal-*` en session 1. Les fichiers `globals.css` et `tailwind.config.ts` restent **intacts**.

## 7. Rollback

Chaque batch de migration est un commit distinct (`chore(seal): migrate <contexte> taupe → seal-gray-500`). Rollback facile via `git revert <sha>`.
