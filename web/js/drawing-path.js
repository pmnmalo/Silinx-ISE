// Show Path in the drawings (#3178): a timing path that goes through a module generated from a drawing (a state
// diagram, an ASM chart, a schematic) marks the drawing's elements on it (core/path-drawing.js), in its editor, again
// after each redraw, until the next Show Path. The MCP's timing_paths gives the same elements (server/mcp-timing.js).
//
//   drawingOf(file)                 // the drawing that generates an HDL file of the project, or null
//   await showInDrawings(path, files)   // the drawings of those generated files opened, their elements marked
import { S, findDoc, openFile } from './app.js';
import { drawingPath, pathNames } from '/core/path-drawing.js';
import { drawingKind } from './related-views.js';

// an element of each type in the editors' drawings
const SELECTOR = { state: id => `[data-state="${CSS.escape(id)}"]`, trans: id => `[data-trans="${CSS.escape(id)}"]`,
  node: id => `[data-node="${CSS.escape(id)}"]`, edge: id => `[data-edge="${CSS.escape(id)}"]`,
  sym: id => `[data-kind="sym"][data-id="${CSS.escape(id)}"]`, wire: id => `[data-kind="wire"][data-id="${CSS.escape(id)}"]` };
const KINDS = new Set(['fsm', 'asm', 'sch']);

/** The drawing (a project's state diagram, ASM chart or schematic) whose HDL file is `file`, or null. */
export function drawingOf(file) {
  const p = S.hdlToSch?.[file];
  return p && KINDS.has(drawingKind(p)) ? p : null;
}

// the drawings' editors marked, and what keeps their marks after a redraw
let marked = [];
function mark(el, items) {
  const apply = () => {
    for (const x of el.querySelectorAll('.on-path')) x.classList.remove('on-path');
    for (const it of items) for (const x of el.querySelectorAll(SELECTOR[it.type](it.id))) x.classList.add('on-path');
  };
  apply();
  // (the editors draw again on every change: the marks put back)
  const obs = new MutationObserver(() => { obs.disconnect(); apply(); obs.observe(el, { childList: true, subtree: true }); });
  obs.observe(el, { childList: true, subtree: true });
  marked.push({ el, obs });
}
/** The marks of the last Show Path taken off. */
export function clearDrawings() {
  for (const m of marked) { m.obs.disconnect(); for (const x of m.el.querySelectorAll('.on-path')) x.classList.remove('on-path'); }
  marked = [];
}

/** The drawings of a path's generated files opened (the last one in front), their elements on the path marked; the
 *  elements marked, by drawing ({ drawing: [{ type, id }] }). */
export async function showInDrawings(p, files) {
  clearDrawings();
  const out = {};
  for (const f of files) {
    const dr = drawingOf(f);
    if (!dr) continue;
    let model;
    try { model = JSON.parse(S.viewTexts[dr]); } catch { continue; }
    const items = drawingPath(drawingKind(dr), model, pathNames(p, f));
    out[dr] = items;
    await openFile(dr);
    const d = findDoc(`${drawingKind(dr)}:${dr}`) || S.docs?.find(x => x.path === dr);
    if (d?.el) mark(d.el, items);
  }
  return out;
}
