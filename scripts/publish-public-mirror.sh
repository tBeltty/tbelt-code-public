#!/usr/bin/env bash
# Publish the current HEAD tree to tBelt Code's public source mirror.
#
# Development happens in the private repository; the public repository only
# receives one snapshot commit per call, authored by MIRROR_AUTHOR_NAME and
# MIRROR_AUTHOR_EMAIL, whose parent is the previous snapshot. No private commit,
# author or message reaches the mirror. Paths in EXCLUDE are left out: the
# upstream sync state and the internal documentation and agent instructions (docs/, website/, .agents/,
# .claude/, AGENTS.md and CLAUDE.md files). Paths in KEEP are published even
# though an EXCLUDE pattern matches them: the README logo and agent-instruction
# test fixtures.
#
# The snapshot is tagged v<version>, where <version> is the newest released
# version in CHANGELOG.md; the public repository's release workflow turns the
# tag into a GitHub Release. When that tag already exists in the mirror, the
# snapshot is published without a tag, so no new Release is created.
#
# Usage: scripts/publish-public-mirror.sh
# Environment:
#   MIRROR_REMOTE        push URL of the public repository (required)
#   MIRROR_FORBIDDEN     newline-separated strings that must not appear in the
#                        published tree, e.g. private email addresses (required)
#   MIRROR_AUTHOR_NAME   snapshot author and committer name (required)
#   MIRROR_AUTHOR_EMAIL  snapshot author and committer email (required)
#   MIRROR_REPLACE_HISTORY  "true" publishes the snapshot as a new root commit and
#                        force-updates the mirror's main, dropping earlier
#                        snapshots from its history (default false)
set -euo pipefail

: "${MIRROR_REMOTE:?MIRROR_REMOTE is required}"
: "${MIRROR_FORBIDDEN:?MIRROR_FORBIDDEN is required}"
: "${MIRROR_AUTHOR_NAME:?MIRROR_AUTHOR_NAME is required}"
: "${MIRROR_AUTHOR_EMAIL:?MIRROR_AUTHOR_EMAIL is required}"

EXCLUDE=(
  '.upstream'
  'scripts/release-public.sh'
  '.agents'
  '.claude'
  'docs'
  'website'
  ':(glob)**/AGENTS.md'
  ':(glob)**/CLAUDE.md'
)

KEEP=(
  'docs/brand/tbelt_logo.png'
  'apps/cli/tests/profiles/AGENTS.md'
  'snapshots/session/agent-instructions/workspace/AGENTS.md'
)

root=$(git rev-parse --show-toplevel)
cd "$root"
version=$(scripts/release-notes.sh version)
scripts/release-notes.sh notes "$version" >/dev/null
tag="v$version"
replace=${MIRROR_REPLACE_HISTORY:-false}
refs=("refs/heads/main" "refs/tags/$tag")
if git ls-remote --exit-code --tags "$MIRROR_REMOTE" "refs/tags/$tag" >/dev/null; then
  # Already released: publish the snapshot without a new tag or Release.
  refs=("refs/heads/main")
fi

index=$(mktemp)
trap 'rm -f "$index"' EXIT
GIT_INDEX_FILE=$index git read-tree HEAD
GIT_INDEX_FILE=$index git rm -r -q --cached --ignore-unmatch -- "${EXCLUDE[@]}"
GIT_INDEX_FILE=$index git reset -q HEAD -- "${KEEP[@]}"
tree=$(GIT_INDEX_FILE=$index git write-tree)

if [[ "$(git cat-file -p "$tree:LICENSE" | head -n 1 | xargs)" != 'GNU AFFERO GENERAL PUBLIC LICENSE' ]]; then
  echo 'publish-public-mirror: LICENSE is not the GNU AGPL; refusing to publish' >&2
  exit 1
fi

while IFS= read -r needle; do
  [[ -n "$needle" ]] || continue
  if git grep -I -q -F -i -e "$needle" "$tree"; then
    echo 'publish-public-mirror: a forbidden string appears in the tree; refusing to publish' >&2
    exit 1
  fi
done <<<"$MIRROR_FORBIDDEN"

parent=()
if [[ "$replace" != true ]] && git ls-remote --exit-code --heads "$MIRROR_REMOTE" main >/dev/null; then
  git fetch -q --depth=1 "$MIRROR_REMOTE" +refs/heads/main:refs/mirror/public-main
  previous=$(git rev-parse refs/mirror/public-main)
  if [[ "$(git rev-parse "$previous^{tree}")" == "$tree" ]]; then
    echo "publish-public-mirror: the mirror already has this tree (${previous:0:12}); nothing to publish"
    exit 0
  fi
  parent=(-p "$previous")
fi

commit=$(
  GIT_AUTHOR_NAME=$MIRROR_AUTHOR_NAME GIT_AUTHOR_EMAIL=$MIRROR_AUTHOR_EMAIL \
  GIT_COMMITTER_NAME=$MIRROR_AUTHOR_NAME GIT_COMMITTER_EMAIL=$MIRROR_AUTHOR_EMAIL \
    git commit-tree "$tree" ${parent[@]+"${parent[@]}"} -m "tBelt Code $version"
)
force=()
[[ "$replace" == true ]] && force=(--force)
git push -q --no-verify ${force[@]+"${force[@]}"} "$MIRROR_REMOTE" "${refs[@]/#/$commit:}"
if (( ${#refs[@]} == 2 )); then
  echo "publish-public-mirror: published tBelt Code $version as ${commit:0:12} ($tag)"
else
  echo "publish-public-mirror: published ${commit:0:12}; $tag was already released, so no tag was added"
fi
