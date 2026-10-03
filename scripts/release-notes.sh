#!/usr/bin/env bash
# Read and cut releases in CHANGELOG.md (Keep a Changelog format).
#
# Usage: scripts/release-notes.sh version          newest released version
#        scripts/release-notes.sh notes <version>  that version's section body
#        scripts/release-notes.sh unreleased       succeed when [Unreleased] has entries
#        scripts/release-notes.sh cut [YYYY-MM-DD] move [Unreleased] into a new version
#
# `cut` names the version <root package.json version>.<YYYYMMDD of date>, adding
# .2, .3, ... for further releases on the same day, writes the section and its
# link reference, and prints the version. date defaults to today (UTC).
# Exits non-zero when CHANGELOG.md has no released version, no such section,
# or (for `unreleased` and `cut`) no unreleased entries.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
changelog="$root/CHANGELOG.md"
public_repo='https://github.com/tBeltty/tbelt-code-public'

section() {
  VERSION="$1" awk '
    /^## \[/ { if (found) exit; if (index($0, "## [" ENVIRON["VERSION"] "]") == 1) { found = 1; next } }
    /^\[[^]]+\]: / { if (found) exit }
    found { print }
  ' "$changelog" | sed -e '/./,$!d'
}

has_entries() {
  [[ -n "$(section Unreleased | tr -d '[:space:]')" ]]
}

case "${1:-}" in
  version)
    version=$(sed -n 's/^## \[\([^]]*\)\].*/\1/p' "$changelog" | grep -v -x 'Unreleased' | head -n 1 || true)
    [[ -n "$version" ]] || { echo 'release-notes: CHANGELOG.md has no released version' >&2; exit 1; }
    printf '%s\n' "$version"
    ;;
  notes)
    version=${2:?usage: release-notes.sh notes <version>}
    [[ "$version" != Unreleased ]] && notes=$(section "$version") || notes=''
    [[ -n "${notes//[[:space:]]/}" ]] || { echo "release-notes: CHANGELOG.md has no section for $version" >&2; exit 1; }
    printf '%s\n' "$notes"
    ;;
  unreleased)
    has_entries
    ;;
  cut)
    has_entries || { echo 'release-notes: [Unreleased] has no entries' >&2; exit 1; }
    # Node instead of `date -d`, which macOS's BSD date lacks.
    day=$(node -e '
      const arg = process.argv[1]
      const date = arg === "now" ? new Date() : new Date(`${arg}T00:00:00Z`)
      if (Number.isNaN(date.getTime())) { console.error(`release-notes: invalid date ${arg}`); process.exit(2) }
      console.log(date.toISOString().slice(0, 10))
    ' "${2:-now}")
    base="$(node -p "require('$root/package.json').version").${day//-/}"
    version=$base
    n=1
    while grep -q -F "## [$version]" "$changelog"; do
      n=$((n + 1))
      version="$base.$n"
    done
    refs=$(grep -E '^\[[^]]+\]: ' "$changelog" | grep -v '^\[Unreleased\]: ' || true)
    body=$(VERSION="$version" DAY="$day" awk '
      /^\[[^]]+\]: / { next }
      { print }
      $0 == "## [Unreleased]" { print ""; print "## [" ENVIRON["VERSION"] "] - " ENVIRON["DAY"] }
    ' "$changelog")
    # [Unreleased] compares the newest tag with HEAD; each version links its tag.
    {
      printf '%s\n\n' "$body"
      echo "[Unreleased]: $public_repo/compare/v$version...HEAD"
      echo "[$version]: $public_repo/releases/tag/v$version"
      [[ -z "$refs" ]] || printf '%s\n' "$refs"
    } > "$changelog"
    printf '%s\n' "$version"
    ;;
  *)
    echo 'usage: release-notes.sh version | notes <version> | unreleased | cut [date]' >&2
    exit 2
    ;;
esac
