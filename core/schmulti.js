// The properties several selected objects of a schematic have in common (#1471): the schematic editor's Properties
// panel shows them for a multi-selection and sets one for all the objects at once. Isomorphic (no DOM).
//
//   import { commonProps, applyProp } from '/core/schmulti.js';
//   const fields = commonProps(doc, ['port:P1', 'port:P2']);   // [{ key: 'dir', label: 'Direction', kind: 'select', value, mixed, … }]
//   applyProp(doc, ['port:P1', 'port:P2'], 'dir', 'out');      // doc changed in place
//
// A field is common when every object selected has it, with the same kind and choices: an I/O marker's direction,
// width and HDL type, a symbol's parameters (the width of gates of any kind, the INIT of
// flip-flops...). Its value is the objects' one, or mixed (null) when they differ. What must stay unique per object
// (an instance name, a marker's name, a net name) and what changes a symbol's type (its inputs) is left out.
import { symbolParams } from './schdoc.js';
import { TEXT_SIZE, TEXT_SIZES } from './schgraphics.js';

const KEYS = { sym: 'symbols', wire: 'wires', port: 'ports', label: 'labels', graphic: 'graphics' };
const DIRS = [['in', 'Input'], ['out', 'Output'], ['inout', 'Bidirectional']];

// the editable fields of one object: [{ key, label, kind, options?, min?, max?, get(o), set(o, v) }]
function fieldsOf(kind, o) {
  if (kind === 'port') return [
    { key: 'dir', label: 'Direction', kind: 'select', options: DIRS, get: p => p.dir, set: (p, v) => { p.dir = v; } },
    { key: 'width', label: 'Width', kind: 'int', min: 1, get: p => p.width ?? 1,
      set: (p, v) => { p.width = Math.max(1, Math.round(+v || 1)); if (p.type && !/\(|\[/.test(p.type) && p.width > 1) delete p.type; } },
    { key: 'type', label: 'HDL type', kind: 'text', get: p => p.type || '', set: (p, v) => { if (String(v).trim()) p.type = String(v).trim(); else delete p.type; } },
  ];
  // (texts, #2593: their size)
  if (kind === 'graphic') return o.kind !== 'text' ? [] : [
    { key: 'size', label: 'Text size', kind: 'int', min: TEXT_SIZES[0], max: TEXT_SIZES[1], get: g => g.size ?? TEXT_SIZE,
      set: (g, v) => { g.size = Math.max(TEXT_SIZES[0], Math.min(TEXT_SIZES[1], Math.round(+v || TEXT_SIZE))); } },
  ];
  if (kind === 'wire') return [];   // (no "Draw as bus": a wire drawn by its net's width, #1705)
  // (a COMP's comparisons, kind multi: its own tick boxes only, as they re-pin it, #1555)
  if (kind === 'sym') return symbolParams(o).filter(p => p.kind !== 'multi').map(p => ({
    key: `param:${p.name}`, label: p.label, kind: p.kind, options: p.options, min: p.min, max: p.max,
    get: s => (p.kind === 'select' && s.params[p.name] != null ? String(s.params[p.name]) : s.params[p.name]),
    set: (s, v) => {
      if (p.kind === 'bool') s.params[p.name] = !!v;
      else if (p.kind === 'int') s.params[p.name] = Math.max(p.min ?? 0, Math.min(p.max ?? 1e6, Math.round(+v || p.default)));
      else s.params[p.name] = p.kind === 'select' ? v : String(v).trim();
    },
  }));
  return [];
}
// (two objects' fields are one when their kind and choices are the same)
const shape = f => JSON.stringify([f.kind, f.options ?? null, f.min ?? null, f.max ?? null]);

/** The selected objects ('kind:id' items) found in the document: [{ kind, obj }]. */
export function selectedObjects(doc, items) {
  return [...items].map(k => { const [kind, id] = k.split(/:(.*)/s); return { kind, obj: doc[KEYS[kind]]?.find(o => o.id === id) }; }).filter(x => x.obj);
}

/** The fields every selected object has: [{ key, label, kind, options?, min?, max?, value, mixed }] (value null when mixed). */
export function commonProps(doc, items) {
  const objs = selectedObjects(doc, items);
  if (!objs.length) return [];
  const all = objs.map(({ kind, obj }) => new Map(fieldsOf(kind, obj).map(f => [f.key, f])));
  const out = [];
  for (const f of all[0].values()) {
    const fs = all.map(m => m.get(f.key));
    if (fs.some(g => !g || shape(g) !== shape(f))) continue;
    const vals = objs.map(({ obj }, i) => fs[i].get(obj));
    const mixed = vals.some(v => JSON.stringify(v ?? null) !== JSON.stringify(vals[0] ?? null));
    const { get, set, ...desc } = f;
    out.push({ ...desc, value: mixed ? null : vals[0], mixed });
  }
  return out;
}

/** Sets the field `key` of every selected object to v (doc changed in place); the number of objects changed. */
export function applyProp(doc, items, key, v) {
  let n = 0;
  for (const { kind, obj } of selectedObjects(doc, items)) {
    const f = fieldsOf(kind, obj).find(g => g.key === key);
    if (f) { f.set(obj, v); n++; }
  }
  return n;
}
