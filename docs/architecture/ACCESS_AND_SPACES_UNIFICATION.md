# Access Matrix et Spaces — arbitrage d'unification

Contexte : `/admin/config` (onglet "Matrice des accès") et `/admin/spaces`
("Espaces & modules") semblent couvrir le même sujet (qui accède à quoi).
Ce document clarifie ce qu'ils font réellement, identifie les redondances et
propose trois options, avec recommandation.

## 1. État actuel

### 1.1 `/admin/config` — Matrice des accès

- UI : `apps/frontend/src/app/(app)/admin/config/page.tsx:2244-2437` — tableau
  28 modules × 8 rôles, cellules cliquables, CSV via `/config/access_matrix`.
- Modules listés (28) : `ACCESS_MODULES` à `page.tsx:194-223` (labels
  francisés — "Documents", "Veille", "Chartes", etc.).
- Rôles (8) : `ACCESS_ROLES` à `page.tsx:265-274` (SUPER_ADMIN → PRESTATAIRE).
- Matrice par défaut : `ACCESS_MATRIX` à `page.tsx:305-432` (hard-codée côté
  frontend).
- Persistance : sérialise un `Record<role, string[]>` dans la table générique
  `AppConfig` sous la clé `access_matrix` via
  `PATCH /config/access_matrix` (`apps/backend/src/config/config.controller.ts:85-93`).
- Backend consommateurs : **aucun**. `grep "access_matrix"` dans
  `apps/backend/src/` ne retourne que la route `AppConfig` générique. Aucun
  guard, aucun service n'utilise cette valeur pour autoriser quoi que ce soit.

Conclusion : c'est une **matrice documentaire**, utile pour la revue d'accès
(ISO 27001 A.5.15 / A.5.18) et la communication à l'auditeur, mais sans effet
fonctionnel sur le RBAC actif.

### 1.2 `/admin/spaces` — Espaces & modules

- UI : `apps/frontend/src/app/(app)/admin/spaces/page.tsx` (435 lignes).
  Deux tables : scope Global + 8 rôles, puis scope Département.
- Modules listés (34) : `AVAILABLE_MODULES` à
  `apps/backend/src/spaces/spaces.service.ts:9-52` — codes canoniques
  (`dashboard`, `tickets`, `veille`, …) groupés en 5 sections
  (`monEspace`, `work`, `security`, `admin`, `transverse`).
- Persistance : table `SpaceAccessConfig`
  (`packages/database/prisma/schema.prisma:1340-1352`), clé unique
  `(module, scopeType, scopeValue)`. 4 `scopeType` supportés : `GLOBAL`,
  `ROLE`, `DEPARTMENT`, `USER`.
- Endpoints : `apps/backend/src/spaces/spaces.controller.ts:21-58`
  - `GET /spaces/my-modules` : liste des modules visibles par l'utilisateur
    courant (consommée par la sidebar/layout).
  - `GET /spaces/modules` / `GET /spaces/configs` : admin.
  - `POST /spaces/configs` : upsert d'une règle (SUPER_ADMIN only).
- Logique d'agrégation : `SpacesService.getModulesForUser`
  (`spaces.service.ts:103-161`). Priorité des règles :
  `USER > ROLE > DEPARTMENT > GLOBAL`. Par défaut tous les modules sont
  actifs, `alwaysOn` verrouillés, `admin` toujours visible pour ADMIN+.

C'est le **vrai moteur RBAC de modules** : ce qui est désactivé ici disparaît
de la sidebar, la route reste techniquement accessible mais la navigation ne
l'expose plus.

### 1.3 Autres couches d'accès présentes (hors scope mais à connaître)

- `UserRole` + `@Roles()` : droits fins sur les endpoints (ex. CRUD sources
  de veille réservé à ADMIN). Base de tout le RBAC NestJS.
- `TicketSpaceMember` (`schema.prisma:715-734`) : RBAC **par espace de
  ticketing** (scope = rôle / département / user, permission = VIEWER →
  MANAGER). Indépendant de `SpaceAccessConfig`.
- `ExternalAccess`, `Department`, `UserDepartment` : ACLs métier.

## 2. Redondances identifiées

| Aspect              | `/admin/config` matrice          | `/admin/spaces`                           |
| ------------------- | -------------------------------- | ----------------------------------------- |
| Scope rôle          | Oui (8 rôles)                    | Oui (8 rôles)                             |
| Scope département   | Non                              | Oui                                       |
| Scope utilisateur   | Non                              | Oui (USER)                                |
| Source modules      | Liste FR hard-codée (28)         | `AVAILABLE_MODULES` canonique (34)        |
| Impact RBAC runtime | **Aucun** (vitrine)              | Effectif (sidebar, navigation)            |
| Persistance         | `AppConfig.access_matrix` (JSON) | `SpaceAccessConfig` (relationnel, indexé) |
| Audience cible      | RSSI / auditeur ISO              | Admin/SUPER_ADMIN opérationnel            |

Redondance réelle : **la dimension rôle × module est dupliquée**. Les listes
de modules diffèrent (28 vs 34) et les labels ne matchent pas ("Veille" vs
`veille`, "Outils PDF" vs `tools`), ce qui rend impossible une comparaison
directe pour un admin.

Source probable du doublon : la matrice de `/admin/config` pré-existait avant
l'introduction de `SpaceAccessConfig` (cf. commentaire "Configuration per-
module access rules" dans le schéma Prisma), et a été conservée comme
référentiel documentaire sans être branchée.

## 3. Options

### Option A — Statu quo avec documentation explicite

Garder les deux pages, clarifier les rôles :

- Renommer l'onglet matrice en "Matrice de référence (audit ISO 27001)".
- Ajouter un bandeau en haut de `/admin/spaces` qui pointe vers la matrice :
  « Pour exporter la vue audit/ISO, consultez /admin/config#matrix ».
- Aligner les 28 modules de la matrice FR sur les 34 codes de
  `AVAILABLE_MODULES` (mapping 1-1 via un fichier partagé).
- Ajouter un badge "Lecture seule — documentaire" sur la matrice.

Effort : **1 jour** (remapping modules + textes). Risque : faible. Impact
users : faible.

### Option B — Fusion dans `/admin/access` avec 3 onglets

Une seule page, trois onglets :

1. **Rôles** : matrice rôle × module (lit/écrit `SpaceAccessConfig` scope=ROLE).
2. **Départements** : matrice département × module (scope=DEPARTMENT).
3. **Utilisateurs** : override par utilisateur (scope=USER).

Supprimer `/admin/config#access_matrix` (ou rediriger). Supprimer la table
logique `AppConfig.access_matrix`. Garder la section "Matrice lecture seule"
dans `/admin/config` comme **export/print** générée depuis
`SpaceAccessConfig` (une seule source de vérité).

Effort : **3-4 jours**

- 1 j unification modèle modules (label FR ↔ code canonique).
- 1 j refonte page `/admin/access` (réutilise les tables existantes).
- 0,5 j migration Prisma + script de conversion de l'ancien
  `AppConfig.access_matrix` vers `SpaceAccessConfig`.
- 0,5-1 j tests + doc admin.

Risque : moyen (migration data, changement d'URL sidebar). Impact users :
moyen (un seul endroit à connaître — gain long terme).

### Option C — Refonte unifiée "Policy"

Modèle `AccessPolicy` unique : `{ subject, action, resource, effect, condition }`
façon OPA/Rego, avec évaluation en cascade. Remplace `SpaceAccessConfig`,
`TicketSpaceMember`, la matrice, et prépare une évolution ABAC (attribute-
based) pour l'AI Act et NIS2 (contrôles conditionnels type "accès document
Secret uniquement si MFA active depuis <30 min").

Effort : **10-15 jours**

- 3 j modélisation + migration.
- 4 j refonte backend (evaluator, caching, tests).
- 3 j UI policy editor (grille + DSL).
- 2-3 j migration données + QA.

Risque : élevé (touche le cœur de l'autorisation). Impact users : fort —
nécessite formation admin. Non justifié à court terme pour 8 rôles + 34
modules ; pertinent si OMNITECH monte à >50 rôles ou multi-tenant.

## 4. Recommandation

**Option B** (fusion `/admin/access` 3 onglets).

Justification :

- Élimine la confusion utilisateur (un seul endroit pour le RBAC modules).
- Unique source de vérité : `SpaceAccessConfig`. La matrice "ISO" devient un
  export généré, plus un état à maintenir en double.
- Coût raisonnable (3-4 j) pour un gain permanent en maintenance.
- Garde la matrice visuelle que l'auditeur attend (même rendu, autre source).
- Ne nécessite aucune refonte du modèle d'autorisation (Option C peut être
  faite plus tard sans rework).

Séquencement proposé :

1. **Semaine 1** : mapping code ↔ label FR + migration `access_matrix` →
   `SpaceAccessConfig` (lecture seule côté UI pendant 1 sprint).
2. **Semaine 2** : nouvelle route `/admin/access`, suppression progressive de
   l'ancien composant, rewrite docs RSSI.
3. **Décommission** : retirer la clé `AppConfig.access_matrix` après
   vérification auditée (changelog + entrée audit log).

## 5. Couverture ISO 27001 par option

| Contrôle | Objet                                 | Option A                       | Option B                    | Option C                   |
| -------- | ------------------------------------- | ------------------------------ | --------------------------- | -------------------------- |
| A.5.15   | Contrôle d'accès (politique)          | Couvert (via matrice doc.)     | **Couvert (source vérité)** | **Couvert + ABAC**         |
| A.5.18   | Droits d'accès (attribution/révision) | Partiel (2 endroits à auditer) | **Couvert**                 | **Couvert**                |
| A.5.3    | Séparation des tâches                 | Partiel                        | **Couvert**                 | **Couvert**                |
| A.8.2    | Privilèges                            | Partiel                        | **Couvert**                 | **Couvert**                |
| A.8.3    | Accès à l'information                 | Partiel                        | **Couvert**                 | **Couvert + conditionnel** |
| A.5.36   | Conformité politiques internes        | Risque de dérive (2 sources)   | **Couvert**                 | **Couvert**                |

L'option A maintient un risque d'incohérence entre la matrice "vitrine" et le
comportement réel — écart factuel décrivant un contrôle qui n'est pas appliqué
(constat d'audit probable). L'option B le supprime.
