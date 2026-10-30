// The schematic editor's toolbar options (#405, #1145: out of mountSchEditor in sch-editor.js), remembered: Keep
// connections, Select whole branch (#2211), Names, Hop-overs; their checkboxes and their values. mountSchOptions(ctx) is called by mountSchEditor
// where this code was.
import { h } from './dom.js';
import { prefKey } from './prefs.js';

/** { branchBox, hopsBox, keepBox, keepConn, namesBox, showHops, showNames, wholeBranch } of mountSchEditor (keepConn(), showHops(), showNames(), wholeBranch(): their current values). */
export function mountSchOptions(ctx) {
  const { render } = ctx;
  // moving components keeps their wires connected (re-routed), or detaches them
  let keepConn = true;
  try { keepConn = localStorage.getItem(prefKey('xl.sch.keepConn')) !== '0'; } catch { /* default */ }
  const keepBox = h('input', { type: 'checkbox', checked: keepConn });
  keepBox.addEventListener('change', () => { keepConn = keepBox.checked; try { localStorage.setItem(prefKey('xl.sch.keepConn'), keepConn ? '1' : '0'); } catch { /* ignore */ } });
  // Select whole branch (#2211): a click on a wire selects it from junction to junction (on by default, as it has
  // always been), or only the straight segment clicked
  let wholeBranch = true;
  try { wholeBranch = localStorage.getItem(prefKey('xl.sch.branch')) !== '0'; } catch { /* default */ }
  const branchBox = h('input', { type: 'checkbox', checked: wholeBranch });
  branchBox.addEventListener('change', () => { wholeBranch = branchBox.checked; try { localStorage.setItem(prefKey('xl.sch.branch'), wholeBranch ? '1' : '0'); } catch { /* ignore */ } });
  // Names: the name of every instance and every net drawn, the automatic ones too
  let showNames = false;
  try { showNames = localStorage.getItem(prefKey('xl.sch.names')) === '1'; } catch { /* default */ }
  const namesBox = h('input', { type: 'checkbox', checked: showNames });
  namesBox.addEventListener('change', () => { showNames = namesBox.checked; try { localStorage.setItem(prefKey('xl.sch.names'), showNames ? '1' : '0'); } catch { /* ignore */ } render(); });
  // Hop-overs (#692): a small arc where two wires cross without connecting (a view only: the nets, the HDL
  // the same)
  // hop-overs on by default (#756), off only when the user turned them off (remembered)
  let showHops = true;
  try { showHops = localStorage.getItem(prefKey('xl.sch.hops')) !== '0'; } catch { /* default */ }
  const hopsBox = h('input', { type: 'checkbox', checked: showHops });
  hopsBox.addEventListener('change', () => { showHops = hopsBox.checked; try { localStorage.setItem(prefKey('xl.sch.hops'), showHops ? '1' : '0'); } catch { /* ignore */ } render(); });

  return { branchBox, hopsBox, keepBox, keepConn: () => keepConn, namesBox, showHops: () => showHops, showNames: () => showNames, wholeBranch: () => wholeBranch };
}
