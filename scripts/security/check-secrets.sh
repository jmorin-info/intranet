#!/usr/bin/env bash
# check-secrets.sh — Détection de secrets hardcodés dans le code source
# Usage : ./scripts/security/check-secrets.sh [répertoire]
# Retour : exit 0 si propre, exit 1 si secrets détectés

set -euo pipefail

SEARCH_DIR="${1:-$(git rev-parse --show-toplevel 2>/dev/null || echo '.')}"
ISSUES=0

echo "=== OMNITECH Security — Scan secrets ==="
echo "Répertoire : $SEARCH_DIR"
echo ""

# Patterns à détecter dans les fichiers source (pas .env)
PATTERNS=(
  "password\s*=\s*['\"][^'\"]{4,}"
  "secret\s*=\s*['\"][^'\"]{4,}"
  "api[_-]?key\s*=\s*['\"][^'\"]{4,}"
  "token\s*=\s*['\"][^'\"]{4,}"
  "Authorization.*Bearer\s+[A-Za-z0-9._-]{20,}"
  "-----BEGIN (RSA |EC )?PRIVATE KEY-----"
  "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
)

# Extensions à scanner
EXTENSIONS="ts,tsx,js,json,yml,yaml,conf,sh"

# Fichiers à exclure
EXCLUDES="node_modules,.next,dist,build,*.lock,package-lock.json,pnpm-lock.yaml,.env.example"

echo "--- Scan patterns sensibles dans le code source ---"
echo ""

for pattern in "${PATTERNS[@]}"; do
  RESULTS=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
    --include="*.json" --include="*.yml" --include="*.yaml" \
    --include="*.conf" --include="*.sh" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
    --exclude-dir=build --exclude="*.lock" \
    -iE "$pattern" "$SEARCH_DIR" 2>/dev/null \
    | grep -v "\.env\." \
    | grep -v "process\.env\." \
    | grep -v "// " \
    | grep -v "test\|spec\|mock\|example\|\.md" \
    | head -20 || true)

  if [ -n "$RESULTS" ]; then
    echo "⚠️  Pattern: $pattern"
    echo "$RESULTS" | while IFS= read -r line; do
      echo "   $line"
      ISSUES=$((ISSUES + 1))
    done
    echo ""
  fi
done

echo "--- Vérification .env dans .gitignore ---"
if [ -f "$SEARCH_DIR/.gitignore" ]; then
  if grep -q "^\.env$" "$SEARCH_DIR/.gitignore"; then
    echo "✅ .env est dans .gitignore"
  else
    echo "❌ .env N'EST PAS dans .gitignore"
    ISSUES=$((ISSUES + 1))
  fi
else
  echo "❌ Pas de .gitignore trouvé"
  ISSUES=$((ISSUES + 1))
fi

echo ""
echo "--- Vérification fallbacks crypto dangereux ---"
FALLBACKS=$(grep -rn --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  "|| 'fallback'\||| 'insecure\||| 'change-me\||| 'secret'" "$SEARCH_DIR" 2>/dev/null \
  | grep -v "test\|spec\|mock" || true)

if [ -n "$FALLBACKS" ]; then
  echo "⚠️  Fallbacks crypto dangereux détectés :"
  echo "$FALLBACKS"
  ISSUES=$((ISSUES + 1))
fi

echo ""
echo "=== Résultat ==="
if [ "$ISSUES" -gt 0 ]; then
  echo "❌ $ISSUES problème(s) détecté(s)"
  exit 1
else
  echo "✅ Aucun secret détecté"
  exit 0
fi
