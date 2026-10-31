// Silinx toolchain - what Silinx gives nextpnr's Spartan-6 chip database (#2138; the generator: the fork's s6_gen.py):
// the PIPs to leave out and the delay model.
import { knownPipS6 } from './bitgen.js';
import { CLASSES6, wireClass6 } from './timing.js';
import { S6_SPEED_3 } from './timing-model.js';

/**
 * The PIPs nextpnr must not use: those whose bits the bit database does not know, as Silinx's own router is first kept
 * off them. Per tile name: the indices of its template's PIPs (the device graph's order). Returns { pips, total, unknown }.
 */
export function unknownPipsS6(device, db) {
  const allow = knownPipS6(device, db);
  const pips = {};
  let total = 0, unknown = 0;
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]], bad = [];
    for (let i = 0; i < tp.from.length; i++) {
      total++;
      if (!allow(k, i)) bad.push(i);
    }
    if (bad.length) pips[device.tileName(k)] = bad;
    unknown += bad.length;
  }
  return { pips, total, unknown };
}

/**
 * The delay model for the chip database: nextpnr counts a PIP's delay, so each PIP takes the class of the wire it drives
 * (fpga/s6/timing.js wireClass6). Returns { wire: [ps-free ns by class], pipClass: { template: [class by PIP] } }.
 */
export function timingExportS6(device, model = S6_SPEED_3) {
  const wire = CLASSES6.map(c => model.wires.classes[c] ?? 0);
  const pipClass = {};
  device.templates.forEach((tp, t) => { pipClass[t] = Array.from(tp.to, w => wireClass6(device.names[tp.wires[w]])); });
  return { wire, pipClass };
}
