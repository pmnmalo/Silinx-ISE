// A global clock's loads reached through general routing (#2224): the fit of model.clock.detour (packages/silinx-fpga/src/
// fpga/timing.js clockDetour) to ISE's delays, and routings to fit it on.
//   node research/s3e-route/clock-detour.mjs --reroute in.xdl out.xdl <count> [seed]
//     moves <count> clock pins of the design's global clock (picked at random, seed) off the global lines: each one's
//     branch of the clock net is cut back and routed again through general routing from the rest of the net (its own
//     wires, the clock tile's way out of the global lines into its output multiplexer, CLKT_TO_OMUX), on the wires no
//     other net uses, as nextpnr-spartan's router did before v0.7.1
//   node research/s3e-route/clock-detour.mjs <folder>...
//     each with silinx.xdl and silinx.dly (reportgen -delay of ISE on it, after xdl -xdl2ncd: trce's clock path of a
//     flip-flop is that delay): for each load of a global clock, ISE's delay against the model's delay of the general
//     wires from where its path leaves the global lines (clockDetour's sum); the least-squares line through the loads
//     on general routing, ISE's delay less the mean of the loads on the global lines (their skew), and its error.
// The fit of #2224: blinky and stopwatch routed by Silinx (and 3 / 12 of their pins moved by --reroute), and by
// nextpnr-spartan v0.6.0 and v0.9.1 (the flow's nextpnr engine): 129 loads off the global lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl, writeXdl } from '../../src/xdl.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { WIRE, SPEED_4, netTree, treePath, nodeClasses } from '../../src/fpga/timing.js';
import { parseDly } from './timing-fit.mjs';

const GENERAL = new Set([WIRE.OMUX, WIRE.DOUBLE, WIRE.HEX, WIRE.LONG]);
const isClockNet = (n, inst) => /^BUFG/.test(inst.get(n.outpins[0]?.inst)?.type || '');

/** The model's delay of the general wires of a clock load's path from where it leaves the global lines, or null. */
export function generalPart(path, tree, cls, model = SPEED_4) {
  const k = path.findIndex(n => GENERAL.has(cls[n]));
  if (k < 0) return null;
  let d = 0;
  for (let j = k; j < path.length; j++) d += model.wire[cls[path[j]]] + model.branch[cls[path[j]]] * Math.max(0, (tree.children.get(path[j]) || 0) - 1);
  return d;
}

/** The loads of every global clock of a routed design: [{ inst, pin, general (the model's delay, or null), ise }]. */
export function clockLoads(design, device, dly) {
  const cls = nodeClasses(device), inst = new Map(design.insts.map(i => [i.name, i]));
  const node = p => device.sitePinNode(inst.get(p.inst).site, p.pin);
  const out = [];
  for (const n of design.nets) {
    if (!isClockNet(n, inst)) continue;
    const tree = netTree(n.pips, [node(n.outpins[0])], device);
    for (const p of n.inpins) {
      if (!/CLK/.test(p.pin)) continue;
      const path = treePath(tree, node(p));
      out.push({ inst: p.inst, pin: p.pin, general: path ? generalPart(path, tree, cls) : null, ise: dly?.get(n.name)?.loads.get(`${p.inst}.${p.pin}`) });
    }
  }
  return out;
}

/** The pips of a net as device nodes: [[a, b]] (a PIP's two nodes). */
const pipNodes = (pips, device) => pips.map(p => { const k = device.tile(p.tile); return device.pipNodes(k, device.findPip(k, p.from, p.to)); });

/** --reroute: <count> clock pins of the design's global clock moved off the global lines (see above). */
export function reroute(design, device, count, seed = 1) {
  const cls = nodeClasses(device), E = device.routingEdges(), inst = new Map(design.insts.map(i => [i.name, i]));
  const net = design.nets.find(n => isClockNet(n, inst) && n.inpins.some(p => p.pin === 'CLK'));
  const node = p => device.sitePinNode(inst.get(p.inst).site, p.pin), src = node(net.outpins[0]);
  const used = new Set();
  for (const n of design.nets) if (n !== net) for (const ab of pipNodes(n.pips, device)) for (const x of ab) used.add(x);
  let r = seed;
  const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pins = net.inpins.filter(p => p.pin === 'CLK'), pick = [];
  while (pick.length < Math.min(count, pins.length)) { const p = pins[Math.floor(rnd() * pins.length)]; if (!pick.includes(p)) pick.push(p); }
  const moved = [];
  for (const p of pick) {
    const sink = node(p);
    let tree = netTree(net.pips, [src], device);
    if (!treePath(tree, sink)) continue;
    // its own branch cut back to the first node shared with another load
    const others = new Set(net.inpins.filter(q => q !== p).map(node)), cut = new Set();
    for (let m = sink; m !== src && !others.has(m);) { const up = tree.parent.get(m); cut.add(`${up}>${m}`); if ((tree.children.get(up) || 0) > 1) break; m = up; }
    const keep = pipNodes(net.pips, device).map(([a, b]) => !cut.has(`${a}>${b}`) && !cut.has(`${b}>${a}`));
    net.pips = net.pips.filter((_, i) => keep[i]);
    tree = netTree(net.pips, [src], device);
    // breadth first from the rest of the net, onto the global lines only through a clock tile's way into its OMUX
    const prev = new Map(), q = [];
    for (const n of tree.parent.keys()) if (cls[n] !== WIRE.PIN || n === src) { prev.set(n, null); q.push(n); }
    let hit = false;
    for (let h = 0; h < q.length && !hit; h++) {
      const a = q[h];
      for (let e = E.edgeStart[a]; e < E.edgeStart[a + 1]; e++) {
        const b = E.edgeTo[e];
        if (prev.has(b) || used.has(b) || (E.edgeFlags[e] & 2) || cls[b] === WIRE.OUT) continue;
        if (cls[b] === WIRE.GCLK && !/TO_OMUX/.test(device.pipWires(E.edgeTile[e], E.edgePip[e])[1])) continue;
        if (b === sink ? cls[a] === WIRE.GCLK : cls[b] === WIRE.PIN) continue;
        prev.set(b, [a, e]); q.push(b);
        if (b === sink) { hit = true; break; }
      }
    }
    if (!hit) throw new Error(`no general route to ${p.inst}.${p.pin}`);
    for (let b = sink; prev.get(b); b = prev.get(b)[0]) {
      const [, e] = prev.get(b), [from, to] = device.pipWires(E.edgeTile[e], E.edgePip[e]);
      net.pips.push({ tile: device.tileNames[E.edgeTile[e]], from, dir: '->', to });
      used.add(b);
    }
    moved.push(p.inst);
  }
  return { net: net.name, moved };
}

/** The least-squares line y = a + b x and its error (rms, max). */
export function fitLine(xy) {
  const n = xy.length, sx = xy.reduce((s, [x]) => s + x, 0), sy = xy.reduce((s, [, y]) => s + y, 0);
  const sxx = xy.reduce((s, [x]) => s + x * x, 0), sxy = xy.reduce((s, [x, y]) => s + x * y, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const err = xy.map(([x, y]) => a + b * x - y);
  return { a, b, rms: Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n), max: Math.max(...err.map(Math.abs)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args[0] === '--reroute') {
    const [, inp, out, count, seed = '1'] = args;
    const design = parseXdl(fs.readFileSync(inp, 'utf8'));
    const { net, moved } = reroute(design, loadDeviceCache(design.part), +count, +seed);
    fs.writeFileSync(out, writeXdl(design));
    console.log(`${net}: ${moved.length} clock pins moved onto general routing`);
  } else {
    const xy = [];
    for (const dir of args) {
      const design = parseXdl(fs.readFileSync(path.join(dir, 'silinx.xdl'), 'utf8'));
      const loads = clockLoads(design, loadDeviceCache(design.part), parseDly(fs.readFileSync(path.join(dir, 'silinx.dly'), 'utf8')));
      const glob = loads.filter(l => l.general === null && l.ise !== undefined), g = glob.reduce((s, l) => s + l.ise, 0) / (glob.length || 1);
      const off = loads.filter(l => l.general !== null && l.ise !== undefined);
      for (const l of off) xy.push([l.general, l.ise - g]);
      console.log(`${path.basename(dir)}: ${off.length} of ${loads.length} clock pins off the global lines; ISE's delay on them ${g.toFixed(3)} ns`);
    }
    if (xy.length > 2) {
      const f = fitLine(xy);
      console.log(`detour = ${f.a.toFixed(3)} + ${f.b.toFixed(3)} x (the model's general wires): ${xy.length} loads, rms error ${f.rms.toFixed(3)} ns, ${f.max.toFixed(3)} at most`);
    }
  }
}
