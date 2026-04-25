# Runbook — Synchronisation LDAP / Active Directory manuelle

> Procédure ops pour déclencher / contrôler / dépanner la synchronisation
> des comptes Active Directory vers la base intranet OMNITECH Security.
> Conforme ISO 27001:2022 — A.5.16 (gestion des identités), A.8.2 (droits
> d'accès privilégiés).

## Quand utiliser ce runbook

- Onboarding de nouveaux collaborateurs (synchro à la demande)
- Vérification après une mise à jour AD massive
- Incident : utilisateurs en `LdapPendingUser` jamais traités
- Diagnostic : « je ne peux pas me connecter » alors que le compte AD existe
- Contrôle de la cron nocturne (02:30)

## Pré-requis

- Compte SUPER_ADMIN sur l'intranet (rôles requis pour `/api/ldap/*`)
- LDAPS activé dans `/admin/access` → onglet LDAPS (clé `ldap.enabled=true`)
- Connectivité réseau backend → contrôleur de domaine sur port 636 (LDAPS)
- Compte de service AD (UPN format) : `svc_intranet@omnitech.security`
- Accès SSH `root` à la VM Debian 12 pour lecture des logs

## Procédure

### 1. Diagnostic préalable

```bash
# 1.1 — Lecture diagnostic depuis le backend (config + ping LDAPS)
curl -s -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     https://intranet.omnitech-security.fr/api/ldap/diagnostic | jq .

# Renvoie : ready, config (sans password), issues[], connectionTest, recommendations[]
```

Ou via l'UI : `/admin/access` → bouton **Diagnostic LDAPS**.

### 2. Tester la connexion LDAPS sans rien synchroniser

```bash
curl -s -X POST -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     https://intranet.omnitech-security.fr/api/ldap/test-connection | jq .

# Réponse attendue :
# { "success": true, "message": "Connexion LDAPS réussie — bind et recherche OK", "details": "..." }
```

### 3. Tester l'authentification d'un utilisateur précis

```bash
curl -s -X POST -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"email":"prenom.nom@omnitech-security.fr","password":"xxxxxxxx"}' \
     https://intranet.omnitech-security.fr/api/ldap/test-auth | jq .
```

### 4. Sync manuelle (un seul utilisateur)

Crée ou met à jour le compte intranet pour un utilisateur LDAP authentifié :

```bash
curl -s -X POST -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"email":"prenom.nom@omnitech-security.fr","password":"xxxxxxxx"}' \
     https://intranet.omnitech-security.fr/api/ldap/sync-user | jq .
```

### 5. Sync manuelle (TOUS les utilisateurs AD actifs)

```bash
# Sans désactivation des comptes locaux absents d'AD (sûr)
curl -s -X POST -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     'https://intranet.omnitech-security.fr/api/ldap/sync-all' | jq .

# Avec désactivation des comptes locaux absents d'AD (à manier avec précaution)
curl -s -X POST -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     'https://intranet.omnitech-security.fr/api/ldap/sync-all?deactivateMissing=true' | jq .
```

> **NB workflow pending** : depuis la refonte, les nouveaux utilisateurs
> détectés sont placés en `LdapPendingUser` (statut `PENDING`). Un admin
> doit valider via l'UI `/admin/access` (choix département + rôle) avant
> qu'ils n'apparaissent comme utilisateurs réels. Cf. endpoints
> `/api/ldap/pending`, `/api/ldap/pending/:id/approve`,
> `/api/ldap/pending/:id/reject`.

### 6. Lecture des logs

```bash
# Logs pendant la sync
journalctl -u omnitech-backend -f | grep -iE "LDAP|sync"

# Dernier état de sync depuis l'audit log (DB)
sudo -u postgres psql -d omnitech_intranet -c \
  "SELECT \"createdAt\", action, severity, metadata
   FROM \"AuditLog\"
   WHERE action LIKE 'LDAP%'
   ORDER BY \"createdAt\" DESC
   LIMIT 20;"
```

Codes d'audit attendus : `LDAP_SCHEDULED_SYNC`, `LDAP_BULK_SYNC`,
`LDAP_USER_SYNCED`, `LDAP_PENDING_APPROVED`, `LDAP_PENDING_REJECTED`,
`LDAP_TEST_CONNECTION`, `LDAP_SCHEDULED_SYNC_FAILED`.

### 7. Cron auto

La synchronisation tourne automatiquement **chaque nuit à 02:30**
(`@Cron('30 2 * * *')` dans `apps/backend/src/ldap/ldap.controller.ts:248`).

- Étape 1 : sync sans désactivation
- Étape 2 : si `total >= 10` comptes AD remontés (garde-fou contre AD KO),
  refait la sync avec `deactivateMissing=true`
- Audit log : `LDAP_SCHEDULED_SYNC` (succès) ou `LDAP_SCHEDULED_SYNC_FAILED` (échec)

Pour vérifier la dernière exécution :

```bash
sudo -u postgres psql -d omnitech_intranet -c \
  "SELECT \"createdAt\", action, metadata
   FROM \"AuditLog\"
   WHERE action LIKE 'LDAP_SCHEDULED%'
   ORDER BY \"createdAt\" DESC LIMIT 5;"
```

## Pannes typiques

| Symptôme                                                    | Cause probable                                  | Remédiation                                                |
|-------------------------------------------------------------|-------------------------------------------------|------------------------------------------------------------|
| `LDAP service bind failed: Invalid Credentials (49)`        | `bind_password` faux ou expiré                  | Voir `SECRETS_ROTATION.md` § LDAP `bind_password`         |
| `connect ETIMEDOUT` ou `EAI_AGAIN`                          | Firewall ou DNS                                 | Vérifier route 636/TCP vers DC, résolution `omnitech.security` |
| `unable to verify the first certificate`                    | Cert AD self-signed sans CA bundle              | Définir `LDAP_CA_CERT_PATH=/etc/ssl/certs/ad-ca.pem`       |
| `size limit exceeded`                                       | AD `MaxPageSize=1000` non géré                  | Déjà câblé via `paged: { pageSize: 1000 }` (cf. service)   |
| Plusieurs utilisateurs sans email après sync                | Attribut `mail` vide en AD                      | Le service tente fallback `userPrincipalName` puis `sAMAccountName@<domaine>` ; vérifier UPN cohérent en AD |
| Rôles écrasés à chaque sync                                 | (Ne devrait plus arriver)                       | Le service préserve `role` sur les users existants, voir `syncUser` |
| Comptes désactivés à tort                                   | AD temporairement vide / pannel partiel         | Garde-fou actif (sync ignore `deactivateMissing` si total < 10) |
| Pending users qui ne se vident pas                          | Aucun admin n'a validé                          | Ouvrir `/admin/access` → onglet « Comptes en attente »     |

## Vérifications post-action

- `/api/ldap/sync-all` retourne `success: true` avec `stats.created`,
  `stats.updated`, `stats.errors`, `stats.total` cohérents
- `LDAP_BULK_SYNC` ou `LDAP_SCHEDULED_SYNC` apparaît dans `AuditLog`
- Compte test peut se connecter via `/login` avec ses identifiants AD
- Pas d'erreur récurrente dans `journalctl -u omnitech-backend | grep LDAP`
- Compteur pending visible dans `/admin/access` (badge mis à jour)

## Rollback

La sync n'écrase pas les rôles ni les `departmentId` déjà assignés.
En cas de désactivation à tort (`deactivateMissing=true` mal utilisé) :

```sql
-- Réactiver tous les utilisateurs désactivés dans la dernière heure
UPDATE "User"
SET "isActive" = true
WHERE "isActive" = false
  AND "updatedAt" > NOW() - INTERVAL '1 hour'
  AND email NOT LIKE '%prestataire%'
  AND email NOT LIKE '%svc_%';
```

> **À utiliser avec précaution** : revoir la liste avant exécution
> via un `SELECT` équivalent.

## Escalade

| Situation                                          | Contact                                  |
|----------------------------------------------------|------------------------------------------|
| Cron nocturne échoue 2 nuits de suite              | DSI puis RSSI                            |
| Désactivation massive accidentelle                 | RSSI immédiat                            |
| Bind password invalidé en AD sans préavis          | Coordination DSI ↔ équipe AD             |
| Suspicion compte AD compromis utilisé pour bind    | RSSI : rotation immédiate du svc account |

## Annexes

- Service : `apps/backend/src/ldap/ldap.service.ts`
- Controller : `apps/backend/src/ldap/ldap.controller.ts`
- Config persistée en DB (table `AppConfig`, clés `ldap.*`)
- UI admin : `/admin/access` (onglet LDAPS + onglet Comptes en attente)
- Filtre user par défaut :
  `(&(objectCategory=Person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))`
- Mapping rôles : `AppConfig.ldap.role_mapping` (JSON)
