#!/usr/bin/env bash
# Vérification locale/CI : aucune migration, aucun seed, aucun déploiement.
set -Eeuo pipefail
case "${1:-}" in
  ''|--build) ;;
  --help|-h) printf 'Usage : %s [--build]\n' "$0"; exit 0 ;;
  *) printf 'Usage : %s [--build]\n' "$0" >&2; exit 2 ;;
esac
intranet_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$intranet_root"
if command -v systemctl >/dev/null 2>&1; then
  for intranet_unit in omnitech-backend.service omnitech-frontend.service; do
    if systemctl is-active --quiet "$intranet_unit" 2>/dev/null; then
      intranet_active_root=$(systemctl show "$intranet_unit" --property=WorkingDirectory --value)
      intranet_active_root=$(readlink -f -- "$intranet_active_root") || {
        printf 'Répertoire du service actif impossible à résoudre ; vérification interrompue.\n' >&2
        exit 1
      }
      if [[ "$intranet_active_root" == "$intranet_root" || "$intranet_active_root" == "$intranet_root/"* ]]; then
        printf 'Exécuter la vérification en CI ou dans une copie de développement ; ce dépôt héberge un service actif.\n' >&2
        exit 1
      fi
    fi
  done
fi
if command -v pnpm >/dev/null 2>&1; then
  intranet_pnpm=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  intranet_pnpm=(corepack pnpm)
else
  printf 'pnpm ou Corepack est nécessaire.\n' >&2
  exit 1
fi
intranet_prisma_client=$(readlink -f -- packages/database/node_modules/@prisma/client) || {
  printf 'Installer les dépendances verrouillées dans cette copie avant la vérification.\n' >&2
  exit 1
}
if [[ "$intranet_prisma_client" != "$intranet_root/"* ]]; then
  printf 'Le client Prisma est partagé hors de cette copie ; utiliser des dépendances autonomes avant sa génération.\n' >&2
  exit 1
fi
"${intranet_pnpm[@]}" --filter @omnitech/database exec prisma generate
for intranet_package in backend frontend mobile; do
  "${intranet_pnpm[@]}" --filter "@omnitech/$intranet_package" typecheck
done
"${intranet_pnpm[@]}" --filter @omnitech/backend exec jest --runInBand
"${intranet_pnpm[@]}" --filter @omnitech/frontend test
if [[ "${1:-}" == '--build' ]]; then
  "${intranet_pnpm[@]}" --filter @omnitech/backend build
  "${intranet_pnpm[@]}" --filter @omnitech/frontend build
fi
