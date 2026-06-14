#!/usr/bin/env bash
# Sync example resume templates into the production runtime home.
# Dev reads examples/; production reads ~/.resume-copilot/resumes/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLES="$ROOT/examples/resumes"
RUNTIME="${RESUME_COPILOT_HOME:-$HOME/.resume-copilot}/resumes"
PATCH_MISSING_INNER=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--patch-missing-inner]

  Copy template.html from examples/resumes/<name>/ to the runtime home when
  ~/.resume-copilot/resumes/<name>/ already exists.

  --patch-missing-inner
      Append inner-row CSS to runtime templates that lack it (e.g. personal
      resumes not based on a repo example).
EOF
}

for arg in "$@"; do
  case "$arg" in
    --patch-missing-inner) PATCH_MISSING_INNER=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

patch_inner_css() {
  local file="$1"
  python3 - "$file" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
if ".inner-row" in text:
    sys.exit(0)
snippet = """
  .inner-row {
    display: grid;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .inner-col {
    min-width: 0;
    overflow-wrap: anywhere;
    box-sizing: border-box;
  }
  .inner-col--left { text-align: left; }
  .inner-col--center { text-align: center; }
  .inner-col--right { text-align: right; }
  .inner-col h1, .inner-col h2, .inner-col h3,
  .inner-col h4, .inner-col h5, .inner-col h6,
  .inner-col p { margin: 0; }
"""
if "</style>" not in text:
    print(f"==> Skip (no </style>): {path}", file=sys.stderr)
    sys.exit(0)
path.write_text(text.replace("</style>", f"{snippet}</style>", 1), encoding="utf-8")
print(f"==> Patched inner CSS: {path}")
PY
}

mkdir -p "$RUNTIME"

for example_dir in "$EXAMPLES"/*; do
  [[ -d "$example_dir" ]] || continue
  name="$(basename "$example_dir")"
  src="$example_dir/template.html"
  dest_dir="$RUNTIME/$name"
  dest="$dest_dir/template.html"
  [[ -f "$src" ]] || continue
  if [[ -d "$dest_dir" ]]; then
    cp "$src" "$dest"
    echo "==> Synced template: $name"
  fi
done

if $PATCH_MISSING_INNER; then
  for runtime_dir in "$RUNTIME"/*; do
    [[ -d "$runtime_dir" ]] || continue
    file="$runtime_dir/template.html"
    [[ -f "$file" ]] || continue
    patch_inner_css "$file"
  done
fi

echo "Runtime templates: $RUNTIME"
