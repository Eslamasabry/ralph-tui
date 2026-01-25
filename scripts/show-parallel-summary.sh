#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
summary_dir="${repo_root}/.ralph-tui/logs/parallel-summary"

latest="$(ls -t "${summary_dir}"/*.json 2>/dev/null | head -n 1 || true)"
if [[ -z "${latest}" ]]; then
  echo "No parallel summary files found in ${summary_dir}."
  exit 1
fi

cat "${latest}"
