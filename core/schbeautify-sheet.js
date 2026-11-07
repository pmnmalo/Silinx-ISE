// Silinx - Beautify the whole sheet (#1506): a schematic laid out again, as a schematic made from HDL is (Convert to
// Schematic): the input markers on the left, the output markers on the right, the symbols by the flow of the signals
// in columns between them (ELK's layered layout, or the columns without it), the wires routed square between their
// pins and then made clearer (core/schbeautify.js). It is the same placer and router, core/schdoc-place.js, fed with
// the drawing's own nets. The new drawing is taken only when it means the same: the same nets (their names, their
// pins and markers), the same diagnostics and the same VHDL and Verilog, and no two symbols overlapping; otherwise
// only the wires are drawn again.
//
// Isomorphic ES module (browser + Node).
import { key, netlist, symbolBox, portBox } from './schdoc.js';
import { generateHdl } from './schdoc-hdl.js';
import { placeAndRoute } from './schdoc-place.js';
import { beautifyWires, wiresNote } from './schbeautify.js';
import { segPoints, wireGrid } from './schpath.js';
import { clone } from './util.js';

const epOf = e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`);

/** The meaning of a schematic: its nets (as their names, pins and markers), its diagnostics, its HDL in both languages. */
export function sheetMeaning(doc, modules = {}) {
  const nl = netlist(doc, { modules });
  let vhdl, verilog;
  try { vhdl = generateHdl(clone(doc), { lang: 'vhdl', modules }).code; } catch (e) { vhdl = `! ${e.message}`; }
  try { verilog = generateHdl({ ...clone(doc), lang: 'verilog' }, { lang: 'verilog', modules }).code; } catch (e) { verilog = `! ${e.message}`; }
  return JSON.stringify({
    nets: nl.nets.map(n => `${n.name}: ${n.endpoints.map(epOf).sort().join(' ')}`).sort(),
    diags: nl.diagnostics.map(x => `${x.severity}: ${x.message}`).sort(),
    vhdl, verilog,
  });
}

/** The pairs of symbols (and markers) whose bodies overlap: [[id, id]]. */
export function overlaps(doc, modules = {}) {
  const boxes = [...doc.symbols.map(s => [s.id, symbolBox(s, modules)]), ...doc.ports.map(p => [p.id, portBox(p)])];
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, A] = boxes[i], [b, B] = boxes[j];
    if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) out.push([a, b]);
  }
  return out;
}

// the drawing's nets as the placer takes them: { name, width, eps, drivers } (a net with no name of its own: __n…, as
// the HDL's anonymous ones, drawn without a name)
function connsOf(doc, modules) {
  const nl = netlist(doc, { modules });
  return nl.nets.filter(n => n.endpoints.length).map((n, k) => {
    const eps = n.endpoints.map(e => (e.kind === 'pin' ? { sym: e.sym, pin: e.pin } : { port: e.port }));
    const drivers = eps.filter((e, i) => { const x = n.endpoints[i]; return (x.kind === 'pin' && x.dir === 'out') || (x.kind === 'port' && x.dir === 'in'); });
    return { name: n.auto ? `__n${k + 1}` : n.name, width: n.width, eps, drivers };
  });
}

// the net names of the drawing the placer did not draw again (a name on a net that has an I/O marker, a second name)
// put back on a wire of their net: on a free point inside it (on no other wire, pin, end or name), 20 from its start
// if it can be. False when one has no net with a pin or a marker, or no free point.
function restoreLabels(d, doc, modules) {
  const nl0 = netlist(doc, { modules }), nl = netlist(d, { modules });
  const g = wireGrid(d, { modules });
  let n = d.labels.reduce((m, l) => Math.max(m, +String(l.id).replace(/\D/g, '') || 0), 0);
  for (const l of doc.labels) {
    const e = nl0.labelNet.get(l.id)?.endpoints[0];
    if (!e) return false;
    const net = e.kind === 'pin' ? nl.pinNet.get(`${e.sym}/${e.pin}`) : nl.portNet.get(e.port);
    if (!net) return false;
    if (net.labels.some(id => d.labels.find(x => x.id === id)?.net === l.net)) continue;
    let q = null;
    for (const id of net.wires) {
      const pts = d.wires.find(w => w.id === id).points;
      for (let i = 0; i + 1 < pts.length && !q; i++) {
        const P = segPoints(pts[i], pts[i + 1]);
        q = P.slice(1, -1).find(p => { const k = key(p.x, p.y); return (g.h.get(k) || 0) + (g.v.get(k) || 0) === 1 && !g.vtx.has(k) && !g.labels.has(k) && !g.fixed.has(k) && Math.abs(p.x - pts[0].x) + Math.abs(p.y - pts[0].y) >= 20; }) || null;
      }
      if (q) break;
    }
    if (!q) return false;
    d.labels.push({ ...l, id: `L${++n}`, x: q.x, y: q.y });
    g.labels.set(key(q.x, q.y), 1);
  }
  return true;
}

/**
 * Beautify the whole sheet (the document mutated): laid out again and its wires routed again, when the new drawing
 * means the same and has no overlapping symbols; otherwise its wires only drawn again (beautifyWires).
 * layout: ELK's layout (graph => Promise of the laid-out graph); without one, the placer's columns.
 * Returns { sheet: true when laid out again, changed: the wires drawn again (wires only) }.
 */
export async function beautifySheet(doc, { modules = {}, layout } = {}) {
  if (doc.symbols.length + doc.ports.length) {
    try {
      const m0 = sheetMeaning(doc, modules);
      // (the nets read before the symbols are turned: a pin's place changes with them)
      const conns = connsOf(doc, modules);
      const d = clone(doc);
      // (the symbols turned back to the way the signals flow: inputs on the left, outputs on the right)
      for (const s of d.symbols) { s.rot = 0; s.mirror = false; }
      for (const p of d.ports) delete p.side;
      const ci = d.lang === 'vhdl';
      await placeAndRoute(d, conns, { layout, modules, nk: s => (ci ? String(s).toLowerCase() : String(s)) });
      beautifyWires(d, { modules });
      if (restoreLabels(d, doc, modules) && sheetMeaning(d, modules) === m0 && !overlaps(d, modules).length) {
        for (const k of ['symbols', 'ports', 'wires', 'labels']) doc[k] = d[k];
        doc.sheet = { w: Math.max(doc.sheet?.w || 0, d.sheet.w), h: Math.max(doc.sheet?.h || 0, d.sheet.h) };
        return { sheet: true, changed: [] };
      }
    } catch { /* the wires only */ }
  }
  return { sheet: false, changed: beautifyWires(doc, { modules }).changed };
}

/** Rearrange Schematic's message (the interface's and the MCP server's): r: beautifySheet's result, same: the drawing as it was. */
export function sheetNote(r, same) {
  // (not laid out again: it would not mean the same, or its symbols would overlap; its wires drawn again only)
  if (!r.sheet) return `Rearrange Schematic: the symbols kept where they were; ${wiresNote('wires', r.changed.length).replace(/^wires: /, '')}`;
  return same ? 'Rearrange Schematic: the schematic is already laid out this way' : 'Rearrange Schematic: the schematic laid out again';
}
