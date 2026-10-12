// Shared real-client harness for dsh-keybindings: pinned binaries, isolated
// profiles, evidence logging and fast-check run parameters.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import fc from 'fast-check';
import { startMockLlm } from '../../rig/mock-llm.mjs';
import { makeProfile, paths, sleep } from '../../rig/rig.mjs';
import { LEVELS, wire } from './oracle.mjs';

export { fc, sleep };

/** Refuse to run against an unpinned or credential-carrying launcher. */
export function pinned() {
  const where = paths();
  const problems = [];
  if (!process.env.DSH_BIN) problems.push('DSH_BIN is unset (run through `nix run .#e2e` or the dev shell)');
  else if (!process.env.DSH_BIN.startsWith('/nix/store/')) problems.push(`DSH_BIN ${process.env.DSH_BIN} is not a store path`);
  if (!process.env.DSH_TUI_DIR) problems.push('DSH_TUI_DIR is unset');
  if (where.version !== '0.2.1-alpha.2') problems.push(`dsh ${where.version} is not the pinned 0.2.1-alpha.2`);
  if (problems.length) throw new Error(`dsh-keybindings e2e: ${problems.join('; ')}`);
  const tuiVersion = JSON.parse(execFileSync('cat', [join(where.tui, 'package.json')], { encoding: 'utf8' })).version;
  return { dsh: where.version, dshStore: where.store, tui: tuiVersion, tuiDir: where.tui };
}

export const evidenceDir = () => {
  const dir = process.env.KEYS_EVIDENCE_DIR || join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** fast-check parameters from the environment: FC_SEED, FC_PATH, NUM_RUNS. */
export function runParams(defaultRuns) {
  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : Date.now() % 2147483647;
  const numRuns = process.env.NUM_RUNS ? Number(process.env.NUM_RUNS) : defaultRuns;
  return { seed, numRuns, ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}) };
}

/** Append one JSON line to <evidence>/<name>.jsonl. */
export function record(name, entry) {
  appendFileSync(join(evidenceDir(), `${name}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

export function saveArtifact(name, content) {
  const file = join(evidenceDir(), name);
  writeFileSync(file, content);
  return file;
}

/** Route models: a ladder (subsequence of LEVELS) with distinct wire values, or none. */
export function routeModels(ladder) {
  const reasoningEfforts = ladder.length ? Object.fromEntries(ladder.map((l) => [l, wire(l)])) : false;
  return [{ id: 'mock-alpha', name: 'Mock Alpha', contextWindow: 128000, maxTokens: 8000, input: ['text'], reasoningEfforts }];
}

/** Generators shared by the TUI properties. */
export const arb = {
  ladder: fc.subarray(LEVELS, { minLength: 0, maxLength: LEVELS.length }),
  // Bias toward ladders that can cycle; empty and single-level routes still appear.
  cyclingLadder: fc.oneof({ weight: 5, arbitrary: fc.subarray(LEVELS, { minLength: 2 }) },
    { weight: 1, arbitrary: fc.subarray(LEVELS, { minLength: 0, maxLength: 1 }) }),
  theme: fc.constantFrom('dark', 'light'),
  cols: fc.constantFrom(60, 100, 140),
  // Draft text: always contains letters such as p/P, spaces and a few non-ASCII
  // characters; never starts with '/' (that opens the command menu by design).
  draft: fc.array(fc.constantFrom('p', 'P', 'a', 'z', ' ', 'q', 'é', '1', '.', '-'), { minLength: 1, maxLength: 8 })
    .map((cs) => cs.join('')).filter((s) => s.trim().length > 0),
};

/** A fresh mock + isolated dsh-TUI profile; dispose() tears both down. */
export async function tuiFixture({ ladder, theme, seedEffort }) {
  const mock = await startMockLlm({ script: () => ({ text: 'pong' }) });
  const seedTui = { 'theme.json': { theme } };
  const profile = makeProfile({ kind: 'tui', mock, models: routeModels(ladder), seedTui });
  if (seedEffort !== undefined) writeFileSync(join(profile.home, '.dsh-tui', 'effort.json'), seedEffort);
  return {
    mock, profile,
    async dispose() { try { profile.dispose(); } finally { await mock.close(); } },
  };
}

/** Poll check() (returns null when satisfied, else a reason) until it holds or the deadline passes. */
export async function eventually(check, { timeout = 6000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let reason = 'not checked';
  while (Date.now() < deadline) {
    reason = await check();
    if (reason === null) return null;
    await sleep(interval);
  }
  return reason;
}
