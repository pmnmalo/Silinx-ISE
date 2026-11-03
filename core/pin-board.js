// Silinx - I/O Pin Planning on the board (#2694): a top-level port dropped on a part of the board (an LED, a switch,
// a button, a digit of the 7-segment display, a connector's resource) and the pins it takes. A bus spreads over the
// resource's pins in order, its least significant bit on the part dropped on (moved back to fit the row); a port
// dropped again moves (its bits leave the pins they had); a pin another port used is taken from it. The resource's
// pull / drive / slew and a clock's period as Auto-assign sets them (packages/silinx-fpga/src/ucf.js boardAutoAssign).
//
// Isomorphic ES module (browser + Node), no DOM.
import { bitName, periodNs } from '../packages/silinx-fpga/src/parts.js';

/** The nets of a port ({ name, width, msb, lsb, bus }), its lowest bit first: [{ net, bit }]. */
export function portNets(port) {
  if (!port.bus) return [{ net: bitName(port.name), bit: null }];
  const lo = Math.min(port.msb, port.lsb);
  return Array.from({ length: port.width }, (_, i) => ({ net: bitName(port.name, lo + i), bit: lo + i }));
}

/** A resource's pins' names, as the table shows them: led<0>, or mclk for a resource of one pin. */
export const pinLabels = (res) => res.labels || res.pins.map((_, i) => (res.pins.length > 1 ? `${res.name}<${i}>` : res.name));

/** The board's resource of a pin and its index: { res, idx } or null. */
export function resourceOfPin(board, loc) {
  const L = String(loc || '').toUpperCase();
  for (const res of board?.resources || []) {
    const idx = res.pins.findIndex((p) => p.toUpperCase() === L);
    if (idx >= 0) return { res, idx };
  }
  return null;
}

/**
 * A port dropped on the k-th digit of the 7-segment display: { res, index } (null on a board without one). A 1-bit
 * port is the digit's anode (dp in its name: the decimal point); 7 bits the segments CA..CG, 8 bits with DP; as many
 * bits as anodes the anodes; fewer, the anodes from the digit's; more, the segments.
 */
export function digitTarget(board, port, k) {
  const of = (name) => board?.resources?.find((r) => r.name === name);
  const an = of('an'), seg = of('seg'), dp = of('dp');
  if (!an || !seg) return null;
  const w = port.width || 1;
  if (w === 1 && !port.bus) return /dp/i.test(port.name) && dp ? { res: dp, index: 0 } : { res: an, index: k };
  if (w === seg.pins.length + 1 && dp) {
    return { res: { ...seg, name: 'seg', pins: [...seg.pins, ...dp.pins], labels: [...pinLabels(seg), ...pinLabels(dp)] }, index: 0 };
  }
  if (w === seg.pins.length) return { res: seg, index: 0 };
  if (w <= an.pins.length) return { res: an, index: w === an.pins.length ? 0 : k };
  return { res: seg, index: 0 };
}

const DIR_WORD = { in: 'an input', out: 'an output', inout: 'bidirectional' };

/**
 * A port dropped on a resource's pin `index`: { changes, clocks, placed, notes, warnings }. changes: { net: attributes }
 * to merge into the assignments (the port's bits not placed and the bits taken from other ports: loc undefined);
 * clocks: the period of a port placed on a clock; placed: [[net, pin label]]; notes: the pins taken from other ports;
 * warnings: an output on an input of the board, an input on an output, the bits left unplaced.
 */
export function boardDrop({ port, res, index = 0, assignments = {} }) {
  const nets = portNets(port), labels = pinLabels(res), len = res.pins.length;
  const n = Math.min(nets.length, len), start = Math.max(0, Math.min(index, len - nets.length));
  const changes = {}, placed = [], notes = [], warnings = [], clocks = [];
  const mine = new Set(nets.map((x) => x.net));
  for (const { net } of nets) changes[net] = { loc: undefined };
  for (let i = 0; i < n; i++) {
    const pin = res.pins[start + i], net = nets[i].net, label = labels[start + i];
    for (const [other, a] of Object.entries(assignments)) {
      if (mine.has(other) || String(a?.loc || '').toUpperCase() !== pin.toUpperCase()) continue;
      changes[other] = { loc: undefined };
      notes.push(`${label} taken from ${other}`);
    }
    changes[net] = { loc: pin, pull: res.pull, drive: res.drive, slew: res.slew };
    placed.push([net, label]);
  }
  if (res.group === 'Clock' && n === 1 && !port.bus && port.dir === 'in') clocks.push({ net: nets[0].net, period: periodNs(res.extra?.period || '20 ns'), duty: 50 });
  if (port.dir !== res.dir && res.dir !== 'inout' && port.dir !== 'inout') {
    warnings.push(`${port.name} is ${DIR_WORD[port.dir]}: ${res.name} is ${DIR_WORD[res.dir]} of the board`);
  }
  if (nets.length > len) {
    warnings.push(`${port.name} has ${nets.length} bits, ${res.name} ${len}: ${nets.slice(len).map((x) => x.net).join(', ')} not placed`);
  }
  return { changes, clocks, placed, notes, warnings };
}
