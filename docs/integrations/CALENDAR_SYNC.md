# Synchronisation Calendar — Google + Outlook M365

> Wave B — item 33. Sync bidirectionnelle (push event-driven + pull cron 10 min).

L'intranet expose deux intégrations OAuth2 :

- **Google Calendar** (Calendar API v3)
- **Microsoft 365 Outlook** (Microsoft Graph v1.0)

Chaque user peut connecter au plus une connexion par provider. Les tokens
OAuth (access + refresh) sont chiffrés au repos via AES-256-GCM
(`CryptoService`). La table `CalendarConnection` les persiste avec leur
état de sync (token de delta, dernière exécution, compteur d'erreurs).

## 1. Architecture

```text
                 ┌──────────────────┐                    ┌──────────────────┐
                 │ Google Calendar  │                    │  M365 Outlook    │
                 │   (Calendar API) │                    │  (Graph delta)   │
                 └────────┬─────────┘                    └────────┬─────────┘
                          │ OAuth2 + REST                          │ OAuth2 + Graph
                          ▼                                        ▼
                 ┌──────────────────┐                    ┌──────────────────┐
                 │ GoogleCalendar   │                    │ OutlookSync      │
                 │ SyncService      │                    │ Service          │
                 └────────┬─────────┘                    └────────┬─────────┘
                          │                                        │
                          └──────────────────┬─────────────────────┘
                                             ▼
                                ┌────────────────────────────┐
                                │ CalendarSyncCron (10min)   │
                                │  + push handlers           │
                                └────────────────┬───────────┘
                                                 ▼
                                ┌────────────────────────────┐
                                │ CalendarEvent (Postgres)   │
                                │   externalUid =            │
                                │   "gcal:<gid>" / "ms:<id>" │
                                └────────────────────────────┘
```

## 2. Setup OAuth — Google

1. Aller sur https://console.cloud.google.com/apis/credentials
2. Créer un projet (ou utiliser un projet existant).
3. **Library** → activer "Google Calendar API".
4. **Credentials** → "Create credentials" → "OAuth client ID".
5. Type **Web application**.
6. **Authorized redirect URIs** :
   - `https://intranet.omnitech-security.fr/api/v1/calendar/callback/google`
   - (en dev) `http://localhost:3000/api/v1/calendar/callback/google`
7. Copier le `client_id` et `client_secret` dans `.env` :
   ```env
   GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
   ```
8. Configurer l'**OAuth consent screen** :
   - User type : Internal (G Suite) ou External
   - Scopes ajoutés : `.../auth/calendar.events`, `openid`, `email`

## 3. Setup OAuth — Microsoft 365

1. Aller sur https://portal.azure.com → Azure Active Directory.
2. **App registrations** → "New registration".
3. Nom : `OMNITECH Intranet — Calendar Sync`.
4. **Supported account types** : Accounts in any organizational directory
   AND personal Microsoft accounts (for Outlook.com inter-op).
5. **Redirect URI (Web)** :
   - `https://intranet.omnitech-security.fr/api/v1/calendar/callback/outlook`
6. Après création, aller dans **Certificates & secrets** → "New client secret".
7. **API permissions** → "Add a permission" → Microsoft Graph → Delegated :
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
8. Copier les valeurs dans `.env` :
   ```env
   MICROSOFT_OAUTH_CLIENT_ID=xxx-xxx-xxx-xxx
   MICROSOFT_OAUTH_CLIENT_SECRET=xxx
   ```

## 4. Flow utilisateur

### Connexion (depuis l'UI)

1. L'utilisateur clique sur "Connecter Google" dans Profile → Intégrations.
2. Le frontend appelle `GET /api/v1/calendar/connect/google`.
3. Le backend génère un `state` CSRF et renvoie 302 vers Google.
4. L'utilisateur consent (premier accès uniquement, scope offline).
5. Google redirige vers `/api/v1/calendar/callback/google?code=...&state=...`.
6. Le backend valide le `state`, échange le code contre un access+refresh
   token, chiffre et persiste dans `CalendarConnection`.
7. Le user est redirigé vers `/calendar?integration=google&status=ok`.

### Sync incrémentale

- **Pull (Google → intranet)** : cron toutes les 10 min via `CalendarSyncCron`.
  Premier run : full sync (tous les events futurs). Runs suivants :
  incremental via `syncToken` (Google) ou `deltaLink` (Outlook).
- **Push (intranet → Google/Outlook)** : event-driven, déclenché à chaque
  `CalendarService.create/update/delete`. Best-effort : si la propagation
  échoue, on incrémente `syncErrorCount` et on log un warning, mais on
  n'échoue pas la mutation locale.

### Gestion des erreurs

- **HTTP 410 Gone** (sync token expiré) → on efface `syncToken` /
  `deltaLink` et le prochain run repart d'une full sync.
- **HTTP 401 sur refresh** (token révoqué côté provider) → `syncEnabled = false`
  + message d'erreur. L'utilisateur doit se reconnecter via l'UI.
- **5 erreurs consécutives** → `syncEnabled = false` (auto-désactivé pour
  ne pas spammer). L'utilisateur peut relancer manuellement avec
  `POST /api/v1/calendar/sync/google` ou `/sync/outlook`.

## 5. Mapping des events

| Champ intranet (CalendarEvent) | Google Calendar     | Outlook Graph                |
|--------------------------------|---------------------|------------------------------|
| `title`                        | `summary`           | `subject`                    |
| `description`                  | `description`       | `body.content` (HTML)        |
| `location`                     | `location`          | `location.displayName`       |
| `startDate` / `endDate`        | `start.dateTime`    | `start.dateTime`             |
| `allDay`                       | `start.date`        | `isAllDay: true`             |
| `recurrence`                   | `recurrence` (RRULE)| (à venir : RRULE → patternedRecurrence) |
| `externalUid`                  | `gcal:<event.id>`   | `ms:<event.id>`              |
| `userId` (owner)               | calendar du user    | `/me/events`                 |

## 6. Conflits

- Le `externalUid` (préfixé `gcal:` ou `ms:`) est unique côté DB. Toute
  modification distante d'un même UID met à jour la ligne locale (pas de
  doublon).
- Si un event est créé d'abord côté intranet puis poussé vers Google,
  l'`externalUid` est mis à jour avec `gcal:<id>` retourné par Google.
- Si la même mutation arrive simultanément depuis les deux côtés (cas de
  course extrêmement rare avec un poll de 10 min), c'est le **dernier
  écrivain** qui gagne — l'intranet ne tient pas de "vector clock".

## 7. Révoquer une connexion (runbook)

```bash
# Côté UI : Profile → Intégrations → "Déconnecter Google" / "Déconnecter Outlook"
# Côté API :
DELETE /api/v1/calendar/connect/google
DELETE /api/v1/calendar/connect/outlook
```

L'effet :
- La ligne `CalendarConnection` est supprimée.
- Pour Google, on appelle `oauth2.googleapis.com/revoke` (best-effort) pour
  révoquer le refresh token côté Google.
- Pour Outlook, Microsoft ne fournit pas d'endpoint revoke direct — le
  refresh token expirera naturellement (≤ 90 j). L'admin tenant peut
  forcer la révocation via Azure AD → Enterprise applications →
  l'application → "Permissions" → révoquer.

## 8. Variables d'env

```env
# Calendar OAuth (.env.example)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
CALENDAR_SYNC_CRON_ENABLED=true   # passer à false en dev pour stopper les pulls

# Crypto (chiffrement at-rest des tokens)
CRYPTO_SECRET=<32+ bytes hex — generer avec `openssl rand -hex 32`>
APP_URL=https://intranet.omnitech-security.fr
```

## 9. Import iCal (manuel)

Indépendamment du sync OAuth, l'intranet accepte l'upload de fichiers `.ics` :

```bash
# Multipart upload
curl -X POST https://intranet.omnitech-security.fr/api/v1/calendar/import \
  -H "Authorization: Bearer $JWT" \
  -F "file=@events.ics" \
  -F "visibility=PRIVATE"

# Body brut (text/calendar inline dans JSON)
curl -X POST https://intranet.omnitech-security.fr/api/v1/calendar/events/import-ical \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"ics": "BEGIN:VCALENDAR\\nVERSION:2.0\\n..."}'
```

L'import est **idempotent** via le champ `externalUid` (= VEVENT.UID).
Réimporter le même fichier met à jour les events au lieu de dupliquer.

## 10. Sécurité — chiffrement des tokens

- Format : `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` (AES-256-GCM, IV 12 bytes
  aléatoires par chiffrement).
- Clé maître : `CRYPTO_SECRET` (sha256 → 32 bytes).
- Rotation de clé : voir `apps/backend/src/common/crypto/crypto.service.ts`
  pour le format `v1:` (futur `v2:` permettra de tagger les chiffrés générés
  par la nouvelle clé sans casser les anciens).

**Audit** : chaque création / révocation de connexion est journalisée dans
`AuditLog` (`CALENDAR_CONNECTION_CREATED`, `CALENDAR_CONNECTION_REVOKED`).
