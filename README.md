# dsh-keybindings

[omp](https://github.com/can1357/oh-my-pi)'s effort and model keys for [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) (`dst`), the terminal front end for DeepSeek Harness. They work on both the chat prompt and the first screen (Launchpad).

| Key / command | Behaviour | omp equivalent |
|---|---|---|
| `Shift+Tab` | Step the reasoning effort to the next level the live model offers, wrapping (e.g. Low → Medium → High → Xhigh → Max → Low). It persists like an `/effort` pick, and the chat shows `Effort: High`. | `app.thinking.cycle` |
| `Alt+P` | Open the model picker for the session. The draft stays as typed. | `app.model.selectTemporary` |
| `/permissions` | Same as `/permission`: the permission-preset picker. dst used to cycle these modes with Shift+Tab; plan mode stays on `/plan`. | |
| Prompt glyph `❯` | Coloured with omp's per-level thinking colours. On dark themes: low `#178fb9`, medium `#0088fa`, high `#b281d6`, xhigh `#e5c1ff`; light themes use darker twins. The hues stay distinct on 256-colour terminals. The top tier keeps dst's bold ignition colour and charge animation. | thinking-coloured editor edge |

Targets **dsh-tui 0.14.0**. Tested with DeepSeek Harness 0.2.1-alpha.2.

## Why a patch, not a plugin

dsh-TUI's plugin shortcut registry (`ctx.tuiShortcuts`) does not cover this:

- it only accepts Ctrl or Alt combos, so it cannot bind Shift+Tab;
- it only fires in the plain chat state, not on the first screen;
- no plugin-facing service can change the effort or open the model picker.

The screens are imported as soon as the dsh-tui bundle loads, before any later profile entry could hook them. So this is a small patch against the published package's `lib/types`. It adds one module (`effortCycle.js`) and touches the chat prompt, the Launchpad, the command router, the command list, one help string and the prompt glyph.

## Install

### npm / pnpm install

```sh
scripts/apply.sh ~/.dsh/profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui
```

The script:

- checks the version;
- skips if the patch is already applied;
- picks the right patch variant;
- dry-runs, then patches, keeping `*.dsh-keybindings.orig` backups;
- runs the test suite.

Restart `dst` afterwards. Reinstalling or `/update` replaces the package, so re-run it.

### Nix

Add the patch to the dsh-tui derivation and run the tests as its install check:

```nix
patches = [ ./dsh-tui-0.14.0.patch ];  # or the -after-launchpad-word-edit variant, listed after that patch
doInstallCheck = true;
installCheckPhase = ''
  HOME=$TMPDIR DSH_TUI_TYPES=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui/lib/types \
    node --test ${./test/omp-keys.test.mjs}
'';
```

## Patches

| File | Apply to |
|---|---|
| `patches/dsh-tui-0.14.0.patch` | The untouched npm tarball |
| `patches/dsh-tui-0.14.0-after-launchpad-word-edit.patch` | A package that already has a Launchpad word-edit patch (Ctrl+W, Ctrl+←/→), as in [jakehemmerle/nix-config](https://github.com/jakehemmerle/nix-config) |

## Tests

```sh
DSH_TUI_TYPES=<dsh-tui>/lib/types node --test test/omp-keys.test.mjs
```

There are nine tests:

- the effort ladder and wrap-around;
- starting from the route default;
- routes without effort levels;
- refused writes;
- repeated presses (dropped while one is in flight);
- error reporting;
- `/permissions` registration;
- the key wiring in the chat prompt, the Launchpad and the command router.

An unpatched package fails them.

## Updating for a new dsh-TUI version

1. Re-apply the hunks to the new `lib/types`.
2. Regenerate the patch with `diff -ruN`.
3. Rename it to the new version.
4. Update the version check in `scripts/apply.sh`.

Retire this if dsh-TUI adds a configurable effort-cycle key.

## License

MIT. The patch modifies dsh-TUI, © 2026 chimney (ccch1mneyyy), which is MIT-licensed. See [LICENSE](LICENSE).
