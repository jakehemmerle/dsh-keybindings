#!/usr/bin/env bash
# Patch an installed dsh-tui 0.14.0 in place with the dsh-keybindings patch.
#
#   scripts/apply.sh <path-to>/node_modules/@deepseek-harness-tui/dsh-tui
#
# Refuses other versions, dry-runs first, keeps a backup of every touched file
# (*.dsh-keybindings.orig), and skips if the patch is already applied.
set -euo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
pkg=${1:?usage: scripts/apply.sh <dsh-tui package dir>}
pkg=$(cd "$pkg" && pwd)

version=$(node -p "require('$pkg/package.json').version")
if [ "$version" != "0.14.0" ]; then
  echo "dsh-keybindings: dsh-tui $version is not supported (patch targets 0.14.0)" >&2
  exit 1
fi

if [ -f "$pkg/lib/types/effortCycle.js" ]; then
  echo "dsh-keybindings: already applied to $pkg"
  exit 0
fi

# Nix-style installs that already carry the Launchpad word-edit patch need the
# variant generated on top of it.
patchfile="$here/patches/dsh-tui-0.14.0.patch"
if grep -q "Word edits, as in the chat prompt" "$pkg/lib/types/screens/Launchpad.js"; then
  patchfile="$here/patches/dsh-tui-0.14.0-after-launchpad-word-edit.patch"
fi

cd "$pkg"
patch -p1 --dry-run --forward < "$patchfile" >/dev/null
patch -p1 --forward --backup --suffix=.dsh-keybindings.orig < "$patchfile"

DSH_TUI_TYPES="$pkg/lib/types" node --test "$here/test/omp-keys.test.mjs"
echo "dsh-keybindings: applied $(basename "$patchfile") to $pkg; restart dst"
