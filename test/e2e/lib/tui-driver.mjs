// Real dsh-TUI driver: keystrokes go through tmux into the real process, and
// every observation is read back from the rendered pane, ~/.dsh-tui/effort.json
// or the mock model's request log. Nothing calls dsh-TUI internals.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTui } from '../../rig/rig.mjs';
import { sleep, eventually } from './harness.mjs';
import { expectedGlyph, expectedNext, glyphMatches, glyphStyle, label, wire } from './oracle.mjs';

const ROWS = 36;

export class TuiCase {
  constructor(fixture, { ladder, theme, cols, seedKind, seedLevel }) {
    Object.assign(this, { fixture, ladder, theme, cols });
    this.profile = fixture.profile;
    this.mock = fixture.mock;
    this.trace = [];
    // Model state (SPEC.md): the live/persisted effort, the screen and the draft.
    this.effort = seedKind === 'valid' ? seedLevel : undefined;
    this.persisted = seedKind === 'valid' ? seedLevel : undefined;
    this.screen = 'launchpad';
    this.draft = '';
    this.turns = 0;
    this.stats = {};
  }

  count(key) { this.stats[key] = (this.stats[key] ?? 0) + 1; }

  async start() {
    this.tui = startTui(this.profile, { cols: this.cols, rows: ROWS });
    await this.tui.waitFor(/mock-alpha/, { timeout: 60000 });
    await this.tui.waitFor(/Say something|❯/, { timeout: 30000 });
    await sleep(800);
    this.screen = 'launchpad';
    this.draft = '';
  }

  async stop() { if (this.tui) await this.tui.kill(); this.tui = undefined; }

  screenText() { return this.tui.capture(); }

  effortFile() {
    try {
      const parsed = JSON.parse(readFileSync(join(this.profile.home, '.dsh-tui', 'effort.json'), 'utf8'));
      return typeof parsed?.effort === 'string' ? parsed.effort : undefined;
    } catch { return undefined; }
  }

  /** The draft as rendered on the current screen's input line. */
  renderedDraft(text = this.screenText()) {
    const lines = text.split('\n');
    if (this.screen === 'launchpad') {
      const line = lines.find((l) => /│ ❯ /.test(l));
      if (!line) return { error: 'no Launchpad input line' };
      const body = line.slice(line.indexOf('❯ ') + 2).replace(/│\s*$/, '').trimEnd();
      return { draft: /^Say something/.test(body) ? '' : body };
    }
    const line = [...lines].reverse().find((l) => /^\s*⌸ ❯/.test(l));
    if (!line) return { error: 'no chat prompt line' };
    return { draft: line.slice(line.indexOf('❯') + 1).replace(/⛶\s*$/, '').trim() };
  }

  /** The effort the status readout shows: Launchpad parameter row (label); chat header '<model id> · <Label> effort'. */
  renderedEffort(text = this.screenText()) {
    const lines = text.split('\n');
    if (this.screen === 'launchpad') {
      const row = lines.find((l) => /^\s*mock-alpha\s+·/.test(l));
      if (!row) return { error: 'no Launchpad parameter row' };
      const segs = row.trim().split(/\s+·\s+/);
      const shown = this.ladder.find((l) => segs.includes(label(l)));
      return { effort: shown };
    }
    // The chat header renders '<model id> · <Label> effort' (or the bare id
    // when none) and can be prefixed by the logo's ▀ blocks at wide panes, so
    // it is matched by line-end shape, not by leading whitespace; the footer
    // continues past the model id (' · cache … · work …') and never matches.
    const header = lines.map((l) => l.match(/mock-alpha(?: · (\S+) effort)?\s*$/)).find((m) => m);
    if (header) {
      if (!header[1]) return { effort: undefined };
      return { effort: this.ladder.find((l) => label(l) === header[1]) };
    }
    const row = [...lines].reverse().find((l) => /^\s*mock-alpha · /.test(l));
    if (!row) return { error: 'no chat effort readout' };
    const second = row.trim().split(' · ')[1]?.split(' ')[0];
    return { effort: this.ladder.includes(second) ? second : undefined };
  }

  /** Invariants checked after every step (SPEC I-1..I-6). Returns null or the violated invariant. */
  invariants() {
    const text = this.screenText();
    if (/\[\[exited/.test(text)) return 'I-1 dsh-TUI exited';
    const file = this.effortFile();
    if (file !== this.persisted) return `I-2 effort.json has ${file}, model ${this.persisted}`;
    if (/Recently used|Enter to view models|Permission preset/.test(text)) return 'I-5 a picker is still open';
    const shown = this.renderedEffort(text);
    if (shown.error) return `I-3 ${shown.error}`;
    if (shown.effort !== this.effort) return `I-3 readout shows ${shown.effort}, model ${this.effort}`;
    const d = this.renderedDraft(text);
    if (d.error) return `I-4 ${d.error}`;
    // The Launchpad preserves leading draft spaces (only the placeholder and
    // trailing padding are stripped); the chat parser trims both ends.
    const expectedDraft = this.screen === 'launchpad' ? this.draft.trimEnd() : this.draft.trim();
    if (d.draft !== expectedDraft) return `I-4 draft shows ${JSON.stringify(d.draft)}, model ${JSON.stringify(expectedDraft)}`;
    if (/Recently used|Enter to view models|Permission preset/.test(text)) return 'I-5 a picker is still open';
    if (this.screen === 'launchpad') {
      const row = text.split('\n').find((l) => /^\s*mock-alpha\s+·/.test(l));
      if (!row) return 'I-6 no Launchpad parameter row';
      const segs = row.trim().split(/\s+·\s+/);
      const effortShown = segs.some((s) => this.ladder.some((l) => label(l) === s));
      const preset = segs.find((s) => s.startsWith('dang'));
      // Shift+Tab must leave the permission preset on the profile default and
      // must not cycle permission modes. At cols ≤ 60 the row drops trailing
      // segments once an effort label joins it, so a missing default there is
      // truncation, not a change; it is required wherever it can render.
      if (preset === undefined && (this.cols >= 100 || !effortShown)) return 'I-6 permission preset readout missing';
      if (segs.some((s) => ['accept-edits', 'read-only', 'plan'].includes(s))) return 'I-6 a different permission preset is shown';
    }
    if (this.screen === 'chat') {
      const line = [...this.tui.captureEscapes().split('\n')].reverse().find((l) => l.includes('⌸') && l.includes('\u276F'));
      const expected = expectedGlyph(this.theme, this.ladder, this.effort);
      const style = line && glyphStyle(line);
      if (!glyphMatches(expected, style, this.theme)) return `I-7 glyph ${JSON.stringify(style)} expected ${JSON.stringify(expected)} (${this.theme})`;
    }
    return null;
  }

  async settle(step) {
    const reason = await eventually(() => this.invariants());
    if (reason) throw new Error(`after ${step}: ${reason}`);
  }

  // ---- actions -------------------------------------------------------------

  async shiftTab() {
    this.count(`shiftTab:${this.screen}`);
    const before = this.effort;
    this.tui.keys('BTab');
    if (this.ladder.length >= 2) {
      this.effort = expectedNext(this.ladder, this.effort);
      this.persisted = this.effort;
      if (before === this.ladder[this.ladder.length - 1]) this.count('wrap');
    } else this.count('shiftTab:noLadder');
    await sleep(300);
    await this.settle('Shift+Tab');
  }

  async burst(k) {
    this.count(`burst:${this.screen}`);
    this.tui.keys(...Array(k).fill('BTab'));
    if (this.ladder.length < 2) { await sleep(400); await this.settle(`Shift+Tab x${k}`); return; }
    const allowed = [];
    let e = this.effort;
    for (let i = 0; i < k; i += 1) { e = expectedNext(this.ladder, e); allowed.push(e); }
    // P-05: a burst advances between 1 and k rungs (presses during a pending step are dropped), never off the ladder.
    let observed;
    const reason = await eventually(() => {
      observed = this.effortFile();
      return allowed.includes(observed) ? null : `P-05 effort.json ${observed} not in ${allowed.join(',')}`;
    });
    if (reason) throw new Error(`after Shift+Tab x${k}: ${reason}`);
    await sleep(800);
    observed = this.effortFile();
    if (!allowed.includes(observed)) throw new Error(`after Shift+Tab x${k}: P-05 settled on ${observed}`);
    this.effort = observed; this.persisted = observed;
    await this.settle(`Shift+Tab x${k}`);
  }

  async altP() {
    this.count(`altP:${this.screen}`);
    this.tui.keys('M-p');
    const open = await eventually(() => (/Recently used|Enter to view models/.test(this.screenText()) ? null : 'P-07 model picker did not open'));
    if (open) throw new Error(`after Alt+P: ${open}`);
    this.tui.keys('Escape');
    await sleep(300);
    await this.settle('Alt+P, Esc');
  }

  /** Ctrl+P must be inert: no picker (I-5), draft untouched (I-4). The meta guard excludes ctrl. */
  async ctrlP() {
    this.count('ctrlP:' + this.screen);
    this.tui.keys('C-p');
    await sleep(600);
    await this.settle('Ctrl+P');
  }

  async type(s) {
    this.count(`type:${this.screen}`);
    if (/[pP]/.test(s)) this.count('type:p');
    this.tui.text(s);
    this.draft += s;
    await sleep(200);
    await this.settle(`type ${JSON.stringify(s)}`);
  }

  async backspace() {
    this.count(`backspace:${this.screen}`);
    this.tui.keys('BSpace');
    this.draft = [...this.draft].slice(0, -1).join('');
    await sleep(200);
    await this.settle('Backspace');
  }

  async clearDraft() {
    for (const _ of [...this.draft]) this.tui.keys('BSpace');
    this.draft = '';
    await sleep(200);
    await this.settle('clear draft');
  }

  /** Submit the draft (typing a word first if empty); P-02: the request carries the live effort. */
  async submit(word = 'go') {
    this.count(`submit:${this.screen}`);
    if (this.draft.trim() === '') await this.type(word);
    const n = this.mock.turns().length;
    await this.tui.submit('', { until: () => this.mock.turns().length > n });
    const req = this.mock.turns()[n];
    const want = this.effort === undefined ? undefined : wire(this.effort);
    if (req.reasoning_effort !== want) throw new Error(`after submit: P-02 request reasoning_effort ${req.reasoning_effort}, expected ${want}`);
    this.screen = 'chat';
    this.draft = '';
    await this.tui.waitFor(/pong/, { timeout: 30000 });
    await this.settle('submit');
  }

  async permissions() {
    this.count(`permissions:${this.screen}`);
    if (this.draft) await this.clearDraft();
    this.tui.text('/permissions');
    await sleep(300);
    this.tui.keys('Enter');
    const open = await eventually(() => (/Permission preset/.test(this.screenText()) ? null : 'P-09 /permissions opened no preset picker'));
    if (open) throw new Error(open);
    this.screen = 'chat';
    this.tui.keys('Escape');
    await sleep(300);
    await this.settle('/permissions, Esc');
  }

  async restart() {
    this.count('restart');
    await this.stop();
    await this.start();
    // P-03: a persisted pick is the live effort after restart.
    this.effort = this.persisted;
    await this.settle('restart');
  }

  async run(action) {
    this.trace.push(action);
    switch (action.t) {
      case 'shiftTab': return this.shiftTab();
      case 'burst': return this.burst(action.k);
      case 'altP': return this.altP();
      case 'ctrlP': return this.ctrlP();
      case 'type': return this.type(action.s);
      case 'backspace': return this.backspace();
      case 'submit': return this.submit();
      case 'permissions': return this.permissions();
      case 'restart': return this.restart();
      default: throw new Error(`unknown action ${action.t}`);
    }
  }
}