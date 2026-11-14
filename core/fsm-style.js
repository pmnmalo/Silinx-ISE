// A state's or a transition's look in a state diagram (#3883): its colours, its line and its text, saved with the
// drawing as the object's `look` and nothing else (the generated HDL never reads it). Only what differs from the
// default look is written: no `look` at all for an object drawn as before, so an old drawing renders as it did. A
// colour not chosen follows the theme (light / dark: the editor's CSS); a chosen one is kept as it is.
//
//   state:      { fill, stroke, strokeWidth, color, fontSize, textStyle, font }
//   transition: { stroke, strokeWidth, dash, color, fontSize, textStyle, font }
//
//   fill, stroke, color   '#rrggbb' (the circle's fill, the circle's border or the arc, the texts)
//   strokeWidth           0.5 to 10 (default 1.6)
//   dash                  'solid' | 'dashed' | 'dotted' (an arc's)
//   fontSize              6 to 48 (a state: its name's, default 13, its outputs' scaled with it; a transition: 12)
//   textStyle             'regular' | 'bold' | 'italic' | 'bold-italic' (a state's default: its name bold)
//   font                  'sans-serif' | 'serif' | 'monospace' (a state's default: its name sans-serif, its outputs
//                         monospace; a transition's: monospace)
//
// The FSM editor's Properties (web/js/fsm-look.js) and the MCP's set_fsm_look (server/mcp-fsm.js) set it through
// setStyle, with the same checks and messages; a file's values not valid are kept (normalizeFsm) and are errors of
// Check (validateFsm: styleProblems), the drawing made with the default look in their place (styleOf).

export const FSM_FONTS = ['sans-serif', 'serif', 'monospace'];
export const FSM_TEXT_STYLES = ['regular', 'bold', 'italic', 'bold-italic'];
export const FSM_DASHES = ['solid', 'dashed', 'dotted'];
export const FONT_SIZE = { min: 6, max: 48 };
export const LINE_WIDTH = { min: 0.5, max: 10 };

/** The keys of a state's ('state') and a transition's ('trans') look, in their order. */
export const STYLE_KEYS = {
  state: ['fill', 'stroke', 'strokeWidth', 'color', 'fontSize', 'textStyle', 'font'],
  trans: ['stroke', 'strokeWidth', 'dash', 'color', 'fontSize', 'textStyle', 'font'],
};
/** The default look's values (a colour's default is the theme's: none here); a value equal to its default is not saved. */
export const STYLE_DEFAULTS = {
  state: { strokeWidth: 1.6, fontSize: 13 },
  trans: { strokeWidth: 1.6, dash: 'solid', fontSize: 12, textStyle: 'regular', font: 'monospace' },
};
const COLOURS = new Set(['fill', 'stroke', 'color']);
const NAMES = {
  state: { fill: 'the fill colour', stroke: 'the border colour', strokeWidth: 'the border width', color: 'the text colour',
    fontSize: 'the text size', textStyle: 'the text style', font: 'the font' },
  trans: { stroke: 'the line colour', strokeWidth: 'the line width', dash: 'the line style', color: 'the text colour',
    fontSize: 'the text size', textStyle: 'the text style', font: 'the font' },
};
const ENUMS = { dash: FSM_DASHES, textStyle: FSM_TEXT_STYLES, font: FSM_FONTS };
const empty = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const shown = (v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

/** The canonical value of `key` of a `kind` ('state' | 'trans') look, or { error }: a colour '#rrggbb' (also '#rgb',
 *  any case), a number in its range (also as text), a word of its list. */
export function styleValue(kind, key, value) {
  const name = NAMES[kind]?.[key];
  if (!name) return { error: `'${key}' is not a property of a ${kind === 'state' ? 'state' : 'transition'}'s look (${STYLE_KEYS[kind].join(', ')})` };
  if (COLOURS.has(key)) {
    const m = typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!m) return { error: `${name} ${shown(value)} is not a colour: #rrggbb (e.g. #ffcc00)` };
    const h = m[1].toLowerCase();
    return { value: `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}` };
  }
  if (key === 'fontSize' || key === 'strokeWidth') {
    const R = key === 'fontSize' ? FONT_SIZE : LINE_WIDTH;
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value) ? Number(value) : NaN;
    if (key === 'fontSize' && !(Number.isInteger(n) && n >= R.min && n <= R.max)) return { error: `${name} ${shown(value)} must be a whole number from ${R.min} to ${R.max}` };
    if (!(Number.isFinite(n) && n >= R.min && n <= R.max)) return { error: `${name} ${shown(value)} must be a number from ${R.min} to ${R.max}` };
    return { value: Math.round(n * 10) / 10 };
  }
  if (!ENUMS[key].includes(value)) return { error: `${name} ${shown(value)} must be one of ${ENUMS[key].join(', ')}` };
  return { value };
}

/** A file's look as normalizeFsm keeps it: its values made canonical, those equal to the default and the empty ones
 *  left out, the ones not valid kept as they are (Check says why: styleProblems); null when nothing is left. */
export function normalizeStyle(kind, st) {
  if (empty(st)) return null;
  if (typeof st !== 'object' || Array.isArray(st)) return st;   // (kept: Check says it is not a look)
  const out = {};
  for (const [k, v] of Object.entries(st)) {
    if (empty(v)) continue;
    const r = styleValue(kind, k, v);
    if (r.error) { out[k] = v; continue; }
    if (STYLE_DEFAULTS[kind][k] !== r.value) out[k] = r.value;
  }
  const keys = STYLE_KEYS[kind];
  const sorted = Object.fromEntries(Object.keys(out).sort((a, b) => (keys.indexOf(a) + 1 || 99) - (keys.indexOf(b) + 1 || 99)).map((k) => [k, out[k]]));
  return Object.keys(sorted).length ? sorted : null;
}

/** Why the look `st` of a `kind` object is not valid: a message per value refused (Check's errors). */
export function styleProblems(kind, st) {
  if (st == null) return [];
  if (typeof st !== 'object' || Array.isArray(st)) return [`its look must be an object { ${STYLE_KEYS[kind].join(', ')} }`];
  return Object.entries(st).filter(([, v]) => !empty(v)).map(([k, v]) => styleValue(kind, k, v).error).filter(Boolean);
}

/** The valid values of an object's look (`obj.look`), to draw it with: a value not valid left out (its default drawn). */
export function styleOf(kind, obj) {
  const st = obj?.look, out = {};
  if (!st || typeof st !== 'object') return out;
  for (const k of STYLE_KEYS[kind]) if (!empty(st[k])) { const r = styleValue(kind, k, st[k]); if (!r.error) out[k] = r.value; }
  return out;
}

/** The look `st` with `values` set ({ key: value }, an empty one or null back to its default): { look } (null: the
 *  default look, nothing to save) or { error } (the first value refused: nothing set). */
export function setStyle(kind, st, values) {
  const r = { ...(st && typeof st === 'object' && !Array.isArray(st) ? st : {}) };
  for (const [k, v] of Object.entries(values || {})) {
    if (empty(v)) {
      if (!NAMES[kind]?.[k]) return { error: styleValue(kind, k, v).error };
      delete r[k]; continue;
    }
    const s = styleValue(kind, k, v);
    if (s.error) return { error: s.error };
    r[k] = s.value;
  }
  return { look: normalizeStyle(kind, r) };
}

/** An object's look in words, as the MCP says it: "fill #ffcc00, text size 16", or "the default look". */
export function styleText(kind, st) {
  const e = Object.entries(st || {});
  return e.length ? e.map(([k, v]) => `${(NAMES[kind][k] || k).replace(/^the /, '')} ${v}`).join(', ') : 'the default look';
}

/** The inline CSS of the texts of a look (`st`: styleOf's), only what it sets ('' for the default look): their colour,
 *  size (`size` of a text whose default is `base`: a state's outputs, 12 under its name's 13, scaled with it), weight,
 *  slant and font. Inline, as the editor's CSS sets the default look's on the classes. */
export function textCss(st, base, size = base) {
  const a = [];
  if (st.color) a.push(`fill:${st.color}`);
  if (st.fontSize != null) a.push(`font-size:${Math.round(st.fontSize * size / base * 10) / 10}px`);
  if (st.textStyle) a.push(`font-weight:${/bold/.test(st.textStyle) ? 700 : 400}`, `font-style:${/italic/.test(st.textStyle) ? 'italic' : 'normal'}`);
  if (st.font) a.push(`font-family:${st.font}`);
  return a.join(';');
}
