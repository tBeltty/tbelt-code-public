#!/usr/bin/env bash
# Read and cut releases in CHANGELOG.md (Keep a Changelog format).
#
# Usage: scripts/release-notes.sh version          newest released version
#        scripts/release-notes.sh notes <version>  that version's section body
#        scripts/release-notes.sh unreleased       succeed when [Unreleased] has entries
#        scripts/release-notes.sh cut [YYYY-MM-DD] move [Unreleased] into a new version
#        scripts/release-notes.sh missing          list commits with no changelog line
#        scripts/release-notes.sh features         check README.md lists the new features
#        scripts/release-notes.sh features-pr [base]  same check on a branch before it merges
#
# `cut` names the version <root package.json version>.<YYYYMMDD of date>, adding
# .2, .3, ... for further releases on the same day, writes the section and its
# link reference, and prints the version. date defaults to today (UTC).
# Exits non-zero when CHANGELOG.md has no released version, no such section,
# or (for `unreleased` and `cut`) no unreleased entries.
#
# `missing` checks the commits since the last `Release <version>` commit and
# prints `<short sha> <subject>` for each one that changes app code (apps/,
# packages/, python/ or native/, ignoring tests and Markdown) without touching
# CHANGELOG.md. A commit is also covered when its message has the line
# `Changelog: none` (no user-visible change) or when a later commit's message
# has `Changelog-for: <sha>` (its lines were added afterwards). Exits non-zero
# when it prints anything.
#
# `features` fails when [Unreleased] has an "Added" entry but README.md has not
# changed since the last `Release <version>` commit. Add the feature to the
# README Features list, or put the line `README: none` in a commit message
# since that release.
#
# `features-pr` applies the same rule to one branch: it fails when the commits
# after <base> (default origin/main) add an "Added" entry under [Unreleased]
# but neither change README.md nor carry `README: none` in a message. Running
# it before the branch merges keeps `features` from failing at release time.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
changelog="$root/CHANGELOG.md"
public_repo='https://github.com/tBeltty/tbelt-code-public'

# Body of one version's section; reads the CHANGELOG file given as $2.
section() {
  VERSION="$1" awk '
    /^## \[/ { if (found) exit; if (index($0, "## [" ENVIRON["VERSION"] "]") == 1) { found = 1; next } }
    /^\[[^]]+\]: / { if (found) exit }
    found { print }
  ' "${2:-$changelog}" | sed -e '/./,$!d'
}

# "- ..." lines under [Unreleased] > "### Added" in the CHANGELOG file given as $1.
added_entries() {
  section Unreleased "$1" | awk '/^### /{on=($0=="### Added")} on && /^- /{print}'
}

# One-line failure for a missing README change: names the entries and the fix.
features_failure() {
  echo 'release-notes: README.md Features list not updated. Add these "Added" entries to the README.md Features list in a commit, or put the line "README: none" in a commit message if the README needs no change:' >&2
  printf '%s\n' "$1" >&2
  exit 1
}

# App code paths that can change what a user sees; tests and Markdown are excluded.
touches_app() {
  git diff-tree --no-commit-id --name-only -r "$1" |
    grep -E '^(apps|packages|python|native)/' |
    grep -v -E '(\.(spec|test|e2e)\.[cm]?[jt]sx?$|/tests?/|/__tests__/|\.md$)' |
    grep -q .
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
  missing)
    last=$(git log -1 --format=%H --grep='^Release ' || true)
    range=${last:+$last..}HEAD
    covered=$(git log --format=%B "$range" | sed -n 's/^Changelog-for: *\([0-9a-fA-F]\{7,40\}\).*/\1/p')
    found=0
    for sha in $(git rev-list --no-merges "$range"); do
      git diff-tree --no-commit-id --name-only -r "$sha" | grep -q -x 'CHANGELOG.md' && continue
      git log -1 --format=%B "$sha" | grep -q -x 'Changelog: none' && continue
      touches_app "$sha" || continue
      skip=false
      for prefix in $covered; do
        [[ "$sha" == "$prefix"* ]] && { skip=true; break; }
      done
      $skip && continue
      git log -1 --format='%h %s' "$sha"
      found=1
    done
    [[ "$found" == 0 ]]
    ;;
  features)
    added=$(added_entries "$changelog")
    [[ -n "$added" ]] || exit 0
    last=$(git log -1 --format=%H --grep='^Release ' || true)
    range=${last:+$last..}HEAD
    [[ -n "$(git log --format=%H "$range" -- README.md)" ]] && exit 0
    git log --format=%B "$range" | grep -q -x 'README: none' && exit 0
    features_failure "$added"
    ;;
  features-pr)
    base=${2:-origin/main}
    base_changelog=$(mktemp)
    trap 'rm -f "$base_changelog"' EXIT
    git show "$base:CHANGELOG.md" > "$base_changelog"
    base_log=$(added_entries "$base_changelog")
    new=$(comm -13 <(printf '%s\n' "$base_log" | sort) <(added_entries "$changelog" | sort))
    [[ -n "$new" ]] || exit 0
    [[ -n "$(git diff --name-only "$base...HEAD" -- README.md)" ]] && exit 0
    git log --format=%B "$base..HEAD" | grep -q -x 'README: none' && exit 0
    features_failure "$new"
    ;;
  *)
    echo 'usage: release-notes.sh version | notes <version> | unreleased | cut [date] | missing | features | features-pr [base]' >&2
    exit 2
    ;;
esac
