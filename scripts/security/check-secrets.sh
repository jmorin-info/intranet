#!/usr/bin/env bash
# Scan sources, documentation and templates without printing secret values.
set -euo pipefail

SEARCH_DIR="${1:-$(git rev-parse --show-toplevel)}"
SEARCH_DIR="$(realpath -- "$SEARCH_DIR")"
CONFIG="$SEARCH_DIR/.gitleaks.toml"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is required; install it before validating publication." >&2
  exit 2
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "Missing .gitleaks.toml; refusing an unconfigured scan." >&2
  exit 2
fi

(
  cd -- "$SEARCH_DIR"
  gitleaks dir --redact --no-banner --config "$CONFIG" .
)

# An ignored environment file is still scanned if it was accidentally tracked.
if git -C "$SEARCH_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r -d '' tracked; do
    case "${tracked##*/}" in
      .env.example|.env.*.example) ;;
      .env|.env.*)
        echo "A real environment file is tracked; publication refused." >&2
        exit 1 ;;
    esac
  done < <(git -C "$SEARCH_DIR" ls-files -z)
  if ! git -C "$SEARCH_DIR" check-ignore -q --no-index .env; then
    echo ".env must be ignored before publication." >&2
    exit 1
  fi
fi
echo "Source secret scan passed. Scan Git history separately before pushing."
