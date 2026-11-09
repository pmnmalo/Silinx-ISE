// Silinx - the device picker of the New Project and Design Properties dialogs (#405: out of web/js/wizards.js).
import { experimentalDevice, noFlowMessage, openOnlyDevice } from '/packages/silinx-fpga/src/parts.js';
import { h } from './ui.js';

// an experimental family's (#3142: the 7-series, no flow runs it yet) family and boards, so marked in the lists
const FAMILY_MARK = ' (experimental)';
/** The Evaluation Development Board list's options: none, then the boards, an experimental family's marked. */
export const boardOptions = db => [['', 'None Specified'], ...db.boards.map(b => [b.id, `${b.name}${experimentalDevice(b.device) ? FAMILY_MARK : ''}`])];

/** The console's warning for a device of an experimental family (set_design_properties says the same), else null. */
export const noFlowWarning = device => (experimentalDevice(device) ? `WARNING: ${noFlowMessage(device)}.` : null);

// Cascading Family -> Device -> Package -> Speed selectors over the device database.
export function devicePicker(db, device) {
  const families = (db.families || []).filter(f => (f.parts || []).length);
  const famOf = part => db.parts.find(p => p.part === part)?.family || 'spartan3e';
  const famSel = h('select'), partSel = h('select'), pkgSel = h('select'), spdSel = h('select');
  let cur = { ...device }, fitSynth = null;
  const fillFam = () => {
    famSel.innerHTML = '';
    for (const f of families) famSel.append(h('option', { value: f.id, selected: f.id === famOf(cur.part) }, `${f.displayName || f.name}${f.experimental ? FAMILY_MARK : ''}`));
  };
  const fillParts = () => {
    partSel.innerHTML = '';
    const parts = db.parts.filter(p => p.family === famSel.value);
    if (!parts.some(p => p.part === cur.part)) cur.part = parts[0]?.part;
    for (const p of parts) partSel.append(h('option', { value: p.part, selected: p.part === cur.part }, p.part.toUpperCase()));
    fillPkgs();
  };
  const fillPkgs = () => {
    const part = db.parts.find(p => p.part === partSel.value);
    pkgSel.innerHTML = ''; spdSel.innerHTML = '';
    if (!part) return;
    const pkgs = Object.keys(part.packages);
    if (!pkgs.includes(cur.package)) cur.package = pkgs[0];
    for (const k of pkgs) pkgSel.append(h('option', { value: k, selected: k === cur.package }, `${k.toUpperCase()}  (${part.packages[k].userIo ?? '?'} I/O)`));
    if (!part.speeds.includes(cur.speed)) cur.speed = part.speeds.find(x => !/L|N$/i.test(x)) || part.speeds[0]; // a standard grade, not low-power
    if (!part.speeds.length) cur.speed = '';   // (a family with no speed grades: the iCE40's)
    for (const sp of part.speeds) spdSel.append(h('option', { value: sp, selected: sp === cur.speed }, sp));
    spdSel.disabled = !part.speeds.length;
    fitSynth?.();
  };
  famSel.addEventListener('change', () => fillParts());
  partSel.addEventListener('change', () => { cur.part = partSel.value; fillPkgs(); });
  pkgSel.addEventListener('change', () => { cur.package = pkgSel.value; });
  spdSel.addEventListener('change', () => { cur.speed = spdSel.value; });
  const set = d => { cur = { ...d }; fillFam(); fillParts(); };
  set(device);
  return {
    famSel, partSel, pkgSel, spdSel, set,
    // (no ISE for the family; an experimental one: no tool runs it yet, the choice kept 'silinx' and locked, #3142)
    lockSynth(sel) { (fitSynth = () => { const d = { part: partSel.value }, o = openOnlyDevice(d) || experimentalDevice(d); if (o) sel.value = 'silinx'; sel.disabled = o; })(); },
    disable(on) { [famSel, partSel, pkgSel].forEach(e => { e.disabled = on; }); spdSel.disabled = on || !spdSel.options.length; },
    value: () => ({ family: famSel.value, part: partSel.value, package: pkgSel.value, speed: spdSel.value }),
    familyName: () => famSel.selectedOptions[0]?.textContent || famSel.value,   // (with its experimental mark)
  };
}
