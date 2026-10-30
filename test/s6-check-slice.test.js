// packages/silinx-fpga/research/s6 check-slice6.mjs (#725), without ISE: the slices of a design predicted from the LUT and slice
// databases (packages/silinx-fpga/bitdb/s6), checked tile by tile against a bitstream; here one written from the prediction itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lutEntries, routeThroughs, loadDb, kindModel, predictSlice, checkDesign, CIN_BIT } from '../packages/silinx-fpga/research/s6/check-slice6.mjs';
import { S6_DEVICES, emptyFdri, writeBit6, FRAME_WORDS } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';

const cfg = s => s.split(' ').map(x => { const [attr, name, ...v] = x.split(':'); return { attr, name, value: v.join(':') }; });

test('check-slice6: a LUT\'s entries from O6 and O5, the route-throughs as settings', () => {
  const t = lutEntries('A1*A2');
  assert.equal(t.length, 64);
  assert.deepEqual([0, 1, 2, 3, 35].map(e => t[e]), [0, 0, 0, 1, 1]);
  // O5 on the entries with A6 = 0, O6 on the others
  const f = lutEntries('A6', '1');
  assert.ok(f.every(x => x === 1));
  assert.deepEqual(lutEntries(null, null), new Array(64).fill(0));
  assert.deepEqual(routeThroughs(cfg('AOUTMUX::#OFF _ROUTETHROUGH:A:AMUX _ROUTETHROUGH:B3:B CFF::#FF')),
    cfg('CFF::#FF AOUTMUX::O6 B6LUT::#LUT:O6=A3'));
  // a route-through where the slice has its own LUT is not one of the LUT
  assert.deepEqual(routeThroughs(cfg('B6LUT:x:#LUT:O6=A1 _ROUTETHROUGH:B3:B')), cfg('B6LUT:x:#LUT:O6=A1'));
});

const db = loadDb('xc6slx16');
test('check-slice6: the predicted bits of a slice: the LUTs, the settings changed from the base, the carry in', () => {
  const m = kindModel(db, 'L'), lutA = db.lut.kinds.L.A.map(p => p.join());
  // a counter's slice: the carry from below, every CY0 on O5, the outputs XOR, the flip-flops on XOR
  const carry = predictSlice(m, cfg('A6LUT:a:#LUT:O6=A1 ACY0::O5 BCY0::O5 CCY0::O5 DCY0::O5 AOUTMUX::XOR CARRY4:c: COUTUSED::0'));
  assert.deepEqual(carry.unknown, []);
  for (const p of ['4,54', '4,48', '4,14', '4,8', CIN_BIT.L, '4,62']) assert.ok(carry.bits.has(p), p);
  for (const p of ['4,60', '4,25', '4,27']) assert.ok(!carry.bits.has(p), p);
  assert.equal(lutA.filter(p => carry.bits.has(p)).length, 32);
  // PRECYINIT set: no carry in
  assert.ok(!predictSlice(m, cfg('CARRY4:c: PRECYINIT::0')).bits.has(CIN_BIT.L));
  // a flip-flop: latch, ASYNC, CLK_B
  const ff = predictSlice(m, cfg('AFF:f:#LATCH AFFMUX::O6 SYNC_ATTR::ASYNC CLKINV::CLK_B'));
  assert.ok(ff.bits.has('4,25') && ff.bits.has('4,35') && !ff.bits.has('4,27'));
  assert.deepEqual(predictSlice(m, cfg('WEMUX::XX')).unknown, ['WEMUX=XX']);
  assert.equal(predictSlice(m, cfg('A6LUT:r:#RAM:O6=0x0000000000000001 A6RAMMODE::SPRAM64')).ram, true);
  assert.equal(predictSlice(m, cfg('A6LUT:r:#RAM:O6=0x0000000000000000 A6RAMMODE::SRL16')).ram, false);
});

test('check-slice6: a SLICEX\'s model by its tile\'s type', () => {
  const l = kindModel(db, 'X', 'CLEXL'), m = kindModel(db, 'X', 'CLEXM');
  const c = cfg('A5FF:f: A5FFSRINIT::SRINIT1 A5LUT:a:#LUT:O5=1 AOUTMUX::A5Q');
  assert.ok(predictSlice(l, c).bits.has('-6,46') && !predictSlice(l, c).bits.has('-7,46'));
  assert.ok(predictSlice(m, c).bits.has('-7,46') && !predictSlice(m, c).bits.has('-6,46'));
});

test('check-slice6: a design checked against a bitstream written from its prediction; a bit flipped is found', () => {
  const xdl = `design "t" xc6slx16csg324-3 v3.2 , cfg "";
inst "s0" "SLICEL",placed CLEXL_X1Y5 SLICE_X0Y5 , cfg " A6LUT:s0.A:#LUT:O6=(A1*A2) AFF:s0.AFF:#FF AFFMUX::O6 AFFSRINIT::SRINIT0 CLKINV::CLK SYNC_ATTR::SYNC " ;
inst "s1" "SLICEX",placed CLEXL_X1Y5 SLICE_X1Y5 , cfg " B6LUT:s1.B:#LUT:O6=~A3 BOUTMUX::O6 " ;
`;
  const dev = S6_DEVICES.xc6slx16, fdri = emptyFdri(dev);
  const put = (site, kind, c) => {
    const [f0, b0] = db.lut.slices[site];
    for (const p of predictSlice(kindModel(db, kind), cfg(c)).bits) {
      const [f, b] = p.split(',').map(Number);
      fdri[(f0 + f) * FRAME_WORDS + ((b0 + b) >> 4)] |= 0x8000 >> ((b0 + b) & 15);
    }
  };
  put('SLICE_X0Y5', 'L', 'A6LUT:s0.A:#LUT:O6=(A1*A2) AFF:s0.AFF:#FF AFFMUX::O6 AFFSRINIT::SRINIT0 CLKINV::CLK SYNC_ATTR::SYNC');
  put('SLICE_X1Y5', 'X', 'B6LUT:s1.B:#LUT:O6=~A3 BOUTMUX::O6');
  const bit = writeBit6({ fdri, name: 't.ncd', part: '6slx16csg324', date: '2026/10/28', time: '12:00:00', device: dev });
  const r = checkDesign(xdl, bit, db);
  assert.deepEqual([r.slices, r.tiles, r.mismatches.length], [2, 1, 0]);
  // ISE setting SRINIT1 the model does not predict: found as ISE's
  const [f0, b0] = db.lut.slices.SLICE_X0Y5;
  fdri[(f0 + 4) * FRAME_WORDS + ((b0 + 55) >> 4)] |= 0x8000 >> ((b0 + 55) & 15);
  const bad = checkDesign(xdl, writeBit6({ fdri, name: 't.ncd', part: '6slx16csg324', date: '2026/10/28', time: '12:00:00', device: dev }), db);
  assert.deepEqual(bad.mismatches, [{ tile: 'CLEXL_X1Y5', sites: ['SLICE_X0Y5', 'SLICE_X1Y5'], missing: ['L 4,55'], extra: [] }]);
});
