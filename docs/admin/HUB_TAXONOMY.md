# Hub Admin — Taxonomie cible

> **Statut** : proposition cible v1 — réorganisation du hub `/admin` en 4 sections thématiques.
> **Contexte** : voir [`docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md`](../audit/INTRANET_FEATURE_AUDIT_v1.0.md) (§0 quick win #8, §1.3 Module 12).
> **Objectif** : réduire la charge cognitive du hub Admin (17 items à plat → 4 sections de 4-6 items), supprimer les doublons (`audit-log`/`audit-timeline` → `/admin/audit`), et retirer l'outil dev `dark-mode-audit`.

---

## Pourquoi 4 sections ?

Le hub Admin actuel empile 17 items sans regroupement visuel clair, avec des icônes dupliquées (4× `Users`, 3× `ShieldAlert`). Regrouper en **4 sections thématiques** permet :

1. **Scan visuel en O(log n)** : l'utilisateur identifie la section en premier, puis l'item en second.
2. **Alignement mental aux rôles** : un ADMIN pense en termes de *domaines* (utilisateurs, conformité, contenu, infra), pas de liste à plat.
3. **Extension sans re-design** : ajouter une page admin = l'insérer dans la section qui la concerne, sans relayout.
4. **Cohérence avec les autres hubs** : le hub `work` regroupe déjà implicitement documents/procédures/wiki d'un côté, directory/files de l'autre.

---

## Les 4 sections

### A. Users & Access — Gestion humaine

Tout ce qui tourne autour des **identités, des rôles et des revues d'accès**. Frontières : ici on gère *qui* accède à *quoi*, mais pas les chartes qu'ils signent (cf. section C).

| Item | URL | Rôle min | Note |
|---|---|---|---|
| Utilisateurs | `/admin/users` | ADMIN | Comptes, rôles, import CSV |
| Départements | `/admin/departments` | ADMIN | Structure organisationnelle |
| Validation LDAP | `/admin/ldap-pending` | ADMIN | Badge live (comptes en attente) |
| Revue d'accès | `/admin/access-reviews` | SUPER_ADMIN | Campagnes ISO 27001 A.5.18 |
| Accès externes / Prestataires | `/admin/external-access` | ADMIN | Comptes temporaires tiers |
| Onboarding | `/admin/onboarding` | ADMIN | Parcours d'intégration (si feature flag actif) |

### B. Compliance & Audit — Conformité et traçabilité

Tout ce qui **prouve** que le SI est conforme : journaux, contrôles ISO, tableaux de bord RSSI, audits AD. Frontières : la *preuve* et le *contrôle* ; les *politiques elles-mêmes* (chartes, workflows) vont en section C.

| Item | URL | Rôle min | Note |
|---|---|---|---|
| Audit (unifié) | `/admin/audit` | ADMIN | **Nouveau** : onglets log + timeline |
| Conformité ISO | `/admin/compliance` | REVIEWER | Vue d'ensemble + onglets |
| Référentiels ISO | `/admin/compliance?tab=frameworks` | REVIEWER | Deep-link onglet existant |
| Contrôles ISO | `/admin/compliance?tab=controls` | REVIEWER | Deep-link onglet existant |
| Audit AD | `/admin/ad-audit` | ADMIN | Analyse Active Directory |
| Dashboard RSSI | `/admin/rssi-dashboard` | SUPER_ADMIN | Vue agrégée risques + audits |

### C. Content & Data — Politiques, contenus et exports

Tout ce qui est **contenu administré** et **extractions de données** : chartes signées, workflows de validation, rapports, exports IT, sauvegardes. Frontières : on gère *ce qui est produit* (docs) ou *ce qui est extrait* (rapports/backups), pas la plateforme elle-même (section D).

| Item | URL | Rôle min | Note |
|---|---|---|---|
| Chartes | `/admin/chartes` | ADMIN | Versions + campagnes signature |
| Signatures admin | `/admin/signatures` | ADMIN | Dashboard signatures DocuSeal |
| Workflows d'approbation | `/admin/workflows` | REVIEWER | Badge live (pending) |
| Rapports | `/admin/reports` | ADMIN | Exports analytiques |
| IT exports | `/admin/it-exports` | ADMIN | Veeam, autres sources infra |
| Sauvegardes | `/admin/backups` | SUPER_ADMIN | Jobs de backup |

### D. Infrastructure & Ops — Plateforme et système

Tout ce qui concerne **la plateforme technique** : configuration, santé, espaces/modules, certificats. Frontières : on configure ou on observe l'état *du système* lui-même.

| Item | URL | Rôle min | Note |
|---|---|---|---|
| Configuration système | `/admin/config` | SUPER_ADMIN | SMTP, matrice d'accès, paramètres globaux |
| Santé système | `/admin/system-health` | ADMIN | Status checks, pastille live |
| Spaces & modules | `/admin/spaces` | SUPER_ADMIN | Activation modules par espace/rôle |
| Certificats | `/admin/certificates` | ADMIN | Certifications utilisateurs (Award) |

---

## Items placés en autonomie

Quelques items du code existant n'étaient pas explicitement listés dans la brief initiale. Placement justifié :

| Item | Section retenue | Justification (≤ 1 ligne) |
|---|---|---|
| Validation LDAP (`/admin/ldap-pending`) | A · Users & Access | Suite de la création de compte — même domaine mental « identités ». |
| Workflows d'approbation (`/admin/workflows`) | C · Content & Data | Workflows s'appliquent à des *documents* (approbation) — domaine contenu. |
| Onboarding (`/admin/onboarding`) | A · Users & Access | Parcours d'intégration = cycle de vie d'un utilisateur. |
| Signatures admin (`/admin/signatures`) | C · Content & Data | Dashboard des signatures de contenus (chartes, procédures). |
| Sauvegardes (`/admin/backups`) | C · Content & Data | Backups = snapshot de **données** (pas de config système). Argument alternatif D valide ; on privilégie C car l'intérêt opérationnel est la récupération de contenu. |
| Certificats (`/admin/certificates`) | D · Infrastructure & Ops | Attestations de formation / habilitation — considéré « état de la plateforme vis-à-vis des utilisateurs » ; certaines habilitations déclenchent des accès techniques. |
| Dashboard RSSI (`/admin/rssi-dashboard`) | B · Compliance & Audit | Agrégat de métriques de conformité — fit naturel avec Audit. Il reste accessible depuis son hub rail dédié pour SUPER_ADMIN. |

## Items retirés de la sidebar

| Item | Raison |
|---|---|
| `/admin/audit-log` | Fusionné dans `/admin/audit` (onglet « Journal d'audit »). Redirect permanent 308 configuré. |
| `/admin/audit-timeline` | Fusionné dans `/admin/audit` (onglet « Chronologie »). Redirect permanent 308 configuré. |
| `/admin/dark-mode-audit` | Outil interne de dev, identifié comme tel dans l'audit — pas sa place dans un hub utilisateur. La page reste accessible directement par URL pour les devs. |

## Règles de placement

1. **Un item ne figure que dans UNE section** (pas de cross-listing).
2. **Deep-links onglet** (`/admin/compliance?tab=...`) comptent comme variantes du même item — ils sont exposés en sous-tuiles de la card parente, pas comme items indépendants.
3. **RBAC** : chaque item respecte le rôle min défini dans `route-registry.ts`. Les items masqués par rôle disparaissent de la card (pas juste grisés).
4. **Hub RSSI** conserve son rail dédié pour SUPER_ADMIN — la section B « Compliance & Audit » **duplique le lien** vers `/admin/rssi-dashboard` (c'est un raccourci, pas un doublon de navigation).

---

## Références

- [INTRANET_FEATURE_AUDIT_v1.0.md §0 quick win #8](../audit/INTRANET_FEATURE_AUDIT_v1.0.md)
- [INTRANET_FEATURE_AUDIT_v1.0.md quick win #10 — fusion audit-log/audit-timeline](../audit/INTRANET_FEATURE_AUDIT_v1.0.md)
- Charte SEAL : `/root/.claude/projects/-root/memory/seal_charter.md`
