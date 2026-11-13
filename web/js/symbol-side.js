// The Symbol Editor's Properties panel (#3755, web/js/symbol-editor.js): the selected pin's section (its direction and
// width, its Side and its Position on it) and the symbol's (the spacing between pins, the body's width and height,
// automatic when empty, and where the module's name is drawn). Read only: the fields disabled.
import { h } from './dom.js';
import { SIZE, SPACING } from '/core/symbol-layout.js';

export const SIDE_NAMES = { W: 'Left', E: 'Right', N: 'Top', S: 'Bottom' };
const TITLE_NAMES = { top: 'Top', center: 'Center', bottom: 'Bottom' };

/** { renderSide } of mountSymbolEditor (S(), sel(), module(): its current symbol, selected pin and module). */
export function mountSymbolSide(ctx) {
  const { side, readOnly, S, sel, module, sideOf, movePin, commit } = ctx;
  const pinSection = h('section', { class: 'asm-section sy-pin-props' });
  const symSection = h('section', { class: 'asm-section sy-symbol-props' });
  side.append(pinSection, symSection);

  const field = (label, input) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input);
  const choice = (options, value, onChange, cls) => {
    const s = h('select', { class: `asm-input ${cls}`, disabled: readOnly }, ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
    s.addEventListener('change', () => onChange(s.value));
    return s;
  };
  // (a number, or empty: automatic, when `auto`)
  const number = (value, { min, max, step = 10, auto = false }, onChange, cls) => {
    const i = h('input', { type: 'number', class: `asm-input ${cls}`, value: value == null ? '' : String(value), min: String(min), max: String(max), step: String(step), disabled: readOnly, ...(auto ? { placeholder: 'auto' } : {}) });
    i.addEventListener('change', () => {
      if (auto && i.value.trim() === '') return onChange(null);
      const n = Math.round(+i.value / step) * step;
      onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value);
    });
    return i;
  };

  function renderSide() {
    pinSection.replaceChildren();
    const name = sel();
    pinSection.hidden = !name;   // (nothing selected: nothing said, #2735)
    if (name) {
      const port = module()?.ports?.find(q => q.name.toLowerCase() === name.toLowerCase());
      const sd = sideOf(name), same = S().pins.filter(q => q.side === sd);
      pinSection.append(h('h3', { 'data-no-i18n': true }, name),
        port ? h('div', { class: 'asm-label sy-port' }, `${port.dir === 'out' ? 'Output' : port.dir === 'inout' ? 'Bidirectional' : 'Input'}, ${port.width > 1 ? `${port.width} bits` : '1 bit'}`) : null,
        field('Side', choice(SIDE_NAMES, sd, v => movePin(name, v, Infinity), 'sy-side')),
        field('Position', number(same.findIndex(q => q.name === name) + 1, { min: 1, max: same.length, step: 1 }, n => movePin(name, sd, n - 1), 'sy-position')));
    }
    const s = S();
    symSection.replaceChildren(h('h3', {}, 'Symbol'),
      field('Pin spacing', number(s.spacing, { min: SPACING.min, max: SPACING.max }, v => { s.spacing = v; commit(); }, 'sy-spacing')),
      field('Width', number(s.width, { min: SIZE.min, max: SIZE.max, auto: true }, v => { s.width = v; commit(); }, 'sy-width')),
      field('Height', number(s.height, { min: SIZE.min, max: SIZE.max, auto: true }, v => { s.height = v; commit(); }, 'sy-height')),
      field('Module name', choice(TITLE_NAMES, s.title, v => { s.title = v; commit(); }, 'sy-title')));
  }
  return { renderSide };
}
