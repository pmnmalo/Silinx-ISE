// Silinx toolchain - the Spartan-3E's clock network as its device graph has it: the sites a global buffer's lines reach
// (clockReach), the buffers a site's output reaches on the dedicated paths (bufgReach), and the clock pad ISE gives each
// DCM (DCM_PAD). Moved as they were from fpga/route.js and fpga/place.js, Silinx's router and placer, removed (#2137): the
// device descriptions' tests and the research's generators of ISE designs read the clock network with them.
import { PIP_ROUTETHRU } from './device.js';

// The clock pad ISE's placer gives a DCM's CLKIN when the pad has no LOC (#92: a design of one DCM on
// each site, implemented by ISE): one of the pads whose dedicated path reaches that DCM
export const DCM_PAD = {
  xc3s100e: { DCM_X0Y1: 'A9', DCM_X0Y0: 'M6' },
  xc3s250e: { DCM_X0Y1: 'C8', DCM_X1Y1: 'A9', DCM_X0Y0: 'N5', DCM_X1Y0: 'M6' },
  xc3s500e: { DCM_X0Y1: 'B9', DCM_X1Y1: 'A10', DCM_X0Y0: 'V9', DCM_X1Y0: 'U10' },
  xc3s1200e: { DCM_X1Y3: 'B9', DCM_X2Y3: 'A10', DCM_X1Y0: 'V9', DCM_X2Y0: 'U10', DCM_X0Y1: 'K3', DCM_X0Y2: 'J4', DCM_X3Y1: 'K13', DCM_X3Y2: 'J15' },
};

function globalClockMask(device) {
  if (device._gclkMask) return device._gclkMask;
  const mask = new Uint8Array(device.nodeCount);
  const gclkName = device.names.map(n => /GCLK/.test(n));
  for (let w = 0; w < device.wireCount; w++) {
    const k = device.wireTile[w], tp = device.templates[device.tileTemplate[k]];
    if (gclkName[tp.wires[w - device.tileWireBase[k]]]) mask[device.nodeOf[w]] = 1;
  }
  return (device._gclkMask = mask);
}

// the wires of general routing (doubles, hexes, long lines): the dedicated clock paths do not enter them
const GENERAL_TO = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d)/;

/**
 * The slices whose clock pin a global clock buffer reaches through the dedicated clock network
 * (GCLK nodes) and, with allowPip(tileName, from, to), only through allowed PIPs: a Set of slice site
 * names, and the clock pins of the block RAMs, multipliers and DCMs it reaches as `site.pin` (RAMB16_X0Y1.CLKA,
 * RAMB16_X0Y1.CLKB, MULT18X18_X0Y1.CLK, DCM_X0Y0.CLKIN, DCM_X0Y0.CLKFB). For the placer (place()'s clockSites option): with the
 * switches of known bits, a clock line reaches the CLK pins of only some slices of a CLB
 * (research/s3e-route/README.md), and a bottom buffer's lines not every block RAM's (#56).
 */
export function clockReach(device, bufgSite, allowPip = null) {
  const E = device.routingEdges();
  const gclk = globalClockMask(device);
  const start = device.sitePinNode(bufgSite, 'O');
  const seen = new Uint8Array(device.nodeCount), reached = new Set();
  if (start < 0) return new Set();
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const n = q.pop();
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      if (seen[m] || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      const [from, to] = device.pipWires(E.edgeTile[e], E.edgePip[e]);
      // (not into general routing: a node of the clock network may hold a general wire's switch, as
      // the side clock tiles' CLKL_GCLKH_MAINk -> IOIS_Xk -> N6BEG0 does, #95)
      if (GENERAL_TO.test(to)) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], from, to)) continue;
      seen[m] = 1;
      if (gclk[m]) q.push(m); else reached.add(m);   // off the clock network: an end (a site pin)
    }
  }
  const out = new Set();
  for (const s of [...device.sites('SLICEL'), ...device.sites('SLICEM')]) if (reached.has(device.sitePinNode(s.name, 'CLK'))) out.add(s.name);
  // a block RAM's / multiplier's clock pin: one switch further, in its site tile (BRAM_CLK2_INT1 -> RAMB16_CLKA)
  const beyond = new Set();
  for (const n of reached) {
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      if (E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], ...device.pipWires(E.edgeTile[e], E.edgePip[e]))) continue;
      beyond.add(E.edgeTo[e]);
    }
  }
  // (and a DCM's clock inputs, CLKIN / CLKFB: a cascade, the feedback, #47)
  for (const [type, pins] of [['RAMB16', ['CLKA', 'CLKB']], ['MULT18X18SIO', ['CLK']], ['DCM', ['CLKIN', 'CLKFB']]]) {
    for (const s of device.sites(type)) for (const p of pins) {
      const n = device.sitePinNode(s.name, p);
      if (reached.has(n) || beyond.has(n)) out.add(`${s.name}.${p}`);
    }
  }
  return out;
}

/**
 * The global clock buffers (BUFGMUX site names) whose I0 an output pin of a site (a DCM's CLK0,
 * CLKFX…) reaches through the device's dedicated paths: PIPs (with allowPip: allowed ones only, no
 * route-throughs) not entering general routing, for the placer (place()'s bufgSites option).
 */
export function bufgReach(device, siteName, pin, allowPip = null, [toType, toPin] = ['BUFGMUX', 'I0']) {
  const E = device.routingEdges();
  const start = device.sitePinNode(siteName, pin);
  if (start < 0) return [];
  const targets = new Map(device.sites(toType).map(s => [device.sitePinNode(s.name, toPin), s.name]));
  const seen = new Uint8Array(device.nodeCount), out = [];
  const q = [start];
  seen[start] = 1;
  for (let steps = 0; q.length && steps < 20000; steps++) {
    const n = q.shift();
    if (targets.has(n)) { out.push(targets.get(n)); continue; }
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
      const m = E.edgeTo[e];
      if (seen[m] || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
      const [from, to] = device.pipWires(E.edgeTile[e], E.edgePip[e]);
      // the dedicated clock paths only (DCM outputs, the clock tiles' wires): not into general routing
      if (GENERAL_TO.test(to)) continue;
      if (allowPip && !allowPip(device.tileNames[E.edgeTile[e]], from, to)) continue;
      seen[m] = 1;
      q.push(m);
    }
  }
  return out;
}
