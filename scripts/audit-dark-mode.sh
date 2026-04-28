#!/usr/bin/env bash
# audit-dark-mode.sh — Scanne toutes les pages du frontend et liste les classes
# Tailwind « light-only » (sans variante dark:).
#
# Usage:
#   ./scripts/audit-dark-mode.sh [path|--verbose]
#
# Sans argument, scanne apps/frontend/src par défaut. Avec --verbose, affiche
# les détails ligne par ligne pour chaque fichier.
#
# Heuristique : pour chaque attribut className du JSX/TSX, on collecte les
# tokens Tailwind utilisant white/black/gray-N/slate-N/zinc-N/stone-N/neutral-N
# sur les propriétés bg/text/border/ring/etc. Un token est « flaggé » si aucun
# pendant `dark:` (avec le même état hover:/focus:/etc + même base de propriété)
# n'apparaît dans le même className.
#
# Faux positifs courants à ignorer :
#   - text-white / fill-white sur un fond brand (bg-primary, bg-amber-600, etc.)
#   - bg-black/50, bg-black/70 sur un backdrop de modal
#   - from-black/70 dans un gradient overlay sur image
#
# Charte SEAL : voir seal_charter.md (PANTONE navy/blue/bordeaux/orange).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERBOSE=""
TARGET="$REPO_ROOT/apps/frontend/src"
for arg in "$@"; do
  case "$arg" in
    -v|--verbose) VERBOSE="-v" ;;
    *) TARGET="$arg" ;;
  esac
done

if [ ! -e "$TARGET" ]; then
  echo "Erreur : cible introuvable : $TARGET" >&2
  exit 1
fi

python3 - "$TARGET" $VERBOSE <<'PY'
import re, sys, os

LIGHT_PATTERN = re.compile(
    r'^(?P<state>(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|peer-[a-z]+:|sm:|md:|lg:|xl:|2xl:)*)'
    r'(?P<prop>bg|text|border|ring|placeholder|fill|stroke|divide|from|to|via|caret|outline|shadow|decoration|accent)'
    r'-(?P<color>white|black|gray-\d+|slate-\d+|zinc-\d+|stone-\d+|neutral-\d+)(?:/\d+)?$'
)

CN_PATTERNS = [
    re.compile(r'className\s*=\s*"([^"]*)"'),
    re.compile(r"className\s*=\s*'([^']*)'"),
    re.compile(r'className\s*=\s*\{`([^`]*)`\}', re.DOTALL),
    re.compile(r'className\s*=\s*\{"([^"]*)"\}'),
    re.compile(r"className\s*=\s*\{'([^']*)'\}"),
    re.compile(r'\bcn\(\s*"([^"]*)"'),
    re.compile(r"\bcn\(\s*'([^']*)'"),
]

def audit_file(path):
    src = open(path, 'r', encoding='utf-8').read()
    line_starts = []
    pos = 0
    for line in src.split('\n'):
        line_starts.append(pos)
        pos += len(line) + 1

    def line_for(offset):
        import bisect
        return bisect.bisect_right(line_starts, offset)

    flagged_lines = []
    seen_offsets = set()
    for pat in CN_PATTERNS:
        for m in pat.finditer(src):
            if m.start() in seen_offsets:
                continue
            seen_offsets.add(m.start())
            text = m.group(1)
            ln = line_for(m.start())
            clean = re.sub(r'\$\{[^}]*\}', ' ', text)
            tokens = clean.split()
            dark_keys = set()
            light_tokens = []
            for t in tokens:
                if t.startswith('dark:'):
                    inner = t[len('dark:'):]
                    lm = LIGHT_PATTERN.match(inner)
                    if lm:
                        dark_keys.add((lm.group('state'), lm.group('prop')))
                else:
                    lm = LIGHT_PATTERN.match(t)
                    if lm:
                        light_tokens.append((t, lm.group('state'), lm.group('prop')))
            flagged = [t for (t, s, p) in light_tokens if (s, p) not in dark_keys]
            if flagged:
                flagged_lines.append((ln, flagged))
    return flagged_lines

def gather(arg):
    if os.path.isfile(arg):
        return [arg]
    files = []
    for root, _, fnames in os.walk(arg):
        if '/node_modules/' in root or '/.next/' in root or '/dist/' in root:
            continue
        for fn in fnames:
            if fn.endswith(('.tsx', '.jsx')):
                files.append(os.path.join(root, fn))
    return files

verbose = '-v' in sys.argv or '--verbose' in sys.argv
target = sys.argv[1]

total = 0
per_file = []
for f in gather(target):
    flags = audit_file(f)
    if flags:
        per_file.append((f, flags))
        total += len(flags)

per_file.sort(key=lambda x: -len(x[1]))
for f, flags in per_file:
    rel = os.path.relpath(f)
    print(f"{len(flags):4d}  {rel}")
    if verbose:
        for ln, tokens in flags[:50]:
            print(f"   L{ln}: {tokens}")

print(f"\nTotal flagged className blocks: {total}")
print(f"Fichiers concernés: {len(per_file)}")
PY
