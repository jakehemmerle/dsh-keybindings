# RALPH.md — dsh-keybindings work graph

Owner: `dsh-keybindings-eng` (Agent Team member for the 5.3 FLASH program).
Beads epic: `keys-fkd` (S1..S9). Binary: `/nix/store/8yhl7n32v992xlidv0jy53gyl4mgq8a3-beads-1.3.0/bin/bd`.
Rules: commits start with `5.3 FLASH: `, direct to `main`, pull --ff-only
first, test before commit (red commits for real bugs are the exception), stage
only own paths, never touch `~/.dsh`, `~/.dsh-tui`, port 3080 or Jake's tmux.

## Round 1 (2026-10-11/12) — done

Recovered the interrupted previous engineer's uncommitted tree (flake, nix
files, vendored rig, in-progress e2e), verified it, and drove it to green:

- `f415e62` beads work graph (keys-fkd S1–S9), agent instructions, ignore nix result links
- `1f17cfc` vendor the test rig (S4): rig.mjs/mock-llm.mjs + SOURCE.md (tmux -f /dev/null, escape capture); test deps
- `97adab4` nix environment (S3): flake with pinned dsh 0.2.1-alpha.2 (nix-dsh f0ca0d7), dsh-TUI base/patched/standalone, e2e app, devShell, checks
- `74c708f` SPEC.md (S2): P-01..P-10, I-1..I-7, oracle, surfaces, web N/A rationale
- `8d2defa` fix rig send-keys flag injection (red evidence: seed 20261011, `unknown flag -p` on generated draft `-p`)
- `8982f70` real-client property suites (S6) + SPEC P-06 single-rung toast contract
- web inertness test + TESTING.md + this file (see `git log` for the final shas)

Evidence (all in TESTING.md): patch variants byte-identical to the deployed
nix-config copy and apply to both bases (S1 ✓); package builds pass 9/9 unit
install checks; TUI property campaigns **green 25/25 cases per surface** (seed
20261011, I-1..I-7 after every step, P-02 request carry on every submitted
turn); fast properties **green 9/9 at NUM_RUNS=1000** (seed 424242) including
the unpatched-control contract. Four red→fix pairs, all harness/oracle
defects — zero product defects found so far (details + counterexample paths in
TESTING.md). Raw evidence: `KEYS_EVIDENCE_DIR` (`tui-property.jsonl`,
`web-inertness.jsonl`, failure captures).

Bead states after round 1: S1, S2, S3, S4, S6 closed (see `bd list`); S5
closed if the web campaign finished green this round; S7 closed with
TESTING.md; S8 (mutants) and S9 (release) open for rounds 2–3.

## Round 2 (next)

1. `bd ready` → work **keys-fkd.8 (S8 Bugs and mutants)**: plant ≥3 mutants
   (colour Medium=Low, light palette dropped, Alt+P meta guard dropped,
   Shift+Tab capability check, in-flight guard) one at a time in an isolated
   copy, rebuild `.#dsh-keybindings`, and record which property kills each
   (target caught N/N in TESTING.md). A survivor means a strengthened test.
2. Run `nix flake check` (S3 acceptance; `checks.fast` now has `test/fast/`).
3. Loop each e2e file 5× for flakes (a failure is a bug).
4. Consider a second TUI campaign seed (e.g. 424242) for seed diversity.

## Round 3 (release)

S9: RELEASING.md + CHANGELOG.md, version bump if needed, and if everything is
green: `nix flake check` + full-suite release run (≥100 generated cases per
surface over ≥3 seeds), annotated tag `v0.1.0-alpha.1`, push with tag.

## Gotchas learned

- The e2e runner and `checks.fast` read the flake's `testSrc`; commit test
  files before `nix run .#e2e` so the store source is current.
- `nix build` leaves `result*` symlinks (gitignored); store paths change when
  the tree hash changes.
- The chat header can be prefixed by logo glyphs (`▀`); parse by line-end
  shape. The footer truncates at cols ≤ 60; the header shows the label, the
  footer the id.
- fast-check: await every `fc.assert` on async properties (module-global
  `inFlight` otherwise collides across tests); `fc.stringMatching` exists,
  `fc.hexaString` does not (v4).
