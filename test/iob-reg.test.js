// #44: the I/O registers (IFF / OFF / TFF, DDR) and the input delays in the bit database: their
// features (core/fpga/bitgen.js iobRegFeatures), bits of each pad's own (research/s3e-bitstream stage G:
// gen-iobreg.mjs, gen-iobrand.mjs, ana-iobreg.mjs), without ISE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXdl } from '../core/xdl.js';
import { designFeatures, frameData, iobRegFeatures, parseBit } from '../core/fpga/bitgen.js';
import { getBit, diffFrames } from '../core/fpga/bitstream.js';
import { loadDb } from '../core/fpga/bitdb-node.js';

const cfgOf = s => s.trim().split(/\s+/).map(t => { const m = /^([^:]+):([^:]*):(.*)$/.exec(t); return { attr: m[1], name: m[2], value: m[3] }; });

test('I/O registers: the pad features of an I/O site\'s settings', () => {
  // the plain paths: none (their bits are the I/O standard's)
  assert.deepEqual(iobRegFeatures(cfgOf('IDELMUX::1 IMUX::1 IOATTRBOX::LVCMOS25 INBUF:a: PAD:a:')), []);
  assert.deepEqual(iobRegFeatures(cfgOf('O1INV::O1 OMUX::O1 OUTBUF:a: PAD:a:')), []);
  assert.deepEqual(iobRegFeatures(cfgOf('O1INV::O1_B OMUX::O1 OUTBUF:a: PAD:a:')), ['O1INV:O1_B']);
  // a direct input delayed: its delay (none for 0)
  assert.deepEqual(iobRegFeatures(cfgOf('IBUF_DELAY_VALUE::DLY5 IDELMUX::0 IMUX::1 PRE_DELAY_MUX::0 IBUF_DELAY:a.IBUF_DELAY: PAD:a:')), ['IBUF:DLY5']);
  assert.deepEqual(iobRegFeatures(cfgOf('IBUF_DELAY_VALUE::DLY0 IDELMUX::1 IMUX::1 PAD:a:')), []);
  // an input register without enable, set / reset or reverse: its delay, its settings, the parts not used
  const r = iobRegFeatures(cfgOf('ICLK1INV::ICLK1_B IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFF1:r:#FF IFF1_INIT_ATTR::INIT0 IFFDELMUX::0 IFFDMUX::1 PRE_DELAY_MUX::0 IFD_DELAY:a.IFD_DELAY: INBUF:a: PAD:a:'));
  assert.equal(r[0], 'IFD:DLY3');
  for (const f of ['R:IFF1:#FF', 'R:ICLK1INV:ICLK1_B', 'R:IFF1_INIT_ATTR:INIT0', 'R:IFF2:#OFF', 'R:ICEINV:#OFF', 'R:IFF1_SR_ATTR:#OFF', 'R:SRINV:#OFF', 'R:REVINV:#OFF']) assert.ok(r.includes(f), f);
  assert.ok(!r.some(f => /DELAY|IFFDELMUX/.test(f.slice(4))), 'the delay line is the bundle\'s');
  // the delay line bypassed: DLY0
  assert.equal(iobRegFeatures(cfgOf('IFD_DELAY_VALUE::DLY0 IFF1:r:#FF IFFDELMUX::1 IFFDMUX::1 PAD:a:'))[0], 'IFD:DLY0');
  // a DDR output and a registered output enable
  const o = iobRegFeatures(cfgOf('O1INV::O1 O2INV::O2 O1_DDRMUX::1 O2_DDRMUX::1 OFF1:x:#FF OFF2:y:#FF OMUX::OFFDDR OTCLK1INV::OTCLK1 OTCLK2INV::OTCLK2_B T1INV::T1 TFF1:t:#FF TMUX::TFF1 OUTBUF:a: PAD:a:'));
  for (const f of ['OMUX:OFFDDR', 'O1INV:O1', 'O2INV:O2', 'O1_DDRMUX:1', 'O2_DDRMUX:1', 'TMUX:TFF1', 'T1INV:T1', 'R:OFF1:#FF', 'R:OFF2:#FF', 'R:TFF1:#FF', 'R:OTCLK2INV:OTCLK2_B', 'R:OCEINV:#OFF', 'R:TCEINV:#OFF', 'R:TFF2:#OFF']) assert.ok(o.includes(f), f);
});

test('I/O registers in the measured database: an input register on a pad, its bits the pad\'s own; a value never measured is refused', () => {
  const db = loadDb('xc3s250ecp132-4');
  const xdl = (dly, mux = '0') => `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "d" "IBUF",placed BIOIS_X24Y0 M11 ,
  cfg " ICEINV::ICE ICLK1INV::ICLK1 IDDRIN_MUX::2 IFD_DELAY_VALUE::${dly} IFF1:r:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFFATTRBOX::SYNC IFFDELMUX::${mux} IFFDMUX::1 IOATTRBOX::LVCMOS25 ISR_USED::0 PRE_DELAY_MUX::0 SRINV::SR IFD_DELAY:d.IFD_DELAY: INBUF:d_IBUF: PAD:d: "
  ;
net "q" ,
  outpin "d" IQ1 ,
  ;
`;
  const r = frameData(parseXdl(xdl('DLY3')), db);
  assert.deepEqual(r.unknown, []);
  const feats = designFeatures(parseXdl(xdl('DLY3')), db).feats.filter(f => f.tile === '@M11').map(f => f.feature);
  for (const f of ['IFD:DLY3', 'R:IFF1:#FF', 'R:IFF1_SR_ATTR:SRLOW', 'R:IFF2:#OFF', 'I:LVCMOS25']) assert.ok(feats.includes(f), f);
  // every bit the pad's register features set is set, every one they clear cleared
  for (const f of feats.filter(x => !/^I:/.test(x))) for (const s of db.padFeats.M11[f]) { const [fr, b, v] = parseBit(s); assert.equal(getBit(r.frames, r.frames.frameWords, fr, b), v, `${f} ${s}`); }
  // the database keeps only the delay ISE's map chooses by itself (DLY3 here: a pad's other delays
  // interact with its neighbours'): another one is refused, as a value ISE's map never writes (8)
  assert.deepEqual(frameData(parseXdl(xdl('DLY0', '1')), db).unknown.map(u => `${u.tile} ${u.feature}`), ['@M11 IFD:DLY0']);
  assert.deepEqual(frameData(parseXdl(xdl('DLY8')), db).unknown.map(u => `${u.tile} ${u.feature}`), ['@M11 IFD:DLY8']);
  // the same register on another pad: that pad's own bits
  const other = frameData(parseXdl(xdl('DLY3').replace('BIOIS_X24Y0 M11', 'BIOIS_X26Y0 N12')), db);
  assert.deepEqual(other.unknown, []);
  assert.ok(diffFrames(r.frames, other.frames, r.frames.frameWords).length > 0);
});

test('I/O registers in the measured database: every pad of the four devices has its register settings', () => {
  // [part, the input delay ISE's map chooses by itself, bonded pads, pads that can drive an output]
  for (const [part, auto, inputs, outputs] of [['xc3s100ecp132-4', 'DLY2', 83, 73], ['xc3s250ecp132-4', 'DLY3', 92, 86], ['xc3s500efg320-4', 'DLY3', 232, 177], ['xc3s1200efg320-4', 'DLY3', 250, 195]]) {
    const db = loadDb(part);
    const pads = Object.values(db.padFeats);
    const n = f => pads.filter(p => p[f]).length;
    // every pad but the clock pin and the two or three that drive the designs' controls: an input register
    for (const f of [`IFD:${auto}`, 'R:IFF1:#FF', 'R:ICLK1INV:ICLK1', 'R:ICLK1INV:ICLK1_B', 'R:IFF1_INIT_ATTR:INIT0', 'R:IFF1_INIT_ATTR:INIT1']) assert.ok(n(f) >= inputs - 3, `${part} ${f}: ${n(f)} pads`);
    // every pad that can drive an output but those of the designs' controls: output and tristate registers, DDR
    for (const f of ['OMUX:OFF1', 'TMUX:TFF1', 'OMUX:OFFDDR', 'O1INV:O1_B', 'R:OFF1:#FF', 'R:OFF2:#FF']) assert.ok(n(f) >= outputs - 3, `${part} ${f}: ${n(f)} pads`);
    // the other delays are not in the database
    assert.equal(pads.filter(p => Object.keys(p).some(f => /^(IFD|IBUF):/.test(f) && f !== `IFD:${auto}`)).length, 0, part);
  }
});
