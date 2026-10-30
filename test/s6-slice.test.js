// packages/silinx-fpga/research/s6 stage S6-C (#725), without ISE: the primitive definitions read from an XDLRC, gen-slice6.mjs's
// designs (a base slice and one variant per slice) and ana-slice6.mjs's analysis on frame data built here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { primitiveDefs } from '../packages/silinx-fpga/research/s6/prim-defs6.mjs';
import { baseSettings, sliceVariants, sliceXdl, oneSlicePerTile, sliceDesign, harnessNets, designName, tileFilter } from '../packages/silinx-fpga/research/s6/gen-slice6.mjs';
import { columnOf, sliceBits, sliceSettings } from '../packages/silinx-fpga/research/s6/ana-slice6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';

const DEFS = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/prim-defs.json', import.meta.url), 'utf8'));

test('prim-defs6: the elements with options or a BEL, the pins and route-throughs left out', () => {
  const text = `(primitive_defs 2
\t(primitive_def SLICEX 3 4
\t\t(pin A1 A1 input)
\t\t(element A1 1
\t\t\t(pin A1 output)
\t\t)
\t\t(element AFFMUX 2
\t\t\t(cfg O6 AX)
\t\t)
\t\t(element AFF 5 # BEL
\t\t\t(cfg OR2L AND2L #LATCH #FF)
\t\t)
\t\t(element A5FF 5 # BEL
\t\t)
\t\t(element _ROUTETHROUGH-A1-A 2
\t\t)
\t)
\t(primitive_def TIEOFF 3 3
\t\t(element KEEP1 1 # BEL
\t\t)
\t)
)`;
  assert.deepEqual(primitiveDefs(text), {
    SLICEX: { AFFMUX: { bel: false, cfg: ['O6', 'AX'] }, AFF: { bel: true, cfg: ['OR2L', 'AND2L', '#LATCH', '#FF'] }, A5FF: { bel: true, cfg: [] } },
    TIEOFF: { KEEP1: { bel: true, cfg: [] } },
  });
  // the measured file: the three slice kinds
  assert.deepEqual(DEFS.SLICEX.AOUTMUX.cfg, ['A5Q', 'O5', 'O6']);
  assert.deepEqual(DEFS.SLICEM.A6RAMMODE.cfg, ['SPRAM32', 'SRL32', 'DPRAM32', 'SPRAM64', 'DPRAM64', 'SRL16']);
  assert.equal(DEFS.SLICEL.CARRY4.bel, true);
  assert.equal(DEFS.SLICEX.CARRY4, undefined);
});

test('gen-slice6: the variants: every option, the base\'s elements removed, the BELs added, the RAM modes', () => {
  const vs = sliceVariants({ AFFMUX: { bel: false, cfg: ['O6', 'AX'] }, AFF: { bel: true, cfg: ['#LATCH', '#FF'] }, A5FF: { bel: true, cfg: [] },
    A6LUT: { bel: true, cfg: ['<eqn>'] }, A5LUT: { bel: true, cfg: ['<eqn>'] }, WEMUX: { bel: false, cfg: ['WE', 'CE'] }, A5RAMMODE: { bel: false, cfg: ['SRL16'] } });
  assert.deepEqual(vs.map(v => v.name), ['AFFMUX=#OFF', 'AFFMUX=AX', 'AFF=#OFF', 'AFF=#LATCH', 'A5FF', 'A5LUT=#LUT', 'WEMUX=WE', 'WEMUX=CE', 'A5RAMMODE=SRL16']);
  const base = baseSettings(), get = (v, e) => vs.find(x => x.name === v).settings.filter(s => s[0] === e);
  assert.equal(base.length, 24);
  assert.deepEqual(get('AFFMUX=AX', 'AFFMUX'), [['AFFMUX', '', 'AX']]);
  assert.deepEqual(get('AFF=#OFF', 'AFF'), []);
  assert.deepEqual(get('AFF=#LATCH', 'AFF'), [['AFF', 's.AFF', '#LATCH']]);
  assert.deepEqual(get('A5FF', 'A5FF'), [['A5FF', 's.A5FF', '']]);
  assert.deepEqual(get('A5RAMMODE=SRL16', 'A6LUT'), [['A6LUT', 's.A6', '#RAM:O6=(A1*A2)']]);
  assert.deepEqual(get('A5RAMMODE=SRL16', 'A5LUT'), [['A5LUT', 's.A5', '#RAM:O5=(A1*A2)']]);
  // every variant differs from the base in one element
  for (const v of vs.filter(x => !/RAMMODE/.test(x.name))) {
    const d = [...v.settings.filter(s => !base.some(b => b.join() === s.join())), ...base.filter(b => !v.settings.some(s => s.join() === b.join()))];
    assert.equal(new Set(d.map(s => s[0])).size, 1, v.name);
  }
  assert.equal(sliceXdl({ name: 'SLICE_X1Y2', kind: 'X', tile: 'CLEXL_X1Y2' }, [['A6LUT', 's.A6', '#LUT:O6=1'], ['CLKINV', '', 'CLK']]),
    'inst "SLICE_X1Y2" "SLICEX",placed CLEXL_X1Y2 SLICE_X1Y2  ,\n  cfg " A6LUT:SLICE_X1Y2.A6:#LUT:O6=1 CLKINV::CLK " ;\n');
});

test('gen-slice6: a design: one slice per tile, the base first and last; too few tiles refused', () => {
  const slices = [0, 1, 2, 3, 4, 5].flatMap(y => [{ name: `SLICE_X0Y${y}`, kind: 'L', tile: `T${y}` }, { name: `SLICE_X1Y${y}`, kind: 'X', tile: `T${y}` }]);
  assert.deepEqual(oneSlicePerTile([...slices, { name: 'SLICE_X9Y0', kind: 'L', tile: 'T0' }], 'L').map(s => s.name), [0, 1, 2, 3, 4, 5].map(y => `SLICE_X0Y${y}`));
  const def = { AFFMUX: { bel: false, cfg: ['O6', 'AX'] } };
  const { xdl, manifest } = sliceDesign('xc6slx16csg324-3', slices, 'L', def);
  assert.deepEqual(manifest, { SLICE_X0Y0: 'BASE', SLICE_X0Y1: 'AFFMUX=#OFF', SLICE_X0Y2: 'AFFMUX=AX', SLICE_X0Y3: 'BASE' });
  assert.match(xdl, /^design "sliceL" xc6slx16csg324-3 v3\.2 ,\n {2}cfg "";\ninst "SLICE_X0Y0" "SLICEL"/);
  assert.equal((xdl.match(/^inst /gm) || []).length, 4);
  assert.throws(() => sliceDesign('p', slices.slice(0, 4), 'L', def), /p: 2 SLICEL tiles for 4 slices/);
  // the measured definitions fit the XC6SLX16's tiles: X 70, L 114, M 169 variants
  assert.deepEqual(['SLICEX', 'SLICEL', 'SLICEM'].map(k => sliceVariants(DEFS[k]).length), [70, 114, 169]);
});

test('gen-slice6 --nets: every pin of the measured slices on a net, from a driver and to a sink of its own', () => {
  assert.equal(baseSettings({ nets: true }).length, 28);
  assert.deepEqual(baseSettings({ nets: true }).filter(s => /OUTMUX/.test(s[0])).map(s => s.join(':')), ['AOUTMUX::O6', 'BOUTMUX::O6', 'COUTMUX::O6', 'DOUTMUX::O6']);
  assert.ok(sliceVariants({ AOUTMUX: { bel: false, cfg: ['O5', 'O6'] } }, { nets: true }).some(v => v.name === 'AOUTMUX=#OFF'));
  const cell = n => ({ name: n, kind: 'M', tile: `T${n}` });
  const nets = harnessNets('M', [cell('S0'), cell('S1')], cell('DRV'), [cell('K0'), cell('K1')]);
  assert.match(nets, /^net "in_AX" , \n {2}outpin "DRV" A ,\n {2}inpin "S0" AX ,\n {2}inpin "S1" AX ,\n {2};\n/);
  assert.match(nets, /net "in_DI" , \n {2}outpin "DRV" DQ ,/);
  assert.match(nets, /net "o1_COUT" , \n {2}outpin "S1" COUT ,\n {2}inpin "K1" C1 ,\n {2};\n/);
  assert.equal((nets.match(/^net /gm) || []).length, 12 + 2 * 13);
  assert.equal((harnessNets('X', [cell('S0')], cell('DRV'), [cell('K0')]).match(/^net /gm) || []).length, 7 + 12);
  // a design: the driver and the sinks in tiles none of the measured slices is in
  const slices = Array.from({ length: 12 }, (_, y) => [{ name: `SLICE_X0Y${y}`, kind: 'L', tile: `L${y}` }, { name: `SLICE_X1Y${y}`, kind: 'X', tile: `L${y}` }]).flat();
  const { xdl, manifest } = sliceDesign('p', slices, 'L', { AFFMUX: { bel: false, cfg: ['O6', 'AX'] } }, { nets: true });
  assert.deepEqual(Object.keys(manifest), ['SLICE_X0Y0', 'SLICE_X0Y1', 'SLICE_X0Y2', 'SLICE_X0Y3']);
  assert.match(xdl, /^design "netsL" p v3\.2/);
  assert.match(xdl, /inst "SLICE_X1Y11" "SLICEX",placed L11 SLICE_X1Y11 {2},\n {2}cfg "" ;\n/);
  assert.match(xdl, /net "in_CLK" , \n {2}outpin "SLICE_X1Y11" AMUX ,/);
  assert.match(xdl, /net "o3_COUT" , \n {2}outpin "SLICE_X0Y3" COUT ,\n {2}inpin "SLICE_X1Y9" C1 ,/);
  assert.doesNotMatch(xdl, /"SLICE_X1Y[0-3]"/);
  assert.throws(() => sliceDesign('p', slices.slice(0, 10), 'L', { AFFMUX: { bel: false, cfg: ['O6', 'AX'] } }, { nets: true }), /p: 2 free slices for 5/);
});

test('gen-slice6 --full: the base with the 5-input LUTs and flip-flops, a SLICEL\'s carry and F7 / F8', () => {
  const l = baseSettings({ full: true, kind: 'L' }).map(s => s.join(':')), x = baseSettings({ full: true, kind: 'X' }).map(s => s.join(':'));
  for (const e of ['A5LUT:s.A5:#LUT:O5=(A1*A2)', 'A5FF:s.A5FF:', 'A5FFSRINIT::SRINIT0', 'AOUTMUX::A5Q']) { assert.ok(l.includes(e), e); assert.ok(x.includes(e), e); }
  for (const e of ['ACY0::O5', 'CARRY4:s.CARRY4:', 'CYINITGND:s.CYINITGND:', 'PRECYINIT::0', 'COUTUSED::0', 'F8MUX:s.F8MUX:']) { assert.ok(l.includes(e), e); assert.ok(!x.includes(e), e); }
  assert.ok(!l.includes('AOUTMUX::O6'));
  const names = sliceVariants(DEFS.SLICEL, { full: true, kind: 'L' }).map(v => v.name);
  for (const n of ['CARRY4=#OFF', 'CYINITGND=#OFF', 'CYINITVCC', 'PRECYINIT=1', 'ACY0=AX', 'F7AMUX=#OFF', 'A5FF=#OFF', 'A5FFSRINIT=SRINIT1', 'A5LUT=#OFF', 'AOUTMUX=O6']) assert.ok(names.includes(n), n);
  for (const n of ['CARRY4', 'A5FF', 'A5LUT=#LUT']) assert.ok(!names.includes(n), n);
  assert.deepEqual([{}, { nets: true }, { full: true }, { nets: true, full: true }].map(designName), ['slice', 'nets', 'full', 'full']);
  const slices = Array.from({ length: 260 }, (_, y) => [{ name: `SLICE_X0Y${y}`, kind: 'L', tile: `L${y}` }, { name: `SLICE_X1Y${y}`, kind: 'X', tile: `L${y}` }]).flat();
  const { xdl } = sliceDesign('p', slices, 'L', DEFS.SLICEL, { full: true });
  assert.match(xdl, /^design "fullL" p v3\.2/);
  assert.match(xdl, /net "in_CLK" ,/);
});

test('gen-slice6 --tiles: the measured slices in the tiles of a type, from a column on', () => {
  const s = (x, t) => ({ name: `SLICE_X${x}Y0`, kind: 'X', tile: `${t}_X${x}Y0` });
  const all = [s(1, 'CLEXL'), s(3, 'CLEXM'), s(13, 'CLEXL'), s(15, 'CLEXM')];
  assert.deepEqual(all.filter(tileFilter('CLEXM')).map(x => x.name), ['SLICE_X3Y0', 'SLICE_X15Y0']);
  assert.deepEqual(all.filter(tileFilter('CLEXL:13')).map(x => x.name), ['SLICE_X13Y0']);
  assert.equal(all.filter(tileFilter(null)).length, 4);
  const many = Array.from({ length: 80 }, (_, y) => [s(1, 'CLEXL'), s(3, 'CLEXM')].map(x => ({ ...x, name: x.name.replace('Y0', `Y${y}`), tile: x.tile.replace('Y0', `Y${y}`) }))).flat();
  const { manifest } = sliceDesign('p', many, 'X', { AFFMUX: { bel: false, cfg: ['O6', 'AX'] } }, { tiles: 'CLEXM' });
  assert.ok(Object.keys(manifest).every(n => /^SLICE_X3Y/.test(n)));
});

const dev = S6_DEVICES.xc6slx16;
test('ana-slice6: a frame\'s column; a slice\'s bits in its column and band; the variants against the base', () => {
  assert.deepEqual(columnOf(dev, 0), [0, 4]);
  assert.deepEqual(columnOf(dev, 55), [34, 30]);
  assert.deepEqual(columnOf(dev, 744 + 70), [744 + 64, 31]);
  assert.throws(() => columnOf(dev, 742), /frame 742: in no column/);
  const fdri = emptyFdri(dev), set = (f, b) => { fdri[f * FRAME_WORDS + (b >> 4)] |= 0x8000 >> (b & 15); };
  const bases = { S0: [55, 848], S1: [55, 784], S2: [55, 720], S3: [55 + 744, 848] };
  // the base: (0, 0) and (-21, 63) (the column's first frame); variant S1 adds (4, 9) and clears (0, 0)
  for (const n of ['S0', 'S2', 'S3']) { set(bases[n][0], bases[n][1]); set(bases[n][0] - 21, bases[n][1] + 63); }
  set(bases.S1[0] - 21, bases.S1[1] + 63); set(bases.S1[0] + 4, bases.S1[1] + 9);
  set(55 + 9, 848 + 64); // outside S0's band: not its
  assert.deepEqual(sliceBits(fdri, dev, bases.S0), [[-21, 63], [0, 0]]);
  const r = sliceSettings(fdri, dev, { S0: 'BASE', S1: 'AFFMUX=AX', S2: 'AFF=#OFF', S3: 'BASE' }, bases);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.variants, { 'AFFMUX=AX': { set: [[4, 9]], clear: [[0, 0]] }, 'AFF=#OFF': { set: [], clear: [] } });
  set(bases.S3[0] + 1, bases.S3[1]);
  assert.deepEqual(sliceSettings(fdri, dev, { S0: 'BASE', S3: 'BASE' }, bases).problems, ['S3: the base differs from S0\'s']);
});

test('the XC6SLX16\'s slice settings, measured: the flip-flops\', the SLICEX\'s frame its neighbour\'s', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-slice.json', import.meta.url), 'utf8'));
  const luts = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-lut.json', import.meta.url), 'utf8'));
  const v = (k, n) => db.kinds[k].variants[n];
  // SYNC_ATTR: SYNC sets one bit, ASYNC clears it; a flip-flop as a latch, AND2L or OR2L: one bit for the four
  assert.deepEqual(v('L', 'SYNC_ATTR=ASYNC'), { set: [], clear: [[4, 27]] });
  assert.deepEqual(v('M', 'SYNC_ATTR=ASYNC'), { set: [], clear: [[5, 27]] });
  for (const p of ['A', 'B', 'C', 'D']) for (const m of ['#LATCH', 'AND2L', 'OR2L']) assert.deepEqual(v('L', `${p}FF=${m}`), { set: [[4, 25]], clear: [] });
  assert.deepEqual(v('L', 'AFFSRINIT=SRINIT1'), { set: [[4, 55]], clear: [] });
  // without nets on its pins a setting of the routing sets nothing (CLKINV, the outputs used)
  assert.deepEqual(v('L', 'CLKINV=CLK_B'), { set: [], clear: [] });
  // the SLICEX's frame before its LUTs' is its neighbour's frame 4 (SLICEL) or 5 (SLICEM): the bits of a used slice
  // the LUT map's zero design set there (S6-B) are the SLICEX's
  const b = luts.slices;
  assert.equal(b.SLICE_X1Y5[0] - b.SLICE_X0Y5[0], 5);
  assert.equal(b.SLICE_X3Y5[0] - b.SLICE_X2Y5[0], 6);
  const xb = db.kinds.X.base.filter(([f]) => f === -1).map(([, x]) => x);
  assert.deepEqual(xb, [9, 10, 15, 33, 47]);
  assert.deepEqual(['A', 'B', 'C', 'D'].map(p => v('X', `${p}FFMUX=${p}X`).set), [[[-1, 45]], [[-1, 44]], [[-1, 30]], [[-1, 29]]]);
});

test('the XC6SLX16\'s slice settings with nets on the pins, measured: CLKINV, CE and SR used, the outputs\' muxes', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-slice-nets.json', import.meta.url), 'utf8'));
  const v = (k, n) => db.kinds[k].variants[n];
  for (const [k, f] of [['L', 4], ['M', 5], ['X', -1]]) {
    assert.deepEqual(v(k, 'CLKINV=CLK_B'), { set: [[f, k === 'X' ? 24 : 35]], clear: [] }, k);
    assert.deepEqual(v(k, 'CEUSED=#OFF'), { set: [], clear: [[f, k === 'X' ? 31 : 28]] }, k);
    assert.deepEqual(v(k, 'SRUSED=#OFF'), { set: [], clear: [[f, k === 'X' ? 32 : 26]] }, k);
  }
  // AOUTMUX: O6 one bit (the base's), O5 none; XOR, CY, F7, A5Q their own
  assert.deepEqual(v('L', 'AOUTMUX=O5'), { set: [], clear: [[4, 63]] });
  assert.deepEqual(v('L', 'AOUTMUX=CY'), { set: [[4, 61], [4, 62]], clear: [[4, 63]] });
  assert.deepEqual(v('L', 'AFFMUX=AX'), { set: [[4, 56], [4, 58]], clear: [] });
  assert.deepEqual(v('M', 'WEMUX=CE'), { set: [[2, 40]], clear: [] });
  // the settings without a pin are as without nets
  const plain = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-slice.json', import.meta.url), 'utf8'));
  for (const k of ['X', 'L', 'M']) for (const n of ['SYNC_ATTR=ASYNC', 'AFF=#LATCH', 'BFFSRINIT=SRINIT1', 'CFFMUX=XOR'].filter(x => plain.kinds[k].variants[x])) assert.deepEqual(v(k, n), plain.kinds[k].variants[n], `${k} ${n}`);
});

test('the XC6SLX16\'s slice settings with the carry, F7 / F8 and the 5-input flip-flops in use, measured', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-slice-full.json', import.meta.url), 'utf8'));
  for (const [k, f] of [['L', 4], ['M', 5]]) {
    const v = n => db.kinds[k].variants[n];
    // CY0 = O5 one bit per LUT, AX none; COUTUSED off clears the four; PRECYINIT 0 none, 1 and AX a bit each
    [['A', 54], ['B', 48], ['C', 14], ['D', 8]].forEach(([p, b]) => assert.deepEqual(v(`${p}CY0=${p}X`), { set: [], clear: [[f, b]] }, `${k} ${p}`));
    assert.deepEqual(v('COUTUSED=#OFF'), { set: [], clear: [[f, 8], [f, 14], [f, 48], [f, 54]] });
    assert.deepEqual(v('PRECYINIT=1'), { set: [[f, 52]], clear: [] });
    assert.deepEqual(v('PRECYINIT=AX'), { set: [[f, 49]], clear: [] });
    // the outputs: A5Q (the base) bit 60, O5 61 and 63, O6 63
    assert.deepEqual(v('AOUTMUX=O5'), { set: [[f, 61], [f, 63]], clear: [[f, 60]] });
    assert.deepEqual(v('AOUTMUX=O6'), { set: [[f, 63]], clear: [[f, 60]] });
    assert.deepEqual(v('A5FFSRINIT=SRINIT1'), { set: [[-1, 47]], clear: [] });
    // the carry's and F7 / F8's BELs: no bits of their own
    for (const n of ['CARRY4=#OFF', 'CYINITGND=#OFF', 'CYINITVCC', 'F7AMUX=#OFF', 'F8MUX=#OFF']) assert.deepEqual(v(n), { set: [], clear: [] }, `${k} ${n}`);
  }
  assert.deepEqual(db.kinds.X.variants['A5FFSRINIT=SRINIT1'], { set: [[-6, 46]], clear: [] });
});

test('the XC6SLX16\'s SLICEX settings by tile type: the flip-flops\' SRINIT bits in minor 20 of the column', () => {
  const read = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/xc6slx16-${n}.json`, import.meta.url), 'utf8'));
  const m = read('slice-full-clexm').kinds.X.variants, l = read('slice-full-clexl13').kinds.X.variants;
  // a SLICEX's base is minor 26 of a CLEXL column, 27 of a CLEXM: the same bits one frame apart from it
  for (const [n, b] of [['A5FFSRINIT=SRINIT1', 46], ['B5FFSRINIT=SRINIT1', 42], ['CFFSRINIT=SRINIT1', 22], ['C5FFSRINIT=SRINIT1', 23], ['D5FFSRINIT=SRINIT1', 17]]) {
    assert.deepEqual(l[n], { set: [[-6, b]], clear: [] }, `CLEXL ${n}`);
    assert.deepEqual(m[n], { set: [[-7, b]], clear: [] }, `CLEXM ${n}`);
  }
  // everything else the same in both and in the first rounds' column; a SLICEL the same in another column
  const full = read('slice-full');
  for (const [n, v] of Object.entries(l)) if (!/SRINIT=SRINIT1$/.test(n)) assert.deepEqual(m[n], v, n);
  assert.deepEqual(read('slice-full-clexl13').kinds.L, full.kinds.L);
});
