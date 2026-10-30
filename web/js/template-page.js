// The Template page of the FSM, ASM and Petri net wizards (#2149): a template of core/chart-templates.js and its
// parameters; leaving the page with another template or other parameters than the last ones applies it (onApply), which
// fills in the wizard's next pages (they can still be edited there).
import { h } from './ui.js';
import { templateOf, templateDefaults, templateError } from '/core/chart-templates.js';
import { field, select } from './wizards.js';

export function templatePage(kind, list, onApply) {
  const tplSel = select(list.map(t => [t.id, t.label]), list[0].id);
  tplSel.classList.add('tp-template');
  const text = h('div', { class: 'hint tp-text', style: { marginTop: '8px' } });
  const grid = h('div', { class: 'form-grid', style: { marginTop: '10px' } });
  let params = {}, applied = null;
  // the fields of the template's parameters, at their defaults
  const fields = () => {
    const t = templateOf(kind, tplSel.value);
    params = templateDefaults(kind, t.id);
    text.textContent = t.text;
    grid.replaceChildren(...(t.params || []).flatMap(p => {
      const ctl = p.options ? select(p.options, p.def)
        : h('input', { type: p.key === 'pattern' ? 'text' : 'number', value: String(p.def), spellcheck: 'false', style: { width: '110px' }, ...(p.min != null ? { min: p.min, max: p.max } : {}) });
      ctl.classList.add(`tp-${p.key}`);
      ctl.addEventListener(p.options ? 'change' : 'input', () => { params[p.key] = p.options || p.key === 'pattern' ? ctl.value.trim() : ctl.value; });
      return field(p.label, ctl);
    }));
  };
  tplSel.addEventListener('change', fields);
  fields();
  const page = {
    title: 'Template',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Start from a template: it fills in the next pages, where you can still change everything.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } }, ...field('Template:', tplSel)), text, grid),
    validate: () => {
      const e = templateError(kind, tplSel.value, params);
      if (e) return e;
      const key = JSON.stringify([tplSel.value, params]);
      if (key !== applied) { applied = key; onApply(tplSel.value, { ...params }); }
      return null;
    },
  };
  return { page, id: () => tplSel.value, params: () => ({ ...params }), label: () => templateOf(kind, tplSel.value).label };
}
