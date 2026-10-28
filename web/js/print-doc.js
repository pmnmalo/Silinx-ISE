// Silinx - what Print prints (File ▸ Print…, Ctrl+P, the toolbar's Print): the document in front, whichever it is
// (#1509). A drawing (ASM chart, state diagram, schematic, Petri net, a read-only schematic: View RTL / Technology
// Schematic, a truth table's) opens the print dialog of diagrams (paper, tiles, SVG / PNG); a source its text; a
// document that gives a print view of its own (doc.printView()) that one; any other one a copy of what it shows; on the
// paper and in the orientation chosen in its print dialog (#1923).
import { S } from './app.js';
import { t } from './i18n.js';
import { setPrintMeta } from './print.js';
import { TEXT_CSS, domSnapshot, metaLine, openPrintView, printOptions, printPageHtml, textBody } from './print-view.js';

// what a copy of a document leaves out: its toolbars, buttons and fields of commands, tips and menus
const CHROME = ['.doc-toolbar', '.editor-bar', '.tb-btn', 'button', '.fv-tip', '.fv-search', '.ctx-menu', '.print-frame'];

/** The project and file of document `d` (its header's line). */
export const docMeta = (d) => metaLine({ project: d.project || S.project?.name || '', file: d.path || '' });

const langOf = (p) => (/\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.(v|vh|sv)$/i.test(p) ? 'verilog' : null);

// The print view of a document that is not a diagram: `{ title, meta, html, fit }`, the page printed; null for a
// diagram (it prints from its own window). d.printView() (or its view's, its editor's), when it has one, gives `{ title, body, css, app, fit }`
// (app: the copy of its elements needs the application's style sheets).
export function printView(d) {
  if (!d || diagramPrint(d)) return null;
  const meta = docMeta(d);
  // (its own: the document's, or its component's: SSim's and the Board Emulator's view, the truth table's editor)
  const own = [d, d.view, d.ttEditor].find((o) => typeof o?.printView === 'function');
  if (own) {
    const v = own.printView();
    if (v) return { title: v.title || d.title, meta, fit: v.fit, html: printPageHtml({ title: v.title || d.title, meta, body: v.body, css: v.css, app: v.app }) };
  }
  if (d.editor?.getValue) {
    const title = d.path ? `${t(d.editor.readOnly?.() ? 'Source (read-only)' : 'Source')} ${d.path.split('/').pop()}` : d.title;
    return { title, meta, fit: false, html: printPageHtml({ title, meta, body: textBody(d.editor.getValue(), langOf(d.path || '')), css: TEXT_CSS }) };
  }
  return { title: d.title, meta, fit: { page: d.printFit === 'page' }, html: printPageHtml({ title: d.title, meta, body: domSnapshot(d.el, { drop: CHROME }), app: true }) };
}

// a drawing's print (the dialog of diagrams), or null
function diagramPrint(d) {
  if (d.asmEditor) return () => d.asmEditor.print();
  if (d.fsmEditor) return () => d.fsmEditor.print();
  if (d.schEditor) return () => d.schEditor.print(`Schematic ${d.path || ''}`.trim());
  if (d.petriEditor?.print) return () => d.petriEditor.print();
  if (d.viewer?.print) return () => d.viewer.print(d.title);
  return null;
}

/** Something to print: a document in front. */
export const printable = () => !!S.active;

/** Print the document in front. */
export async function printActive() {
  const d = S.active;
  if (!d) return;
  setPrintMeta(docMeta(d));
  const draw = diagramPrint(d);
  if (draw) { draw(); return; }
  const v = printView(d);
  if (!v) return;
  const o = await printOptions(v.title);
  if (o) openPrintView(v, o);
}
