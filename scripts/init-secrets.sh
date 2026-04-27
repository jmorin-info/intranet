#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Initialisation des secrets Docker (mode `file`)
#
# Genere /secrets/*.txt avec des valeurs aleatoires fortes.
# A executer UNE SEULE FOIS sur le host de prod, avant le premier `docker
# compose up`. Re-executer ecrase les secrets existants (nouveaux mots de
# passe) — ce qui peut entrainer une perte d'acces a Postgres / Redis si pas
# coordonne avec un dump + restore.
#
# Usage :
#   ./scripts/init-secrets.sh                # cree /secrets/ avec defaults
#   FORCE=1 ./scripts/init-secrets.sh        # ecrase les secrets existants
#
# Permissions : le script chmod 0600 chaque fichier (uid root) pour empecher
# tout autre utilisateur du host de les lire.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SECRETS_DIR="${PROJECT_DIR}/secrets"

mkdir -p "${SECRETS_DIR}"
chmod 0700 "${SECRETS_DIR}"

# Liste des secrets requis. Le format = "<nom_fichier>:<longueur_bytes>"
SECRETS=(
  "postgres_password:32"
  "redis_password:32"
  "jwt_access_secret:64"
  "jwt_refresh_secret:64"
  "meili_master_key:32"
  "onlyoffice_jwt_secret:48"
  "onlyoffice_secure_link_secret:32"
  "docuseal_secret_key:64"
)

generate_secret() {
  local len="$1"
  # base64 puis tronque a la longueur souhaitee + retire les '=' / '+' / '/'
  openssl rand -base64 "$((len * 2))" | tr -d '\n=+/' | head -c "${len}"
}

echo "============================================"
echo "  OMNITECH — Init Docker secrets"
echo "============================================"
echo "  Repertoire : ${SECRETS_DIR}"
echo ""

for entry in "${SECRETS[@]}"; do
  name="${entry%%:*}"
  len="${entry##*:}"
  file="${SECRETS_DIR}/${name}.txt"

  if [[ -f "$file" && "${FORCE:-0}" != "1" ]]; then
    echo "  [SKIP] ${name}.txt deja present (FORCE=1 pour ecraser)"
    continue
  fi

  generate_secret "${len}" > "${file}"
  chmod 0600 "${file}"
  echo "  [OK]   ${name}.txt (${len} chars)"
done

# Cas special : DATABASE_URL pour DocuSeal — utilise le mot de passe Postgres
DOCUSEAL_DBURL_FILE="${SECRETS_DIR}/docuseal_database_url.txt"
if [[ ! -f "$DOCUSEAL_DBURL_FILE" || "${FORCE:-0}" == "1" ]]; then
  PG_PASSWORD="$(cat "${SECRETS_DIR}/postgres_password.txt")"
  POSTGRES_USER="${POSTGRES_USER:-omnitech}"
  POSTGRES_DB="${POSTGRES_DB:-omnitech_intranet}_docuseal"
  echo "postgresql://${POSTGRES_USER}:${PG_PASSWORD}@postgres:5432/${POSTGRES_DB}" > "$DOCUSEAL_DBURL_FILE"
  chmod 0600 "$DOCUSEAL_DBURL_FILE"
  echo "  [OK]   docuseal_database_url.txt (postgres uri)"
fi

echo ""
echo "============================================"
echo "  Termine. ${#SECRETS[@]} secrets initialises + 1 url docuseal."
echo "  Pense a :"
echo "    1. Sauvegarder /secrets/*.txt dans un coffre (KeePass / Vault)"
echo "    2. Ajouter /secrets/ a .gitignore (deja fait)"
echo "    3. Tourner les secrets tous les 90 jours (ISO 27001 A.5.17)"
echo "============================================"
