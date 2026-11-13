// The schematic's Try it panel (#405: out of liveController in sch-live.js): its notes, and the pins of the module
// instance clicked with their directions and values (a module's ports, a library symbol's pins).
import { SYMBOLS, symbolPins } from '/core/schdoc.js';
import { esc } from './dom.js';
import { fmtValue } from '/core/schlive.js';
import { lvClass } from './sch-live.js';

/** { renderInstance, renderProps } of liveController (propEl(), radix(), selSym(): its current values). */
export function mountLiveInstance(ctx) {
  const {
    live, h, modules, propEl, radix, selSym, setPropEl
  } = ctx;

  // ------------------------------------------------------------------ module instances
  function renderInstance() {
    if (!propEl()) return;
    const box = propEl().querySelector('.lv-inst');
    if (!box) return;
    if (!selSym()) { box.innerHTML = ''; return; }
    const ports = live.instancePorts(selSym().id);
    const rows = ports.length
      ? ports.map(p => `<tr class="${lvClass(p.value)}"><td>${esc(p.name)}</td><td>${p.dir === 'in' ? 'in' : p.dir === 'out' ? 'out' : 'inout'}</td><td class="v">${esc(fmtValue(p.value, radix()))}</td></tr>`).join('')
      : (() => {
        let ps = [];
        try { ps = symbolPins(selSym(), modules); } catch { /* none */ }
        return ps.map(p => { const v = live.pinValue(selSym().id, p.name); return `<tr class="${lvClass(v)}"><td>${esc(p.name)}</td><td>${esc(p.dir)}</td><td class="v">${esc(fmtValue(v, radix()))}</td></tr>`; }).join('');
      })();
    box.innerHTML = `<div class="se-ptitle" data-no-i18n>${esc(selSym().name)} : ${esc(selSym().type === 'module' ? selSym().params.module : (SYMBOLS[selSym().type]?.title || selSym().type))}</div>`
      + `<table class="lv-ports" data-no-i18n><tbody>${rows}</tbody></table>`;
  }
  function renderProps(el) {
    setPropEl(el);
    el.innerHTML = '';
    el.append(h('div', { class: 'se-ptitle', text: 'Try it' }),
      h('div', { class: 'se-note', text: 'Click an input to change it: 1-bit inputs toggle, buses open a value editor, clock inputs step one cycle. Wires: green = 1, dark green = 0, red = X/U, blue = Z. Hover a pin or a wire to see its value; click a component to list its pins.' }),
      ...(live.bidirs?.length ? [h('div', { class: 'se-note lv-bidir-note', text: 'Bidirectional (inout) markers show the value on the bus. Click one to drive the bus from outside (1-bit: Z, 0, 1 in turn; a bus opens the value editor, Z releases it); released (Z), the circuit drives it.' })] : []),
      h('div', { class: 'lv-inst' }));
    renderInstance();
  }

  return { renderInstance, renderProps };
}
