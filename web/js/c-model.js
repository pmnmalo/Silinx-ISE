// HDL to C in the app (#1530): a module's C model (core/hdl-c.js), the design elaborated from the project's sources (an
// HDL module, or a drawing's: its generated HDL), read-only in a document of its own: its struct, _init, _eval and a
// sequential one's _step, to use as a model of the design in C (a test bench of its own, teaching).
import { h } from './dom.js';
import { S, closeDoc, findDoc, openDoc, withPrimitives } from './app.js';
import { createEditor } from './editor.js';
import { log, showConsolePage } from './console.js';
import { compile, elaborate } from '/core/compile.js';

/** View C Model: the module's C model, generated, read-only. */
export async function openCModel(mod) {
  const { hdlToCSafe } = await import('/core/hdl-c.js');
  const srcs = S.sources.filter((s) => (s.lang === 'vhdl' || s.lang === 'verilog') && s.role !== 'sim');
  const design = elaborate(compile(withPrimitives(srcs)), mod);
  if (!design.top || design.diags.some((d) => d.severity === 'error')) {
    log(`ERROR: '${mod}' does not elaborate: correct it first.`, 'err');
    showConsolePage('errors');
    return null;
  }
  const r = hdlToCSafe(design);
  if (!r.ok) { log(`ERROR: the C model of '${mod}': ${r.errors.join('; ')}`, 'err'); return null; }
  log(`The C model of '${mod}': ${r.clock ? `sequential, ${r.top}_step a rising edge of ${r.clock}` : 'combinational'}.`, 'ok');
  const id = `cmodel:${mod}`;
  const old = findDoc(id);
  if (old) await closeDoc(old);
  const name = `${r.top}_model.c`;
  return openDoc({
    id, title: name, tooltip: `${name}, the C model of ${mod}`, icon: 'file',
    create(el, d) {
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), h('span', { class: 'gen-banner read-only' }, `Read-only, the C model of ${mod}`));
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      d.editor = createEditor(host, { text: r.text, lang: 'c', path: name, readOnly: true });
      return { lang: 'c', destroy: () => d.editor.destroy() };
    },
  });
}
