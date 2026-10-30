// research/s6: the scripts of the Spartan-6 measurements' night 1 (#733), checked without ISE: the
// Spartan-6 .bit reader on bitstreams built here word by word (UG380's packets), the work folder of
// night1.mjs, the parsers of summarize-night1.mjs on reports of ISE's format, the shell scripts' syntax.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readBit6, readHeader, packetLine, REG6 } from '../research/s6/bits6.mjs';
import { writeNight1, emptyXdl, xdlPart, BOARDS } from '../research/s6/night1.mjs';
import { mapCounts, xdlSiteTypes, minPeriod, routed, times, reportSummary, summarize } from '../research/s6/summarize-night1.mjs';

const S6 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../research/s6');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-'));

// a .bit: the header fields (a, b, c, d; e the length), then the 16-bit words of the configuration data
function bitFile(words, { a = 'empty.ncd;UserID=0xFFFFFFFF', b = '6slx16csg324', c = '2026/10/21', d = '01:02:03' } = {}) {
  const field = (k, s) => [k.charCodeAt(0), 0, s.length + 1, ...[...s].map(ch => ch.charCodeAt(0)), 0];
  const data = words.flatMap(w => [w >>> 8, w & 0xff]);
  const n = data.length;
  return Uint8Array.from([0x00, 0x09, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x00, 0x00, 0x01,
    ...field('a', a), ...field('b', b), ...field('c', c), ...field('d', d), 0x65, n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...data]);
}
const T1W = (reg, n) => 0x3000 | (reg << 5) | n;     // Type 1 write of n words
const T2W = reg => 0x5000 | (reg << 5);              // Type 2 write (the count follows, 32 bits)
const reg = name => REG6.indexOf(name);

test('readBit6: the header and the UG380 packets of 16-bit words: Type 1 writes, NOOP runs, a Type 2 FDRI with its 32-bit count', () => {
  const frame = Array.from({ length: 70000 }, (_, i) => (i * 7) & 0xffff);   // more than 16 bits of count
  const words = [0xffff, 0xffff, 0xaa99, 0x5566, T1W(reg('CMD'), 1), 0x0007, 0x2000, 0x2000, T1W(reg('IDCODE'), 2), 0x0400, 0x2093,
    T1W(reg('COR1'), 1), 0x3d00, T1W(reg('FAR_MAJ'), 2), 0x0000, 0x0000, T1W(reg('CMD'), 1), 0x0001,
    T2W(reg('FDRI')), frame.length >>> 16, frame.length & 0xffff, ...frame, T1W(reg('CMD'), 1), 0x000d, 0x2000];
  const r = readBit6(bitFile(words));
  assert.deepEqual(r.header, { a: 'empty.ncd;UserID=0xFFFFFFFF', b: '6slx16csg324', c: '2026/10/21', d: '01:02:03' });
  assert.deepEqual(r.packets.map(packetLine), ['W CMD 1: 0007', 'NOOP x2', 'W IDCODE 2: 0400 2093', 'W COR1 1: 3d00', 'W FAR_MAJ 2: 0000 0000',
    'W CMD 1: 0001', 'W FDRI 70000 words', 'W CMD 1: 000d', 'NOOP x1']);
  assert.equal(r.fdri.length, 70000);
  assert.equal(r.fdri[69999], (69999 * 7) & 0xffff);
  assert.deepEqual(r.registers.IDCODE, [0x0400, 0x2093]);
  assert.deepEqual(r.registers.CMD, [0x000d], 'the last write of a register');
  // the configuration data alone (no header) reads the same
  assert.equal(readBit6(Uint8Array.from(words.flatMap(w => [w >>> 8, w & 0xff]))).header, null);
  // the register names of UG380 by address
  assert.deepEqual([reg('CRC'), reg('FDRI'), reg('FLR'), reg('IDCODE'), reg('MODE_REG'), reg('CBC_REG')], [0, 3, 13, 14, 24, 34]);
});

test('readBit6: errors: no sync word, a header that is not a .bit\'s; an unknown header word is kept', () => {
  assert.throws(() => readBit6(bitFile([0xffff, 0x1234])), /no sync word AA995566/);
  assert.throws(() => readHeader(Uint8Array.from([0, 9, ...new Array(11).fill(0), 0x7a, 0, 1, 0])), /not a \.bit header \(field 'z' at byte 13\)/);
  assert.throws(() => readHeader(Uint8Array.from([0, 9, ...new Array(11).fill(0)])), /no field e/);
  assert.deepEqual(readBit6(bitFile([0xaa99, 0x5566, 0x8001])).packets, [{ unknown: 0x8001, at: 0 }]);
});

test('night1: the parts of the boards, the empty designs in XDL', () => {
  assert.deepEqual(BOARDS, { nexys3: 'xc6slx16-csg324-3', atlys: 'xc6slx45-csg324-3' });
  assert.equal(xdlPart('xc6slx45-csg324-3'), 'xc6slx45csg324-3');
  assert.equal(emptyXdl('xc6slx16-csg324-3'), 'design "empty" xc6slx16csg324-3 v3.2 ,\n  cfg "";\n');
});

test('night1: the work folder: each example\'s HDL, UCF and top on both boards, the open synthesis\'s EDIF, the manifest', { timeout: 300000 }, async () => {
  const w = tmp();
  const m = await writeNight1(w, { only: ['gates', 'traffic'] });
  assert.deepEqual(Object.keys(m.boards), ['nexys3', 'atlys']);
  assert.deepEqual(m.empty, ['xc6slx16-csg324-3', 'xc6slx45-csg324-3']);
  assert.deepEqual(fs.readdirSync(path.join(w, 'empty')).sort(), ['xc6slx16-csg324-3.xdl', 'xc6slx45-csg324-3.xdl']);
  // the HDL as in examples/, the top named
  const gates = path.join(w, 'impl-nexys3', 'gates');
  assert.equal(fs.readFileSync(path.join(gates, 'top.txt'), 'utf8'), `${m.boards.nexys3.examples.gates.top}\n`);
  assert.ok(fs.readdirSync(gates).some(f => /\.(vhd|v)$/.test(f)));
  // the UCF: the board's pins (Nexys3: sw0 on T10), every port matched on both boards (the Atlys's 7-segment display on its VHDCI connector, #732)
  const ucf = fs.readFileSync(path.join(w, 'impl-nexys3', 'traffic', 'top.ucf'), 'utf8');
  assert.match(ucf, /^# UCF for top '\w+' on Digilent Nexys3 \(xc6slx16-3-csg324\), generated by Silinx$/m);
  assert.deepEqual(m.boards.nexys3.examples.traffic.unmatched, []);
  assert.deepEqual(m.boards.atlys.examples.traffic.unmatched, []);
  assert.deepEqual(m.boards.atlys.examples.gates.unmatched, []);
  // the open synthesis's netlist for the Spartan-6 (Yosys xc6s: LUT6, CARRY4), the same UCF
  const edf = fs.readFileSync(path.join(w, 'edif-nexys3', 'traffic', 'top.edf'), 'utf8');
  assert.match(edf, /^\(edif \w+/);
  assert.match(edf, /\(cell CARRY4\b/);
  assert.equal(fs.readFileSync(path.join(w, 'edif-nexys3', 'traffic', 'top.ucf'), 'utf8'), ucf);
  assert.ok(m.boards.nexys3.examples.traffic.openCells.CARRY4 > 0, JSON.stringify(m.boards.nexys3.examples.traffic.openCells));
  assert.equal(fs.readFileSync(path.join(w, 'manifest.json'), 'utf8'), `${JSON.stringify(m, null, 2)}\n`);
  fs.rmSync(w, { recursive: true, force: true });
});

// the reports' lines in ISE's format
const MRP = `Slice Logic Utilization:
  Number of Slice Registers:                    35 out of  18,224    1%
    Number used as Flip Flops:                  35
  Number of Slice LUTs:                         57 out of   9,112    1%
  Number of occupied Slices:                    20 out of   2,278    1%
  Number of LUT Flip Flop pairs used:           60
  Number of RAMB8BWERs:                          1 out of      64    1%
  Number of DSP48A1s:                            3 out of      32    9%
  Number of occupied Slices:                    99 out of   2,278    4%
`;

test('summarize-night1: map\'s counts (the first of each), the XDL\'s instances by type, trce\'s period, par, the times, the report\'s summary', () => {
  const c = mapCounts(MRP);
  assert.deepEqual(c['Slice Registers'], { used: 35, of: 18224 });
  assert.deepEqual(c['occupied Slices'], { used: 20, of: 2278 });
  assert.deepEqual(c['LUT Flip Flop pairs used'], { used: 60 });
  assert.deepEqual(c['used as Flip Flops'], { used: 35 });
  assert.deepEqual(c['DSP48A1s'], { used: 3, of: 32 });
  assert.deepEqual(mapCounts(null), {});
  const xdl = 'design "top" xc6slx16csg324-3 v3.2 ,\n  cfg "";\ninst "a" "SLICEX",placed CLEXL_X1Y2 SLICE_X1Y2 ,\ninst "b" "SLICEL",placed CLEXL_X1Y2 SLICE_X0Y2 ,\n'
    + 'inst "c" "SLICEX",unplaced ,\ninst "clk" "IOB",placed X Y ,\nnet "n" ,\n';
  assert.deepEqual(xdlSiteTypes(xdl), { IOB: 1, SLICEL: 1, SLICEX: 2 });
  assert.equal(minPeriod('Design statistics:\n   Minimum period:   4.123ns{1}   (Maximum frequency: 242.542MHz)\n'), 4.123);
  assert.equal(minPeriod('no constraint'), null);
  assert.equal(routed('...\nAll signals are completely routed.\n'), true);
  assert.equal(routed('The router has 3 unrouted signals'), false);
  assert.deepEqual(times('xst 41\nngdbuild 9\nreport xc6slx16csg324-3 1800\n'), { xst: 41, ngdbuild: 9, 'report xc6slx16csg324-3': 1800 });
  assert.deepEqual(reportSummary('(summary tiles=1234 sites=567 sitedefs=40 numpins=8 numpips=99)\n# tile types\n  12 INT\n   3 CLEXL\n# site types\n  20 SLICEX\n'),
    { summary: { tiles: 1234, sites: 567, sitedefs: 40, numpins: 8, numpips: 99 }, tiles: { INT: 12, CLEXL: 3 }, sites: { SLICEX: 20 } });
});

test('summarize-night1: a work folder as night1-remote.sh leaves it: the examples\' results, the empty bitstreams, the report', () => {
  const w = tmp();
  const part = 'xc6slx16-csg324-3';
  fs.writeFileSync(path.join(w, 'manifest.json'), JSON.stringify({ stage: 'S6-0', boards: { nexys3: { part, examples: { gates: { top: 'gates', unmatched: [] } } } }, empty: [part] }));
  const hdl = path.join(w, 'impl-nexys3', 'gates');
  fs.mkdirSync(hdl, { recursive: true });
  fs.writeFileSync(path.join(hdl, 'top_map.mrp'), MRP);
  fs.writeFileSync(path.join(hdl, 'par.log'), 'All signals are completely routed.\n');
  fs.writeFileSync(path.join(hdl, 'times.txt'), 'xst 30\nmap 20\n');
  fs.mkdirSync(path.join(w, 'empty'));
  fs.writeFileSync(path.join(w, 'empty', `${part}.bit`), bitFile([0xffff, 0xaa99, 0x5566, T1W(reg('IDCODE'), 2), 0x0400, 0x2093, T2W(reg('FDRI')), 0, 2, 1, 2]));
  fs.mkdirSync(path.join(w, 'reports'));
  fs.writeFileSync(path.join(w, 'reports', 'xc6slx16csg324-3.summary.txt'), '(summary tiles=10 sites=4)\n');
  const s = summarize(w);
  const g = s.boards.nexys3.examples.gates;
  assert.equal(g.hdl.map['occupied Slices'].used, 20);
  assert.deepEqual([g.hdl.routed, g.hdl.minPeriod, g.hdl.times], [true, null, { xst: 30, map: 20 }]);
  assert.deepEqual(g.open, { map: {}, sites: {}, routed: false, minPeriod: null, times: {} }, 'not implemented: empty');
  assert.deepEqual(s.parts[part].empty.packets, ['W IDCODE 2: 0400 2093', 'W FDRI 2: 0001 0002']);
  assert.equal(s.parts[part].empty.fdriWords, 2);
  assert.equal(s.parts[part].emptyCrc, undefined);
  assert.deepEqual(s.parts[part].report.summary, { tiles: 10, sites: 4 });
  fs.rmSync(w, { recursive: true, force: true });
});

test('ise-s6.sh and night1-remote.sh: their syntax, the usage, the host asked for and never written in them', () => {
  for (const f of ['ise-s6.sh', 'night1-remote.sh', 'ise-format.sh', 'ise-place-check.sh', 'ise-xdl-bits.sh']) assert.equal(spawnSync('bash', ['-n', path.join(S6, f)]).status, 0, f);
  const u = spawnSync('bash', [path.join(S6, 'ise-s6.sh'), 'nothing'], { encoding: 'utf8' });
  assert.equal(u.status, 2);
  assert.match(u.stdout, /^usage: ise-s6\.sh report <part> <dir> \| empty <dir> \| impl <part> <dir>… \| edif <part> <dir>…$/m);
  const env = { ...process.env };
  delete env.SILINX_ISE_HOST;
  const r = spawnSync('bash', [path.join(S6, 'night1-remote.sh'), os.tmpdir()], { encoding: 'utf8', env });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SILINX_ISE_HOST: set SILINX_ISE_HOST=user@host/);
  // (the scripts and the measurements: no address, no host, no user's home)
  for (const f of fs.readdirSync(S6, { recursive: true }).filter(f => fs.statSync(path.join(S6, f)).isFile())) {
    assert.doesNotMatch(fs.readFileSync(path.join(S6, f), 'utf8'), /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\.local\b|\/Users\/|\/home\//, f);
  }
});
