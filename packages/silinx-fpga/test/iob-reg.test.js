// #44: the I/O registers (IFF / OFF / TFF, DDR) and the input delays in the bit database: their
// features (packages/silinx-fpga/src/fpga/bitgen.js iobRegFeatures), bits of each pad's own (packages/silinx-fpga/research/s3e-bitstream stage G:
// gen-iobreg.mjs, gen-iobrand.mjs, ana-iobreg.mjs), without ISE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXdl } from '../src/xdl.js';
import { designFeatures, frameData, iobRegFeatures, parseBit } from '../src/fpga/bitgen.js';
import { getBit, diffFrames } from '../src/fpga/bitstream.js';
import { loadDb } from '../src/fpga/bitdb-node.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';
import { deviceSites } from '../src/fpga/place.js';
import { bufgReach } from '../src/fpga/route.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  // every delay of the pad is in the database (#97: measured with every pair of values on the pads of each tile, its
  // bits the pad's own; DLY0, the delay line bypassed, its own bits too); a value ISE's map never writes (8) is refused
  const d0 = frameData(parseXdl(xdl('DLY0', '1')), db);
  assert.deepEqual(d0.unknown, []);
  assert.ok(diffFrames(r.frames, d0.frames, r.frames.frameWords).length > 0);
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
    // (#96, the second round: every register kind on every pad, solved with #44's designs) the plain registers, no
    // clock enable or set / reset (the open synthesis's usual kind), and the tristate output's enable from the fabric
    // on every pad that can drive an output; the plain input register on every pad of an input register, the
    // eight that drive the designs' outputs, measured with rio1-3; the output-enable register's kinds with rtek0-3
    for (const f of ['R:OFF1_SR_ATTR:#OFF', 'R:OCEINV:#OFF', 'TMUX:T1', 'R:TFF1_SR_ATTR:#OFF', 'R:TCEINV:#OFF', 'R:TCEINV:TCE']) assert.ok(n(f) >= outputs - 3, `${part} ${f}: ${n(f)} pads`);
    for (const f of ['R:IFF1_SR_ATTR:#OFF', 'R:ICEINV:#OFF']) assert.ok(n(f) >= inputs - 3, `${part} ${f}: ${n(f)} pads`);
    // every input delay on every pad of an input but the global clock pins (#97): an input register's IFD_DELAY_VALUE
    // 0-6, a direct input's IBUF_DELAY_VALUE 1-12 (0: no feature); a clock pin (a dedicated path to a global buffer)
    // only the delay ISE's map chooses, its other delays setting bits of the clock tiles (refused)
    const dev = loadDeviceCache(part);
    const gclk = new Set([...deviceSites(dev).pads.keys()].filter(p => bufgReach(dev, p, 'I').length));
    assert.equal(gclk.size, /fg320/.test(part) ? 34 : 32, part);
    for (let k = 0; k <= 6; k++) assert.ok(n(`IFD:DLY${k}`) >= inputs - gclk.size - 3 || `IFD:DLY${k}` === `IFD:${auto}`, `${part} IFD:DLY${k}: ${n(`IFD:DLY${k}`)} pads`);
    for (let k = 1; k <= 12; k++) assert.ok(n(`IBUF:DLY${k}`) >= inputs - gclk.size - 3, `${part} IBUF:DLY${k}: ${n(`IBUF:DLY${k}`)} pads`);
    for (const [name, f] of Object.entries(db.padFeats)) if (gclk.has(name)) assert.deepEqual(Object.keys(f).filter(x => /^(IFD|IBUF):/.test(x) && x !== `IFD:${auto}`), [], `${part} ${name}`);
  }
});

// #671: #44 / #96 solved the registers' settings per pad from designs whose registers were all clocked from line 4 and in
// which both pads of every I/O tile had an input register; two kinds of bits went to the wrong place, measured with ISE
test('I/O registers in the measured database: no pad feature holds the I/O columns\' clock-row bits, each bit of R:ICLK2INV:#OFF its owner\'s (#671)', () => {
  const tool = s => spawnSync(process.execPath, [fileURLToPath(new URL(`../research/s3e-bitstream/${s}`, import.meta.url)), '--check'], { encoding: 'utf8' });
  // (the writer had the left column's clock rows 2 frames early; the solution gave one pad of each row the difference)
  for (const s of ['pad-clock-rows.mjs', 'pad-owners.mjs']) { const r = tool(s); assert.equal(r.status, 0, `${s}: ${r.stdout}${r.stderr}`); }
  // a lone input register on a pad: its tile's bits set as ISE sets them (measured: B4 alone sets 3,71 of TIOIS_X3Y35, C4
  // alone does not, as on the board test feat_iob_plain; B18 alone, on the XC3S500E, not 3,33 of the tile below, C17's)
  const lone = (part, tile, pad, iob) => parseXdl(`design "t" ${part} v3.2 , cfg "";
inst "d" "IBUF",placed ${tile} ${pad} ,
  cfg " ICLK1INV::ICLK1 IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFF1:r:#FF IFF1_INIT_ATTR::INIT0 IFFDELMUX::0 IFFDMUX::1 IOATTRBOX::LVCMOS25 PRE_DELAY_MUX::0 IFD_DELAY:d.IFD_DELAY: INBUF:d_IBUF: PAD:d: "
  ;
net "q" ,
  outpin "d" IQ${iob} ,
  ;
`);
  const bit = (part, tile, pad, iob, fr, b) => { const db = loadDb(part); const r = frameData(lone(part, tile, pad, iob), db); assert.deepEqual(r.unknown, []); return getBit(r.frames, r.frames.frameWords, fr, b); };
  assert.equal(bit('xc3s250ecp132-4', 'TIOIS_X3Y35', 'B4', 1, 542, 71), 1);
  assert.equal(bit('xc3s250ecp132-4', 'TIOIS_X3Y35', 'C4', 1, 542, 71), 0);
  assert.equal(bit('xc3s500efg320-4', 'RIBUFS_X35Y46', 'B18', 1, 521, 177), 0);
  assert.equal(bit('xc3s500efg320-4', 'RIOIS_X35Y45', 'C17', 1, 521, 177), 1);
  // the left column's top clock row of the XC3S250E (bit 3): no pad sets or clears it any more (B3's R:REVINV held it)
  const db = loadDb('xc3s250ecp132-4');
  assert.deepEqual(Object.values(db.padFeats.B3).flat().filter(s => /^!?1[0-3],3$/.test(s)), []);
});

// #897: bits of a pad's input register held by a neighbour's features (#96 / #759 solved them from designs that registered
// the two pads together, or against a database that lacked the bit): A3's set / reset and second flip-flop bits on B3,
// C9's delay bit on E9, B9's, C15's and D13's second flip-flop bits on D9, A16 and E12; measured with ISE, an IDDR2 on
// one pad alone (gen-padalone.mjs, ana-padalone.mjs: packages/silinx-fpga/research/s3e-bitstream, measured/fix-897-owners.json)
test('I/O registers in the measured database: each bit of a lone IDDR2 its own pad\'s, as ISE sets it (#897)', () => {
  // the IOB of ISE's IDDR2 (R and S, both flip-flops: map writes ISR_USED and IREV_USED either way), or a plain register
  // with a set / reset (#96's designs)
  const IDDR2 = 'ICEINV::ICE ICLK1INV::ICLK1 ICLK2INV::ICLK2_B IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFF1:u_i/FF0:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFF2:u_i/FF1:#FF IFF2_INIT_ATTR::INIT0 IFF2_SR_ATTR::SRLOW IFFATTRBOX::SYNC IFFDELMUX::0 IFFDMUX::1 IOATTRBOX::LVCMOS25 IREV_USED::0 ISR_USED::0 PRE_DELAY_MUX::0 REVINV::REV SRINV::SR IFD_DELAY:d.IFD_DELAY: INBUF:d_IBUF: PAD:d:';
  const SR = 'ICEINV::ICE ICLK1INV::ICLK1 IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFF1:r:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFFATTRBOX::SYNC IFFDELMUX::0 IFFDMUX::1 IOATTRBOX::LVCMOS25 ISR_USED::0 PRE_DELAY_MUX::0 SRINV::SR IFD_DELAY:d.IFD_DELAY: INBUF:d_IBUF: PAD:d:';
  const bits = (part, tile, pad, cfg, list) => {
    const r = frameData(parseXdl(`design "t" ${part} v3.2 , cfg "";\ninst "d" "IBUF",placed ${tile} ${pad} ,\n  cfg " ${cfg} "\n  ;\n`), loadDb(part));
    assert.deepEqual(r.unknown, [], `${part} ${pad}`);
    return list.map(b => getBit(r.frames, r.frames.frameWords, ...b.split(',').map(Number)));
  };
  for (const [part, row, fr] of [['xc3s500efg320-4', 47, 45], ['xc3s1200efg320-4', 61, 46]]) {
    const at = [`${fr},29`, `${fr},30`];
    // as ISE sets them: A3's register both, B3's neither; a set / reset alone only the first
    assert.deepEqual(bits(part, `TIBUFS_X2Y${row}`, 'A3', IDDR2, at), [1, 1], `${part} A3`);
    assert.deepEqual(bits(part, `TIOIS_X1Y${row}`, 'B3', IDDR2, at), [0, 0], `${part} B3`);
    assert.deepEqual(bits(part, `TIBUFS_X2Y${row}`, 'A3', SR, at), [1, 0], `${part} A3, a set / reset`);
    const f = loadDb(part).padFeats;
    assert.deepEqual([f.A3['R:ISR_USED:0'], f.A3['R:IFF2:#FF'], f.B3['R:IREV_USED:0']], [[at[0]], [at[1]], []], part);
  }
  // [part, the pad that sets the bit (its tile), its neighbour that held it (its tile), the bit]: ISE's bitgen on an
  // IDDR2 alone on each
  for (const [part, own, ownTile, other, otherTile, b] of [
    ['xc3s1200efg320-4', 'C9', 'TIOIS_X22Y61', 'E9', 'TIOIS_X20Y61', '354,11'],
    ['xc3s1200efg320-4', 'B9', 'TIBUFS_X23Y61', 'D9', 'TIOIS_X22Y61', '369,49'],
    ['xc3s1200efg320-4', 'C15', 'TIBUFS_X46Y61', 'A16', 'TIOIS_X45Y61', '730,30'],
    ['xc3s500efg320-4', 'C9', 'TIOIS_X16Y47', 'E9', 'TIOIS_X14Y47', '239,11'],
    ['xc3s500efg320-4', 'B9', 'TIBUFS_X17Y47', 'D9', 'TIOIS_X16Y47', '254,49'],
    ['xc3s500efg320-4', 'C15', 'TIBUFS_X34Y47', 'A16', 'TIOIS_X33Y47', '501,30'],
    ['xc3s500efg320-4', 'D13', 'TIBUFS_X27Y47', 'E12', 'TIOIS_X26Y47', '444,30'],
  ]) assert.deepEqual([bits(part, ownTile, own, IDDR2, [b])[0], bits(part, otherTile, other, IDDR2, [b])[0]], [1, 0], `${part} ${own} / ${other} ${b}`);
});

// #751: #44 / #97 solved the input delays from designs where every pad had an input (all registered, or all direct), so a
// bit of one pad's delay could go to its neighbour's; measured with ISE with each pad used on its own (gen-paddly.mjs,
// gen-pairdly.mjs, ana-paddly.mjs: packages/silinx-fpga/research/s3e-bitstream, measured/fix-28-pad-delays.json)
test('I/O registers in the measured database: each bit of an input delay its own pad\'s, as ISE sets it with the pad used alone (#751)', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../research/s3e-bitstream/pad-delays.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `pad-delays.mjs: ${r.stdout}${r.stderr}`);
  // a lone input register (IFD_DELAY_VALUE dly) on a pad, its neighbours unused
  const lone = (part, tile, pad, dly = 'DLY3') => parseXdl(`design "t" ${part} v3.2 , cfg "";
inst "d" "IBUF",placed ${tile} ${pad} ,
  cfg " ICLK1INV::ICLK1 IDDRIN_MUX::2 IFD_DELAY_VALUE::${dly} IFF1:r:#FF IFF1_INIT_ATTR::INIT0 IFFDELMUX::0 IFFDMUX::1 IOATTRBOX::LVCMOS25 PRE_DELAY_MUX::0 IFD_DELAY:d.IFD_DELAY: INBUF:d_IBUF: PAD:d: "
  ;
net "q" ,
  outpin "d" IQ1 ,
  ;
`);
  const bits = (part, tile, pad, list, dly) => { const r = frameData(lone(part, tile, pad, dly), loadDb(part)); assert.deepEqual(r.unknown, []); return list.map(b => getBit(r.frames, r.frames.frameWords, ...b.split(',').map(Number))); };
  // the issue's five bits, as ISE sets them (measured: a lone register on each pad, every pair of the two pads' kinds and
  // delays): each the input-only pad's next to the I/O tile, not its neighbour's. XC3S500E: 46,31 is A3's (its register,
  // any delay), not B3's; 538,356 D18's (IFD_DELAY_VALUE 1-3), not E17's, whose is 538,420
  assert.deepEqual(bits('xc3s500efg320-4', 'TIOIS_X1Y47', 'B3', ['46,31']), [0]);
  assert.deepEqual(bits('xc3s500efg320-4', 'TIBUFS_X2Y47', 'A3', ['46,31']), [1]);
  assert.deepEqual(bits('xc3s500efg320-4', 'TIBUFS_X2Y47', 'A3', ['46,31'], 'DLY0'), [1]);
  assert.deepEqual(bits('xc3s500efg320-4', 'RIOIS_X35Y41', 'E17', ['538,356', '538,420']), [0, 1]);
  assert.deepEqual(bits('xc3s500efg320-4', 'RIBUFS_X35Y42', 'D18', ['538,356', '538,420']), [1, 0]);
  assert.deepEqual(bits('xc3s500efg320-4', 'RIBUFS_X35Y42', 'D18', ['538,356', '538,343'], 'DLY1'), [1, 1]);
  assert.deepEqual(bits('xc3s500efg320-4', 'RIBUFS_X35Y42', 'D18', ['538,356', '538,343'], 'DLY4'), [0, 1]);
  // XC3S1200E: 47,31 A3's; 767,740 E17's (above F14's tile), 767,996 E18's (above G13's)
  assert.deepEqual(bits('xc3s1200efg320-4', 'TIOIS_X1Y61', 'B3', ['47,31']), [0]);
  assert.deepEqual(bits('xc3s1200efg320-4', 'TIBUFS_X2Y61', 'A3', ['47,31']), [1]);
  assert.deepEqual(bits('xc3s1200efg320-4', 'RIOIS_X47Y49', 'F14', ['767,740', '767,806']), [0, 1]);
  assert.deepEqual(bits('xc3s1200efg320-4', 'RIBUFS_X47Y50', 'E17', ['767,740', '767,806']), [1, 0]);
  assert.deepEqual(bits('xc3s1200efg320-4', 'RIOIS_X47Y45', 'G13', ['767,996', '767,1062']), [0, 1]);
  assert.deepEqual(bits('xc3s1200efg320-4', 'RIBUFS_BRK_X47Y46', 'E18', ['767,996', '767,1062']), [1, 0]);
  // no bit in the delays of two pads (a bit two pads set would be one of them only, as ISE sets it)
  for (const part of ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4']) {
    const owner = new Map();
    for (const [pad, f] of Object.entries(loadDb(part).padFeats)) for (const [k, v] of Object.entries(f)) if (/^(IFD|IBUF):/.test(k)) for (const b of v) {
      assert.ok(!owner.has(b) || owner.get(b) === pad, `${part} ${b}: ${owner.get(b)} and ${pad}`);
      owner.set(b, pad);
    }
  }
});
