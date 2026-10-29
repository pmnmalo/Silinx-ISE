// The critical path of a routed design (Silinx's timing analysis), connection by connection (#651): its
// fanout, the distance (columns, rows of CLBs), the wires of its route and their delays, against the
// fastest route the device has from the same source pin (known PIPs) to the same pin (best), to any
// input of the same LUT (anyLUTpin: the placement's floor, no congestion) and to any of them on the wires
// no other net uses (free). The summary splits the path's routing into the placement's floor, the
// contention (free less floor) and the router's own choice (the rest: the branch loads of the net's own
// tree, a slower path where a free one was faster).
//   node research/s3e-route/crit-path.mjs <routed.xdl> <part, e.g. xc3s1200efg320-4>
import fs from 'node:fs';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { loadDb } from '../../packages/silinx-fpga/src/fpga/bitdb-node.js';
import { knownRouting } from '../../packages/silinx-fpga/src/fpga/bitgen.js';
import { analyzeTiming, nodeDelays, nodeClasses, netTree, treePath, pathDelay, SPEED_4 } from '../../packages/silinx-fpga/src/fpga/timing.js';
class Heap { constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= a[i][0]) break; [a[c], a[i]] = [a[i], a[c]]; i = c; } } return top; } }
const [file, part] = process.argv.slice(2);
const design = parseXdl(fs.readFileSync(file, 'utf8'));
const device = loadDeviceCache(part);
const known = knownRouting(loadDb(part, { graph: device }));
const E = device.routingEdges(), ndel = nodeDelays(device), cls = nodeClasses(device);
const CL = ['?', 'out', 'pin'];
const inst = new Map(design.insts.map(i => [i.name, i]));
const netOfIn = new Map(); for (const n of design.nets) for (const p of n.inpins) netOfIn.set(p.inst + '.' + p.pin, n);
const node = (i, p) => device.sitePinNode(inst.get(i).site, p);
const wname = n => { const w = device.nodeWires[device.nodeStart[n]], k = device.wireTile[w]; return device.tileNames[k] + '/' + device.names[device.templates[device.tileTemplate[k]].wires[w - device.tileWireBase[k]]]; };
const allowed = new Uint8Array(E.edgeTo.length);
const ok = e => { if (!allowed[e]) { if (E.edgeFlags[e] & 2) allowed[e] = 2; else { const [a, b] = device.pipWires(E.edgeTile[e], E.edgePip[e]); allowed[e] = known.allowPip(device.tileNames[E.edgeTile[e]], a, b) ? 1 : 2; } } return allowed[e] === 1; };
// the nodes of every net (for the routes on the nodes no other net uses)
const user = new Map();
for (const n of design.nets) { if (!n.outpins.length || !n.pips.length) continue; const s0 = node(n.outpins[0].inst, n.outpins[0].pin); const t = netTree(n.pips, [s0], device); if (t) for (const k of t.parent.keys()) user.set(k, n.name); }
let FREE = null;
function best(src, targets) {   // Dijkstra by node delay
  const g = new Map([[src, 0]]); const q = new Heap(); q.push(0, src); const T = new Set(targets);
  while (q.size) { const [d, n] = q.pop(); if (d > g.get(n)) continue; if (T.has(n)) return Math.max(0, d + SPEED_4.base); if (d > 6) return Infinity;
    for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) { const m = E.edgeTo[e], dm = d + ndel[m]; if (FREE && user.has(m) && user.get(m) !== FREE && !T.has(m)) continue; if (dm < (g.get(m) ?? Infinity) && ok(e)) { g.set(m, dm); q.push(dm, m); } } }
  return Infinity;
}
const site = i => inst.get(i).site, tileRC = i => { const k = device.tile(inst.get(i).tile); return [device.tileRow[k], device.tileCol[k]]; };
const r = analyzeTiming(design, device);
const clk = r.clocks.sort((a, b) => b.period - a.period)[0];
console.log('period', clk.period.toFixed(3));
let prev = null, sumR = 0, sumB = 0, sumL = 0, sumF = 0;
for (const s of clk.path) {
  if (s.kind === 'net' && prev) {
    const n = netOfIn.get(s.inst + '.' + s.pin);
    const src = node(n.outpins[0].inst, n.outpins[0].pin), dst = node(s.inst, s.pin);
    const tree = netTree(n.pips, [src], device), p = tree && treePath(tree, dst);
    const wires = p ? p.slice(1, -1).map(x => wname(x).split('/')[1] + ':' + ndel[x].toFixed(2) + ((tree.children.get(x) || 0) > 1 ? 'x' + tree.children.get(x) : '')).join(' ') : '(no route)';
    const lutPins = /^[FG][1-4]$/.test(s.pin) ? [1, 2, 3, 4].map(k => node(s.inst, s.pin[0] + k)) : [dst];
    const b1 = best(src, [dst]), b4 = best(src, lutPins);
    FREE = n.name; const bf = best(src, lutPins.filter(x => !user.has(x) || user.get(x) === n.name)); FREE = null;
    sumF += Math.min(bf, s.delay);
    const [r0, c0] = tileRC(n.outpins[0].inst), [r1, c1] = tileRC(s.inst);
    sumR += s.delay; sumB += b1; sumL += b4;
    console.log(`${s.delay.toFixed(3)} best ${b1.toFixed(3)} anyLUTpin ${b4.toFixed(3)} free ${bf.toFixed(3)} fo=${n.inpins.length} d=(${c1 - c0},${r1 - r0}) ${site(n.outpins[0].inst)}.${n.outpins[0].pin} -> ${site(s.inst)}.${s.pin} srcFanoutAtPin=${tree?.children.get(src)} | ${wires}`);
  } else console.log(`  ${s.kind} ${s.delay.toFixed(3)} ${s.inst}.${s.pin} @${inst.get(s.inst)?.site}`);
  prev = s;
}
console.log('route', sumR.toFixed(3), 'best (pin)', sumB.toFixed(3), 'best (any LUT pin)', sumL.toFixed(3), 'best on free nodes', sumF.toFixed(3));
console.log('SUMMARY', JSON.stringify({ period: +clk.period.toFixed(3), route: +sumR.toFixed(3), placement: +sumL.toFixed(3), contention: +(sumF - sumL).toFixed(3), router: +(sumR - sumF).toFixed(3) }));
