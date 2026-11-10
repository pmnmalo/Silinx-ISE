// The Properties side panel of an exercise document (#3192, web/js/exercise-view.js): the exercise's title and
// statement in English and Portuguese and its top, then the selected test's settings by its kind (vectors: the clock,
// the period, the vectors' text; reference: the cycles, the seed; testbench: its module, its end message; synthesis:
// no latches, the LUTs, flip-flops and slices at most). A change is the exercise's at once (`changed`), saved as every
// document is (its tab's mark, saved after a moment). Its problems are the console's when the tests run.
import { h } from './ui.js';
import { TEST_KINDS } from '/core/grade-format.js';

const textOf = (v, L) => (v == null ? '' : typeof v === 'string' ? (L === 'en' ? v : '') : v[L] ?? '');
// a text of the exercise in language L set (a plain string becomes { en, pt })
function setText(obj, key, L, value) {
  const cur = obj[key];
  const o = cur && typeof cur === 'object' ? { ...cur } : { en: typeof cur === 'string' ? cur : '' };
  o[L] = value;
  obj[key] = o;
}

/** The panel in `side` (after its caption): render() draws it again for the exercise and the test selected. */
export function mountExerciseProps(side, { exercise, selected, changed }) {
  const body = h('div', { class: 'ex-props' });
  side.append(body);
  const field = (label, input, cls = '') => h('label', { class: `ex-field ${cls}` }, h('span', {}, label), input);
  const input = (value, onchange, attrs = {}) => h('input', { type: 'text', value: value ?? '', 'data-no-i18n': '', onchange: e => onchange(e.target.value), ...attrs });
  const area = (value, onchange, attrs = {}) => h('textarea', { 'data-no-i18n': '', onchange: e => onchange(e.target.value), ...attrs }, value ?? '');
  const numberIn = (value, onchange, attrs = {}) => h('input', { type: 'number', value: value ?? '', min: 0, onchange: e => onchange(e.target.value === '' ? undefined : Number(e.target.value)), ...attrs });
  const check = (value, onchange, attrs = {}) => h('input', { type: 'checkbox', checked: !!value, onchange: e => onchange(e.target.checked), ...attrs });
  const set = (obj, key) => v => { if (v === undefined || v === '') delete obj[key]; else obj[key] = v; changed(); };

  function testFields(x) {
    const out = [
      field('Id', input(x.id, set(x, 'id'), { 'data-prop': 'test-id' })),
      field('Title (English)', input(textOf(x.title, 'en'), v => { setText(x, 'title', 'en', v); changed(); }, { 'data-prop': 'test-title-en' })),
      field('Title (Portuguese)', input(textOf(x.title, 'pt'), v => { setText(x, 'title', 'pt', v); changed(); }, { 'data-prop': 'test-title-pt' })),
      field('Kind', h('select', { 'data-prop': 'test-kind', onchange: e => { x.kind = e.target.value; changed(); render(); } },
        ...TEST_KINDS.map(k => h('option', { value: k, selected: x.kind === k }, k)))),
      field('Visible', check(x.visible, v => { x.visible = v; changed(); }, { 'data-prop': 'test-visible' }), 'check'),
      field('Points', numberIn(x.points, set(x, 'points'), { 'data-prop': 'test-points' })),
    ];
    if (x.kind === 'vectors' || x.kind === 'reference') {
      out.push(field('Clock', input(x.clock, set(x, 'clock'), { 'data-prop': 'test-clock' })),
        field('Period (ns)', numberIn(x.periodNs, set(x, 'periodNs'), { 'data-prop': 'test-period' })));
    }
    if (x.kind === 'vectors') out.push(field('Vectors', area(x.vectors, set(x, 'vectors'), { rows: 10, 'data-prop': 'test-vectors' })));
    if (x.kind === 'reference') out.push(field('Cycles', numberIn(x.cycles, set(x, 'cycles'), { 'data-prop': 'test-cycles' })), field('Seed', numberIn(x.seed, set(x, 'seed'), { 'data-prop': 'test-seed' })));
    if (x.kind === 'testbench') out.push(field('Test bench', input(x.top, set(x, 'top'), { 'data-prop': 'test-top' })), field('End message', input(x.done, set(x, 'done'), { 'data-prop': 'test-done' })));
    if (x.kind === 'synthesis') {
      out.push(field('No latches', check(x.latches === false, v => { if (v) x.latches = false; else delete x.latches; changed(); }, { 'data-prop': 'test-latches' }), 'check'),
        field('LUTs at most', numberIn(x.luts, set(x, 'luts'), { 'data-prop': 'test-luts' })),
        field('Flip-flops at most', numberIn(x.ffs, set(x, 'ffs'), { 'data-prop': 'test-ffs' })),
        field('Slices at most', numberIn(x.slices, set(x, 'slices'), { 'data-prop': 'test-slices' })));
    }
    return out;
  }

  function render() {
    const ex = exercise(), x = selected();
    body.replaceChildren(
      h('div', { class: 'ex-section' }, h('h3', {}, 'Exercise'),
        field('Title (English)', input(textOf(ex.title, 'en'), v => { setText(ex, 'title', 'en', v); changed(); }, { 'data-prop': 'title-en' })),
        field('Title (Portuguese)', input(textOf(ex.title, 'pt'), v => { setText(ex, 'title', 'pt', v); changed(); }, { 'data-prop': 'title-pt' })),
        field('Statement (English)', area(textOf(ex.statement, 'en'), v => { setText(ex, 'statement', 'en', v); changed(); }, { rows: 5, 'data-prop': 'statement-en' })),
        field('Statement (Portuguese)', area(textOf(ex.statement, 'pt'), v => { setText(ex, 'statement', 'pt', v); changed(); }, { rows: 5, 'data-prop': 'statement-pt' })),
        field('Top module', input(ex.top, set(ex, 'top'), { 'data-prop': 'top' }))),
      h('div', { class: 'ex-section' }, h('h3', {}, 'Test'), ...(x ? testFields(x) : [])));
  }
  return { render };
}
