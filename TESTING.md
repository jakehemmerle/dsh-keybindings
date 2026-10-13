# TESTING.md — dsh-keybindings

Traceability: SPEC property → test → surface → last result (seed, runs,
versions). No silent skips: every row below was actually executed; the only
skipped check (unpatched-control contract) runs wherever `DSH_TUI_BASE_TYPES`
is set — the nix `fast` check and the evidence below set it.

## Versions under test (this round, 2026-10-11/12)

| Artifact | Version | Source |
|---|---|---|
| dsh | 0.2.1-alpha.2 | `/nix/store/d7q35phhz4aq6kj0mzq4xjs99dijbi6i-dsh-0.2.1-alpha.2` (nix-dsh flake input `f0ca0d7`, the revision nix-config pins) |
| dsh-TUI (patched: launchpad-word-edit + omp-keys) | 0.14.0 | `/nix/store/4cnr1wdskgv4srzx9gxgdwkyzwrawnsg-dsh-keybindings-0.1.0-alpha.1` |
| dsh-TUI (base control: launchpad-word-edit only) | 0.14.0 | `/nix/store/zps5ic86gixb2fdix05vzmxrkwi2nhxs-dsh-tui-base-0.14.0` |
| dsh-TUI (standalone: omp-keys on the pristine npm tarball) | 0.14.0 | `/nix/store/sdklv14dfl4vpyglfa6qv3qc15l2scbq-dsh-keybindings-standalone-0.1.0-alpha.1` |
| node | 24.21.0 | `nodejs_24` (dsh's own runtime major) |

The tarball hash (`sha512-syU0CL…`) and `npmDepsHash` equal nix-config's
`pkgs/dsh-tui.nix`; the two patch variants in `patches/` are byte-identical
(md5 `97fd5507744a027af51993f1ac810b4b`) to the deployed
`~/nix-config/pkgs/dsh-omp-keys/dsh-tui-0.14.0.patch`.

## Source reconcile (S1)

- Byte-compares, all identical: patch vs nix-config's `dsh-omp-keys/dsh-tui-0.14.0.patch`;
  `test/omp-keys.test.mjs` vs `dsh-omp-keys/test/`; `nix/launchpad-word-edit.patch` and
  `nix/dsh-tui-package-lock.json` vs `pkgs/dsh-tui/`.
- Both patch variants apply to their stated bases, proven by the Nix builds:
  `patched` (after `launchpad-word-edit.patch`, the deployed order) and
  `standalone` (pristine tarball) each built and passed all 9 unit tests as
  their `installCheck`.

## Property results

| Property | Test (layer) | Surface | Last result |
|---|---|---|---|
| P-01 cycle/wrap | `test/omp-keys.test.mjs` (unit, Nix install check) | contract | green 9/9 in every package build (patched, standalone) |
| P-01 equivalence to oracle | `test/fast/properties.test.mjs` | contract | green, 1000 runs, seed 424242 |
| P-05 burst/drops | fast (in-flight guard) + unit example + e2e `burst` actions | contract + TUI both | fast green (above); e2e 9 chat / 6 launchpad bursts green |
| P-06 degenerate ladders | fast (silent vs only-level toast) + e2e 0/1-ladder cases | contract + TUI both | fast green; e2e `ladder:0`×1, `ladder:1`×1 per surface green |
| P-09 /permissions | unit + fast contract + e2e `permissions` action | TUI chat | fast/unit green; e2e 11 picker opens green |
| P-10 glyph palette | fast source contract + e2e I-7 (SGR capture) | contract + TUI chat | fast green; I-7 checked after every chat step, all 25 cases |
| patch-presence contract | fast vs `DSH_TUI_BASE_TYPES` control | contract | green (control has no effortCycle/permissions) |
| P-01..P-10, I-1..I-7 end-to-end | `test/e2e/tui.property.test.mjs` (real dsh-TUI in private tmux) | TUI Launchpad + chat | **green 25/25 cases per surface**, seed 20261011, ~7 min total; coverage below |
| Web inertness (S5) | `test/e2e/web.inertness.test.mjs` (real dsh web + Playwright) | web | **green 25/25 cases**, seed 20261011, coverage composer 25 / turn 25 / inert 25, zero console or page errors; real session flow (Preview Notice dismissed, profile work dir added as the workspace) |

### TUI campaign coverage (seed 20261011, 25 runs/surface)

- Launchpad: shiftTab 49 (34 cycling, incl. 5 wraps; 4 no-ladder), burst 6,
  altP 11, type 35 (11 with `p`/`P`), submit 25, backspace 11, restart 10;
  ladders of 0–6 levels, seeds none 11 / corrupt 7 / valid 7, themes 12 dark /
  13 light, widths 60/100/140.
- Chat: shiftTab 37 (incl. 2 wraps; 5 no-ladder), burst 9, altP 4,
  permissions 11, type 47 (12 with `p`/`P`), submit 36, backspace 4,
  restart 8; same seed/width/theme spread.
- Every case ends with a turn whose serialized request carries the live
  effort (P-02, wire spellings `w-<level>`); I-1..I-7 held after every step.

### Replay commands

```sh
# TUI campaigns (25/surface; FC_PATH replays a shrunk counterexample)
DSH_BIN=<dsh> DSH_TUI_DIR=<patched tui> FC_SEED=20261011 NUM_RUNS=25 \
  node --test --test-concurrency=1 test/e2e/tui.property.test.mjs
# Fast properties (1000/property)
DSH_TUI_TYPES=<patched>/lib/types DSH_TUI_BASE_TYPES=<base>/lib/types \
  FC_SEED=424242 NUM_RUNS=1000 node --test test/fast/properties.test.mjs
# Nix gates
nix flake check && nix run .#e2e
```

## Red → fix pairs (found this round)

All four discoveries were **harness/oracle** defects, not product defects —
at every counterexample the omp-keys patch matched the spec (P-02's request
carry, persistence, wrap and the preset readout all held):

1. **I-4 launchpad draft comparison** (red: seed 20261011 path `1:3:5:4:4`,
   type `" p"`): the Launchpad preserves leading draft spaces; the driver
   compared against `trim()`. Fix: trimEnd comparison for the Launchpad.
2. **I-3 chat effort readout** (red: paths `2:1:1:0:1`, `3:0:1:1:1`): at
   cols ≤ 60 the footer truncates segments (`mock-alp… · l…`), and at wide
   panes the header is prefixed by logo glyphs; the footer also shows the id
   while the header shows the label. Fix: shape-based header parse
   (`<model id> · <Label> effort` or the bare id), footer fallback.
3. **I-6 permission preset readout** (red: paths `2:1:0`, `3:0:0:0:0:0`): at
   cols ≤ 60 the parameter row drops trailing segments once an effort label
   joins it, so `danger-full-access` legitimately disappears. Fix: require
   the default preset only where it can render; reject any other preset name.
4. **Rig send-keys flag injection** (red: paths `21:3:0:1:0:5` at 22/25
   launchpad cases and `14:1:0:4:2:2` at 15/25 chat cases): the generated
   draft `-p` was parsed as a tmux flag (`unknown flag -p`). Red commit with
   the failing evidence, then fix commit `8d2defa` (`--` before literal text
   in `text()`/`submit()`).

No product red→green pair exists: the S8 mutants below were all caught in
round 2, and the round-3 audit found no product defect either (pair 5 there
is a harness defect).

## Mutation results (S8, round 2)

Method: each mutant is planted in an isolated copy of the committed tree
(`git archive HEAD` → `/tmp/keys-mutants/<id>`), the patch file mutated with
hunk headers recomputed, the package rebuilt with its unit install check
disabled, and all three layers run against the mutant build: unit
(`test/omp-keys.test.mjs`), fast (`test/fast/*.test.mjs`, 300 runs, seed
424242) and e2e (real dsh-TUI campaigns, 8 cases per surface, seed 999). Raw
logs: `/tmp/keys-mutants-evidence/<id>-{build,unit,fast,e2e}.log`.

| Mutant (change) | Unit | Fast — killed by | E2E — killed by |
|---|---|---|---|
| **mediumIsLow** — dark palette `medium: '#0088fa'` → Low's `#178fb9` | survived (no hex assertions in the unit suite) | **caught** — `P-10: every omp palette hex` ("dark/medium hex #0088fa missing") | **caught** — chat property, I-7 glyph colour (replay `FC_SEED=999 FC_PATH=3:1:1:0:1:1`) |
| **lightDropped** — `ompTierColor` always uses the dark palette | survived | survived (all hexes still present, by design) | **caught** — chat property I-7, light-theme tier index mismatch |
| **metaGuard v1** — `key.meta &&` dropped from the Alt+P guard | survived | survived | **dead mutation, replaced**: dsh-TUI's printable-insert path returns before the guard, so plain `p` still types (probe capture against the mutant build); observationally equivalent |
| **metaGuardCtrl (v2)** — `!key.ctrl` dropped from both Alt+P guards | survived | **caught** — `P-04 contract: the Alt+P meta guard excludes ctrl/super/shift` | survived — Ctrl+P reaches the prompt as a control character, not `input === 'p'` (ctrlP action ran on both surfaces, no picker opened); guard weakening is a source-level regression |
| **capabilityCheck** — guard replaced with `if (false)` | survived | **caught** — `P-01 contract: the Shift+Tab capability guard` | survived — the branch is unreachable in the rig (dsh always declares effort capability for the mock route); documented unreachability |
| **inFlightGuard** — pending-press drop removed | **caught** — "presses while a step is pending are dropped, not raced" | **caught** — `P-05` concurrent-calls property (exactly one `setEffort` under k in-flight calls) | survived — the e2e burst oracle deliberately allows 1..k advances because tmux delivery timing makes exactly-one unassertable |

**Caught 5/5** — every planted mutant fails at least one suite layer (fast
contract minimum, unit for the in-flight guard, and the real-client e2e suite
for both colour mutants). Two mutants survived their first form and the tests
were strengthened until they failed (`4309eaf`): the meta-guard source
contract plus the Ctrl+P inertness action, and the capability-guard source
contract. No silent survives; every survive above carries its reason.

### Flake loops (5× full TUI campaigns, second seed)

Seed **424242**, 25 runs per surface per loop, committed suite at
`18d9086`: **5/5 loops green** (both surfaces, I-1..I-7 after every step),
durations 428–441 s per loop. Both recorded seeds now: 20261011 (round 1) and
424242 (round 2).

## Round 3 (release, Round C) — done

Closure audit (this round): every closed bead S1-S8 re-verified against its
recorded evidence — commit shas exist, S1 md5 `97fd5507744a027af51993f1ac810b4b`
still equal to the deployed nix-config copy (md5sum re-run this round), S4
greps clean of `~/.agents` imports, S8's `/tmp/keys-mutants-evidence` logs
still on disk, zero deferred or bug-type beads — **no reopen**.

New red on the release gate:

5. **e2e runner default argument** (red, release round C): the flake's
   `apps.e2e` default `set -- test/e2e/` fails on node 24.21 — `node --test
   <dir>` treats the positional as a module entrypoint
   (`Cannot find module '.../dsh-keybindings-e2e.*/src/test/e2e'`,
   `MODULE_NOT_FOUND`) and every campaign seed (424242, 20261011, 999,
   8675309, 20261012) exited 1 within <=4 s, before any case ran. Rounds 1-2
   never exercised the default (they passed explicit file args per the
   replay commands). Harness/tooling defect in the S3 flake runner, not a
   product defect; S3's recorded evidence (flake check green, 9/9 unit
   install checks, e2e app present) was re-verified true this round.
   Repro: `nix run .#e2e` with no arguments. **Fix`59230f9`**: the runner
   default expands `test/e2e/*.test.mjs` (verified by a default-invocation
   smoke: 3/3 pass, `FC_SEED=424242 NUM_RUNS=1`, dsh `0.2.1-alpha.2`).
   Product code untouched; this pair is harness-only.

### Release campaign (Round C, 2026-10-12, committed tree `59230f9`)

Runner: the e2e app's **default invocation** (`nix run .#e2e`, no args) after
the fix above — the same path the gate prescribes. 25 generated cases per
surface per seed × 5 seeds = **125 ≥ 100 cases per surface over 5 ≥ 3 seeds**,
seeds logged below and replayable with `FC_SEED`/`FC_PATH`; `424242`
included per the release-brief instruction, `20261011` (regression) and
`999` (mutant-campaign) retained, `8675309` and `20261012` fresh. Raw jsonl
evidence committed at `release-evidence/seed-<seed>/{tui-property,web-inertness}.jsonl`
(full captures in the same directory, gitignored).

| Seed | TUI Launchpad | TUI chat | web inertness | duration |
|---|---|---|---|---|
| 424242 | pass 25/25 | pass 25/25 | pass 25/25 (composer 25 / turn 25 / inert 25) | 484 s |
| 20261011 | pass 25/25 | pass 25/25 | pass 25/25 | 490 s |
| 999 | pass 25/25 | pass 25/25 | pass 25/25 | 447 s |
| 8675309 | pass 25/25 | pass 25/25 | pass 25/25 | 453 s |
| 20261012 | pass 25/25 | pass 25/25 | pass 25/25 | 465 s |

All 15 suite runs (5 seeds × {launchpad, chat, web}) report `failed: false`
with I-1..I-7 checked after **every step** and P-02's serialized
`reasoning_effort` carry on every submitted turn. Summed coverage buckets
across the 250 real-client TUI cases (launchpad/chat; full per-seed buckets
are in the committed jsonl): shiftTab presses 205/157 (incl. 56 wraps and
43 no-ladder steps), bursts 37/27, Alt+P 61/67, Ctrl+P meta-guard actions
32/33, `/permissions` 36 (chat), typing incl. `p`/`P` 57/42,
backspaces 40/24, restarts 29/31, `effort.json` seed states none 39 /
corrupt 51 / valid 35 per surface, ladders 0–6 including the degenerate
0- and 1-ladder cases, themes dark 64 / light 61, widths 60/100/140 cols.
**126/126 web cases** (125 campaign + the default-invocation smoke's 1 case,
`FC_SEED=424242 NUM_RUNS=1`): composer/turn/inert buckets measured in
every case; zero console or page errors.

Fast suites at the release runs: `test/fast/properties.test.mjs`
**11/11 pass at `NUM_RUNS=1000`** (all properties + unit examples + the
P-04 Alt+P meta-guard contract and P-01 Shift+Tab capability contract from
`4309eaf`) at seeds **424242** and **20261011**, against the built
`lib/types` of the patched package (`/nix/store/qx8f47m92mznh2fpm39v23a97lrkr2ih-…`)
and the base control (`/nix/store/zps5ic86gixb2fdix05vzmxrkwi2nhxs-…`,
`DSH_TUI_BASE_TYPES` set — the unpatched-control contract runs and passes).
Plus harness-check-independent evidence: `nix flake check` green
(`patched`/`standalone` unit install checks 9/9 + sandbox `fast` at the
default `NUM_RUNS=1000`). The five campaign runs on the committed tree are
also 5/5 consecutive green e2e invocations (the round-2 flake-loop shape);
per-seed wall times 447–490 s.

DSH channels re-checked 2026-10-12 for the release record (`npm view
@deepseek-ai/dsh dist-tags`): `latest`/`next` = 0.2.0-rc.2,
`alpha` = 0.2.1-alpha.2 — the fleet alpha remains the newest DSH; no newer
beta/stable requires qualification this release. S8 mutants stay caught 5/5
(each suite was re-exercised at release budgets above; no mutant-related
regression was planted or released).

## Evidence

Raw evidence (jsonl logs, failure captures with screen text and SGR streams):
`KEYS_EVIDENCE_DIR` (default `./test-results`; round-1 runs wrote to
`/tmp/dsh-keybindings-evidence`). `tui-property.jsonl` and
`web-inertness.jsonl` hold one line per run with seed, ran/failed counts,
counterexample, versions and coverage buckets.