// Independent oracles for the dsh-keybindings product properties (SPEC.md).
// Nothing here imports dsh-TUI or the patch: the expected values come from the
// spec (omp's palette, the ladder order) and from public formulas.

/** Reasoning levels pi-ai can declare on a route, weakest to strongest (SPEC: ladder order). */
export const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Distinct wire spellings, so a request names exactly which level it carries. */
export const wire = (level) => `w-${level}`;

/** SPEC P-01: the level after current on the ladder, wrapping; unknown/absent starts at the first rung. */
export function expectedNext(ladder, current) {
  if (ladder.length < 2) return current;
  const i = current === undefined ? -1 : ladder.indexOf(current);
  return ladder[(i + 1) % ladder.length];
}

/** pi-ai's display name for a declared level (capitalised id). */
export const label = (level) => level.charAt(0).toUpperCase() + level.slice(1);

/** SPEC P-10: omp's thinking colours (dark) and the darker twins (light). */
export const PALETTE = {
  dark: { minimal: '#808080', low: '#178fb9', medium: '#0088fa', high: '#b281d6', xhigh: '#e5c1ff' },
  light: { minimal: '#8a8a8a', low: '#0f6d8e', medium: '#0062b8', high: '#7d4fa6', xhigh: '#5b2d86' },
};

/**
 * xterm 256-colour index a 24-bit colour is rendered with on a 256-colour
 * terminal: the 6x6x6 cube with per-channel round(c/255*5), and the 24-step
 * grey ramp for greys. This is the public ansi-styles/chalk mapping the
 * terminal sees; written out here so the oracle does not call the renderer.
 */
export function ansi256(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
}

/**
 * SPEC P-10: how the chat prompt glyph should look for a level.
 *   { kind: 'plain' }                      no effort, or a ladder of < 2 levels
 *   { kind: 'tier', index }                a non-top tier: omp colour as 256-colour index
 *   { kind: 'top' }                        top tier: dst's bold ignition glyph (not an omp colour)
 * Custom ids would map by ladder position; pi-ai only declares the LEVELS ids.
 */
export function expectedGlyph(theme, ladder, effort) {
  if (effort === undefined || ladder.length < 2 || !ladder.includes(effort)) return { kind: 'plain' };
  if (effort === ladder[ladder.length - 1]) return { kind: 'top' };
  return { kind: 'tier', index: ansi256(PALETTE[theme][effort]) };
}

/** Parse the SGR state in effect at the first "❯" of a captured line. */
export function glyphStyle(line) {
  const at = line.indexOf('\u276F');
  if (at < 0) return undefined;
  let fg; let bold = false;
  const re = /\x1b\[([0-9;]*)m/g;
  let m;
  while ((m = re.exec(line)) && m.index < at) {
    const parts = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (let i = 0; i < parts.length; i += 1) {
      const p = parts[i];
      if (p === 0) { fg = undefined; bold = false; } else if (p === 1) bold = true;
      else if (p === 22) bold = false;
      else if (p === 39) fg = undefined;
      else if (p === 38 && parts[i + 1] === 5) { fg = `256:${parts[i + 2]}`; i += 2; } else if (p === 38 && parts[i + 1] === 2) { fg = `rgb:${parts.slice(i + 2, i + 5).join(',')}`; i += 4; } else if (p >= 30 && p <= 37) fg = `ansi:${p}`;
    }
  }
  return { fg, bold };
}

/** True when a captured glyph style satisfies the expected glyph. */
export function glyphMatches(expected, style, theme) {
  if (!style) return false;
  const ompIndexes = new Set(Object.values(PALETTE[theme]).map((h) => `256:${ansi256(h)}`));
  if (expected.kind === 'plain') return !ompIndexes.has(style.fg) && !style.bold;
  if (expected.kind === 'tier') return style.fg === `256:${expected.index}` && !style.bold;
  return style.bold && !ompIndexes.has(style.fg);
}
