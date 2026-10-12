// SPEC P-01..P-10 on a real dsh-TUI process: fast-check generates route
// ladders, themes, widths, seeded effort.json states and key sequences; every
// step goes through tmux and every invariant is checked after every step.
//   FC_SEED=<n> [FC_PATH=<path>] NUM_RUNS=<n> nix run .#e2e -- test/e2e/tui.property.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arb, fc, pinned, record, runParams, saveArtifact, tuiFixture } from './lib/harness.mjs';
import { TuiCase } from './lib/tui-driver.mjs';

const versions = pinned();

const seedState = (ladder) => fc.oneof(
  fc.constant({ seedKind: 'none' }),
  fc.constant({ seedKind: 'corrupt' }),
  ...(ladder.length >= 2 ? [fc.constantFrom(...ladder).map((seedLevel) => ({ seedKind: 'valid', seedLevel }))] : []),
);

const launchpadAction = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ t: 'ctrlP' }) },
  { weight: 5, arbitrary: fc.constant({ t: 'shiftTab' }) },
  { weight: 1, arbitrary: fc.integer({ min: 2, max: 4 }).map((k) => ({ t: 'burst', k })) },
  { weight: 2, arbitrary: fc.constant({ t: 'altP' }) },
  { weight: 3, arbitrary: arb.draft.map((s) => ({ t: 'type', s })) },
  { weight: 1, arbitrary: fc.constant({ t: 'backspace' }) },
  { weight: 1, arbitrary: fc.constant({ t: 'restart' }) },
);
const chatAction = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ t: 'ctrlP' }) },
  { weight: 5, arbitrary: fc.constant({ t: 'shiftTab' }) },
  { weight: 1, arbitrary: fc.integer({ min: 2, max: 4 }).map((k) => ({ t: 'burst', k })) },
  { weight: 2, arbitrary: fc.constant({ t: 'altP' }) },
  { weight: 3, arbitrary: arb.draft.map((s) => ({ t: 'type', s })) },
  { weight: 1, arbitrary: fc.constant({ t: 'backspace' }) },
  { weight: 2, arbitrary: fc.constant({ t: 'submit' }) },
  { weight: 1, arbitrary: fc.constant({ t: 'permissions' }) },
  { weight: 1, arbitrary: fc.constant({ t: 'restart' }) },
);

function scenario(action, maxActions) {
  return arb.cyclingLadder.chain((ladder) => fc.record({
    ladder: fc.constant(ladder),
    theme: arb.theme,
    cols: arb.cols,
    seed: seedState(ladder),
    actions: fc.array(action, { minLength: 1, maxLength: maxActions }),
  }));
}

async function runCase(surface, c, totals) {
  const fixture = await tuiFixture({ ladder: c.ladder, theme: c.theme,
    seedEffort: c.seed.seedKind === 'valid' ? JSON.stringify({ effort: c.seed.seedLevel })
      : c.seed.seedKind === 'corrupt' ? '{"effort": ' : undefined });
  const k = new TuiCase(fixture, { ...c, ...c.seed });
  try {
    await k.start();
    await k.settle('launch');
    if (surface === 'chat') await k.submit('hello');
    for (const action of c.actions) {
      // After a restart the chat property returns to chat with a first prompt.
      await k.run(action);
      if (surface === 'chat' && k.screen === 'launchpad') await k.submit('back');
    }
    // Every case ends with a turn whose request must carry the live effort (P-02).
    await k.submit('end');
    for (const [key, n] of Object.entries(k.stats)) totals[key] = (totals[key] ?? 0) + n;
    totals[`ladder:${c.ladder.length}`] = (totals[`ladder:${c.ladder.length}`] ?? 0) + 1;
    totals[`seed:${c.seed.seedKind}`] = (totals[`seed:${c.seed.seedKind}`] ?? 0) + 1;
    totals[`theme:${c.theme}`] = (totals[`theme:${c.theme}`] ?? 0) + 1;
    totals[`cols:${c.cols}`] = (totals[`cols:${c.cols}`] ?? 0) + 1;
    return true;
  } catch (error) {
    const id = `tui-${surface}-${Date.now()}`;
    try {
      saveArtifact(`${id}.txt`, `${error.message}\n\ncase: ${JSON.stringify(c)}\ntrace: ${JSON.stringify(k.trace)}\n\n${k.tui?.capture() ?? ''}`);
      saveArtifact(`${id}.ansi`, k.tui?.captureEscapes() ?? '');
    } catch { /* tui gone */ }
    throw new Error(`${error.message}\n  trace: ${JSON.stringify(k.trace)}\n  capture: ${id}.txt`);
  } finally {
    await k.stop();
    await fixture.dispose();
  }
}

for (const [surface, action, max] of [['launchpad', launchpadAction, 8], ['chat', chatAction, 8]]) {
  test(`dsh-TUI ${surface}: generated key sequences keep P-01..P-10 after every step`, { timeout: 4 * 60 * 60 * 1000 }, async () => {
    const params = runParams(25);
    const totals = {};
    const started = Date.now();
    console.log(`[${surface}] FC_SEED=${params.seed} NUM_RUNS=${params.numRuns} dsh ${versions.dsh} dsh-TUI ${versions.tui} (${versions.tuiDir})`);
    const details = await fc.check(fc.asyncProperty(scenario(action, max), (c) => runCase(surface, c, totals)),
      { ...params, interruptAfterTimeLimit: 3 * 60 * 60 * 1000, markInterruptAsFailure: true });
    const entry = { test: `tui.property ${surface}`, seed: params.seed, numRuns: params.numRuns, ran: details.numRuns,
      failed: details.failed, counterexample: details.counterexample, path: details.counterexamplePath,
      error: details.errorInstance?.message?.slice(0, 2000), versions, coverage: totals, seconds: Math.round((Date.now() - started) / 1000) };
    record('tui-property', entry);
    console.log(`[${surface}] coverage ${JSON.stringify(totals)}`);
    if (details.failed) {
      assert.fail(`[${surface}] property failed; replay with FC_SEED=${params.seed} FC_PATH=${details.counterexamplePath}\n${JSON.stringify(details.counterexample)}\n${details.errorInstance?.message}`);
    }
  });
}