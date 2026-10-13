# CHANGELOG

All notable changes to this package are documented here. The package follows
Semantic Versioning 2.0.0 with DSH's prerelease channels (see RELEASING.md):
while the fleet qualifies against DSH `0.2.1-alpha.2`, versions carry the
`-alpha.N` channel. Format based on Keep a Changelog 1.1.0.

## v0.1.0-alpha.1 — 2026-10-12

Initial tagged release. This repository packages omp's effort and model keys
for dsh-TUI `0.14.0` as a version-pinned source patch: Shift+Tab cycles
reasoning effort over the live route's declared ladder, Alt+P opens the
session model picker, `/permissions` is a DSH-local command entry, and the
chat prompt glyph is tinted by effort tier with omp's thinking colours. The
patch is byte-identical (md5 `97fd5507744a027af51993f1ac810b4b`) to the
deployed `nix-config` copy and applies on the fleet stack
(launchpad-word-edit first) and on the pristine npm tarball.

### Changed
- none user-visible beyond the seeded patch; this tag is the first qualified,
  fully-tested revision. The source reconcile (S1) is byte-identical to what
  the fleet already runs, so the release adds the qualification evidence and
  the test system, not a behaviour change.

### Added
- SPEC.md with acceptance properties P-01..P-10, invariants I-1..I-7, oracle
  and surface table (web explicitly not applicable, proven inert).
- Real-client property suites: fast-check campaigns on a real dsh-TUI
  process (Launchpad and chat in private tmux sockets; wire-level P-02
  request carry against the mock model), the dsh-web Playwright inertness
  campaign, and fast-check contract/property suites against the built
  `lib/types`.
- Nix environment: `flake.nix` with the package variants (base, patched,
  standalone), unit install checks, the sandbox `fast` check at
  `NUM_RUNS=1000`, and the `apps.`e2e` real-client runner.
- RELEASING.md (this repository's release procedure) and TESTING.md
  traceability with recorded seeds, coverage buckets and versions.

### Tested
- dsh `0.2.1-alpha.2` (store
  `/nix/store/d7q35phhz4aq6kj0mzq4xjs99dijbi6i-dsh-0.2.1-alpha.2`, nix-dsh
  revision `f0ca0d7`) with dsh-TUI `0.14.0` (npm tarball
  `sha512-syU0CLbAoxA97URyhnPFiLbWm3dXrmCR5NCO6mFovRi7mebX2HeEYdhpugEoT9vZ1vpUfE/+uX7xrs6zOGUJ1g==`
  patched after launchpad-word-edit), node 24.21.0.
- Release campaign (full table with seeds, coverage buckets and durations in
  TESTING.md): TUI Launchpad and chat each ≥100 generated cases over 5
  recorded seeds (`424242`, `20261011`, `999`, `8675309`, `20261012`),
  I-1..I-7 checked after every step; web inertness ≥100 cases over the same
  seeds; fast property suites at `NUM_RUNS=1000`; `nix flake check` green;
  S8 mutants caught 5/5.

### Known limitations
- Shift+Tab cannot be bound through the dsh-TUI plugin shortcut registry and
  plugin shortcuts do not run on the first screen (Launchpad), so this is a
  source patch. Effort cycling replaces dsh-TUI's former Shift+Tab
  permission-mode cycling; permission presets live at `/permissions` and
  plan mode stays on `/plan`.
- Qualified only against the DSH `alpha` channel; the `-alpha.N` suffix
  remains until a beta/stable candidate is qualified per RELEASING.md.
