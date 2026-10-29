// SSim's rows of the wave window (#405: out of mountISim): the signals, dividers and groups shown (st.rows) and the
// lines drawn from them (flat: a bus expanded into its bits, a closed group's signals hidden), a bit's wave, the value
// at a time; the rows' commands (Delete, New Group, Ungroup, the dividers, the radix) and their menu. mountRows(ctx) is
// called by mountISim where the rows model was.
import * as V from '/core/values.js';
import { isBitsType } from './isim.js';

const RADIXES = [
  ['default', 'Default'], ['bin', 'Binary'], ['hex', 'Hexadecimal'], ['oct', 'Octal'],
  ['udec', 'Decimal (Unsigned)'], ['sdec', "Decimal (Two's Complement)"], ['c1dec', "Decimal (One's Complement)"],
  ['ascii', 'ASCII'],
];
const BIT_VALS = [V.ZERO, V.ONE, V.X1, V.mk(1, 1n, 1n)];
const bitKey = (b) => Number(b.v & 1n) | (Number(b.x & 1n) << 1);

function bitIndices(t) {
  // returns [{index, pos}] in display order (left .. right)
  const out = [];
  const left = t.left ?? t.w - 1, right = t.right ?? 0;
  const desc = t.left === undefined ? true : left >= right;
  const step = desc ? -1 : 1;
  for (let i = left; desc ? i >= right : i <= right; i += step) out.push({ index: i, pos: desc ? i - right : right - i });
  return out.slice(0, t.w);
}

/** { flat, rebuildFlat, clearBits, newRow, addSignals, instSignals, waveSignals, itemWave, valueOf, itemType, itemRadix, selectedItems,
 *  removeSelectedRows, renameDivider, radixItems, waveRowMenu } of an SSim window (flat(): the lines shown). */
export function mountRows(ctx) {
  const { st, sim, onOpenSource, updateVScroll, invalidate, renderObjects, forceDialog, isForced, removeForces, openSource } = ctx;

  let flat = [];
  const bitCache = new Map();
  function newRow(sig, extra = {}) { return { id: st.rowSeq++, kind: 'sig', sig, name: sig.name, radix: 'default', expanded: false, ...extra }; }
  // groups (#341, as ISim's New Group): a row of kind 'group' (name, expanded), its members the rows after it that
  // have `group` = its id; normalizeGroups keeps them right after it, in their order
  function normalizeGroups() {
    const groups = new Map(st.rows.filter(r => r.kind === 'group').map(g => [g.id, g]));
    for (const r of st.rows) if (r.group != null && (!groups.has(r.group) || r.kind === 'group')) delete r.group;
    const out = [];
    for (const r of st.rows) {
      if (r.group != null) continue;
      out.push(r);
      if (r.kind === 'group') out.push(...st.rows.filter(m => m.group === r.id));
    }
    st.rows = out;
  }
  function rebuildFlat() {
    normalizeGroups();
    flat = [];
    const groups = new Map(st.rows.filter(r => r.kind === 'group').map(g => [g.id, g]));
    for (const r of st.rows) {
      if (r.group != null && !groups.get(r.group).expanded) continue;
      const d = r.group != null ? 1 : 0;
      flat.push({ row: r, bit: null, key: String(r.id), depth: d });
      if (r.kind === 'sig' && r.expanded && r.sig.wave && isBitsType(r.sig.t) && r.sig.t.w > 1) {
        for (const b of bitIndices(r.sig.t)) flat.push({ row: r, bit: b, key: `${r.id}:${b.index}`, depth: d + 1 });
      }
    }
    for (const k of [...st.sel]) if (!flat.some(f => f.key === k)) st.sel.delete(k);
  }
  function addSignals(sigs, at = st.rows.length) {
    const rows = [];
    for (const s of sigs) if (s) rows.push(newRow(s));
    st.rows.splice(at, 0, ...rows);
    rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
    return rows;
  }
  function instSignals(inst) {
    const seen = new Set(), out = [];
    for (const p of inst.ports || []) if (!seen.has(p.sig)) { seen.add(p.sig); out.push({ sig: p.sig, port: p }); }
    for (const s of inst.signals || []) if (!seen.has(s)) { seen.add(s); out.push({ sig: s, port: null }); }
    return out;
  }
  /** The signals in the wave window as a simulation opens: a design module's inputs and outputs, in their order (the
   *  rest added from Objects, #1519); a test bench's (no ports) top-level signals, as ISE does. */
  function waveSignals(inst) {
    const all = instSignals(inst), ports = all.filter(o => o.port);
    return (ports.length ? ports : all).map(o => o.sig);
  }
  function itemWave(it) {
    const sig = it.row.sig;
    if (!sig?.wave) return null;
    if (!it.bit) return sig.wave;
    return bitWave(sig, it.bit.pos);
  }
  function bitWave(sig, pos) {
    const w = sig.wave, key = `${sig.id}:${pos}`;
    let c = bitCache.get(key);
    if (!c || c.src !== w || c.len > w.t.length) { c = { src: w, len: 0, t: [], v: [] }; bitCache.set(key, c); }
    if (c.len === w.t.length) return c;
    let i = 0;
    if (c.len > 0) {
      i = c.len - 1;
      const lastT = w.t[i];
      while (c.t.length && c.t[c.t.length - 1] >= lastT) { c.t.pop(); c.v.pop(); }
    }
    const P = BigInt(pos);
    let last = c.t.length ? bitKey(c.v[c.t.length - 1]) : -1;
    for (; i < w.t.length; i++) {
      const v = w.v[i];
      const k = Number((v.v >> P) & 1n) | (Number((v.x >> P) & 1n) << 1);
      if (k !== last) { c.t.push(w.t[i]); c.v.push(BIT_VALS[k]); last = k; }
    }
    c.len = w.t.length;
    return c;
  }
  function valueOf(it, t) {
    const sig = it.row.sig;
    if (!sig) return null;
    const v = sim.valueAt(sig, t);
    if (!it.bit || !v || Array.isArray(v)) return v;
    return V.getBits(v, it.bit.pos, 1);
  }
  function itemType(it) { return it.bit ? { kind: 'logic', w: 1, s: false } : it.row.sig.t; }
  function itemRadix(it) { return it.bit ? 'bin' : it.row.radix; }
  function selectedItems() { return flat.filter(f => st.sel.has(f.key)); }

  function removeSelectedRows() {
    const keys = st.sel;
    if (!keys.size) return;
    // (a group deleted with its signals)
    st.rows = st.rows.filter(r => !keys.has(String(r.id)) && !(r.group != null && keys.has(String(r.group))));
    st.sel.clear(); rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
  }
  // New Group: the selected rows (not groups) in a new group, where the first of them was; Ungroup: its rows back
  function newGroup() {
    const its = selectedItems().filter(f => !f.bit && f.row.kind !== 'group');
    if (!its.length) return;
    const n = prompt('Group name:', 'New Group');
    if (n == null) return;
    const g = { id: st.rowSeq++, kind: 'group', name: n.trim() || 'New Group', expanded: true };
    // (where the first of them is, or its group; normalizeGroups puts the members after it, in the window's order)
    const first = its[0].row;
    st.rows.splice(st.rows.indexOf(first.group != null ? st.rows.find(r => r.id === first.group) : first), 0, g);
    for (const f of its) f.row.group = g.id;
    st.sel.clear(); st.sel.add(String(g.id));
    rebuildFlat(); updateVScroll(); invalidate();
  }
  function renameGroup(g) {
    const n = prompt('Group name:', g.name);
    if (n != null && n.trim()) { g.name = n.trim(); invalidate(false); }
  }
  function ungroup(gs) {
    for (const g of gs) {
      const at = st.rows.indexOf(g);
      for (const r of st.rows) if (r.group === g.id) delete r.group;
      st.rows.splice(at, 1);
    }
    st.sel.clear(); rebuildFlat(); updateVScroll(); invalidate();
  }
  function renameDivider(row) {
    const n = prompt('Divider name:', row.name);
    if (n != null) { row.name = n; invalidate(false); }
  }
  function addDivider() {
    const sel = flat.findIndex(f => st.sel.has(f.key));
    const at = sel >= 0 ? st.rows.indexOf(flat[sel].row) : st.rows.length;
    const row = { id: st.rowSeq++, kind: 'div', name: 'New Divider' };
    st.rows.splice(at, 0, row); rebuildFlat(); invalidate();
    renameDivider(row);
  }
  function radixItems() {
    const its = selectedItems().filter(f => f.row.kind === 'sig' && !f.bit);
    const cur = its.length ? its[0].row.radix : null;
    return RADIXES.map(([k, label]) => ({
      label, checked: cur === k, disabled: !its.length,
      action: () => { for (const f of its) f.row.radix = k; invalidate(false); },
    }));
  }
  function waveRowMenu() {
    const its = selectedItems();
    const sigs = its.filter(f => f.row.kind === 'sig' && !f.bit);
    const one = sigs.length === 1 ? sigs[0].row.sig : null;
    const expandable = sigs.filter(f => f.row.sig.wave && isBitsType(f.row.sig.t) && f.row.sig.t.w > 1);
    return [
      { label: 'Radix', sub: radixItems(), disabled: !sigs.length },
      { label: expandable.some(f => f.row.expanded) ? 'Collapse Bus' : 'Expand Bus', disabled: !expandable.length, action: () => { const v = !expandable.some(f => f.row.expanded); for (const f of expandable) f.row.expanded = v; rebuildFlat(); invalidate(); } },
      { sep: true },
      { label: 'Force Constant...', disabled: !one || !one.wave, action: () => forceDialog(one, 'const') },
      { label: 'Force Clock...', disabled: !one || !one.wave, action: () => forceDialog(one, 'clock') },
      { label: 'Remove Force', disabled: !sigs.some(f => isForced(f.row.sig)), action: () => { for (const f of sigs) removeForces(f.row.sig); } },
      { sep: true },
      { label: 'New Divider', action: addDivider },
      { label: 'Rename Divider...', disabled: !(its.length === 1 && its[0].row.kind === 'div'), action: () => renameDivider(its[0].row) },
      { label: 'New Group', disabled: !its.some(f => !f.bit && f.row.kind !== 'group'), action: newGroup },
      { label: 'Rename Group...', disabled: !(its.length === 1 && its[0].row.kind === 'group'), action: () => renameGroup(its[0].row) },
      { label: 'Ungroup', disabled: !its.some(f => f.row.kind === 'group'), action: () => ungroup(its.filter(f => f.row.kind === 'group').map(f => f.row)) },
      { label: 'Go To Source Code', disabled: !one || !onOpenSource, action: () => openSource(one) },
      { sep: true },
      { label: 'Delete', disabled: !its.some(f => !f.bit), action: removeSelectedRows },
    ];
  }

  return { flat: () => flat, rebuildFlat, clearBits: () => bitCache.clear(), newRow, addSignals, instSignals, waveSignals, itemWave, valueOf, itemType,
    itemRadix, selectedItems, removeSelectedRows, renameDivider, radixItems, waveRowMenu };
}
