# GED intranet ↔ SharePoint — Synchronisation

> **Statut** : Déployé en prod le 2026-06-13 (migration `20260613000000_pol015_pro040_reg016_alignment`
> appliquée, services redémarrés, endpoints joignables). Le module est **feature-flagged** :
> `SharePointSyncService` se charge mais n'effectue **aucun appel Graph** tant que
> `GED_SHAREPOINT_SYNC_ENABLED=true` n'est pas positionné dans `/root/omnitech-intranet/.env`
> (état par défaut actuel : flag absent ⇒ inactif).

## 1. Pourquoi cette intégration ?

Le **Registre Documentaire SMSI (REG_016)** maintenu sur SharePoint est la
source de vérité administrative des documents ISO 27001 d'OMNITECH. Les
fichiers (`.docx`, `.pdf`) vivent dans des bibliothèques SharePoint
structurées (« 03 - Chartes », « 07 - Formulaires/00 - Modèles vierges »…)
alignées sur la colonne `Q. Localisation (dossier)` de REG_016.

L'intranet OMNITECH apporte la couche **opérationnelle** : workflows
d'approbation, signatures électroniques, notifications, audit ISO, RAG
sémantique. Au lieu de dupliquer les fichiers, la synchronisation lit
SharePoint comme source et matérialise les **métadonnées** + un **lien
canonique** dans `Document.externalStorageUrl`.

| Approche                                                                    | Adoptée                               | Pourquoi                                                              |
| --------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| **Référence-only** (mode A : intranet stocke métadonnées + lien SharePoint) | ✅ documents standards                | Simple, conflits = 0, pas de stockage doublé                          |
| **Pull partiel** (mode B : copie locale du PDF pour signature)              | ✅ chartes & formulaires obligatoires | Signature électronique inline (Charte) doit pouvoir servir le fichier |
| **Bidirectionnel**                                                          | ❌                                    | Conflits, complexité, hors scope V1                                   |

## 2. Architecture

```
                       ┌─────────────────────┐
                       │   Microsoft Graph   │
                       │  (graph.microsoft.com)
                       └──────────┬──────────┘
                                  │ OAuth 2.0
                                  │ client_credentials (app-only)
                                  │ scopes : Sites.Read.All, Files.Read.All
                                  ▼
            ┌────────────────────────────────────────┐
            │   apps/backend/src/sharepoint/         │
            │   SharePointSyncService                │
            │   ─────────────────────                │
            │  • getAppAccessToken()  (cache 50min)  │
            │  • listLibraryFiles(siteId, libId)     │
            │  • syncLibrary(...)                    │
            │  • mapDriveItemToDocument(...)         │
            └───────────────────┬────────────────────┘
                                │ Prisma
                                ▼
                       ┌────────────────────┐
                       │   Document         │
                       │ (PostgreSQL)       │
                       │ + REG_016 columns  │
                       │ + externalStorage* │
                       └────────────────────┘
```

Le pattern OAuth réutilise la mécanique éprouvée de
`apps/backend/src/calendar/outlook-sync.service.ts` (synchronisation
Outlook), avec une différence clé : **app-only** (client credentials)
au lieu d'OAuth utilisateur, parce que la sync est un job serveur sans
session interactive.

## 3. Configuration

### 3.1 Préparer le tenant Azure / Microsoft 365

1. Dans **Microsoft Entra Admin Center** → _Applications d'entreprise_ →
   _Inscription d'application_ → **Nouvelle inscription** :
   - Nom : `OMNITECH Intranet SharePoint Sync`
   - Compte pris en charge : _Locataire unique_ (votre tenant)
   - URI de redirection : _(aucune — c'est de l'app-only)_

2. Dans l'app inscrite → **Autorisations d'API** → _Ajouter_ → _API Microsoft Graph_
   → **Autorisations d'application** (pas déléguées) :
   - `Sites.Read.All`
   - `Files.Read.All`
   - _(optionnel)_ `Sites.Selected` si vous voulez restreindre à un site spécifique
   - **Cliquez « Consentement administrateur »** pour les valider

3. Dans **Certificats et secrets** → _Nouveau secret client_ → notez la
   valeur (visible une seule fois) — c'est `SP_CLIENT_SECRET`.

4. Notez aussi :
   - `SP_TENANT_ID` (onglet _Vue d'ensemble_ → ID de répertoire)
   - `SP_CLIENT_ID` (ID d'application client)

### 3.2 .env de l'intranet

Ajoutez dans `/root/omnitech-intranet/.env` :

```env
# === SharePoint GED Sync (POL_015 §7 + REG_016) ===
# Si false (ou absent) : le module se charge mais n'appelle pas Graph.
GED_SHAREPOINT_SYNC_ENABLED=true

# OAuth 2.0 application (Entra ID / Azure AD)
SP_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SP_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SP_CLIENT_SECRET=secret-genere-cote-entra

# (Optionnel) Site SharePoint par défaut au format graph
# Ex. omnitech-security.sharepoint.com,GUID,GUID
SP_DEFAULT_SITE_ID=
```

Puis : `systemctl restart omnitech-backend.service`

## 4. Mapping bibliothèques SharePoint ↔ catégories intranet

Le champ `externalStoragePath` de `Document` correspond à la colonne
`Q. Localisation (dossier)` de REG_016 (ex. « 03 - Chartes »).

Lors d'un sync, `mapDriveItemToDocument()` essaie de matcher :

| Dossier SharePoint    | DocumentCategory intranet | DocumentLevel   |
| --------------------- | ------------------------- | --------------- |
| `01 - Politiques`     | `POLICY`                  | `GOVERNANCE`    |
| `02 - Procédures`     | `PROCEDURE`               | `OPERATIONAL`   |
| `03 - Chartes`        | `CHARTER`                 | `COMMUNICATION` |
| `04 - Plans`          | `PLAN`                    | `GOVERNANCE`    |
| `05 - Organisations`  | `ORGANIZATION`            | `GOVERNANCE`    |
| `06 - Registres`      | `REGISTRY`                | `EVIDENCE`      |
| `07 - Formulaires`    | `FORM`                    | `EVIDENCE`      |
| `08 - Guides`         | `GUIDE`                   | `OPERATIONAL`   |
| `09 - Standards`      | `STANDARD`                | `OPERATIONAL`   |
| `10 - Instructions`   | `INSTRUCTION`             | `OPERATIONAL`   |
| `11 - Communications` | `COMMUNICATION`           | `COMMUNICATION` |
| `12 - Rapports`       | `REPORT`                  | `EVIDENCE`      |
| autres                | `OTHER`                   | `EVIDENCE`      |

Le mapping est codé dans `sharepoint-sync.service.ts` (constante
`PATH_TO_CATEGORY`) ; ajustez si la nomenclature de votre bibliothèque
SharePoint diffère.

## 5. Politique POL_015 §7.1 et marquage SharePoint

Les fichiers issus de SharePoint **doivent** porter la classification :

- Pied de page du `.docx` : « Classification : Niveau X — Libellé »
  (cf. helper `getDocumentMarking()` côté frontend)
- Métadonnée SharePoint colonne « Classification » : valeur canonique
  « Niveau X — Libellé » (alignée sur la colonne G de REG_016).

Le sync intranet **lit** cette métadonnée et la **mappe** vers le champ
`Document.classification` (string enum DB) :

| SharePoint « Classification »    | Document.classification       |
| -------------------------------- | ----------------------------- |
| `Niveau 1 — Très sensible`       | `SECRET`                      |
| `Niveau 2 — Sensible`            | `CONFIDENTIEL`                |
| `Niveau 3 — Restreint` ou absent | `INTERNE` (défaut POL_015 §5) |
| `Niveau 4 — Public`              | `PUBLIC`                      |

## 6. Déclenchement manuel

Endpoints exposés (SUPER_ADMIN / ADMIN uniquement) :

| Méthode | Endpoint                                                     | Effet                                                           |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `GET`   | `/api/v1/admin/sharepoint/status`                            | `{ enabled, configured, lastSyncAt? }`                          |
| `GET`   | `/api/v1/admin/sharepoint/libraries/:siteId`                 | Liste les bibliothèques (drives) du site                        |
| `POST`  | `/api/v1/admin/sharepoint/sync` body `{ siteId, libraryId }` | Lance un pull → renvoie `{ created, updated, skipped, errors }` |

## 7. Cron de synchronisation automatique

La synchronisation périodique est gérée par
`apps/backend/src/sharepoint/sharepoint-sync.scheduler.ts`
(`SharePointSyncScheduler`). Elle s'exécute **toutes les 2 heures**
(expression cron `0 */2 * * *`, fuseau `Europe/Paris`) et itère sur une
liste de cibles `(siteId, libraryId)` lue dans une variable d'env.

### 7.1 Variables d'environnement

| Variable                      | Obligatoire        | Effet                                                                                                                                                                                                             |
| ----------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GED_SHAREPOINT_SYNC_ENABLED` | oui                | Flag global du module SharePoint. Si absent ou `false`, le module ne fait rien (cron et endpoints manuels désactivés).                                                                                            |
| `SP_AUTO_SYNC_ENABLED`        | oui (pour le cron) | Flag **dédié au cron**. Permet de désactiver le cron tout en gardant la sync manuelle disponible (utile en debug ou pendant un incident SharePoint). Doit être `true` pour que le cron tourne.                    |
| `SP_AUTO_SYNC_TARGETS`        | oui (pour le cron) | Liste des bibliothèques à synchroniser, au format `siteId1:libraryId1,siteId2:libraryId2,...`. Les entrées malformées sont loggées en warning et ignorées. Si vide ou absente, le cron loggue un warning et sort. |

Le cron applique le ET logique : `GED_SHAREPOINT_SYNC_ENABLED=true`
**ET** `SP_AUTO_SYNC_ENABLED=true` **ET** `SP_AUTO_SYNC_TARGETS` non vide.

### 7.2 Trouver `siteId` et `libraryId`

1. Le `siteId` au format Graph (`hostname,siteCollectionGuid,siteGuid`)
   est obtenu via `GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{path}`
   ou via l'admin Center SharePoint. Vous pouvez aussi le récupérer depuis
   le `.env` (`SP_DEFAULT_SITE_ID`) si vous l'avez déjà saisi à l'étape 3.2.
2. Pour le `libraryId` (driveId), appelez l'endpoint admin intranet :
   ```
   GET /api/v1/admin/sharepoint/libraries/:siteId
   Authorization: Bearer <JWT_ADMIN_OU_SUPER_ADMIN>
   ```
   La réponse liste les drives (`id`, `name`, `webUrl`). L'`id` retourné
   est exactement la valeur à utiliser comme `libraryId` dans
   `SP_AUTO_SYNC_TARGETS`.

### 7.3 Exemple complet

Dans `/root/omnitech-intranet/.env` :

```env
# Flag global (sect. 3.2)
GED_SHAREPOINT_SYNC_ENABLED=true

# Cron auto toutes les 2h
SP_AUTO_SYNC_ENABLED=true

# Deux bibliothèques : « Documents SMSI » et « Chartes »
SP_AUTO_SYNC_TARGETS=omnitech.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222:b!AAAA...drive1...,omnitech.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222:b!BBBB...drive2...
```

> ⚠️ Les `siteId` au format Graph contiennent des virgules ; collez la
> ligne entière sans retour à la ligne. Le parseur split sur la **première**
> `,` de séparation entre cibles n'est pas suffisant : préférez utiliser
> des `siteId` simples (GUID seul, accepté par Graph pour les sites
> connus) si vous configurez plusieurs cibles. Format alternatif accepté :
> `<siteGuid>:<driveId>,<siteGuid>:<driveId>`.

Puis :

```bash
systemctl restart omnitech-backend.service
```

### 7.4 Logs et audit

À chaque tick (toutes les 2h), le scheduler loggue :

```
sharepoint.sync.cron.start — N cible(s)
sharepoint.sync.cron.done — Xms, targets=N ok=K failed=F updated=U skipped=S unmapped=Un errors=E
```

Chaque appel `syncLibrary` génère par ailleurs son propre `AuditLog`
`SHAREPOINT_SYNC` (cf. section 8). Le cron passe `triggeredBy=undefined`,
donc l'AuditLog est rattaché à `userId=null` (convention projet pour les
actions système, cf. `audit.service.ts`).

Une cible en échec **ne bloque pas** les autres (try/catch par cible).
Pour désactiver temporairement le cron sans désactiver tout le module :

```bash
sed -i 's/^SP_AUTO_SYNC_ENABLED=true/SP_AUTO_SYNC_ENABLED=false/' \
  /root/omnitech-intranet/.env
systemctl restart omnitech-backend.service
```

## 8. Audit ISO

Chaque opération `syncLibrary` génère une entrée `AuditLog` :

- `action` : `SHAREPOINT_SYNC`
- `resourceType` : `SharePointLibrary`
- `metadata` : `{ siteId, libraryId, durationMs, created, updated, skipped, errors }`
- `severity` : `INFO` si errors=0, `WARN` sinon.

Cela couvre A.5.33 (Protection des informations documentées) — la traçabilité
des sources externes intégrées au SMSI.

## 9. Rollback

Le module est entièrement feature-flagged :

```bash
sed -i 's/^GED_SHAREPOINT_SYNC_ENABLED=true/GED_SHAREPOINT_SYNC_ENABLED=false/' \
  /root/omnitech-intranet/.env
systemctl restart omnitech-backend.service
```

Les Documents déjà synchronisés gardent leurs `externalStorage*` (les liens
SharePoint restent valides), mais aucun nouveau pull n'est déclenché.

## 10. Sécurité

- Le `SP_CLIENT_SECRET` est stocké dans `.env` (chmod 600). Aucune rotation
  automatique pour la V1 — à planifier ANSSI R31.
- Le scope `Files.Read.All` est large ; restreindre via `Sites.Selected` +
  consentement explicite sur les sites concernés est recommandé pour
  certification ISO 27001 A.5.15 (contrôle d'accès).
- Pas de droit `Sites.ReadWrite` demandé → pas d'écriture possible vers
  SharePoint (cohérent avec mode A « Référence-only »).

## 11. Voir aussi

- `POL_015_POL_013` — Politique de classification, marquage et transfert
- `PRO_040` — Gestion des informations documentées
- `REG_016` — Registre Documentaire SMSI (fichier xlsx maître)
- `apps/backend/src/calendar/outlook-sync.service.ts` — pattern OAuth Graph existant
- `apps/backend/src/sharepoint/` — code de la sync
- `apps/frontend/src/app/(app)/admin/registre/page.tsx` — vue REG_016 intranet
