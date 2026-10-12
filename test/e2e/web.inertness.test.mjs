// S5 web inertness (SPEC: web surface not applicable — the patch only modifies
// the @deepseek-harness-tui/dsh-tui package, which the dsh-web profile bundle
// never loads). Property: a real dsh web, driven by Playwright, renders and
// works normally with this repo installed, and shows no dsh-keybindings
// artefacts. Generated prompts; invariants after every step; FC_SEED/NUM_RUNS
// replay; failure screenshots under KEYS_EVIDENCE_DIR.
//   nix run .#e2e -- test/e2e/web.inertness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { arb, evidenceDir, fc, pinned, record, runParams, saveArtifact, webFixture } from './lib/harness.mjs';

const versions = pinned();

const webAction = fc.record({
  prompt: fc.oneof({ weight: 4, arbitrary: arb.draft }, { weight: 1, arbitrary: fc.constant('hello web') }),
});

let web; // set inside the test before any case runs

/** Dismiss dsh 0.2's Preview Notice modal when it is up (idempotent per context). */
async function dismissPreviewNotice(page) {
  const notice = page.getByRole('dialog', { name: 'Preview Notice' });
  if (await notice.count()) await notice.getByRole('button').last().click();
}

/** The active-session composer's own label on 0.2.1-alpha.2 (contract-tested below). */
const COMPOSER = /commands, @ files or sessions/;

/** One-time setup inside the browser context: dismiss the notice, add the profile's work dir as the workspace. */
async function setupWorkspace(context) {
  const page = await context.newPage();
  try {
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    const chooser = page.getByRole('textbox', { name: 'Choose workspace' });
    // Whichever lands first: the notice modal or the composer.
    await Promise.race([
      page.getByRole('dialog', { name: 'Preview Notice' }).waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
      chooser.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    ]);
    await dismissPreviewNotice(page);
    if (await chooser.count()) {
      await page.getByRole('button', { name: 'Add workspace' }).click();
      const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' });
      await dialog.waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: 'Edit path' }).click();
      await page.waitForTimeout(300);
      await dialog.locator('input, [contenteditable="true"]').first().fill(web.profile.work);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      await dialog.getByRole('button', { name: 'Open' }).click();
    }
    const composer = page.getByRole('textbox', { name: COMPOSER });
    await composer.waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await composer.getAttribute('data-phase'), 'plain', 'the session composer must be active after setup');
  } finally {
    await page.close();
  }
}

async function runCase(c, totals) {
  const page = await web.context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  try {
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await dismissPreviewNotice(page);
    // A fresh page is the reset: the composer starts empty and active.
    const composer = page.getByRole('textbox', { name: COMPOSER });
    await composer.waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await composer.getAttribute('data-phase'), 'plain', 'the composer must be active');
    totals['composer'] = (totals['composer'] ?? 0) + 1;

    await composer.click();
    await page.keyboard.type(c.prompt);
    await page.keyboard.press('Enter');
    // The mock streams back the scripted text: the turn must complete.
    const answer = page.getByText('pong', { exact: false }).first();
    await answer.waitFor({ state: 'visible', timeout: 30000 });
    totals['turn'] = (totals['turn'] ?? 0) + 1;

    // Inertness: no trace of this repo's TUI-only features anywhere in the DOM.
    const body = await page.locator('body').innerText();
    assert.ok(!/omp-keys|dsh-keybindings/i.test(body), 'repo artefacts leaked into the web UI');
    assert.ok(!/Effort: |Permission preset/i.test(body), 'TUI-only strings leaked into the web UI');
    totals['inert'] = (totals['inert'] ?? 0) + 1;

    assert.deepEqual(pageErrors, [], 'uncaught page errors');
    const allowed = consoleErrors.filter((text) => /favicon|404/.test(text));
    assert.deepEqual(consoleErrors.filter((e) => !allowed.includes(e)), [], 'console errors');
    return true;
  } catch (error) {
    const id = `web-inertness-${Date.now()}`;
    try { await page.screenshot({ path: join(evidenceDir(), `${id}.png`), fullPage: true }); } catch { /* page gone */ }
    saveArtifact(`${id}.txt`, `${error.message}\n\ncase: ${JSON.stringify(c)}\nconsole: ${JSON.stringify(consoleErrors)}\npageerrors: ${JSON.stringify(pageErrors)}`);
    throw error;
  } finally {
    await page.close();
  }
}

test('dsh web stays unaltered with the patched dsh-TUI installed: generated prompts turn normally', { timeout: 60 * 60 * 1000 }, async () => {
  const params = runParams(25);
  console.log(`[web-inertness] FC_SEED=${params.seed} NUM_RUNS=${params.numRuns} dsh ${versions.dsh} dsh-TUI ${versions.tui}`);
  const fixture = await webFixture();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  web = { ...fixture.web, profile: fixture.profile, context };
  const totals = {};
  try {
    await setupWorkspace(context);
    const details = await fc.check(fc.asyncProperty(webAction, (c) => runCase(c, totals)), params);
    record('web-inertness', { test: 'web.inertness', seed: params.seed, numRuns: params.numRuns, ran: details.numRuns,
      failed: details.failed, counterexample: details.counterexample, path: details.counterexamplePath,
      error: details.errorInstance?.message?.slice(0, 2000), versions, coverage: totals });
    console.log(`[web-inertness] coverage ${JSON.stringify(totals)}`);
    if (details.failed) assert.fail(`[web-inertness] property failed; replay with FC_SEED=${params.seed} FC_PATH=${details.counterexamplePath}`);
  } finally {
    await browser.close();
    await fixture.dispose();
  }
});
