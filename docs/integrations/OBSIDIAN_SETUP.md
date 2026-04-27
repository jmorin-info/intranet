# Obsidian — Synchroniser ton vault avec l'intranet

> Procédure concrète pour configurer le plugin **Remotely Save**
> et sync ton vault Obsidian local avec les pages wiki de l'intranet
> via WebDAV.
>
> Temps estimé : **5-10 minutes**.

## 1. Pré-requis

- Compte intranet OMNITECH (URL : `https://intranet.omnitech-security.fr`)
- Obsidian installé sur ton poste
- Plugin **Remotely Save** (community plugin)

---

## 2. Générer un token WebDAV (côté intranet)

Le token sert de mot de passe pour Obsidian. Il est affiché **une seule fois**
— note-le bien dans ton gestionnaire de mots de passe.

### Option A — via l'API (rapide, ligne de commande)

Tu dois d'abord avoir un token JWT (le cookie `accessToken` quand tu es
connecté à l'intranet). Le plus simple :

1. Connecte-toi à `https://intranet.omnitech-security.fr` dans ton navigateur.
2. Ouvre les DevTools (F12) → onglet **Application** → **Cookies** →
   copie la valeur du cookie `accessToken`.
3. Lance :

```bash
curl -X POST https://intranet.omnitech-security.fr/api/v1/users/me/webdav-token \
  -H "Cookie: accessToken=<COLLE_TON_TOKEN_ICI>" \
  -H "Content-Type: application/json" \
  -d '{"label": "Obsidian — MacBook"}' | jq
```

La réponse contient :

```json
{
  "token": "abc123...XYZ",        // ← le password Basic à utiliser dans Obsidian
  "id": "uuid",
  "expiresAt": "2027-04-27T...",
  "url": "/api/v1/webdav/obsidian/8902d63b-f23a-4db0-a7b0-ae3b6ece902b/",
  "username": "jmorin@omnitech-security.fr"
}
```

### Option B — via l'UI (à venir)

Une page dédiée `/profile/integrations/webdav` est prévue v1.2 — pour
l'instant, l'option A est la voie unique.

---

## 3. Installer le plugin Remotely Save

1. Obsidian → **Settings** (⚙) → **Community plugins** → **Browse**.
2. Cherche **Remotely Save** (auteur : fyears).
3. Installe + Active.
4. Settings → **Remotely Save** apparaît dans la liste.

---

## 4. Configurer la connexion WebDAV

Dans **Settings → Remotely Save** :

| Champ                       | Valeur                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- |
| **Choose a remote service** | `WebDAV`                                                                              |
| **Server address**          | `https://intranet.omnitech-security.fr/api/v1/webdav/obsidian/<TON_USER_ID>/`         |
| **Username**                | `jmorin@omnitech-security.fr` (ton email intranet)                                    |
| **Password**                | le `token` retourné à l'étape 2                                                       |
| **Authentication type**     | `Basic`                                                                               |
| **Depth header**            | `1` (laisser par défaut)                                                              |

**Ton URL exacte** (pour ton compte) :
```
https://intranet.omnitech-security.fr/api/v1/webdav/obsidian/8902d63b-f23a-4db0-a7b0-ae3b6ece902b/
```

Clique sur **Check Connectivity** → doit afficher ✅ "Connection succeeded".

---

## 5. Premier sync

1. Toujours dans Remotely Save, clique sur **Sync Now**.
2. Le plugin télécharge les pages wiki de l'intranet (auteur = toi)
   sous forme de fichiers `.md` dans ton vault Obsidian.
3. Structure de dossier reproduit la catégorie de chaque page :
   ```
   Vault Obsidian/
   ├── procedures/
   │   ├── ma-procedure.md
   │   └── ...
   ├── runbooks/
   │   └── ...
   └── notes-rssi/
       └── ...
   ```

Chaque fichier `.md` contient un **frontmatter YAML** avec les métadonnées
(`title`, `slug`, `category`, `createdAt`, `updatedAt`) — **ne le supprime
pas**, il est utilisé pour la sync inverse.

---

## 6. Sync bidirectionnel — comment ça marche

À chaque **Sync Now** :

| Action côté Obsidian        | Effet côté intranet                                              |
| --------------------------- | ---------------------------------------------------------------- |
| Tu crées un nouveau `.md`   | Une `WikiPage` est créée (auteur = toi, slug auto-généré)        |
| Tu modifies un `.md`        | La page est mise à jour ; ancienne version snapshotée            |
| Tu supprimes un `.md`       | La page est soft-deleted (récupérable côté admin)                |
| Tu déplaces vers un dossier | La `category` de la page change                                  |
| Une page est modifiée intra | Le `.md` local est mis à jour à la prochaine sync                |

**Conflits** : last-write-wins en MVP. Avant d'écraser la version DB,
l'ancienne est snapshotée dans `WikiPageVersion` (tu peux la rollback
depuis l'UI wiki).

**Auto-sync** : tu peux activer **Auto sync** dans Remotely Save (recommandé :
toutes les 5 minutes).

---

## 7. Limites actuelles (v1.1)

- Seules **tes pages** (où tu es l'auteur) sont visibles via WebDAV.
  Les pages partagées par d'autres collègues restent uniquement sur
  l'intranet — pas exposées dans ton vault.
- Pas de support des **pièces jointes** (images dans `/uploads/wiki/*`).
  Garde-les sur l'intranet directement.
- Pas d'expansion des **liens wiki Obsidian** `[[slug]]` — ils restent en
  texte brut à l'intranet (à enrichir v1.4).
- Profondeur d'arborescence : **un niveau de catégorie max**. Sous-dossiers
  dans des sous-dossiers Obsidian seront aplaties.

---

## 8. Sécurité — bonnes pratiques

- **Token = mot de passe** — ne jamais commit dans un repo, ne jamais
  partager. Si compromis : voir étape 9 (révocation).
- Le token est hashé SHA-256 côté serveur (jamais stocké en clair).
- Toute opération (PUT, DELETE, MOVE, COPY) est **tracée dans les audit
  logs** (`WEBDAV_FILE_*`) — accessibles par l'admin.
- Token avec une durée de vie de **1 an** par défaut.
- L'URL contient ton `userId` mais c'est l'auth Basic (token) qui protège
  — un autre user ne peut pas lire ton vault même s'il connaît ton ID.

---

## 9. Révoquer un token (en cas de fuite ou changement de poste)

```bash
# Lister tes tokens actifs
curl https://intranet.omnitech-security.fr/api/v1/users/me/webdav-token \
  -H "Cookie: accessToken=<JWT>"

# Révoquer un token spécifique
curl -X DELETE \
  https://intranet.omnitech-security.fr/api/v1/users/me/webdav-token/<TOKEN_ID> \
  -H "Cookie: accessToken=<JWT>"

# Tout révoquer en une fois (panique button)
curl -X DELETE \
  https://intranet.omnitech-security.fr/api/v1/users/me/webdav-token \
  -H "Cookie: accessToken=<JWT>"
```

Toute requête WebDAV avec un token révoqué retourne `401 Unauthorized`.

---

## 10. Troubleshooting

| Symptôme                            | Cause probable                              | Fix                                                    |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `401 Unauthorized` au check         | Token expiré ou révoqué                     | Régénérer un token (étape 2)                           |
| `403 Forbidden: vault scope mismatch` | userId dans l'URL ≠ userId du token         | Vérifier que l'URL contient ton bon userId             |
| `400 Path traversal denied`         | Tentative de `..` ou `\\` dans un chemin    | Renomme le fichier sans ces caractères                 |
| Sync très lente la première fois    | Tous les vault `.md` téléchargés            | Normal. Les sync suivantes ne touchent que les diffs.  |
| Plugin ne voit rien                 | URL ne finit pas par `/`                    | Ajouter `/` final à l'URL                              |
| Conflit non résolu                  | Edit simultané intra + Obsidian             | Snapshot dans `WikiPageVersion`, restore manuel        |

---

## 11. Référence technique

- Spec complète : [`docs/integrations/OBSIDIAN_SYNC.md`](./OBSIDIAN_SYNC.md)
- Schéma DB : `WebDAVToken` (token hashé), `WikiPage` (mapping vault).
- Verbes WebDAV supportés : `OPTIONS`, `PROPFIND`, `PROPPATCH`, `MKCOL`,
  `GET`, `HEAD`, `PUT`, `DELETE`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`.
- Plugin Remotely Save : https://github.com/remotely-save/remotely-save
