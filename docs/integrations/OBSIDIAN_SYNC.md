# Synchronisation Obsidian (WebDAV)

> Wave B — item 16. Statut : MVP last-write-wins.

OMNITECH expose un endpoint WebDAV qui mappe les pages wiki personnelles
de chaque utilisateur à un vault Obsidian Markdown. Une fois Obsidian
configuré avec le plugin **Remotely Save**, toutes les pages créées /
modifiées dans Obsidian sont propagées vers le wiki intranet, et inversement.

## 1. Architecture

| Côté Obsidian (vault local)              | Côté intranet (DB)                        |
|------------------------------------------|-------------------------------------------|
| `/<categorie>/<slug>.md`                 | `WikiPage` (filtré par `authorId = user`) |
| `---\ntitle: ...\nslug: ...\n---\n...`   | Frontmatter YAML → `title`, `slug`, ...   |
| Création / modification de fichier `.md` | `PUT /api/v1/webdav/obsidian/:userId/...` |
| Lecture (open file)                      | `GET /api/v1/webdav/obsidian/:userId/...` |
| Suppression                              | `DELETE /api/v1/webdav/obsidian/:userId/..`|

Le endpoint accepte les verbes WebDAV standards : `OPTIONS`, `PROPFIND`,
`PROPPATCH`, `MKCOL`, `GET`, `HEAD`, `PUT`, `DELETE`, `COPY`, `MOVE`,
`LOCK`, `UNLOCK`. Tous les chemins sont scopés au user authentifié — un
user ne peut pas lire ou modifier le vault d'un autre.

## 2. Authentification

Obsidian Remotely Save n'envoie pas de JWT — on utilise donc **HTTP Basic
Auth** :
- `username` : adresse email du compte intranet
- `password` : token long-lived issu de `POST /api/v1/users/me/webdav-token`

Le token est généré par le user et **n'est affiché qu'une seule fois**.
Il est ensuite stocké uniquement par son hash SHA-256 (table `WebDAVToken`).
Tout token est révocable (`DELETE /api/v1/users/me/webdav-token` ou
`DELETE /api/v1/users/me/webdav-token/:id`) et expirable (1 an par défaut).

### Endpoints de gestion

| Méthode + chemin                                | Auth   | Rôle                |
|--------------------------------------------------|--------|---------------------|
| `POST /api/v1/users/me/webdav-token`             | JWT    | Génère un token     |
| `GET /api/v1/users/me/webdav-token`              | JWT    | Liste les tokens    |
| `DELETE /api/v1/users/me/webdav-token`           | JWT    | Révoque tous        |
| `DELETE /api/v1/users/me/webdav-token/:id`       | JWT    | Révoque un token    |

## 3. Configuration côté Obsidian

1. Installer le plugin "Remotely Save" depuis le Community Marketplace.
2. Aller dans Paramètres → Remotely Save → "Choose a remote service".
3. Sélectionner **WebDAV**.
4. Renseigner :
   - **Server URL** : `https://intranet.omnitech-security.fr/api/v1/webdav/obsidian/<USER_ID>/`
     (le `<USER_ID>` est retourné par `POST /users/me/webdav-token` dans le champ `url`)
   - **WebDAV Authentication** : Basic
   - **Username** : votre email intranet
   - **Password** : le token retourné par l'API
5. Cliquer sur "Check Connectivity" → doit afficher "OK".
6. Lancer "Sync Now" pour la première sync.

## 4. Conflits & versionning

L'implémentation MVP est **last-write-wins** :
- Si Obsidian PUT un fichier existant, son contenu écrase la version DB.
- Avant écrasement, l'ancienne version est snapshotée dans `WikiPageVersion`
  (avec `changeLog = "via WebDAV (Obsidian)"`) — récupérable depuis l'UI wiki.
- Si l'intranet modifie une page pendant qu'Obsidian est offline, la
  prochaine sync Obsidian peut soit écraser (si l'utilisateur a édité le
  fichier local depuis), soit récupérer la version intranet.

Pour v1.4, l'objectif est :
- Comparer `Last-Modified` dans `If-Unmodified-Since` côté PUT pour rejeter
  les écrasements obsolètes (412 Precondition Failed).
- Surface UI dans `WikiPage` montrant les pages modifiées récemment via WebDAV.

## 5. Sécurité

- **Scope user strict** : la `userId` du path doit correspondre au user
  authentifié. Un mismatch retourne 403.
- **Audit log** : chaque opération d'écriture (PUT/DELETE/MOVE/COPY) est
  tracée dans `AuditLog` avec `WEBDAV_FILE_*` actions.
- **Path traversal denied** : `..`, `\`, double slash sont rejetés.
- **Format whitelist** : seuls les fichiers `.md` sont acceptés en PUT.
- **Slug validation** : `[a-z0-9-]{1,200}`.
- **Folder validation** : `[a-z0-9_-]{1,100}`.

## 6. Runbook — révoquer un token compromis

```bash
# 1. Lister les tokens actifs (depuis l'UI ou en SQL)
SELECT id, label, "lastUsedAt", "expiresAt"
FROM "WebDAVToken"
WHERE "userId" = '<userId>';

# 2a. Révoquer un token précis depuis l'UI (Profile → Intégrations → WebDAV)
DELETE /api/v1/users/me/webdav-token/<tokenId>

# 2b. Ou tout révoquer en une fois
DELETE /api/v1/users/me/webdav-token
```

Toute requête WebDAV avec un token révoqué retourne 401.

## 7. Limites connues

- Les pièces jointes wiki (`/uploads/wiki/*`) ne sont PAS exposées via WebDAV.
  Elles restent gérées par les endpoints classiques (`POST /wiki/:id/attachments`).
- Les pages partagées (visibility = DEPARTMENT/ROLE/PUBLIC) ne sont visibles
  via WebDAV QUE si l'utilisateur est l'auteur (`authorId = userId`).
- Pas d'expansion des liens wiki `[[slug]]` côté Obsidian.
- Pas de support des sous-dossiers récursifs (limité à un niveau de catégorie).
