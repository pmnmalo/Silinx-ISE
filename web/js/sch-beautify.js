// The schematic editor's Rearrange Wires and Rearrange Schematic (#1481's Beautify, as two commands, #1730): a clearer
// drawing, in one undo step each.
//   Rearrange Wires      the wires drawn again (core/schbeautify.js), the symbols, markers and net names where they are:
//                        the whole sheet's, or with a selection its wires and the wires of its symbols and markers
//   Rearrange Schematic  the whole sheet laid out again (#1506, core/schbeautify-sheet.js: the inputs on the left, the
//                        outputs on the right, the symbols moved by the flow of the signals, with ELK's layout when the
//                        page has it), then its wires drawn again
import { beautifyWires, selectionWires, wiresNote } from '/core/schbeautify.js';
import { beautifySheet, sheetNote } from '/core/schbeautify-sheet.js';

/** { rearrangeWires, rearrangeSheet } of mountSchEditor (doc(), modules(), sel(): its current values). */
export function mountSchBeautify(ctx) {
  const { doc, edit, fit, flash, modules, sel, snapshot } = ctx;
  let busy = false;

  // the wires the selection takes in (null: no selection, the whole sheet; core/schbeautify.js, as the MCP server's)
  function scope() {
    if (!sel().size) return null;
    const by = { wire: [], sym: [], port: [] };
    for (const k of sel()) { const [kind, id] = k.split(/:(.*)/s); by[kind]?.push(id); }
    return selectionWires(doc(), { wires: by.wire, symbols: by.sym, ports: by.port }, modules());
  }
  function rearrangeWires() {
    const only = scope();
    if (only && !only.size) { flash('Rearrange Wires: no wire in the selection', 3000); return; }
    let n = 0;
    edit(() => { n = beautifyWires(doc(), { modules: modules(), ...(only ? { only } : {}) }).changed.length; }, { keepProps: true });
    flash(wiresNote('Rearrange Wires', n), 3000);
  }
  // the whole sheet: laid out on a copy (ELK answers later), taken in one edit unless the drawing changed meanwhile
  async function rearrangeSheet() {
    if (busy) return;
    busy = true;
    try {
      const before = snapshot(), d = JSON.parse(before);
      const elk = globalThis.ELK ? new globalThis.ELK() : null;
      const r = await beautifySheet(d, { modules: modules(), layout: elk ? g => elk.layout(g) : undefined });
      if (snapshot() !== before) return;
      edit(() => { for (const k of ['symbols', 'ports', 'wires', 'labels', 'sheet']) doc()[k] = d[k]; }, { keepProps: true });
      if (!r.sheet) { flash(sheetNote(r), 4000); return; }
      if (snapshot() === before) { flash(sheetNote(r, true), 3000); return; }
      fit();
      flash(sheetNote(r, false), 3000);
    } finally { busy = false; }
  }

  return { rearrangeWires, rearrangeSheet };
}
