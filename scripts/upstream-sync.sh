#!/usr/bin/env bash
# Bring DeepSeek Harness changes into tBelt Code.
#
# tBelt Code shares no git history with upstream, so this replays the upstream
# range UPSTREAM_BASE..<target> as a three-way merge against the current HEAD
# (`git merge-tree --merge-base`). The result is one commit on a new branch:
# files both sides changed keep conflict markers for a human to resolve, files
# tBelt Code deleted stay deleted, and paths matching SKIP_PATTERNS keep
# tBelt Code's version (or stay absent).
#
# Usage: scripts/upstream-sync.sh [target-ref]   (default: UPSTREAM_BRANCH)
# Output: branch upstream-sync/<short-sha>, and a summary in
#         $UPSTREAM_SYNC_SUMMARY (default .upstream/last-sync-summary.md, untracked).
# shellcheck disable=SC2016  # backticks in the summary are Markdown, not expansions
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
config=.upstream/deepseek-harness.env
# shellcheck source=/dev/null
source "$config"

# Upstream-only paths tBelt Code does not carry: maintainer notes, Chinese
# translations, the docs website, and upstream's own CI (which would run the
# full quality gate with their secrets).
SKIP_PATTERNS=(
  '.agents/*'
  '.github/*'
  '*.zh.md'
  '*.i18n.yaml'
  'website/*'
)

# tBelt Code's own areas: the whole file keeps tBelt Code's version even when
# upstream changed it, and new upstream files there are dropped. Upstream API
# changes these files depend on still surface as typecheck failures on the PR.
OURS_PATTERNS=(
  'apps/desktop/*'
  'apps/desktop-host/*'
  'LICENSE'
  'LICENSES/*'
  'README.md'
  'SAFETY.md'
  '.gitguardian.yaml'
  'docs/AGENTS.md'
  'docs/development.md'
  'apps/web/index.html'
  'apps/web/public/*'
)

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'upstream-sync: working tree has uncommitted changes; commit or stash them first' >&2
  exit 1
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
target_ref=${1:-$UPSTREAM_BRANCH}
# The merge needs only the base and target trees, so CI fetches them shallowly
# (UPSTREAM_SYNC_FETCH_DEPTH=1); a local run fetches full history by default.
fetch=(git fetch --no-tags ${UPSTREAM_SYNC_FETCH_DEPTH:+--depth="$UPSTREAM_SYNC_FETCH_DEPTH"} upstream)
if [[ "$target_ref" == "$UPSTREAM_BRANCH" ]]; then
  "${fetch[@]}" "+refs/heads/$UPSTREAM_BRANCH:refs/remotes/upstream/$UPSTREAM_BRANCH"
  target=$(git rev-parse "refs/remotes/upstream/$UPSTREAM_BRANCH")
else
  # A tag or upstream branch name is not a local ref, so resolve it via FETCH_HEAD.
  if ! target=$(git rev-parse --verify --quiet "$target_ref^{commit}"); then
    "${fetch[@]}" "$target_ref"
    target=$(git rev-parse --verify "FETCH_HEAD^{commit}")
  fi
fi
git cat-file -e "$UPSTREAM_BASE^{commit}" 2>/dev/null || "${fetch[@]}" "$UPSTREAM_BASE"

if [[ "$target" == "$UPSTREAM_BASE" ]]; then
  echo "upstream-sync: already at upstream ${target:0:12}; nothing to do"
  exit 0
fi

head=$(git rev-parse HEAD)
skipped() {
  local path=$1 pattern
  for pattern in "${SKIP_PATTERNS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$path" == $pattern ]] && return 0
  done
  return 1
}
ours() {
  local path=$1 pattern
  for pattern in "${OURS_PATTERNS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$path" == $pattern ]] && return 0
  done
  return 1
}

set +e
merge_output=$(git merge-tree --write-tree --name-only --merge-base="$UPSTREAM_BASE" "$head" "$target")
merge_status=$?
set -e
if (( merge_status > 1 )); then
  echo "$merge_output" >&2
  exit "$merge_status"
fi
tree=$(sed -n 1p <<<"$merge_output")
# With --name-only, conflicted paths follow the tree id until the first blank line.
mapfile -t conflicted < <(sed -n '2,/^$/p' <<<"$merge_output" | sed '/^$/d' | sort -u)

branch="upstream-sync/${target:0:12}"
git checkout -q -B "$branch" "$head"
git read-tree -u --reset "$tree"

# Keep tBelt Code's deletions and drop upstream-only areas.
kept_deleted=()
while IFS= read -r path; do
  if skipped "$path"; then
    git rm -q --cached -f -- "$path"; rm -f -- "$path"
  elif git cat-file -e "$UPSTREAM_BASE:$path" 2>/dev/null; then
    # Existed at the base and tBelt Code deleted it, but upstream changed it since.
    kept_deleted+=("$path")
    git rm -q --cached -f -- "$path"; rm -f -- "$path"
  fi
  # Otherwise it is a new upstream file and stays.
done < <(git diff --cached --no-renames --name-only --diff-filter=A "$head")

# Skipped areas tBelt Code does carry keep tBelt Code's version.
while IFS= read -r path; do
  skipped "$path" && git checkout -q "$head" -- "$path"
done < <(git diff --cached --no-renames --name-only --diff-filter=MD "$head")

# tBelt Code's own areas take tBelt Code's copy wholesale, conflicted or not.
kept_ours=()
while IFS= read -r path; do
  ours "$path" || continue
  if git cat-file -e "$head:$path" 2>/dev/null; then
    git checkout -q "$head" -- "$path"
  else
    git rm -q --cached -f -- "$path"; rm -f -- "$path"
  fi
  kept_ours+=("$path")
done < <(git diff --cached --no-renames --name-only "$head")

# Docs are English only: drop the language switcher upstream puts under titles.
while IFS= read -r path; do
  [[ -f "$path" ]] || continue
  perl -0pi -e 's/^English \| \[\x{4E2D}\x{6587}\]\([^)\n]*\)\n\n?//mu' -CSD -- "$path"
  git add -- "$path"
done < <(git diff --cached --no-renames --name-only --diff-filter=AM "$head" -- '*.md')

remaining=()
upstream_deleted=()
for path in "${conflicted[@]}"; do
  skipped "$path" && continue
  ours "$path" && continue
  if [[ ! -e "$path" ]] || ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    continue
  fi
  if grep -q '^<<<<<<< ' -- "$path"; then
    remaining+=("$path")
  else
    # modify/delete: upstream removed a file tBelt Code changed; tBelt Code's copy stays.
    upstream_deleted+=("$path")
  fi
done

# Packages released in lockstep with dsh follow upstream's new version, including
# tBelt Code-owned ones, so `release:pack --family dsh` and desktop packaging
# keep matching versions.
manifest_version() { perl -ne 'if (/^  "version": "([^"]+)"/) { print $1; exit }' "$@"; }
old_version=$(git show "$head:package.json" | manifest_version)
new_version=$(manifest_version package.json)
version_aligned=()
if [[ -n "$old_version" && -n "$new_version" && "$old_version" != "$new_version" ]]; then
  while IFS= read -r manifest; do
    [[ -f "$manifest" && "$(manifest_version "$manifest")" == "$old_version" ]] || continue
    OLD="$old_version" NEW="$new_version" perl -pi -e 's/^  "version": "\Q$ENV{OLD}\E"/  "version": "$ENV{NEW}"/' "$manifest"
    git add -- "$manifest"
    version_aligned+=("$manifest")
  done < <(git ls-files -- 'apps/*/package.json' 'packages/*/*/package.json')
fi

sed "s/^UPSTREAM_BASE=.*/UPSTREAM_BASE=$target/" "$config" > "$config.tmp" && mv "$config.tmp" "$config"
git add -- "$config"

summary=${UPSTREAM_SYNC_SUMMARY:-.upstream/last-sync-summary.md}
{
  echo "Upstream: $UPSTREAM_URL"
  echo "Range: [\`${UPSTREAM_BASE:0:12}...${target:0:12}\`]($UPSTREAM_URL/compare/$UPSTREAM_BASE...$target)"
  echo
  echo "Files changed by this sync: $(git diff --cached --no-renames --name-only "$head" | wc -l)"
  echo
  if (( ${#remaining[@]} > 0 )); then
    echo "### Conflicts to resolve (${#remaining[@]})"
    echo
    echo 'These files contain `<<<<<<<` / `>>>>>>>` markers where tBelt Code and upstream changed the same lines.'
    echo
    printf -- '- `%s`\n' "${remaining[@]}"
  else
    echo 'No conflicts.'
  fi
  if (( ${#kept_ours[@]} > 0 )); then
    echo
    echo "### Kept tBelt Code's version (${#kept_ours[@]})"
    echo
    echo 'Upstream changed these tBelt Code-owned files; tBelt Code'"'"'s copy stays. Port any upstream API change they need.'
    echo
    printf -- '- `%s`\n' "${kept_ours[@]}"
  fi
  if (( ${#version_aligned[@]} > 0 )); then
    echo
    echo "### Moved to version $new_version (${#version_aligned[@]})"
    echo
    echo "These packages were on $old_version with dsh and follow it to $new_version."
    echo
    printf -- '- `%s`\n' "${version_aligned[@]}"
  fi
  if (( ${#upstream_deleted[@]} > 0 )); then
    echo
    echo "### Deleted upstream, kept here (${#upstream_deleted[@]})"
    echo
    echo 'Upstream removed these files but tBelt Code had changed them, so tBelt Code'"'"'s copy stays. Delete any that the upstream change made obsolete.'
    echo
    printf -- '- `%s`\n' "${upstream_deleted[@]}"
  fi
  if (( ${#kept_deleted[@]} > 0 )); then
    echo
    echo "### Kept deleted (${#kept_deleted[@]})"
    echo
    echo 'tBelt Code removed these files; upstream changed them. Restore any that matter with `git checkout '"${target:0:12}"' -- <path>`.'
    echo
    printf -- '- `%s`\n' "${kept_deleted[@]}"
  fi
} > "$summary"

git -c core.hooksPath=/dev/null commit -q --no-verify -m "chore(upstream): sync DeepSeek Harness ${target:0:12}" \
  -m "Replays upstream ${UPSTREAM_BASE:0:12}..${target:0:12} onto tBelt Code. ${#remaining[@]} file(s) still carry conflict markers."
echo "upstream-sync: branch $branch ready; ${#remaining[@]} conflicted file(s); summary in $summary"
