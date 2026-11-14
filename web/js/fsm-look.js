// The look of a state or a transition in the FSM editor's Properties (#3883, under its other fields, web/js/fsm-side.js):
// its colours (a colour picker each, showing the colour drawn: the theme's until one is chosen, then ✕ back to the
// theme's), its line's width and style, its text's colour, size, style and font, and Default look. Each value set
// through core/fsm-style.js setStyle, as the MCP's set_fsm_look does: a value refused marked as it is typed and, when
// it is left, said in the console (flash) and the value in force shown again; a change committed (an undo step, a
// quick run of the same field merged into one).
import { h } from './ui.js';
import { setStyle, STYLE_DEFAULTS, FONT_SIZE, LINE_WIDTH } from '/core/fsm-style.js';

// (the colour a CSS value stands for in the editor, its theme's variables resolved, as #rrggbb; null: unknown)
function cssColour(host, value) {
  const probe = h('span', { style: { color: value, display: 'none' } });
  host.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c) || /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
  if (!m) return null;
  const k = c.startsWith('color(') ? 255 : 1;
  return `#${m.slice(1, 4).map((x) => Math.round(Math.min(255, Number(x) * k)).toString(16).padStart(2, '0')).join('')}`;
}
// (the theme's colour of each colour of the look: the editor's CSS's default look, fsm-editor.css)
const THEME = { state: { fill: 'var(--fsm-state-fill)', stroke: 'var(--asm-fg)', color: 'var(--asm-fg)' },
  trans: { stroke: 'var(--asm-fg)', color: 'var(--asm-fg)' } };

/** The look's fields of the object `obj()` (kind: 'state' | 'trans'), for the Properties section `host`. */
export function lookFields({ kind, obj, host, commit, flash, where, refresh, field, btn }) {
  const look = () => obj()?.look || {};
  // (a value set: { look } of setStyle written to the object, committed; its error returned)
  const apply = (key, v) => {
    const o = obj();
    if (!o) return null;
    const r = setStyle(kind, o.look, { [key]: v });
    if (r.error) return r.error;
    if (JSON.stringify(r.look) !== JSON.stringify(o.look ?? null)) { if (r.look) o.look = r.look; else delete o.look; commit(`look:${key}`); }
    return null;
  };
  // (each field's label and its options' as `label: '…'`, which the label scan of test/web-i18n.test.js finds)
  const colour = ({ key, label }) => {
    const el = h('input', { type: 'color', class: `fsm-colour ${key}`, value: look()[key] || cssColour(host, THEME[kind][key]) || '#000000' });
    el.dataset.key = `look:${key}`;
    const reset = h('button', { type: 'button', class: 'asm-x fsm-colour-reset', title: 'Back to the colour of the theme', hidden: !look()[key],
      onclick: (e) => { e.preventDefault(); apply(key, ''); refresh(); } }, '✕');
    el.addEventListener('input', () => { apply(key, el.value); reset.hidden = !look()[key]; });
    return field(label, h('span', { class: 'fsm-colour-row' }, el, reset));
  };
  const number = ({ key, label }, R, step) => {
    const el = h('input', { type: 'number', class: `asm-input fsm-look-num ${key}`, min: R.min, max: R.max, step, value: look()[key] ?? '',
      placeholder: String(STYLE_DEFAULTS[kind][key]) });
    el.dataset.key = `look:${key}`;
    const set = (done) => {
      const err = apply(key, el.value);
      el.classList.toggle('bad', !!err);
      if (err && done) { flash(`${where()}: ${err}`); el.value = look()[key] ?? ''; el.classList.remove('bad'); }
    };
    el.addEventListener('input', () => set(false));
    el.addEventListener('change', () => set(true));
    return field(label, el);
  };
  const choice = ({ key, label }, options) => {
    const el = h('select', { class: `asm-select fsm-look-sel ${key}` }, ...options.map((o) => h('option', { value: o.value, selected: (look()[key] ?? '') === o.value }, o.label)));
    el.addEventListener('change', () => apply(key, el.value));
    return field(label, el);
  };
  const state = kind === 'state';
  const styles = [{ value: '', label: state ? 'Default (name bold)' : 'Regular' }, ...(state ? [{ value: 'regular', label: 'Regular' }] : []),
    { value: 'bold', label: 'Bold' }, { value: 'italic', label: 'Italic' }, { value: 'bold-italic', label: 'Bold italic' }];
  const fonts = [{ value: '', label: state ? 'Default' : 'Monospace' }, { value: 'sans-serif', label: 'Sans-serif' }, { value: 'serif', label: 'Serif' },
    ...(state ? [{ value: 'monospace', label: 'Monospace' }] : [])];
  const dashes = [{ value: '', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }];
  const width = { key: 'strokeWidth', label: state ? 'Border width' : 'Line width' };
  const lineFields = state
    ? [h('div', { class: 'asm-grid2' }, colour({ key: 'fill', label: 'Fill colour' }), colour({ key: 'stroke', label: 'Border colour' })),
      h('div', { class: 'asm-grid2' }, number(width, LINE_WIDTH, 0.1), colour({ key: 'color', label: 'Text colour' }))]
    : [h('div', { class: 'asm-grid2' }, colour({ key: 'stroke', label: 'Line colour' }), number(width, LINE_WIDTH, 0.1)),
      h('div', { class: 'asm-grid2' }, choice({ key: 'dash', label: 'Line style' }, dashes), colour({ key: 'color', label: 'Text colour' }))];
  const reset = { label: 'Default look', title: 'Draw it with the default look, in the colours of the theme' };
  return [h('h3', { class: 'fsm-look-title' }, 'Look'), ...lineFields,
    h('div', { class: 'asm-grid2' }, number({ key: 'fontSize', label: 'Text size' }, FONT_SIZE, 1), choice({ key: 'textStyle', label: 'Text style' }, styles)),
    choice({ key: 'font', label: 'Font' }, fonts),
    h('div', { class: 'asm-row' }, btn(reset.label, reset.title, () => {
      const o = obj();
      if (o?.look) { delete o.look; commit(); }
      refresh();
    }, 'asm-small fsm-look-default'))];
}
