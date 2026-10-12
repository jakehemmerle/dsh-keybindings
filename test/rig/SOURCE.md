# Vendored test rig

`rig.mjs` and `mock-llm.mjs` are copied from jakehemmerle/nix-config
`skills/new-dsh-plugin/scripts/` at commit `2d658d4187ce36db8ff01936620950dc44f760d2`
(last commit touching those files; nix-config main was `6a7e613` when copied, 2026-10-11).
Tests import them by relative path; never import the rig from `~/.agents` or the skill directory.

Local changes (keep them when re-vendoring):

- `startTui`: every tmux call passes `-f /dev/null`, so the private `-L` server never reads a user tmux config.
- `startTui`: adds `captureEscapes()` (`capture-pane -e`), used by the prompt-glyph colour oracle.
- `startTui`: also passes `COLORTERM` from the profile env (truecolor runs for exact colour oracles; empty means 256 colours).
- `startTui.text()`/`submit()`: `send-keys -l` passes `--` before the text, so drafts starting with `-` (generated hostile input) are not parsed as tmux flags (found by the seed-20261011 property run, `unknown flag -p`).

`mock-llm.mjs` is unchanged.
