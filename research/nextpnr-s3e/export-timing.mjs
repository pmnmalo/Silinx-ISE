// Silinx's delay model (fpga/timing.js SPEED_4, fitted to ISE's trce) for nextpnr's chip database (#1954): the
// class of the node each PIP drives (its delay in the model, the LUT input it reaches), per template of the
// device graph, and the model's delays. nextpnr counts a PIP's delay, not a wire's: each PIP gets the delay of the
// node it drives, which is how Silinx sums a connection's nodes after its source.
//   node research/nextpnr-s3e/export-timing.mjs <part> out.json
// out.json: { wireNames, wire, branch, source, lutPin, base, dist, slice (SLICEL's), clock,
//   pipClass: { template: [c * 5 + lut pin] }, wireClass: { template: [c] } }
// (a template's PIPs and wires in the device graph's order; where the tiles of a template disagree, the most frequent
// class). wireClass: the class of the node each tile wire is in, for the loads (SPEED_4.branch: per extra branch).
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { SPEED_4, WIRE_NAMES, nodeClasses, lutPinIndex } from '../../packages/silinx-fpga/src/fpga/timing.js';

const [part, outFile] = process.argv.slice(2);
const device = loadDeviceCache(part);
const cls = nodeClasses(device), lut = lutPinIndex(device);
const votes = new Map();   // template -> Array of Map(class -> count)
const wvotes = new Map();  // the same for the template's wires
let disagree = 0;
for (let k = 0; k < device.tileCount; k++) {
  const t = device.tileTemplate[k], tp = device.templates[t];
  if (!votes.has(t)) votes.set(t, Array.from({ length: tp.from.length }, () => new Map()));
  if (!wvotes.has(t)) wvotes.set(t, Array.from({ length: tp.wires.length }, () => new Map()));
  const v = votes.get(t), wv = wvotes.get(t);
  for (let w = 0; w < tp.wires.length; w++) {
    const c = cls[device.nodeOf[device.tileWireBase[k] + w]];
    wv[w].set(c, (wv[w].get(c) || 0) + 1);
  }
  for (let i = 0; i < tp.from.length; i++) {
    const n = device.pipNodes(k, i)[1], c = cls[n] * 5 + lut[n];
    v[i].set(c, (v[i].get(c) || 0) + 1);
  }
}
const pipClass = {};
for (const [t, v] of votes) {
  pipClass[t] = v.map(m => {
    if (m.size > 1) disagree++;
    return [...m].sort((a, b) => b[1] - a[1])[0][0];
  });
}
const wireClass = {};
for (const [t, v] of wvotes) wireClass[t] = v.map(m => [...m].sort((a, b) => b[1] - a[1])[0][0]);
const slice = Object.fromEntries(Object.entries(SPEED_4.slice).map(([k, [l]]) => [k, l]));
fs.writeFileSync(outFile, JSON.stringify({
  wireNames: WIRE_NAMES, wire: SPEED_4.wire, branch: SPEED_4.branch, source: SPEED_4.source, lutPin: SPEED_4.lutPin, base: SPEED_4.base, dist: SPEED_4.dist,
  slice, clock: SPEED_4.clock, pipClass, wireClass,
}));
console.log(`${outFile}: ${Object.keys(pipClass).length} templates, ${disagree} template PIPs whose tiles disagree on the class`);
