// The Silinx toolchain's SDF (the post-place & route simulation model's timing, #122) against ISE's for the same
// placed and routed design: ISE's netgen -sim on Silinx's routed.xdl (xdl -xdl2ncd), its <name>_timesim.vhd and
// .sdf. Compares
//   - the connections' delays: each site input pin's (Silinx: the static timing's, packages/silinx-fpga/src/fpga/timing.js; ISE: the
//     PORT delay netgen writes on the element that reads that pin: the LUT inputs F1-F4 / G1-G4, BX, BY, CE, SR of
//     the slices, the output pads' O1), by site (the LOC generic) and pin;
//   - the minimum period: the longest path from a clock's edge to a setup check over each SDF's elements (ISE's
//     clock network left out: Silinx's static timing has no skew), and Silinx's static timing's.
//
//   node research/s3e-route/sdf-compare.mjs <folder>    (routed.xdl, silinx_timesim.vhd / .sdf, ise_timesim.vhd / .sdf)
//
// ISE runs on the Mac mini (its Docker image): xdl -xdl2ncd routed.xdl routed.ncd; netgen -sim -ofmt vhdl -w
// routed.ncd ise_timesim.vhd. Its outputs are not committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseSdf } from '../../core/sdf.js';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { analyzeTiming } from '../../packages/silinx-fpga/src/fpga/timing.js';
import { loadDevice } from '../../packages/silinx-fpga/src/fpga/device.js';
import { shippedDevicePath } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { parseNetgenVhdl, primitiveInterface } from '../../core/netlist-hier.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: node research/s3e-route/sdf-compare.mjs <folder>'); process.exit(2); }
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const design = parseXdl(read('routed.xdl'));
const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath(design.part.toLowerCase()))).toString('utf8')));
const sta = analyzeTiming(design, device);
const site = new Map(design.insts.map(i => [i.name, i.site]));

// Silinx: every connection's delay by (site, pin)
const ours = new Map();
for (const c of sta.conns) { const [inst, pin] = [c.to.slice(0, c.to.lastIndexOf('.')), c.to.slice(c.to.lastIndexOf('.') + 1)]; ours.set(`${site.get(inst)} ${pin}`, c.delay * 1000); }

// ISE: the PORT delays of the elements that read a site pin, by the element's name and formal
const ise = parseSdf(read('ise_timesim.sdf'));
const iseNet = parseNetgenVhdl(read('ise_timesim.vhd'));
const theirs = new Map();
const PIN_OF = [[/_F_X_LUT4$/, f => `F${+f.slice(3) + 1}`], [/_G_X_LUT4$/, f => `G${+f.slice(3) + 1}`],
  [/_BXINV$/, () => 'BX'], [/_BYINV$/, () => 'BY'], [/_CEINV$/, () => 'CE'], [/_SRINV$/, () => 'SR'], [/_OUTPUT_OFF_O1INV$|_O1INV$/, () => 'O1']];
for (const it of iseNet.instances) {
  const loc = /LOC => "([^"]+)"/.exec(it.generics)?.[1];
  const cell = ise.cells.get(it.name);
  if (!loc || !cell) continue;
  const rule = PIN_OF.find(([re]) => re.test(it.name));
  if (!rule) continue;
  for (const [f, d] of cell.port) theirs.set(`${loc} ${rule[1](f)}`, d);
}
const pairs = [...theirs].filter(([k]) => ours.has(k)).map(([k, d]) => [k, ours.get(k), d]);
const diff = pairs.map(([, a, b]) => a - b);
const mean = x => x.reduce((s, v) => s + v, 0) / (x.length || 1);
const rms = Math.sqrt(mean(diff.map(v => v * v)));
const within = t => diff.filter(v => Math.abs(v) <= t).length;
console.log(`connections compared: ${pairs.length} (ISE's PORT delays on site pins: ${theirs.size}, Silinx's connections: ${ours.size})`);
console.log(`  Silinx - ISE: mean ${mean(diff).toFixed(0)} ps, rms ${rms.toFixed(0)} ps, ${(100 * within(100) / (pairs.length || 1)).toFixed(0)} % within 100 ps, ${(100 * within(200) / (pairs.length || 1)).toFixed(0)} % within 200 ps, max ${Math.max(...diff.map(Math.abs)).toFixed(0)} ps`);
console.log(`  the mean delay: Silinx ${mean(pairs.map(p => p[1])).toFixed(0)} ps, ISE ${mean(pairs.map(p => p[2])).toFixed(0)} ps`);

// the longest path from a clock's edge to a setup check over the elements of a netlist with its SDF (ps)
function sdfPeriod(vhdl, sdf) {
  const { instances } = parseNetgenVhdl(vhdl);
  const edges = new Map(), starts = [], ends = [];
  const add = (a, b, d) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push([b, d]); };
  for (const it of instances) {
    const cell = sdf.cells.get(it.name) || { port: new Map(), iopath: [], setup: [] };
    const dirs = new Map((primitiveInterface(it.type)?.ports || []).map(p => [p.name.toUpperCase(), p.dir]));
    const base = pin => pin.replace(/\(\d+\)$/, '');
    const key = pin => pin.replace(/\((\d+)\)$/, '[$1]');
    const port = pin => cell.port.get(key(pin)) ?? cell.port.get(base(pin)) ?? 0;
    const ins = it.pins.filter(p => dirs.get(base(p.pin).toUpperCase()) !== 'out' && !/^'|^"/.test(p.net));
    const outs = it.pins.filter(p => dirs.get(base(p.pin).toUpperCase()) === 'out');
    // (the clock network: not on the paths; a clocked element's clock to out starts them)
    if (/^X_(BUFGMUX|CKBUF|BUFGP)$/.test(it.type)) continue;
    for (const a of cell.iopath) {
      for (const o of outs.filter(o => base(o.pin) === a.to || key(o.pin) === a.to)) {
        if (a.edge || /^CLK/.test(a.from)) starts.push([o.net, a.ps]);
        else for (const i of ins.filter(i => base(i.pin) === a.from || key(i.pin) === a.from)) add(i.net, o.net, port(i.pin) + a.ps);
      }
    }
    for (const c of cell.setup) for (const i of ins.filter(i => base(i.pin) === c.pin || key(i.pin) === c.pin)) ends.push([i.net, port(i.pin) + c.setup]);
  }
  const arr = new Map(), order = [], seen = new Set();
  const visit = n => { if (seen.has(n)) return; seen.add(n); for (const [m] of edges.get(n) || []) visit(m); order.push(n); };
  for (const n of edges.keys()) visit(n);
  for (const [n, d] of starts) arr.set(n, Math.max(arr.get(n) ?? -Infinity, d));
  for (const n of order.reverse()) { const a = arr.get(n); if (a === undefined) continue; for (const [m, d] of edges.get(n) || []) arr.set(m, Math.max(arr.get(m) ?? -Infinity, a + d)); }
  return Math.max(0, ...ends.map(([n, su]) => (arr.has(n) ? arr.get(n) + su : 0)));
}
const twr = fs.existsSync(path.join(dir, 'routed.twr')) ? /Minimum period is\s+([\d.]+)ns/.exec(read('routed.twr'))?.[1] : null;
console.log(`minimum period: Silinx's static timing ${sta.period.toFixed(3)} ns, its SDF ${(sdfPeriod(read('silinx_timesim.vhd'), parseSdf(read('silinx_timesim.sdf'))) / 1000).toFixed(3)} ns; ` +
  `ISE's SDF ${(sdfPeriod(read('ise_timesim.vhd'), ise) / 1000).toFixed(3)} ns${twr ? `, ISE's trce ${twr} ns` : ''}`);
