// Silinx - the device picker of the New Project and Design Properties dialogs (#405: out of web/js/wizards.js).
import { h } from './ui.js';

// Cascading Family -> Device -> Package -> Speed selectors over the device database.
export function devicePicker(db, device) {
  const families = (db.families || []).filter(f => (f.parts || []).length);
  const famOf = part => db.parts.find(p => p.part === part)?.family || 'spartan3e';
  const famSel = h('select'), partSel = h('select'), pkgSel = h('select'), spdSel = h('select');
  let cur = { ...device };
  const fillFam = () => {
    famSel.innerHTML = '';
    for (const f of families) famSel.append(h('option', { value: f.id, selected: f.id === famOf(cur.part) }, f.displayName || f.name));
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
    for (const sp of part.speeds) spdSel.append(h('option', { value: sp, selected: sp === cur.speed }, sp));
    spdSel.disabled = !part.speeds.length;   // (the iCE40 has no speed grades)
  };
  famSel.addEventListener('change', () => fillParts());
  partSel.addEventListener('change', () => { cur.part = partSel.value; fillPkgs(); });
  pkgSel.addEventListener('change', () => { cur.package = pkgSel.value; });
  spdSel.addEventListener('change', () => { cur.speed = spdSel.value; });
  const set = d => { cur = { ...d }; fillFam(); fillParts(); };
  set(device);
  return {
    famSel, partSel, pkgSel, spdSel, set,
    disable(on) { [famSel, partSel, pkgSel, spdSel].forEach(e => { e.disabled = on; }); },
    value: () => ({ family: famSel.value, part: partSel.value, package: pkgSel.value, speed: spdSel.value }),
    familyName: () => famSel.selectedOptions[0]?.textContent || famSel.value,
  };
}
