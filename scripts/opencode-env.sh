#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="${repo_root}/.ralph-tui/opencode/tmp"

mkdir -p "${tmp_dir}"

export TMPDIR="${tmp_dir}"
export TMP="${tmp_dir}"
export TEMP="${tmp_dir}"
export BUN_TMPDIR="${tmp_dir}"

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command...>"
  echo "Example: $0 bun run dev -- run --tracker beads --epic ralph-tui-69x --force --no-tui"
  exit 1
fi

cd "${repo_root}"
exec "$@"
