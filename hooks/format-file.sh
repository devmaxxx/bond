#!/usr/bin/env bash
# Format the file just edited/written via prettier (if available in the project).
# Reads Claude Code's tool payload from stdin and extracts the file path.
set -euo pipefail

file_path="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"

if [[ -z "${file_path}" ]] || [[ ! -f "${file_path}" ]]; then
  exit 0
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm exec prettier --write --ignore-unknown "${file_path}" >/dev/null 2>&1 || true
elif command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write --ignore-unknown "${file_path}" >/dev/null 2>&1 || true
fi

exit 0
