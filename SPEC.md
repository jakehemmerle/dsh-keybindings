# SPEC.md — dsh-keybindings (dsh-omp-keys)

omp's effort and model keys for dsh-TUI `0.14.0` (`dst`), delivered as a
version-pinned source patch because dsh-TUI has no plugin seam for them: the
plugin shortcut registry cannot bind Shift+Tab, does not fire on the first
screen, and no service can change effort or open the model picker. The patch
adds one module (`lib/types/effortCycle.js`) and touches the chat prompt
input, the Launchpad, the command router, the command list, one help string
and the prompt glyph.

Target versions (temporary alpha exception per the `new-dsh-plugin` skill):
DSH `0.2.1-alpha.2`, dsh-TUI `0.14.0`. The patch is built against the npm
tarball (`sha512-syU0CLbAoxA97URyhnPFiLbWm3dXrmCR5NCO6mFovRi7mebX2HeEYdhpugEoT9vZ1vpUfE/+uX7xrs6zOGUJ1g==`)
and against the fleet stack, whose `launchpad-word-edit.patch` is applied
first. Both patch variants shipped in `patches/` are byte-identical
(md5 `97fd5507744a027af51993f1ac810b4b`) and apply cleanly to both bases;
the variant names only document the intended base. Source reconcile with the
deployed copy (`~/nix-config/pkgs/dsh-omp-keys`, applied after
`launchpad-word-edit.patch` in `pkgs/dsh-tui.nix`) is byte-identical for the
patch, its tests, the launchpad patch and the package lock.

## Surfaces

| Surface | Applicability |
|---|---|
| dsh-TUI chat (follow-up prompts) | applicable — primary |
| dsh-TUI Launchpad (first prompt) | applicable — equal primary |
| dsh web | **not applicable**: the patch only modifies the `@deepseek-harness-tui/dsh-tui` package, which the web profile bundle does not load. Inertness property (S5) proves real dsh web is unaltered by this repo being installed. |
| headless | not applicable — no interactive editor; no property claims |

## Scope and non-goals

- Shift+Tab cycles **reasoning effort** through the levels the live route
  declares. It no longer cycles permission modes; those move to
  `/permission` / `/permissions` (DSH local command). Plan mode stays on
  `/plan`.
- Alt+P opens the session **model picker**; the draft stays as typed.
- The prompt glyph `❯` is tinted by effort tier with omp's thinking colours.
- **No effort pin**: the patch never forces an initial effort (the audit's
  "effort persistence vs removed `effort: max` pin" is resolved as: absent
  state leaves DSH's own default; only user picks are persisted).
- No plugin API is used; no dsh web behaviour changes; no other keys rebound.

## State ownership

- `~/.dsh-tui/effort.json` — `{"effort": "<level-id>"}` after a completed
  pick; rewritten only by the patch's pick path. Missing/malformed file must
  behave exactly like "no pick".
- Live effort — per route/model, read from `channel.reasoningEffort` /
  `listEfforts()`; never invented by the patch.
- Draft text — transient editor state per screen; the patch must never alter
  it except through ordinary typing/backspace.
- Theme — DSH's own `theme.json`; read-only for the glyph.

## Acceptance properties

Oracle: `test/e2e/lib/oracle.mjs` (spec-owned ladder order, wire spellings,
omp palette, terminal colour math). It imports nothing from dsh-TUI or the
patch. `LEVELS = [minimal, low, medium, high, xhigh, max]`, weakest first;
wire spellings `w-<level>` are distinct so a request names exactly which
level it carries.

| ID | Property | Oracle | Surfaces |
|---|---|---|---|
| P-01 | Shift+Tab, on both screens, sets the next level of the live route's ladder, wrapping to the first rung after the last; an unknown/absent current starts at the first rung. | `expectedNext(ladder, current)` | TUI Launchpad, TUI chat |
| P-02 | Every turn submitted from either screen serialises `reasoning_effort` = the wire spelling of the live level (absent when none), including the final turn of a case. | `wire(effort)` vs mock request log | TUI Launchpad, TUI chat |
| P-03 | A completed pick is persisted to `~/.dsh-tui/effort.json` and is the live effort after a process restart on the same profile. | file bytes vs model state; restart | TUI both |
| P-04 | Plain typing (letters incl. `p`/`P`, digits, punctuation, spaces, non-ASCII) is editor input on both screens and never triggers cycling or the picker; the meta guard reserves Alt+P. Draft edits (backspace) behave as typed. | rendered draft vs model draft (I-4) | TUI both |
| P-05 | A burst of k Shift+Tab presses advances the persisted effort by between 1 and k rungs — presses landing while a step is pending are dropped, never queued or raced; the result stays on the ladder; the guard releases for later presses. | `allowed = next^i(effort)`, i ≤ k | TUI both |
| P-06 | A route offering fewer than two effort levels makes Shift+Tab a complete no-op: no write, no toast, no readout or file change. | model unchanged | TUI both |
| P-07 | Alt+P opens the session model picker on both screens; Escape closes it and returns to the prior screen with the draft preserved; no picker is left open. | screen capture vs model (I-5) | TUI both |
| P-08 | A malformed `effort.json` behaves as absent: no crash, live effort undefined, first Shift+Tab lands on the first rung, and the file is rewritten only by a completed pick. | parse fails ⇒ `undefined` | TUI both |
| P-09 | `/permissions` is a DSH-local command (requirement `dsh`) that opens the permission-preset picker; Escape closes it. | command registry + screen | TUI chat (typed), Launchpad (submitted) |
| P-10 | The chat prompt glyph: plain when no effort or ladder < 2; omp's per-level colour for non-top tiers (dark and light palettes), rendered as the terminal's 256-colour approximation; the top tier keeps dst's bold ignition style, not an omp colour. | `expectedGlyph` + `glyphStyle` on captured SGR | TUI chat |

## Invariants (checked after every step of every generated case)

| ID | Invariant |
|---|---|
| I-1 | The dsh-TUI process is still alive (no `[[exited]]` on the pane). |
| I-2 | `effort.json` on disk equals the model's persisted effort at all times. |
| I-3 | The on-screen effort readout equals the model's live effort (Launchpad parameter row by label; chat footer by id). |
| I-4 | The rendered draft equals the model's draft on both screens. |
| I-5 | No picker/menu is left open after an action that should have closed it. |
| I-6 | The Launchpad permission preset readout is unchanged (`danger-full-access`). |
| I-7 | On chat, the glyph style satisfies P-10's expectation for the live state. |

## Test mapping

| Test | Layer | Properties |
|---|---|---|
| `test/omp-keys.test.mjs` | unit/contract against built `lib/types` (runs as the Nix install check of every package variant) | P-01, P-05, P-06, P-09 examples; wiring contracts |
| `test/fast/properties.test.mjs` | fast-check properties, `NUM_RUNS` ≥ 1000, vs built `lib/types` | P-01, P-05, P-06, P-09, P-10 source contract, patch-presence contract |
| `test/e2e/tui.property.test.mjs` | real dsh-TUI processes in private tmux sockets, fast-check sequences, invariants after each step | P-01..P-10, I-1..I-7 |
| `test/e2e/web.inertness.test.mjs` | real dsh web + Playwright | web inertness (S5) |

## Evidence and versions

Recorded per run in `TESTING.md`: exact DSH/dsh-TUI versions, store paths,
seeds, run counts, coverage buckets and duration. The fleet exception (DSH
`0.2.1-alpha.2`) is re-checked each task per the skill's version policy.
