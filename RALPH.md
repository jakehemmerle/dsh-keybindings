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

## Round 2 (2026-10-12) — done (fresh-start resume)

S8 mutants executed and closed; flake loops green. Commits:
- `4309eaf` strengthen meta-guard coverage: Ctrl+P inertness action on both surfaces + Alt+P/Shift+Tab guard source contracts
- TESTING.md S8 mutant table + flake-loop results (this round's final commit)

Mutant results (full table in TESTING.md): caught 5/5 —
mediumIsLow (fast P-10 + e2e I-7), lightDropped (e2e I-7 light),
metaGuardCtrl (fast P-04 contract), capabilityCheck (fast P-01 contract),
inFlightGuard (unit + fast P-05). Two survived their first form and were
strengthened until they failed; every survive carries its documented reason
(dead mutation, control-character input, unreachable branch, or deliberately
permissive e2e burst oracle). Flake loops: 5/5 green on seed 424242
(25 runs/surface per loop, 428–441 s each) — both seeds now recorded.

Bead states after round 2: S1–S8 closed; open: epic, S9 (release) for round 3.

## Round 3 (final, lead's ROUND C — Jake authorized full completion) — done

**STEP 0 closure audit first**: every closed bead S1–S8 re-verified against
its recorded evidence — referenced shas exist in history (f415e62 1f17cfc
97adab4 74c708f 8d2defa 8982f70 74c708f a8cf280 4309eaf 1d79ab9 068fe11), S1's
md5 `97fd5507744a027af51993f1ac810b4b` re-run identical to the deployed
nix-config copy and test file identical, S4 greps clean of `~/.agents`
imports, S8's `/tmp/keys-mutants-evidence` logs still on disk, TESTING.md
has no contradiction footnotes, zero deferred or bug-type beads. **No
reopen.** The only S2/S3-class finding was a harness defect *outside* any
closed bead's recorded path: the flake e2e runner's default argument was
never exercised and fails on node 24.21 (`node --test <dir>` is a module
entrypoint). Red commit `5e721fc` (all five first campaign-seed attempts
died <=4 s with MODULE_NOT_FOUND before a single case ran), fix commit
`59230f9` (default expands `test/e2e/*.test.mjs`; default-invocation
smoke 3/3 pass). The closed beads' recorded evidence itself all re-verifies
true, so closures stand; the pair is attributed to the release gate.

**STEP 1 release gate, all green on committed tree `59230f9`:**
- `nix flake check` green: patched/standalone builds with unit install
  checks 9/9 + sandbox `fast` check at the default NUM_RUNS=1000.
- Release campaign: **125 real-client cases per surface over 5 seeds**
  (`424242`, `20261011`, `999`, `8675309`, `20261012`): TUI
  Launchpad 125/125, TUI chat 125/125 (I-1..I-7 after every step, P-02 wire
  carry on every submitted turn), web inertness 126/126 (campaign 125 +
  default-invocation smoke 1); zero console/page errors; seeds logged, `FC_SEED`/`FC_PATH` replayable; raw jsonl committed under
  `release-evidence/`. Wall time 447–490 s per seed, 39 min total.
- Fast suites: **11/11 at `NUM_RUNS=1000`** at seeds `424242` and
  `20261011` (unpatched control via `DSH_TUI_BASE_TYPES` included).
- DSH channels re-checked 2026-10-12: latest/next 0.2.0-rc.2, alpha
  0.2.1-alpha.2 — the fleet alpha remains newest; no qualification jump.
- S8 mutants stay caught 5/5 (no regression planted or released this round).
- Red -> fix found this round: pair 5 (e2e runner default), harness-only;
  full table in TESTING.md.

Release: RELEASING.md + CHANGELOG.md written; package.json stays
`0.1.0-alpha.1` (first tagged release: the artifact is byte-identical to
the deployed copy, so there is no pre-existing published version to bump;
the tag records the first qualified revision); annotated tag
`v0.1.0-alpha.1` on the release commit; commit + tag pushed; preflight run
per the skill's rules. Board closed with keys-fkd.9 and the epic closed last.
