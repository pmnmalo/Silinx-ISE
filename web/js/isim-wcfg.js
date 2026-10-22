// ISim's wave configuration (#1019): the wave window's rows (the signals, their order and radix, the dividers, the
// groups) and the markers, as a .wcfg file (core/wcfg.js). Save Wave Configuration hands the text to the app, which
// writes it to a file of the project; Load Wave Configuration applies a file's to the current simulation (a signal the
// design does not have is said in the console and left out). opts.wcfg: { save(text) → its name | null, load() →
// { name, text } | null }; without it the toolbar has no such buttons.
import { readWcfg, writeWcfg } from '/core/wcfg.js';
import { isScalarType, pathOf } from './isim.js';

/** { wcfgText, applyWcfg, saveWcfg, loadWcfg } of mountISim, through its API (isim-api.js). */
export function mountWcfg(ctx) {
  const { opts, st, design, newRow, rebuildFlat, invalidate, logLine } = ctx;

  /** The wave window's configuration as a .wcfg file's text. */
  function wcfgText() {
    const sig = r => ({ kind: 'sig', path: pathOf(r.sig), name: r.sig.name, radix: r.radix, expanded: !!r.expanded,
      type: isScalarType(r.sig.t) ? 'logic' : r.sig.t.kind === 'logic' ? 'array' : 'other' });
    const row = r => r.kind === 'div' ? { kind: 'div', name: r.name }
      : r.kind === 'group' ? { kind: 'group', name: r.name, expanded: r.expanded !== false, rows: st.rows.filter(m => m.group === r.id).map(row) }
        : sig(r);
    return writeWcfg({ tops: design.top ? [design.top.name] : [], rows: st.rows.filter(r => r.group == null).map(row), markers: st.markers.map(m => m.t) });
  }

  /** A .wcfg file's configuration applied to the wave window (name: the file's, for the console). */
  function applyWcfg(text, name = 'the wave configuration') {
    const cfg = readWcfg(text);
    const byPath = new Map(design.signals.map(s => [pathOf(s), s]));
    const rows = [], missing = [];
    const add = (r, group) => {
      let row = null;
      if (r.kind === 'div') row = { id: st.rowSeq++, kind: 'div', name: r.name };
      else if (r.kind === 'group') {
        // (a group in a group: its members in the outer one, the window has one level)
        if (group != null) { for (const c of r.rows) add(c, group); return; }
        row = { id: st.rowSeq++, kind: 'group', name: r.name, expanded: r.expanded !== false };
        rows.push(row);
        for (const c of r.rows) add(c, row.id);
        return;
      } else {
        const sig = byPath.get(r.path);
        if (!sig) { missing.push(r.path); return; }
        row = newRow(sig, { radix: r.radix, expanded: !!r.expanded });
      }
      if (group != null) row.group = group;
      rows.push(row);
    };
    for (const r of cfg.rows) add(r, null);
    st.rows = rows;
    st.sel.clear();
    st.markers = cfg.markers.map(t => ({ id: st.markerSeq++, t }));
    st.activeMarker = st.markers[st.markers.length - 1] || null;
    rebuildFlat(); invalidate();
    for (const p of missing) logLine(`WARNING: ${p} is not a signal of this design: not shown`, 'warning');
    const n = rows.filter(r => r.kind === 'sig').length;
    logLine(`Wave configuration ${name} loaded: ${n} signal${n === 1 ? '' : 's'}, ${st.markers.length} marker${st.markers.length === 1 ? '' : 's'}`);
    return { signals: n, missing };
  }

  async function saveWcfg() {
    try {
      const name = await opts.wcfg?.save(wcfgText());
      if (name) logLine(`Wave configuration saved to ${name}`);
    } catch (e) { logLine(`ERROR: the wave configuration was not saved: ${e.message}`, 'error'); }
  }
  async function loadWcfg() {
    try {
      const f = await opts.wcfg?.load();
      if (f) applyWcfg(f.text, f.name);
    } catch (e) { logLine(`ERROR: the wave configuration was not loaded: ${e.message}`, 'error'); }
  }

  return { wcfgText, applyWcfg, saveWcfg, loadWcfg };
}
