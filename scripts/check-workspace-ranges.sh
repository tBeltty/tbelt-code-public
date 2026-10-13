#!/usr/bin/env bash
# Fail when a workspace package declares a DSH dependency with any range other
# than `workspace:*`. A `workspace:^` packs to `^<version>`, and the desktop
# packaging check requires the exact release version. Needs no dependency
# install.
#
# Usage: scripts/check-workspace-ranges.sh [--fix]
# --fix rewrites `workspace:^` and `workspace:~` DSH dependencies to
# `workspace:*` (the upstream sync runs it); run `pnpm install
# --lockfile-only` afterwards to refresh pnpm-lock.yaml.
set -euo pipefail

cd "$(dirname "$0")/.."

dep='"@deepseek-ai/dsh(-[^"]+)?": "workspace:[~^]"'
files=$(git ls-files 'packages/**/package.json' 'apps/**/package.json')

if [[ "${1:-}" == --fix ]]; then
  printf '%s\n' "$files" | xargs sed -i -E 's#("@deepseek-ai/dsh(-[^"]+)?": "workspace:)[~^]"#\1*"#'
  exit 0
fi

bad=$(printf '%s\n' "$files" | xargs grep -nE "$dep" || true)
if [[ -n "$bad" ]]; then
  printf '%s\n' "$bad" >&2
  echo 'check-workspace-ranges: DSH dependencies must use "workspace:*" (fix: scripts/check-workspace-ranges.sh --fix)' >&2
  exit 1
fi
