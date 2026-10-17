// core/fpga/bitgen.js: XDL -> features -> frame data -> .bit, with a small hand-made database and
// with the measured database (research/s3e-bitstream/db), without ISE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseXdl } from '../core/xdl.js';
import { makeDb, tileOf, tileBase, designFeatures, pipFeatures, frameData, bitgen, dcmPeriodFeatures, siteKind, padsFromDevice, shiftBit, featureBits, knownRouting, lutBits, bramBits } from '../core/fpga/bitgen.js';
import { XC3S250E, readBit, getBit, diffFrames } from '../core/fpga/bitstream.js';
import { withDcmClkinGclk } from '../research/s3e-bitstream/db.mjs';

const FW = XC3S250E.frameWords;
// a database for two tiles: CLB_X1Y1 (frames 10-28, bits 100-163) and BIOIS_X1Y0
const tinyParts = () => ({
  layout: { frameWords: 73, frames: 578, brkRows: [9], cols: { 1: 10, 2: 40 }, rows: { 1: 100, 0: 2256 }, defaults: [[3, 37]] },
  lut: { colFrame: { 0: 10, 1: 13 }, rowBit: { 0: 148, 1: 116 } },
  pads: { P11: ['BIOIS_X1Y0', 2] },   // (from the device: padsFromDevice)
  tiles: {
    padFeatures: { P11: { 'I:LVCMOS33': ['500,2300'] } },
    types: {
      CENTER_SMALL: { features: { 'X0->OMUX0': ['6,28'], 'OMUX0->E2BEG0': ['7,1', '!8,2'], 'BX1->BY3': ['10,31'], 'BY3->BX1': [], 'SLICE2:CLKINV:CLK_B': ['5,26'], 'SLICE2:USED': [] } },
      CENTER_SMALL_BRK: { sameAs: 'CENTER_SMALL', features: { 'X0->OMUX0': ['6,29'] } },
      BIOIS: { features: { 'IOB2:IOATTRBOX:LVCMOS33': ['3,69', '5,70@1,0'] } },
    },
  },
});
const tiny = () => makeDb(tinyParts());
const design = `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "s" "SLICEL",placed CLB_X1Y1 SLICE_X1Y0 ,
  cfg " F:s_f:#LUT:D=A1 CLKINV::CLK_B XORF:a\\:b: FFX::#OFF _NO_USER_LOGIC:: "
  ;
inst "p" "IBUF",placed BIOIS_X1Y0 P11 ,
  cfg " IOATTRBOX::LVCMOS33 PULL::PULLUP "
  ;
net "n" ,
  outpin "s" X ,
  inpin "p" O1 ,
  pip CLB_X1Y1 X0 -> OMUX0 ,
  pip CLB_X1Y1 OMUX0 -> E2BEG0 ,
  ;
net "nopins" ,
  pip CLB_X1Y1 X0 -> OMUX9 ,
  ;
`;

test('tiles: type from the name, start from the layout', () => {
  const db = tiny();
  assert.deepEqual(tileOf('CLB_X1Y1', db), { name: 'CLB_X1Y1', type: 'CENTER_SMALL', x: 1, y: 1 });
  assert.equal(tileOf('CLB_X1Y9', db).type, 'CENTER_SMALL_BRK');
  assert.deepEqual(tileBase(tileOf('CLB_X1Y1', db), db), { frame: 10, bit: 100 });
  assert.equal(tileBase(tileOf('CLB_X5Y1', db), db), null);
  // a tile type that shares another's features keeps its own first
  assert.deepEqual(db.types.CENTER_SMALL_BRK.feats.get('X0->OMUX0'), ['6,29']);
  assert.deepEqual(db.types.CENTER_SMALL_BRK.feats.get('OMUX0->E2BEG0'), ['7,1', '!8,2']);
});

test('tile types share a switch box at an offset of frames and bits', () => {
  assert.equal(shiftBit('6,28', 2, 0), '8,28');
  assert.equal(shiftBit('!8,2', 0, 16), '!8,18');
  assert.equal(shiftBit('5,70@1,0', 2, 16), '7,86@1,0');
  const db = makeDb({
    layout: { cols: { 0: 3 }, rows: { 5: 100 } },
    lut: {},
    tiles: { types: {
      CENTER_SMALL: { features: { 'X0->OMUX0': ['6,28'], 'OMUX0->E2BEG0': ['7,1', '!8,2'] } },
      LIOIS: { sameAs: 'CENTER_SMALL', shift: [2, 0], rename: [['IOIS_VCC_WIRE', 'VCC_PINWIRE'], ['IOIS_', '']], features: { 'IOIS_Y0->OMUX0': ['1,1'] } },
      TIOIS: { sameAs: 'CENTER_SMALL', shift: [0, 16], features: { 'X0->OMUX0': ['6,99'] } },
    } },
  });
  assert.deepEqual(db.types.LIOIS.feats.get('OMUX0->E2BEG0'), ['9,1', '!10,2']);
  assert.deepEqual(db.types.LIOIS.feats.get('IOIS_Y0->OMUX0'), ['1,1']);
  // the type's own wire names: IOIS_X0 is the CLB's X0 (own measurements first)
  assert.deepEqual(featureBits(db.types.LIOIS, 'IOIS_X0->OMUX0'), ['8,28']);
  assert.deepEqual(featureBits(db.types.LIOIS, 'IOIS_Y0->OMUX0'), ['1,1']);
  assert.equal(featureBits(db.types.LIOIS, 'IOIS_X1->OMUX0'), undefined);
  assert.equal(featureBits(db.types.TIOIS, 'IOIS_X0->OMUX0'), undefined);   // no renaming there
  // a type whose PIPs set no bits (the terminal tiles): any PIP is known, other features are not
  const term = makeDb({ layout: {}, lut: {}, tiles: { types: { BTERM: { pipsWithoutBits: true, features: { 'X:Y:Z': ['1,1'] } } } } }).types.BTERM;
  assert.deepEqual(featureBits(term, 'BTERM_S2BEG7->BTERM_N2MID7'), []);
  assert.deepEqual(featureBits(term, 'X:Y:Z'), ['1,1']);
  assert.equal(featureBits(term, 'SLICE0:USED'), undefined);
  // the type's own measurement first; the shared type is unchanged
  assert.deepEqual(db.types.TIOIS.feats.get('X0->OMUX0'), ['6,99']);
  assert.deepEqual(db.types.TIOIS.feats.get('OMUX0->E2BEG0'), ['7,17', '!8,18']);
  assert.deepEqual(db.types.CENTER_SMALL.feats.get('OMUX0->E2BEG0'), ['7,1', '!8,2']);
  // in the frame data: LIOIS_X0Y5 starts at frame 3, bit 100
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
net "n" ,
  outpin "a" X ,
  inpin "b" F1 ,
  pip LIOIS_X0Y5 X0 -> OMUX0 ,
  ;`);
  const { frames, unknown } = frameData(d, db);
  assert.deepEqual(unknown, []);
  assert.equal(getBit(frames, FW, 3 + 8, 128), 1);
});

test('a SLICEM as RAM or shift register: the LUT feature says which, the initial value in hexadecimal', () => {
  assert.deepEqual(lutBits('D=0x8001'), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(lutBits('D=A1'), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  const db = tiny();
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "m" "SLICEM",placed CLB_X1Y1 SLICE_X0Y0 ,
  cfg " F:m_f:#RAM:D=0x00FF G:m_g:#RAM:D=0x1234 G_ATTR::SHIFT_REG F_ATTR::#OFF FXMUX::F XUSED::0 "
  ;`);
  const { feats, luts } = designFeatures(d, db);
  const names = feats.map(f => f.feature);
  assert.ok(names.includes('SLICE0:F:#RAM') && names.includes('SLICE0:G:#RAM:SHIFT_REG'));
  assert.deepEqual(luts.find(l => l.lut === 'F').bits, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('an I/O pad: drive, slew and pull are the pad\'s own features, against DRIVE 12, SLOW, no pull', () => {
  const db = tiny();
  db.tiles.padDriveDefault = { LVCMOS15: '8' };
  db.pads.M5 = ['BIOIS_X1Y0', 0];
  const io = cfg => designFeatures(parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "p" "IOB",placed BIOIS_X1Y0 M5 ,
  cfg " ${cfg} OUTBUF:p_ob: PAD:p: "
  ;`), db).feats.filter(f => f.tile === '@M5').map(f => f.feature);
  assert.deepEqual(io('IOATTRBOX::LVCMOS33 DRIVEATTRBOX::12 SLEW::SLOW'), ['O:LVCMOS33']);
  assert.deepEqual(io('IOATTRBOX::LVCMOS33 DRIVEATTRBOX::8 SLEW::FAST PULL::PULLUP'), ['O:LVCMOS33', 'O:DRIVE:8', 'O:SLEW:FAST', 'O:PULL:PULLUP']);
  assert.deepEqual(io('IOATTRBOX::LVCMOS15 DRIVEATTRBOX::8 SLEW::SLOW'), ['O:LVCMOS15']);
  // the I/O site's own settings of these are not features of the tile
  const tileFeats = designFeatures(parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "p" "IOB",placed BIOIS_X1Y0 M5 ,
  cfg " IOATTRBOX::LVCMOS33 DRIVEATTRBOX::8 SLEW::FAST PULL::PULLUP OUTBUF:p_ob: "
  ;`), db).feats.filter(f => f.tile === 'BIOIS_X1Y0').map(f => f.feature);
  assert.ok(!tileFeats.some(f => /DRIVE|SLEW|PULL/.test(f)));
  // an I/O tile type whose site settings have their bits in the pad features
  const t = makeDb({ layout: {}, lut: {}, tiles: { types: { BIOIS: { emptyFeatures: '^IOB\\d:(USED|PAD:)', features: {} } } } }).types.BIOIS;
  assert.deepEqual(featureBits(t, 'IOB1:PAD:'), []);
  assert.equal(featureBits(t, 'IOB1:IFF1:#FF'), undefined);
});

test('block RAM contents: INIT_xx / INITP_xx -> memory bits -> their places in the frame data', () => {
  const zeros = '0'.repeat(64);
  const cfg = [{ attr: 'INIT_00', value: zeros.slice(1) + '9' }, { attr: 'INIT_0a', value: '8' + zeros.slice(1) }, { attr: 'INITP_01', value: zeros.slice(1) + '1' }, { attr: 'WRITEMODEA', value: 'WRITE_FIRST' }];
  assert.deepEqual(bramBits(cfg), [0, 3, 2560 + 255, 16384 + 256]);
  // a database whose memory bit i is at frame colFrame + (i % 4), bit rowBit - (i >> 2)
  const N = 18432;
  const db = makeDb({ ...tinyParts(), bram: { colFrame: { 1: 400 }, rowBit: { 2: 2000 }, inverted: false, df: Array.from({ length: N }, (_, i) => i % 4), db: Array.from({ length: N }, (_, i) => -(i >> 2)) } });
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "r" "RAMB16",placed BRAMSITE2_X22Y14 RAMB16_X1Y2 ,
  cfg " INIT_00::${zeros.slice(1)}9 "
  ;`);
  const { frames, unknown } = frameData(d, db);
  assert.equal(getBit(frames, FW, 400, 2000), 1);
  assert.equal(getBit(frames, FW, 403, 2000), 1);
  assert.equal(getBit(frames, FW, 401, 2000), 0);
  // the contents are not features of the tile
  assert.ok(!unknown.some(u => /INIT_00/.test(u.feature)));
  // the output latch values: one feature per bit set, by port width; the enable and write-enable
  // pins of an unused port count as not inverted
  const f = designFeatures(parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "r" "RAMB16",placed BRAMSITE2_X22Y14 RAMB16_X1Y2 ,
  cfg " PORTA_ATTR::2048X9 INIT_A::105 SRVAL_A::000 ENAINV::ENA_B WEAINV::WEA PORTB_ATTR::#OFF ENBINV::#OFF "
  ;`), db).feats.map(x => x.feature);
  assert.deepEqual(f.filter(x => /@/.test(x)), ['RAMB16:INIT_A@2048X9:0', 'RAMB16:INIT_A@2048X9:2', 'RAMB16:INIT_A@2048X9:8']);
  assert.ok(f.includes('RAMB16:ENBINV:ENB') && f.includes('RAMB16:WEBINV:WEB') && f.includes('RAMB16:ENAINV:ENA_B'));
  assert.ok(!f.includes('RAMB16:ENAINV:ENA') && !f.some(x => /SRVAL_A/.test(x)));
});

test('a SLICEM site holding a SLICEM instance has a feature of its own', () => {
  const db = tiny();
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "m" "SLICEM",placed CLB_X1Y1 SLICE_X0Y0 ,
  cfg " _NO_USER_LOGIC:: _GND_SOURCE::Y "
  ;
inst "l" "SLICEL",placed CLB_X1Y1 SLICE_X0Y1 ,
  cfg " F:l_f:#LUT:D=A1 FXMUX::F XUSED::0 "
  ;`);
  const names = designFeatures(d, db).feats.map(f => f.feature);
  assert.ok(names.includes('SLICE0:SLICEM'));
  assert.ok(names.includes('SLICE0:_GND_SOURCE:Y'));
  assert.ok(names.includes('SLICE1:USED'));
  assert.ok(!names.includes('SLICE1:SLICEM'));
});

test('XDL configuration strings keep escaped colons in names', () => {
  const d = parseXdl(design);
  assert.deepEqual(d.insts[0].cfg.find(c => c.attr === 'XORF'), { attr: 'XORF', name: 'a:b', value: '' });
});

test('features: site settings, LUTs, PIPs only on nets with pins', () => {
  const db = tiny();
  const d = parseXdl(design);
  assert.equal(siteKind(d.insts[0], db), 'SLICE2');
  assert.equal(siteKind(d.insts[1], db), 'IOB2');
  const { feats, luts } = designFeatures(d, db);
  const names = feats.map(f => f.feature);
  assert.ok(names.includes('SLICE2:CLKINV:CLK_B'));
  assert.ok(names.includes('SLICE2:XORF:'));
  assert.ok(names.includes('SLICE2:USED'));
  assert.ok(!names.some(n => /FFX|_NO_USER/.test(n)));
  assert.ok(names.includes('X0->OMUX0'));
  assert.ok(!names.includes('X0->OMUX9'));
  // LUT F with its 16 bits, LUT G unused: the constant 0
  assert.deepEqual(luts.map(l => l.lut), ['G', 'F']);
  assert.deepEqual(luts[1].bits, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
});

test('bidirectional PIPs take the direction away from the driven wire', () => {
  const net = { pips: [{ tile: 'T', from: 'W2MID4', dir: '->', to: 'BY3' }, { tile: 'T', from: 'BX1', dir: '=-', to: 'BY3' }, { tile: 'T', from: 'BX0', dir: '=-', to: 'BY1' }] };
  assert.deepEqual(pipFeatures(net), ['W2MID4->BY3', 'BY3->BX1', 'BX0=-BY1']);
});

test('frame data: defaults, features at tile offsets, LUTs stored inverted, unknown features listed', () => {
  const db = tiny();
  const { frames, unknown } = frameData(parseXdl(design), db);
  assert.equal(getBit(frames, FW, 3, 37), 1);              // default bit
  assert.equal(getBit(frames, FW, 16, 128), 1);            // X0->OMUX0 at 6,28
  assert.equal(getBit(frames, FW, 17, 101), 1);            // OMUX0->E2BEG0 7,1 (and 8,2 cleared)
  assert.equal(getBit(frames, FW, 15, 126), 1);            // CLKINV:CLK_B 5,26
  assert.equal(getBit(frames, FW, 13, 2256 + 69), 1);      // IOB2 LVCMOS33 at the I/O tile
  assert.equal(getBit(frames, FW, 45, 2256 + 70), 1);      // and in the column of the tile at x + 1
  // LUT F of SLICE_X1Y0: frame 13 from bit 148, address order, inverted (D=A1: even addresses 1)
  for (let a = 0; a < 16; a++) assert.equal(getBit(frames, FW, 13, 148 + a), a & 1 ? 0 : 1);
  // LUT G (unused): the 16 bits before, all 1
  for (let a = 0; a < 16; a++) assert.equal(getBit(frames, FW, 13, 132 + a), 1);
  assert.deepEqual(unknown.map(u => u.feature).sort(), ['I:PULL:PULLUP', 'IOB2:USED', 'SLICE2:F:#LUT', 'SLICE2:FXMUX:#OFF', 'SLICE2:XORF:'].sort());
  // the pad's own setting (absolute bits)
  assert.equal(getBit(frames, FW, 500, 2300), 1);
});

test('bitgen: a complete .bit file whose frame data is the design', () => {
  const db = tiny();
  const { bytes } = bitgen(design, db, { name: 't.ncd', date: '2026/10/10', time: '10:00:00', crc: false });
  const r = readBit(bytes);
  assert.equal(r.header.a, 't.ncd');
  assert.deepEqual(diffFrames(frameData(parseXdl(design), db).frames, r.frames), []);
});

// the measured database
const dbDir = new URL('../research/s3e-bitstream/db/', import.meta.url);
const measured = () => {
  const read = f => JSON.parse(fs.readFileSync(new URL(f, dbDir), 'utf8'));
  // (with the DCM settings that follow from the routing: DCM:CLKIN:GCLK, DCM:DFS:OFF, as loadDb adds them)
  return makeDb({ layout: read('xc3s250e-layout.json'), lut: read('xc3s250e-lut.json').lutF, tiles: withDcmClkinGclk(read('s3e-tiles.json')) });
};

test('a DCM\'s input period: its frequency ranges as measured (stage F, #46)', () => {
  // [period, CLKFX_DIVIDE, CLKFX_MULTIPLY, CLKIN_DIVIDE_BY_2] -> features, every case measured with ISE
  // (ISE truncates the period to whole nanoseconds, then doubles it with CLKIN_DIVIDE_BY_2)
  const f = (p, d, m = '3', d2 = false) => dcmPeriodFeatures(p, d, m, d2);
  assert.deepEqual(f('20.0000000000000000', '2'), []);
  assert.deepEqual(f('24.9', '2'), []);
  assert.deepEqual(f('24.999', '2'), [], '24 ns');
  assert.deepEqual(f('25.0', '2'), ['DCM:CLKIN:LOW']);
  assert.deepEqual(f('20.0', '30'), [], 'CLKFX 200 ns');
  assert.deepEqual(f('20.4', '30'), [], '20 ns: CLKFX 200 ns');
  assert.deepEqual(f('20.99', '30'), [], '20 ns: CLKFX 200 ns');
  assert.deepEqual(f('21.0', '30'), ['DCM:CLKFX_IN:LOW'], 'CLKFX 210 ns');
  assert.deepEqual(f('20.0', '31'), ['DCM:CLKFX_IN:LOW'], 'CLKFX 206.7 ns');
  assert.deepEqual(f('20.0', '31', '7'), [], 'CLKFX 88.6 ns');
  assert.deepEqual(f('20.0', '32', '4'), [], 'CLKFX 160 ns');
  assert.deepEqual(f('38.4', '16'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], '38 ns: CLKFX 202.7 ns');
  assert.deepEqual(f('38.05', '16'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], '38 ns: CLKFX 202.7 ns');
  assert.deepEqual(f('37.8', '16'), ['DCM:CLKIN:LOW'], '37 ns: CLKFX 197.3 ns');
  assert.deepEqual(f('14.1', '29', '2'), ['DCM:CLKFX_IN:LOW'], '14 ns: CLKFX 203 ns');
  assert.deepEqual(f('25.9', '8', '1'), ['DCM:CLKIN:LOW'], '25 ns: CLKFX 200 ns');
  assert.deepEqual(f('152.0', '4'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], 'CLKFX 202.7 ns');
  assert.deepEqual(f('150.9', '4'), ['DCM:CLKIN:LOW'], '150 ns: CLKFX 200 ns');
  assert.deepEqual(f('150.0', '6'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], 'CLKFX 300 ns (x 3 / 6, not reduced)');
  // CLKIN under 5 MHz
  assert.deepEqual(f('200.0', '2'), ['DCM:CLKIN:LOW'], 'CLKIN 5 MHz, CLKFX 7.5');
  assert.deepEqual(f('200.99', '1', '4'), ['DCM:CLKIN:LOW'], '200 ns');
  assert.deepEqual(f('201', '1', '4'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW']);
  assert.deepEqual(f('300.0', '2'), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], 'CLKIN 3.33 MHz');
  assert.deepEqual(f('1000.0', undefined), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW']);
  // CLKIN_DIVIDE_BY_2: the truncated period doubled
  assert.deepEqual(f('12.9', '1', '2', true), [], '24 ns');
  assert.deepEqual(f('13.0', '1', '2', true), ['DCM:CLKIN:LOW'], '26 ns');
  assert.deepEqual(f('15.0', '1', '2', true), ['DCM:CLKIN:LOW'], '30 ns');
  assert.deepEqual(f('10.9', '10', '1', true), [], '20 ns: CLKFX 200 ns');
  assert.deepEqual(f('11.0', '10', '1', true), ['DCM:CLKFX_IN:LOW'], '22 ns: CLKFX 220 ns');
  assert.deepEqual(f('20.0', '16', '3', true), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], '40 ns: CLKFX 213 ns');
  assert.deepEqual(f('100.9', '1', '4', true), ['DCM:CLKIN:LOW'], '200 ns');
  assert.deepEqual(f('101', '1', '4', true), ['DCM:CLKIN:LOW', 'DCM:CLKFX_IN:LOW'], '202 ns');
  // no period: neither range, whatever the factors
  assert.deepEqual(f(undefined, '4'), []);
  assert.deepEqual(f(undefined, '32'), []);
  assert.deepEqual(f(undefined, '31', '2'), []);
  assert.deepEqual(f('#OFF', '32', '1'), []);
});

test('a DCM: its period ranges, an enable per clock output used, STARTUP_WAIT in the COR register', () => {
  const dcm = (cfg, outs) => `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "u" "DCM",placed DCM_BL_CENTER_X13Y1 DCM_X0Y0 ,
  cfg " CLKFX_DIVIDE::4 CLKFX_MULTIPLY::2 X_CLKIN_PERIOD::40.0000000000000000 ${cfg} "
  ;
${outs.map(p => `net "n_${p}" ,
  outpin "u" ${p} ,
  ;
`).join('')}`;
  const names = d => designFeatures(parseXdl(d), measured()).feats.filter(f => f.tile === 'DCM_BL_CENTER_X13Y1').map(f => f.feature);
  const n = names(dcm('', ['CLK0', 'CLKFX', 'LOCKED']));
  for (const f of ['DCM:USED', 'DCM:CLKIN:LOW', 'DCM:OUT:CLK0', 'DCM:OUT:CLKFX', 'DCM:OUT:LOCKED']) assert.ok(n.includes(f), f);
  assert.ok(!n.some(f => /X_CLKIN_PERIOD|CLKFX_IN|OUT:CLK2X/.test(f)), n.join());
  const db = measured();
  const r = bitgen(dcm('STARTUP_WAIT::STARTUP_WAIT', ['CLK0']), db, { crc: false, startupClk: 'JtagClk' });
  assert.deepEqual(r.unknown, []);
  const b = readBit(r.bytes);
  assert.equal(b.cor, 0x2001211d);
  // the bottom-left DCM's bits: STARTUP_WAIT (0,-26), CLK0's enable (0,-10), the input period (-39,-58 / -78)
  const base = tileBase(tileOf('DCM_BL_CENTER_X13Y1', db), db);
  for (const [df, db_] of [[0, -26], [0, -10], [-39, -58], [-39, -78]]) assert.equal(getBit(b.frames, FW, base.frame + df, base.bit + db_), 1, `${df},${db_}`);
  assert.equal(readBit(bitgen(dcm('', ['CLK0']), db, { crc: false }).bytes).cor, 0x200031e5);
  // ISE's bitgen waits only for the DCMs at the sites DCM_X0Y0 … X1Y1 (an XC3S1200E's DCM_X2Y0 not)
  const x2 = bitgen(dcm('STARTUP_WAIT::STARTUP_WAIT', ['CLK0']).replace('DCM_X0Y0', 'DCM_X2Y0'), db, { crc: false });
  assert.equal(readBit(x2.bytes).cor, 0x200031e5);
  assert.equal(getBit(readBit(x2.bytes).frames, FW, base.frame, base.bit - 26), 1, 'the DCM\'s own STARTUP_WAIT bit');
});

test('a DCM whose CLKIN comes from a global clock buffer, a DCM whose CLKFX / CLKFX180 drive nothing: bits of DCM:USED cleared, as ISE\'s bitgen does, on every DCM (#47)', async () => {
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const db = loadDb('xc3s250ecp132-4');
  const dcm = (tile, site, from, drv = from.startsWith('GCLK') ? 'BUFGMUX' : 'IBUF') => `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "u" "DCM",placed ${tile} ${site} ,
  cfg " CLKFX_DIVIDE::1 CLKFX_MULTIPLY::4 "
  ;
inst "d" "${drv}",unplaced ,
  cfg " "
  ;
net "c" ,
  outpin "d" ${drv === 'BUFGMUX' ? 'O' : 'I'} ,
  inpin "u" CLKIN ,
  pip ${tile} ${from} -> DCM_CLKIN ,
  pip ${tile} DCM_CLKIN -> DCM_CLKIN_PINWIRE ,
  ;
`;
  // the bit: (0, 100) of the top-left DCM, its mirror image on the others (DCM:USED sets it)
  for (const [tile, site, from, gen, df, dbit] of [['DCM_TL_CENTER_X13Y34', 'DCM_X0Y1', 'GCLK4', 'S6A4', 0, 100], ['DCM_TR_CENTER_X14Y34', 'DCM_X1Y1', 'GCLK5', 'S6A4', 18, 100],
    ['DCM_BL_CENTER_X13Y1', 'DCM_X0Y0', 'GCLK4', 'S6A4', 0, -37], ['DCM_BR_CENTER_X14Y1', 'DCM_X1Y0', 'GCLK6', 'S6D4', 18, -37]]) {
    const g = parseXdl(dcm(tile, site, from));
    assert.ok(designFeatures(g, db).feats.some(f => f.tile === tile && f.feature === 'DCM:CLKIN:GCLK'), tile);
    const base = tileBase(tileOf(tile, db), db);
    const bitOf = d => { const r = frameData(d, db); assert.deepEqual(r.unknown, [], tile); return getBit(r.frames, FW, base.frame + df, base.bit + dbit); };
    assert.equal(bitOf(g), 0, `${tile}: CLKIN from ${from}`);
    // from a buffer through general routing: cleared too; from a pad (or the fabric): set
    assert.equal(bitOf(parseXdl(dcm(tile, site, gen, 'BUFGMUX'))), 0, `${tile}: CLKIN from a BUFGMUX through ${gen}`);
    const h = parseXdl(dcm(tile, site, gen));
    assert.ok(!designFeatures(h, db).feats.some(f => f.feature === 'DCM:CLKIN:GCLK'), tile);
    assert.equal(bitOf(h), 1, `${tile}: CLKIN from ${gen}`);
  }
  // CLKFX and CLKFX180 unused (the frequency synthesizer idle): three bits of DCM:USED cleared
  // (DCM:DFS:OFF, (-39, 7), (-39, 12), (-39, 43) of the top-left DCM); either used: set
  const tl = 'DCM_TL_CENTER_X13Y34', base = tileBase(tileOf(tl, db), db);
  const dfs = outs => {
    const x = `${dcm(tl, 'DCM_X0Y1', 'S6A4')}${outs.map(p => `net "n_${p}" ,\n  outpin "u" ${p} ,\n  ;\n`).join('')}`;
    const r = frameData(parseXdl(x), db);
    assert.deepEqual(r.unknown, []);
    return [[-39, 7], [-39, 12], [-39, 43]].map(([df, b]) => getBit(r.frames, FW, base.frame + df, base.bit + b));
  };
  assert.deepEqual(dfs(['CLK0', 'LOCKED']), [0, 0, 0]);
  assert.deepEqual(dfs(['CLK0', 'CLKFX']), [1, 1, 1]);
  assert.deepEqual(dfs(['CLKFX180']), [1, 1, 1]);
  // the XC3S1200E's side DCMs too (their mirror images)
  const big = loadDb('xc3s1200efg320-4');
  assert.deepEqual(['DCM_H_BL_CENTER', 'DCM_H_BR_CENTER', 'DCM_H_TL_CENTER', 'DCM_H_TR_CENTER'].map(t => featureBits(big.types[t], 'DCM:CLKIN:GCLK')), [['!18,100'], ['!0,100'], ['!18,-37'], ['!0,-37']]);
});

test('a global buffer of the left side: as a BUFG its settings and switches set only its input line\'s bit; a BUFGMUX\'s select one bit (#45)', () => {
  const db = measured();
  const xdl = sinv => `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "b" "BUFGMUX",placed CLKL_X0Y17 BUFGMUX_X0Y2 ,
  cfg " DISABLE_ATTR::LOW I0_USED::0 I1_USED::#OFF SINV::${sinv} GCLKMUX:b.GCLKMUX: GCLK_BUFFER:b: "
  ;
inst "XDL_DUMMY_CLKL_X0Y17_VCC_X0Y19" "VCC",placed CLKL_X0Y17 VCC_X0Y19 ,
  cfg " _NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT "
  ;
net "d" ,
  inpin "b" I0 ,
  pip CLKL_X0Y17 CLKL_UP_IOIS_F4_B3 -> CLKL_GCLK0 ,
  pip CLKL_X0Y17 CLKL_GCLK0 -> CLKL_GCLKIN00 ,
  ;
net "g" ,
  outpin "b" O ,
  pip CLKL_X0Y17 CLKL_GCLK_PWO0 -> CLKL_GCLKH_MAIN0 ,
  ;
net "v" vcc ,
  outpin "XDL_DUMMY_CLKL_X0Y17_VCC_X0Y19" VCCOUT ,
  inpin "b" S ,
  pip CLKL_X0Y17 CLKL_VCC_WIRE -> CLKL_SELDUB0 ,
  ;
`;
  const base = tileBase(tileOf('CLKL_X0Y17', db), db);
  const empty = readBit(bitgen(parseXdl('design "t" xc3s250ecp132-4 v3.2 , cfg "";\n'), db, { crc: false }).bytes).frames;
  const bits = sinv => {
    const r = bitgen(parseXdl(xdl(sinv)), db, { crc: false });
    assert.deepEqual(r.unknown, [], sinv);
    return diffFrames(empty, readBit(r.bytes).frames, FW).map(x => `${x.frame - base.frame},${x.bit - base.bit}`).sort();
  };
  // a BUFG (select inverted, I1 not used): only the switch from the fabric into line 0
  assert.deepEqual(bits('S_B'), ['1,-17']);
  // the select not inverted: one bit of its own
  assert.deepEqual(bits('S'), ['1,-17', '4,-20']);
});

test('a DCM with CLKIN_DIVIDE_BY_2: its bit on each of the four DCMs, the input period doubled (#46)', () => {
  const db = measured();
  // the bit of CLKIN_DIVIDE_BY_2 per DCM (measured on the four, the top-left one's mirrored)
  const want = { DCM_TL_CENTER_X13Y34: [0, 112], DCM_TR_CENTER_X14Y34: [18, 112], DCM_BL_CENTER_X13Y1: [0, -49], DCM_BR_CENTER_X14Y1: [18, -49] };
  const site = { DCM_TL_CENTER_X13Y34: 'DCM_X0Y1', DCM_TR_CENTER_X14Y34: 'DCM_X1Y1', DCM_BL_CENTER_X13Y1: 'DCM_X0Y0', DCM_BR_CENTER_X14Y1: 'DCM_X1Y0' };
  for (const [tile, [df, dbit]] of Object.entries(want)) {
    const xdl = div2 => `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "u" "DCM",placed ${tile} ${site[tile]} ,
  cfg " CLKFX_DIVIDE::1 CLKFX_MULTIPLY::2 DESKEW_ADJUST::0 X_CLKIN_PERIOD::12.9000000000000004 ${div2 ? 'CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2' : 'CLKIN_DIVIDE_BY_2::#OFF'} "
  ;
net "n" ,
  outpin "u" CLK0 ,
  ;
`;
    const feats = designFeatures(parseXdl(xdl(true)), db).feats.filter(f => f.tile === tile).map(f => f.feature);
    assert.ok(feats.includes('DCM:CLKIN_DIVIDE_BY_2:CLKIN_DIVIDE_BY_2'), tile);
    assert.ok(!feats.includes('DCM:CLKIN:LOW'), `${tile}: 12.9 ns doubled is 24 ns in whole nanoseconds`);
    const [on, off] = [true, false].map(d => bitgen(parseXdl(xdl(d)), db, { crc: false }));
    assert.deepEqual([on.unknown, off.unknown], [[], []]);
    const base = tileBase(tileOf(tile, db), db);
    const bit = r => getBit(readBit(r.bytes).frames, FW, base.frame + df, base.bit + dbit);
    assert.deepEqual([bit(on), bit(off)], [1, 0], tile);
    assert.equal(diffFrames(readBit(on.bytes).frames, readBit(off.bytes).frames, FW).length, 1, `${tile}: one bit`);
  }
});

test('measured database: a LUT and a slice setting where stage A and B found them', () => {
  const db = measured();
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "s" "SLICEL",placed CLB_X16Y24 SLICE_X31Y47 ,
  cfg " F:s_f:#LUT:D=(A1*A2*A3*A4) CLKINV::CLK_B "
  ;`);
  const { frames } = frameData(d, db);
  // LUT F of SLICE_X31Y47: frame 236, bits 736-751, inverted: only address 15 is 1 (stored 0)
  for (let a = 0; a < 16; a++) assert.equal(getBit(frames, FW, 236, 736 + a), a === 15 ? 0 : 1);
  // the clock inverter of an upper SLICEL: 2 frames after its LUT frame, at the LUT's first bit
  assert.equal(getBit(frames, FW, 238, 736), 1);
});

test('measured database: the routing switches of a route are known', () => {
  const db = measured();
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
net "n" ,
  outpin "a" X ,
  inpin "b" F2 ,
  pip CLB_X8Y24 X0 -> OMUX6 ,
  pip CLB_X8Y24 OMUX6 -> S2BEG2 ,
  pip CLB_X8Y24 F2_B0 -> F2_B_PINWIRE0 ,
  ;`);
  const { unknown } = frameData(d, db);
  assert.deepEqual(unknown, []);
});

test('measured database: the four carry PIPs of a CLB (COUT2 -> COUT_N1 included) set no bits', () => {
  // as the device names them (COUT0 -> CIN2, COUT1 -> CIN3 inside the CLB; COUT2 -> COUT_N1, COUT3 ->
  // COUT_N3 to the CLB above); COUT2 -> COUT_N1 was missing (Silinx-routed blinky: tiles whose only
  // unknown feature it was had no differing bit with ISE's bitgen)
  const db = measured();
  for (const p of ['COUT0->CIN2', 'COUT1->CIN3', 'COUT2->COUT_N1', 'COUT3->COUT_N3']) assert.deepEqual(db.types.CENTER_SMALL.feats.get(p), [], p);
  assert.equal(knownRouting(db).allowPip('CLB_X15Y9', 'COUT2', 'COUT_N1'), true);
});

test('knownRouting: the PIPs and GND sources a router may use so that every feature has its bits', () => {
  const db = makeDb({
    layout: { brkRows: [9], cols: { 1: 10 }, rows: { 1: 100 } }, lut: {},
    tiles: { types: { CENTER_SMALL: { features: {
      'X0->OMUX0': ['6,28'], 'BY3->BX1': [], 'COUT2->COUT_N1': [], 'W6END4->E2BEG4': [], 'E2MID3->LH6': [],
      'SLICE2:USED': [], 'SLICE2:_GND_SOURCE:Y': [], 'SLICE0:USED': ['1,50'],
    } } } },
  });
  const { allowPip, allowConstSource } = knownRouting(db);
  assert.equal(allowPip('CLB_X1Y1', 'X0', 'OMUX0'), true);
  assert.equal(allowPip('CLB_X1Y1', 'X0', 'OMUX1'), false);                 // not in the database
  assert.equal(allowPip('CLB_X2Y1', 'X0', 'OMUX0'), false);                 // the layout does not know the tile
  assert.equal(allowPip('CLB_X1Y9', 'X0', 'OMUX0'), false);                 // CENTER_SMALL_BRK: not in this database
  assert.equal(allowPip('CLB_X1Y1', 'BY3', 'BX1'), true);                   // no bits, a dedicated wire
  assert.equal(allowPip('CLB_X1Y1', 'COUT2', 'COUT_N1'), true);
  assert.equal(allowPip('CLB_X1Y1', 'W6END4', 'E2BEG4'), false);            // no bits into a general wire: not trusted
  assert.equal(allowPip('CLB_X1Y1', 'E2MID3', 'LH6'), false);
  assert.equal(allowPip('CLB_X1Y1', 'OMUX0', 'X0'), false);                 // the direction matters
  // GND sources: slices whose USED and _GND_SOURCE:Y are known; VCC sites always
  assert.equal(allowConstSource('gnd', { name: 'SLICE_X3Y2', tileName: 'CLB_X1Y1', type: 'SLICEL' }), true);    // SLICE2
  assert.equal(allowConstSource('gnd', { name: 'SLICE_X2Y2', tileName: 'CLB_X1Y1', type: 'SLICEM' }), false);   // SLICE0: no _GND_SOURCE:Y
  assert.equal(allowConstSource('vcc', { name: 'VCC_X1Y1', tileName: 'CLB_X1Y1', type: 'VCC' }), true);
});

test('padsFromDevice: the bonded I/O sites of the device, by their index among the I/O sites of the tile', () => {
  // a synthetic device in the form of core/fpga/device.js: an I/O tile with other sites first, an
  // unbonded pad, and an input-only pad; a CLB tile
  const device = {
    tileNames: ['TIOIS_X1Y35', 'CLB_X1Y1'],
    tileTemplate: [0, 1],
    templates: [{ sites: [{ type: 'VCC' }, { type: 'RESERVED_LL' }, { type: 'DIFFM' }, { type: 'DIFFS' }, { type: 'IOB' }, { type: 'IBUF' }] }, { sites: [{ type: 'SLICEM' }] }],
    tileSites: [[['VCC_X2Y37', 0], ['RLL_X1Y35', 0], ['A3', 1], ['B3', 1], ['NOPAD0', 2], ['C4', 1]], [['SLICE_X0Y0', 0]]],
    siteIndex: new Map([['VCC_X2Y37', [0, 0]], ['RLL_X1Y35', [0, 1]], ['A3', [0, 2]], ['B3', [0, 3]], ['NOPAD0', [0, 4]], ['C4', [0, 5]], ['SLICE_X0Y0', [1, 0]]]),
  };
  assert.deepEqual(padsFromDevice(device), { A3: ['TIOIS_X1Y35', 0], B3: ['TIOIS_X1Y35', 1], C4: ['TIOIS_X1Y35', 3] });
  // the committed database has no pad table (it comes from the user's device report)
  const tiles = JSON.parse(fs.readFileSync(new URL('../research/s3e-bitstream/db/s3e-tiles.json', import.meta.url), 'utf8'));
  assert.equal(tiles.pads, undefined);
});

// #18: an input pad whose buffer drives nothing. ISE's bitgen writes the pad without its input: of
// the input bits it keeps those of the 1.8 V standards less one, whatever the standard; the pull is
// written as usual. The expected bits are ISE's (XC3S250E-CP132, routed XDL with dangling inputs at
// B8, C11, G12 and A7; ISE's DRC: 0 errors, one PhysDesignRules:812 warning per pad, dangling pin).
test('an input pad that drives nothing: the bits ISE\'s bitgen writes (I:NOLOAD), with its pull; a connected input keeps its standard (#18)', async () => {
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const db = loadDb('xc3s250ecp132-4');
  const pad = (name, tile, site, cfg) => `inst "${name}" "IBUF",placed ${tile} ${site} ,\n  cfg " IDELMUX::1 IMUX::1 ${cfg} INBUF:${name}_IBUF: PAD:${name}: "\n  ;\n`;
  const xdl = `design "top" xc3s250ecp132-4 v3.2 , cfg "";\n${pad('clk', 'TIBUFS_X13Y35', 'B8', 'IOATTRBOX::LVCMOS33')}${pad('b1', 'TIOIS_X20Y35', 'C11', 'IOATTRBOX::LVCMOS33 PULL::PULLUP')}${pad('b0', 'RIBUFS_PCI_X27Y21', 'G12', 'IOATTRBOX::LVCMOS18')}${pad('b3', 'TIOIS_X12Y35', 'A7', 'IOATTRBOX::LVTTL PULL::PULLDOWN')}`;
  const { feats } = designFeatures(parseXdl(xdl), db);
  assert.deepEqual(feats.filter(f => f.tile[0] === '@').map(f => `${f.tile} ${f.feature}`), ['@B8 I:NOLOAD', '@C11 I:NOLOAD', '@C11 I:PULL:PULLUP', '@G12 I:NOLOAD', '@A7 I:NOLOAD', '@A7 I:PULL:PULLDOWN']);
  const { frames, unknown } = frameData(parseXdl(xdl), db);
  assert.deepEqual(unknown, []);
  const bits = list => list.split(' ').map(s => getBit(frames, db.format.frameWords, ...s.split(',').map(Number)));
  // ISE: set / clear
  assert.deepEqual(bits('177,14 178,11'), [1, 1]);
  assert.deepEqual(bits('177,11 178,14 178,15'), [0, 0, 0]);
  assert.deepEqual(bits('310,12 310,14 311,13 315,12 310,15'), [1, 1, 1, 1, 1]);
  assert.deepEqual(bits('313,12 314,13 316,14'), [0, 0, 0]);
  assert.deepEqual(bits('385,917 385,918'), [1, 1]);
  assert.deepEqual(bits('385,928 385,929 385,935'), [0, 0, 0]);
  assert.deepEqual(bits('188,12 189,13 192,14'), [1, 1, 1]);
  assert.deepEqual(bits('189,11 191,13 192,15 193,14'), [0, 0, 0, 0]);
  // the same pad with a load: its I/O standard as before
  const loaded = `${xdl}inst "s" "SLICEL",placed CLB_X1Y1 SLICE_X0Y0 ,\n  cfg " "\n  ;\nnet "clk_i" ,\n  outpin "clk" I ,\n  inpin "s" BX ,\n  ;\n`;
  assert.ok(designFeatures(parseXdl(loaded), db).feats.some(f => f.tile === '@B8' && f.feature === 'I:LVCMOS33'));
  const f2 = frameData(parseXdl(loaded), db).frames;
  assert.deepEqual('177,11 177,14 178,11 178,14 178,15'.split(' ').map(s => getBit(f2, db.format.frameWords, ...s.split(',').map(Number))), [1, 1, 1, 1, 1]);
});

test('the bit database: every pad of every package has I:NOLOAD, its 1.8 V input bits less one (#18)', async () => {
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  for (const part of ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4']) {
    const db = loadDb(part);
    const pads = Object.entries(db.padFeats);
    assert.ok(pads.length > 80, part);
    for (const [p, f] of pads) {
      assert.ok(f['I:NOLOAD'], `${part} ${p}`);
      assert.equal(f['I:NOLOAD'].length, f['I:LVCMOS18'].length - 1, `${part} ${p}`);
      assert.ok(f['I:NOLOAD'].every(b => f['I:LVCMOS18'].includes(b)), `${part} ${p}`);
    }
  }
});
