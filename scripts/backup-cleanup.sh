#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Rotation backups (GFS : 7 daily + 4 weekly + 12 monthly)
# =============================================================================
#
# Implémente une rotation Grandfather-Father-Son sur les dumps PostgreSQL et
# les archives storage. Conforme aux bonnes pratiques ISO 27001 A.8.13 :
# garder un historique long sans coût d'espace explosif.
#
# Politique :
#   - 7  derniers backups quotidiens                (DAILY_KEEP=7)
#   - 4  derniers backups dimanche (hebdomadaires)  (WEEKLY_KEEP=4)
#   - 12 derniers backups 1er du mois (mensuels)    (MONTHLY_KEEP=12)
#
# Tout dump qui sort des trois fenêtres est supprimé. Les fichiers
# .sha256 compagnons suivent leur dump.
#
# Usage :
#   bash scripts/backup-cleanup.sh             # mode réel
#   DRY_RUN=1 bash scripts/backup-cleanup.sh   # liste seulement
#
# Cron : déjà appelé automatiquement par scripts/backup.sh.
# Standalone (recommandé en plus, pour rattraper après crash) :
#   30 2 * * * /root/omnitech-intranet/scripts/backup-cleanup.sh \
#     >> /var/log/omnitech/backup-cleanup.log 2>&1
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/omnitech}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
DRY_RUN="${DRY_RUN:-0}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -d "$BACKUP_DIR" ]; then
  log "ERROR: BACKUP_DIR introuvable : $BACKUP_DIR"
  exit 1
fi

log "============================================"
log "OMNITECH — Rotation backups (GFS)"
log "============================================"
log "  Dir       : ${BACKUP_DIR}"
log "  Daily     : ${DAILY_KEEP}"
log "  Weekly    : ${WEEKLY_KEEP} (dimanches)"
log "  Monthly   : ${MONTHLY_KEEP} (1er du mois)"
log "  Dry-run   : $([ "$DRY_RUN" = "1" ] && echo OUI || echo non)"

# Liste tous les dumps DB (et dumps storage) avec timestamp
# Pattern : db_YYYYMMDD_HHMMSS.sql.gz / storage_YYYYMMDD_HHMMSS.tar.gz
list_backups() {
  local prefix="$1"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    -regex ".*/${prefix}_[0-9]+_[0-9]+\\(\\.sql\\.gz\\|\\.tar\\.gz\\|\\.dump\\)$" \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr
}

# Extrait la date YYYYMMDD du nom : db_YYYYMMDD_HHMMSS.sql.gz
extract_date() {
  local f="$1"
  basename "$f" | sed -E 's/^[a-z]+_([0-9]{8})_.*$/\1/'
}

# Détermine le type d'un backup (daily / weekly / monthly) selon sa date
classify() {
  local yyyymmdd="$1"
  local dow day
  dow=$(date -d "$yyyymmdd" +%u 2>/dev/null || echo 0)   # 1=lundi … 7=dimanche
  day=$(date -d "$yyyymmdd" +%d 2>/dev/null || echo 0)
  if [ "$day" = "01" ]; then
    echo "monthly"
  elif [ "$dow" = "7" ]; then
    echo "weekly"
  else
    echo "daily"
  fi
}

rotate_one_kind() {
  local prefix="$1"
  log "--- Rotation '${prefix}' ---"

  declare -a daily_to_keep weekly_to_keep monthly_to_keep
  local kept=0

  # Trie les fichiers DESC par mtime, puis classe chacun
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file="${line#* }"
    local d
    d=$(extract_date "$file")
    [ -z "$d" ] && continue
    local kind
    kind=$(classify "$d")

    case "$kind" in
      monthly)
        if [ "${#monthly_to_keep[@]}" -lt "$MONTHLY_KEEP" ]; then
          monthly_to_keep+=("$file")
          kept=$((kept+1))
        fi
        ;;
      weekly)
        if [ "${#weekly_to_keep[@]}" -lt "$WEEKLY_KEEP" ]; then
          weekly_to_keep+=("$file")
          kept=$((kept+1))
        fi
        ;;
      daily)
        if [ "${#daily_to_keep[@]}" -lt "$DAILY_KEEP" ]; then
          daily_to_keep+=("$file")
          kept=$((kept+1))
        fi
        ;;
    esac
  done < <(list_backups "$prefix")

  # Construit la liste des keeps
  local keep_set=$'\n'
  for f in "${daily_to_keep[@]:-}" "${weekly_to_keep[@]:-}" "${monthly_to_keep[@]:-}"; do
    [ -z "$f" ] && continue
    keep_set+="$f"$'\n'
  done

  log "  Daily kept   : ${#daily_to_keep[@]}/${DAILY_KEEP}"
  log "  Weekly kept  : ${#weekly_to_keep[@]}/${WEEKLY_KEEP}"
  log "  Monthly kept : ${#monthly_to_keep[@]}/${MONTHLY_KEEP}"

  # Supprime tout ce qui n'est pas dans le keep_set
  local deleted=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file="${line#* }"
    if ! grep -qxF "$file" <<< "$keep_set"; then
      if [ "$DRY_RUN" = "1" ]; then
        log "  [dry-run] DELETE ${file}"
      else
        rm -f "$file" "${file}.sha256" 2>/dev/null && deleted=$((deleted+1))
        log "  DELETED ${file}"
      fi
    fi
  done < <(list_backups "$prefix")

  log "  Total deleted: ${deleted}"
}

rotate_one_kind "db"
rotate_one_kind "storage"

# Nettoyage des fichiers .log et .sha256 orphelins
log "--- Cleanup orphelins ---"
ORPHAN_LOGS=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.log' \
  -mtime "+$((DAILY_KEEP + 30))" $([ "$DRY_RUN" = "1" ] && echo "-print" || echo "-delete -print") 2>/dev/null | wc -l)
log "  Logs supprimés : ${ORPHAN_LOGS}"

# Orphan sha256 (sans dump compagnon)
ORPHAN_SHA=0
while IFS= read -r sha; do
  ref="${sha%.sha256}"
  if [ ! -f "$ref" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "  [dry-run] DELETE orphan sha256 ${sha}"
    else
      rm -f "$sha" 2>/dev/null && ORPHAN_SHA=$((ORPHAN_SHA+1))
    fi
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sha256' 2>/dev/null)
log "  SHA-256 orphelins supprimés : ${ORPHAN_SHA}"

# Bilan
log "--- Bilan ---"
log "  Espace total restant : $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
log "  Fichiers DB restants : $(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_*' 2>/dev/null | wc -l)"
log "  Fichiers storage     : $(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'storage_*' 2>/dev/null | wc -l)"
log "============================================"
