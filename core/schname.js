// A name given to an object of a schematic by Rename… (#1546): an instance's, an I/O marker's, a net name's. The
// name is written as is in the HDL generated in VHDL or in Verilog, so it must be an identifier of both (a letter,
// then letters, digits and single _, not at the end), not a reserved word of either in any letter case (#679), and
// not the name of another instance or I/O marker (in any letter case: VHDL ignores it). A net name may be a bus
// (data(7:0)); another net of the same name is not refused here: the editor asks to connect them by name (#689).
// An instance's empty name is no error: it gets a fresh automatic name, inst_n (#3300). A module's instance may be named
// with a range, reg(3:0): an arrayed instance, its copies reg_3 … reg_0 (#3755, core/sch-array.js).
//
// Isomorphic module (browser + Node).
import { parseNetName } from './schdoc.js';
import { reservedError } from './reserved.js';
import { arrayName } from './sch-array.js';

const IDENT = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Why `name` cannot be given to the object `kind` ('sym', 'port' or 'label') `id` of `doc`, or null. The name is
 * taken trimmed; its own name again is no problem.
 * @returns {string|null} the message, with its full stop
 */
export function renameError(doc, kind, id, name) {
  const v = String(name ?? '').trim();
  if (!v) return kind === 'sym' ? null : 'Type a name.';   // (an instance's: its automatic name, #3300)
  const sym0 = kind === 'sym' && (doc.symbols || []).find(s => s.id === id);
  const base = kind === 'label' ? parseNetName(v).base : sym0?.type === 'module' && arrayName(v) ? arrayName(v).base : v;
  if (!IDENT.test(base)) return `'${base}' is not a valid name: use a letter, then letters, digits and single _ (not at the end).`;
  // (an arrayed instance's base, reg of reg(3:0), is never written alone: its copies are reg_3 … reg_0)
  const r = base !== v && kind === 'sym' ? null : reservedError(base);
  if (r) return `${r}: choose another name.`;
  if (kind === 'label') return null;
  const sym = (doc.symbols || []).find(s => s.id !== id && same(s.name, v));
  if (sym) return `'${v}' is already the name of ${kind === 'sym' ? 'another instance' : 'an instance'}: choose another name.`;
  const port = (doc.ports || []).find(p => p.id !== id && same(p.name, v));
  if (port) return `'${v}' is already the name of ${kind === 'port' ? 'another I/O marker' : 'an I/O marker'}: choose another name.`;
  return null;
}

/**
 * The automatic name of an instance of `doc` (#311): inst_n, the number after the highest inst_n or XLXI_n of its
 * instances (a schematic drawn or imported before), skipping a name another instance or an I/O marker has (in any
 * letter case). `id`: the instance named, whose own name is not counted (an instance's name cleared, #3300).
 */
export function autoInstName(doc, id = null) {
  const others = (doc.symbols || []).filter(s => s.id !== id);
  const used = new Set([...others, ...(doc.ports || [])].map(o => String(o.name ?? '').toLowerCase()));
  let n = 0;
  for (const s of others) { const m = /^(?:inst|XLXI)_(\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); }
  let nm;
  do nm = `inst_${++n}`; while (used.has(nm));
  return nm;
}

/** The name typed for the instance `id` of `doc`, trimmed; an empty one is a fresh automatic name (#3300), not drawn
 *  as every automatic name. Its errors are renameError's. */
export const instName = (doc, id, name) => String(name ?? '').trim() || autoInstName(doc, id);

/** The instances of `doc` with no name (an empty one, written by the MCP's write_file) given their automatic names
 *  (#3300), in place, one after another. Returns [{ id, name }] of those named. */
export function nameUnnamed(doc) {
  const named = [];
  for (const s of doc.symbols || []) {
    if (String(s.name ?? '').trim()) continue;
    s.name = autoInstName(doc, s.id);
    named.push({ id: s.id, name: s.name });
  }
  return named;
}
