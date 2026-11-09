#!/usr/bin/env bash
# Fail when a shipped composition leaves a telemetry or session-upload row
# enabled, or when shipped composition files or plugin sources name an
# external collector. Needs no dependency install, so the light CI job runs it.
#
# Usage: scripts/check-no-default-telemetry.sh [--self-test]
set -euo pipefail

cd "$(dirname "$0")/.."

# Rows that can send data off the machine; each must be disabled in shipped bundles.
guarded='dsh-session-telemetry-otel|dsh-host-product-telemetry-otel|dsh-client-product-analytics|dsh-session-log-deepseek'
# Hosts a shipped default may never point at.
forbidden_host='deepseeksvc\.com'

# Print every guarded row of one cordis patch file that is not disabled.
enabled_rows() {
  awk -v guarded="$guarded" '
    function flush() {
      if (name != "" && !off) print FILENAME ": row " id " (" name ") is enabled"
      name = ""; off = 0
    }
    /^[[:space:]]*- id:/ { flush(); id = $3 }
    $0 ~ "name: .?@deepseek-ai/(" guarded ")" { name = $0; sub(/.*name: /, "", name) }
    /^[[:space:]]+disabled: true[[:space:]]*$/ { off = 1 }
    /^[[:space:]]+enabled: false[[:space:]]*$/ { off = 1 }
    END { flush() }
  ' "$1"
}

check() {
  local status=0 file
  for file in packages/bundle/*/cordis.patch.yml packages/bundle/*/presets/*.patch.yml; do
    [[ -f "$file" ]] || continue
    out=$(enabled_rows "$file")
    if [[ -n "$out" ]]; then echo "$out" >&2; status=1; fi
  done
  if grep -rnE "$forbidden_host" packages/bundle --include='*.yml' >&2; then status=1; fi
  if grep -rnE "$forbidden_host" packages/*/*/src apps/*/src >&2 2>/dev/null; then status=1; fi
  return $status
}

if [[ "${1:-}" == --self-test ]]; then
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT
  printf '%s\n' '- insert:' '    - id: t' "      name: '@deepseek-ai/dsh-session-telemetry-otel'" '      config: {}' > "$tmp"
  [[ -n "$(enabled_rows "$tmp")" ]] || { echo 'self-test: enabled row was not rejected' >&2; exit 1; }
  printf '%s\n' '- insert:' '    - id: t' "      name: '@deepseek-ai/dsh-session-telemetry-otel'" '      disabled: true' > "$tmp"
  [[ -z "$(enabled_rows "$tmp")" ]] || { echo 'self-test: disabled row was rejected' >&2; exit 1; }
  echo 'self-test passed'
  exit 0
fi

check || { echo 'check-no-default-telemetry: shipped compositions must send no telemetry by default' >&2; exit 1; }
echo 'no default telemetry'
