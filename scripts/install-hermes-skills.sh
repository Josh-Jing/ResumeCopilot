#!/usr/bin/env bash
# Install ResumeCopilot Hermes skills from this repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
LINK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --link) LINK=true; shift ;;
    --hermes-home) HERMES_HOME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SKILLS_DIR="$HERMES_HOME/skills"
mkdir -p "$SKILLS_DIR"

install_one() {
  local name="$1"
  local src="$ROOT/hermes-skill/$2"
  local dest="$SKILLS_DIR/$name"
  if [[ ! -d "$src" ]]; then
    echo "Missing skill source: $src" >&2
    exit 1
  fi
  rm -rf "$dest"
  if $LINK; then
    ln -s "$src" "$dest"
    echo "Linked $dest -> $src"
  else
    cp -R "$src" "$dest"
    echo "Copied $src -> $dest"
  fi
}

install_one resume-copilot-content content
install_one resume-copilot-template template
echo "Done. Run: hermes skills list | grep resume-copilot"
