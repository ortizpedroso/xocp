#!/usr/bin/env bash
set -euo pipefail

# Pinned upstream — bump only with an intentional version decision.
UI_UX_PRO_MAX_PINNED_COMMIT="f3ac195224eac1eb0dfe1a3059c2a6add78ffbe3"
UI_UX_PRO_MAX_REPO="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git"

INSTALL_DIR="${HOME}/.config/opencode/skills/ui-ux-pro-max"
SEARCH_PY="${INSTALL_DIR}/scripts/search.py"
SKILL_MD="${INSTALL_DIR}/SKILL.md"
UPSTREAM_SKILL_DIR=".claude/skills/ui-ux-pro-max"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

git -C "$tmpdir" init -q
git -C "$tmpdir" remote add origin "$UI_UX_PRO_MAX_REPO"
git -C "$tmpdir" fetch --depth 1 origin "$UI_UX_PRO_MAX_PINNED_COMMIT"
git -C "$tmpdir" checkout -q FETCH_HEAD

mkdir -p "$INSTALL_DIR"
cp -a "$tmpdir/$UPSTREAM_SKILL_DIR/." "$INSTALL_DIR/"

sed -i "s|\${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py|${SEARCH_PY}|g" "$SKILL_MD"

cat >"${INSTALL_DIR}/PINNED_UPSTREAM.txt" <<EOF
repository=${UI_UX_PRO_MAX_REPO}
commit=${UI_UX_PRO_MAX_PINNED_COMMIT}
installed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
search_py=${SEARCH_PY}
EOF

echo "Installed ui-ux-pro-max skill to ${INSTALL_DIR}"
echo "Pinned commit: ${UI_UX_PRO_MAX_PINNED_COMMIT}"
