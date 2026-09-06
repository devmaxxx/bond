#!/usr/bin/env bash
# Format the file just edited/written via prettier (if available in the project).
# Reads Claude Code's tool payload from stdin and extracts the file path.
set -euo pipefail

file_path="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"

if [[ -z "${file_path}" ]] || [[ ! -f "${file_path}" ]]; then
  exit 0
fi

# Prettier resolves .prettierignore against the working directory, not against the file, so
# running it from wherever the session happens to stand reformats paths the project excludes.
# Stand in the file's own repository root — a worktree resolves to its own root and its own
# ignore file — and hand prettier a path relative to it.
file_dir="$(cd "$(dirname "${file_path}")" && pwd)"
abs_path="${file_dir}/$(basename "${file_path}")"
project_root="$(git -C "${file_dir}" rev-parse --show-toplevel 2>/dev/null || echo "${file_dir}")"
rel_path="${abs_path#"${project_root}"/}"

cd "${project_root}" || exit 0

if command -v pnpm >/dev/null 2>&1; then
  pnpm exec prettier --write --ignore-unknown "${rel_path}" >/dev/null 2>&1 || true
elif command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write --ignore-unknown "${rel_path}" >/dev/null 2>&1 || true
fi

exit 0
