# GED intranet ↔ SharePoint — Synchronisation

> **Statut** : Phase 1 (foundation) déployée. Phase 2 (build) en cours.
> Le service `SharePointSyncService` se charge mais n'effectue **aucun appel
> Graph** tant que `GED_SHAREPOINT_SYNC_ENABLED=true` n'est pas positionné.

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

| Approche | Adoptée | Pourquoi |
|---|---|---|
| **Référence-only** (mode A : intranet stocke métadonnées + lien SharePoint) | ✅ documents standards | Simple, conflits = 0, pas de stockage doublé |
| **Pull partiel** (mode B : copie locale du PDF pour signature) | ✅ chartes & formulaires obligatoires | Signature électronique inline (Charte) doit pouvoir servir le fichier |
| **Bidirectionnel** | ❌ | Conflits, complexité, hors scope V1 |

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

1. Dans **Microsoft Entra Admin Center** → *Applications d'entreprise* →
   *Inscription d'application* → **Nouvelle inscription** :
   - Nom : `OMNITECH Intranet SharePoint Sync`
   - Compte pris en charge : *Locataire unique* (votre tenant)
   - URI de redirection : *(aucune — c'est de l'app-only)*

2. Dans l'app inscrite → **Autorisations d'API** → *Ajouter* → *API Microsoft Graph*
   → **Autorisations d'application** (pas déléguées) :
   - `Sites.Read.All`
   - `Files.Read.All`
   - *(optionnel)* `Sites.Selected` si vous voulez restreindre à un site spécifique
   - **Cliquez « Consentement administrateur »** pour les valider

3. Dans **Certificats et secrets** → *Nouveau secret client* → notez la
   valeur (visible une seule fois) — c'est `SP_CLIENT_SECRET`.

4. Notez aussi :
   - `SP_TENANT_ID` (onglet *Vue d'ensemble* → ID de répertoire)
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

| Dossier SharePoint | DocumentCategory intranet | DocumentLevel |
|---|---|---|
| `01 - Politiques` | `POLICY` | `GOVERNANCE` |
| `02 - Procédures` | `PROCEDURE` | `OPERATIONAL` |
| `03 - Chartes` | `CHARTER` | `COMMUNICATION` |
| `04 - Plans` | `PLAN` | `GOVERNANCE` |
| `05 - Organisations` | `ORGANIZATION` | `GOVERNANCE` |
| `06 - Registres` | `REGISTRY` | `EVIDENCE` |
| `07 - Formulaires` | `FORM` | `EVIDENCE` |
| `08 - Guides` | `GUIDE` | `OPERATIONAL` |
| `09 - Standards` | `STANDARD` | `OPERATIONAL` |
| `10 - Instructions` | `INSTRUCTION` | `OPERATIONAL` |
| `11 - Communications` | `COMMUNICATION` | `COMMUNICATION` |
| `12 - Rapports` | `REPORT` | `EVIDENCE` |
| autres | `OTHER` | `EVIDENCE` |

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

| SharePoint « Classification » | Document.classification |
|---|---|
| `Niveau 1 — Très sensible` | `SECRET` |
| `Niveau 2 — Sensible` | `CONFIDENTIEL` |
| `Niveau 3 — Restreint` ou absent | `INTERNE` (défaut POL_015 §5) |
| `Niveau 4 — Public` | `PUBLIC` |

## 6. Déclenchement manuel

Endpoints exposés (SUPER_ADMIN / ADMIN uniquement) :

| Méthode | Endpoint | Effet |
|---|---|---|
| `GET` | `/api/v1/admin/sharepoint/status` | `{ enabled, configured, lastSyncAt? }` |
| `GET` | `/api/v1/admin/sharepoint/libraries/:siteId` | Liste les bibliothèques (drives) du site |
| `POST` | `/api/v1/admin/sharepoint/sync` body `{ siteId, libraryId }` | Lance un pull → renvoie `{ created, updated, skipped, errors }` |

## 7. Cron (V2, hors scope foundation)

Pour automatiser : ajouter un `@nestjs/schedule` `@Cron('0 */2 * * *')` dans
`sharepoint-sync.service.ts` (toutes les 2h) qui itère sur les bibliothèques
configurées et appelle `syncLibrary`. Cf. pattern existant
`apps/backend/src/rag/rag-reindex.scheduler.ts`.

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
