# Docker secrets — OMNITECH Intranet

Ce repertoire contient les secrets Docker (mots de passe, JWT, cles API)
montes en `/run/secrets/` dans les conteneurs prod.

**JAMAIS** commiter le contenu (cf `.gitignore` : `secrets/*.txt`).

## Initialisation

```bash
./scripts/init-secrets.sh        # premiere installation
FORCE=1 ./scripts/init-secrets.sh  # tourner tous les secrets (rotation 90j)
```

## Liste des secrets

| Fichier                              | Service       | Usage                                  |
| ------------------------------------ | ------------- | -------------------------------------- |
| `postgres_password.txt`              | postgres      | Mot de passe utilisateur DB            |
| `redis_password.txt`                 | redis         | `requirepass`                          |
| `jwt_access_secret.txt`              | backend       | Signature JWT access tokens            |
| `jwt_refresh_secret.txt`             | backend       | Signature JWT refresh tokens           |
| `meili_master_key.txt`               | meilisearch   | API master key                         |
| `onlyoffice_jwt_secret.txt`          | documentserver| JWT entre backend et docs server       |
| `onlyoffice_secure_link_secret.txt`  | documentserver| Liens signes courte duree              |
| `docuseal_database_url.txt`          | docuseal      | URL Postgres dediee                    |
| `docuseal_secret_key.txt`            | docuseal      | Rails `secret_key_base`                |

## Rotation (ISO 27001 A.5.17)

```bash
# 1. Generer les nouveaux secrets
FORCE=1 ./scripts/init-secrets.sh

# 2. Recreer les conteneurs concernes
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  up -d --force-recreate postgres redis backend frontend
```

Pour postgres : exporter d'abord les donnees, puis recreer le conteneur,
puis re-importer (le mot de passe dans le volume devient invalide sinon).

## Sauvegarde

- Les secrets doivent etre sauvegardes dans un coffre (KeePass / Bitwarden /
  HashiCorp Vault).
- Sur la VM : permissions `0600` (`chmod 0600 secrets/*.txt`), proprio root.
- Le repertoire entier est sauvegarde par `scripts/backup-full.sh` (chiffre).
