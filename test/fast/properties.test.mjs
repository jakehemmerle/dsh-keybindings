// fast-check property suite against the BUILT patched dsh-TUI lib/types
// (DSH_TUI_TYPES), with the independent spec oracle (../e2e/lib/oracle.mjs).
//   DSH_TUI_TYPES=<patched>/lib/types [DSH_TUI_BASE_TYPES=<base>/lib/types] \
//   [FC_SEED=<n>] [NUM_RUNS=<n>] node --test test/fast/properties.test.mjs
// The nix `fast` check sets all of these; DSH_TUI_BASE_TYPES enables the
// unpatched-control contract (skipped loudly when unset).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import fc from 'fast-check';
import { LEVELS, expectedNext, label, PALETTE } from '../e2e/lib/oracle.mjs';

const types = process.env.DSH_TUI_TYPES;
assert.ok(types, 'set DSH_TUI_TYPES to the patched <dsh-tui>/lib/types');
const load = (file) => import(pathToFileURL(join(types, file)).href);
const source = (file) => readFile(join(types, file), 'utf8');

const { nextEffort, cycleEffort } = await load('effortCycle.js');
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 424242;
const numRuns = process.env.NUM_RUNS ? Number(process.env.NUM_RUNS) : 1000;
const params = { seed, numRuns };
console.log(`fast properties: FC_SEED=${seed} NUM_RUNS=${numRuns} DSH_TUI_TYPES=${types}`);

const cyclingLadder = fc.subarray(LEVELS, { minLength: 2 });
const degenerateLadder = fc.constantFrom([], ['only']);
const current = fc.oneof({ weight: 4, arbitrary: fc.constantFrom(...LEVELS, 'not-offered') },
  { weight: 1, arbitrary: fc.constant(undefined) });

/** A channel mock whose setEffort updates the live level, like the product. */
function fakeChannel({ ladderIds, current: live, delay = 0, setResult = true } = {}) {
  const calls = { set: [], notes: [] };
  const channel = {
    calls,
    reasoningEffort: live,
    async listEfforts() {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return { efforts: ladderIds.map((id) => ({ id, name: label(id) })), defaultEffort: undefined };
    },
    async setEffort(id) { calls.set.push(id); channel.reasoningEffort = id; return setResult; },
    notify(text, options) { calls.notes.push({ text, color: options?.color }); },
  };
  return channel;
}

test('P-01: nextEffort matches the spec oracle for every ladder and current', async () => {
  const property = fc.property(cyclingLadder, current, (ladder, live) => {
    assert.equal(nextEffort(ladder, live), expectedNext(ladder, live));
  });
  await fc.assert(property, params);
});

test('P-01/P-06: degenerate ladders never cycle (nextEffort undefined)', async () => {
  const property = fc.property(degenerateLadder, fc.constantFrom(...LEVELS, undefined), (ladder, live) => {
    assert.equal(nextEffort(ladder, live), undefined);
  });
  await fc.assert(property, params);
});

test('P-05: concurrent cycleEffort calls are dropped to exactly one step, then the guard releases', async () => {
  const property = fc.asyncProperty(cyclingLadder, current, fc.integer({ min: 2, max: 5 }),
    fc.integer({ min: 0, max: 10 }), async (ladder, live, k, delay) => {
      const channel = fakeChannel({ ladderIds: ladder, current: live, delay });
      await Promise.all(Array.from({ length: k }, () => cycleEffort(channel)));
      const first = expectedNext(ladder, live);
      assert.deepEqual(channel.calls.set, [first]);
      assert.deepEqual(channel.calls.notes, [{ text: `Effort: ${label(first)}`, color: undefined }]);
      await cycleEffort(channel); // the guard must release afterwards
      assert.deepEqual(channel.calls.set, [first, expectedNext(ladder, first)]);
    });
  await fc.assert(property, params);
});

test('P-01: a refused setEffort still steps the live level request but shows no success toast', async () => {
  const property = fc.asyncProperty(cyclingLadder, current, async (ladder, live) => {
    const channel = fakeChannel({ ladderIds: ladder, current: live, setResult: false });
    await cycleEffort(channel);
    assert.deepEqual(channel.calls.set, [expectedNext(ladder, live)]);
    assert.deepEqual(channel.calls.notes, []);
  });
  await fc.assert(property, params);
});

test('P-01: a failing route is reported as an error toast, never thrown', async () => {
  const property = fc.asyncProperty(fc.stringMatching(/^[0-9a-f]{1,12}$/), async (message) => {
    const channel = fakeChannel({ ladderIds: ['low', 'high'] });
    channel.listEfforts = async () => { throw new Error(message); };
    await cycleEffort(channel);
    assert.equal(channel.calls.notes[0].color, 'error');
    assert.match(channel.calls.notes[0].text, new RegExp(`Effort switch failed: ${message}`));
  });
  await fc.assert(property, params);
});

test('P-06: zero-level routes are a silent no-op; single-rung routes only toast the only level', async () => {
  const property = fc.asyncProperty(degenerateLadder, current, async (ladder, live) => {
    const channel = fakeChannel({ ladderIds: ladder, current: live });
    await cycleEffort(channel);
    assert.deepEqual(channel.calls.set, []);
    if (ladder.length === 0) assert.deepEqual(channel.calls.notes, []);
    else assert.deepEqual(channel.calls.notes, [{ text: `Effort: ${ladder[0]} (only level)`, color: undefined }]);
  });
  await fc.assert(property, params);
});

test('P-09: /permissions is registered as a DSH-local command', async () => {
  const commands = await load('commands.js');
  assert.ok(commands.LOCAL_COMMANDS.some((command) => command.name === 'permissions'));
  assert.equal(commands.localCommandRequirement('permissions'), 'dsh');
});

test('P-10: every omp palette hex (dark and light) is present in the glyph source', async () => {
  const glyph = await source('components/EffortChargeGlyph.js');
  const lowered = glyph.toLowerCase();
  for (const [theme, palette] of Object.entries(PALETTE)) {
    for (const [level, hex] of Object.entries(palette)) {
      assert.ok(lowered.includes(hex.toLowerCase()), `${theme}/${level} hex ${hex} missing from EffortChargeGlyph.js`);
    }
  }
});

test('patch-presence contract: the unpatched control build has no effortCycle module', { skip: !process.env.DSH_TUI_BASE_TYPES && 'DSH_TUI_BASE_TYPES unset (nix checks set it)' }, async () => {
  const base = process.env.DSH_TUI_BASE_TYPES;
  await assert.rejects(() => import(pathToFileURL(join(base, 'effortCycle.js')).href));
  const baseCommands = await import(pathToFileURL(join(base, 'commands.js')).href);
  assert.ok(!baseCommands.LOCAL_COMMANDS.some((command) => command.name === 'permissions'));
});