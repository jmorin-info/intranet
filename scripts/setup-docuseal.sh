#!/usr/bin/env bash
set -euo pipefail

DOCUSEAL_URL="${DOCUSEAL_URL:-http://localhost:7000}"
DOCUSEAL_KEY="${DOCUSEAL_API_KEY:-}"

if [ -z "$DOCUSEAL_KEY" ]; then
  source /root/omnitech-intranet/.env
  DOCUSEAL_KEY="${DOCUSEAL_API_KEY}"
fi

echo "============================================"
echo "  DocuSeal — Configuration Templates"
echo "============================================"
echo ""
echo "DocuSeal URL: $DOCUSEAL_URL"
echo ""

# Check connection
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$DOCUSEAL_URL/api/templates" -H "X-Auth-Token: $DOCUSEAL_KEY")
if [ "$STATUS" != "200" ]; then
  echo "ERROR: Cannot connect to DocuSeal API (HTTP $STATUS)"
  echo "Please check DOCUSEAL_API_KEY in .env"
  exit 1
fi

echo "API connection: OK"
echo ""
echo "To create signature templates:"
echo "1. Open $DOCUSEAL_URL in your browser"
echo "2. Login with admin@omnitech-security.fr / Admin123!"
echo "3. Go to Templates > New Template"
echo "4. Upload a PDF (charte, contrat, etc.)"
echo "5. Add signature fields where needed"
echo "6. Save the template"
echo ""
echo "Available templates:"
curl -s "$DOCUSEAL_URL/api/templates" -H "X-Auth-Token: $DOCUSEAL_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
templates = data.get('data', data) if isinstance(data, dict) else data
if not templates:
  print('  No templates yet — create one in the DocuSeal UI')
else:
  for t in templates:
    print(f'  ID: {t[\"id\"]} — {t[\"name\"]} (created: {t.get(\"created_at\",\"?\")})')
" 2>&1
