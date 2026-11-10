// The Digilent Adept USB programmer over WebUSB (core/adept.js, the browser edition's programmer)
// against a simulated board (test/fixtures/adept-sim.js: the Adept firmware and a JTAG chain of a
// Spartan-3E and a Platform Flash): the chain scanned, a bitstream configured, the errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanAdept, programAdept, byterev, bitHeader, Adept, Djtg, Chain, JtagSeq, RTI_PAIRS, DR_TDI_BITS } from '../core/adept.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';

// a .bit: a header, dummy words, the sync word, then the configuration
function fakeBit(n = 4000, part = '3s250ecp132') {
  const field = (k, v) => [k.charCodeAt(0), 0, v.length + 1, ...[...v].map(c => c.charCodeAt(0)), 0];
  const head = Uint8Array.from([0, 9, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0, 0, 1, ...field('a', 'top.ncd;UserID=0xFFFFFFFF'), ...field('b', part),
    ...field('c', '2026/10/12'), ...field('d', '14:05:00'), 0x65, 0, 0, 0x0f, 0xb0]);
  const body = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
  const bit = new Uint8Array(head.length + 8 + 4 + n);
  bit.set(head); bit.fill(0xff, head.length, head.length + 8);
  bit.set([0xaa, 0x99, 0x55, 0x66], head.length + 8);
  bit.set(body, head.length + 12);
  return { bit, sync: head.length + 8 };
}

test('byterev reverses the bits of each byte', () => {
  assert.deepEqual([...byterev(new Uint8Array([0x01, 0x80, 0xaa, 0x0f]))], [0x80, 0x01, 0x55, 0xf0]);
});

test('scan: the Basys2\'s JTAG chain (XC3S250E, XCF02S) with the programmer\'s name and serial', async () => {
  const board = new SimAdeptBoard();
  const lines = [];
  const r = await scanAdept(board, { log: l => lines.push(l) });
  assert.deepEqual(r.devices.map(d => [d.name, d.kind]), [['xc3s250e', 'fpga'], ['xcf02s', 'prom']]);
  assert.equal(r.product, 'Digilent Basys2');
  assert.deepEqual(lines, [
    'Programmer: Digilent Digilent Basys2 (serial 10146A2B3C4D)'.replace('Digilent Digilent', 'Digilent'),
    'Position 1: XC3S250E (IDCODE 0x11c1a093)',
    'Position 2: XCF02S (IDCODE 0xd5045093)',
  ].map(l => l));
  assert.equal(board.opened, false, 'the device is closed afterwards');
});

test('program: the FPGA takes the bitstream from its sync word, DONE goes high', async () => {
  const board = new SimAdeptBoard();
  const { bit, sync } = fakeBit();
  const lines = [];
  const r = await programAdept(board, bit, { part: 'xc3s250e', log: l => lines.push(l) });
  assert.equal(r.fpga, 'xc3s250e');
  assert.ok(board.done);
  assert.deepEqual([...board.config], [...bit.subarray(sync)]);
  const T = l => l.replace(/\d+\.\d s/g, 'T s').replace(/ \(\d+(\.\d+)? (KB\/s|MHz TCK over USB)\)/g, '');
  assert.deepEqual(lines.slice(1).map(T), ['JTAG chain: XC3S250E → XCF02S', 'JPROGRAM: clearing the configuration', `CFG_IN: ${bit.length} bytes`, 'JSTART',
    `  bitstream: ${bit.length * 8} bits in T s; INIT after 1 poll, DONE after 0`, '  USB: data shifts 1 x 4.1 KB in T s; TAP moves 5 x 0.1 KB in T s', 'DONE: the FPGA is configured in T s']);
  assert.equal(board.opened, false);
});

// #508: the steps of a program composed into JTAG sequences (JtagSeq), as the PROM's (#274): after the
// chain's scan, JPROGRAM, CFG_IN and the INIT read one PUT_TMS_TDI_BITS; the bitstream one PUT_TDI_BITS
// between the pairs before it and JSTART, its 12 clocks and the DONE read after it; the last 12 clocks
// one more (88 commands, 240 transfers before: every IR shift a command a device, a status 4 commands)
test('program: the steps in few commands (the IR shifts, polls and clocks composed into streams)', async () => {
  const board = new SimAdeptBoard();
  const { bit, sync } = fakeBit(20000);
  let xfers = 0;
  for (const m of ['transferOut', 'transferIn', 'controlTransferIn']) { const f = board[m].bind(board); board[m] = (...a) => { xfers++; return f(...a); }; }
  await programAdept(board, bit, { part: 'xc3s250e' });
  assert.deepEqual([...board.config], [...bit.subarray(sync)]);
  const cmds = board.log.map(([, c]) => c), scan = cmds.indexOf(10) + 2 + 2 * 3 + 2;   // the chain's init: TLR / Shift-DR, 3 IDCODE reads, Exit1 / Update
  assert.deepEqual(cmds.slice(scan), [10, 0x8a, 10, 0x8a, 10, 0x8a, 8, 0x88, 10, 0x8a, 10, 0x8a, 1], 'JPROGRAM + CFG_IN + INIT, one INIT poll; pairs, the bitstream, JSTART + DONE; the last clocks; DISABLE');
  assert.equal(board.log.length, 26);
  assert.ok(xfers <= 80, `${xfers} USB transfers`);
});

test('program: a Nexys2-500 (XC3S500E), a chain with the FPGA alone', async () => {
  const board = new SimAdeptBoard({ fpga: 'xc3s500e', prom: null, product: 'Nexys2' });
  const { bit, sync } = fakeBit(1001, '3s500efg320');
  await programAdept(board, bit, { part: 'XC3S500E' });
  assert.deepEqual([...board.config], [...bit.subarray(sync)]);
});

test('program: the errors (another FPGA, no sync word, the board in use)', async () => {
  const { bit } = fakeBit();
  await assert.rejects(programAdept(new SimAdeptBoard({ fpga: 'xc3s100e' }), bit, { part: 'xc3s250e' }),
    /Adept USB: the board's FPGA is a XC3S100E, the bitstream is for a XC3S250E/);
  const junk = new Uint8Array(500).fill(0x12);
  await assert.rejects(programAdept(new SimAdeptBoard(), junk, { maxPolls: 20 }), /DONE did not go high: the bitstream was not accepted/);
  await assert.rejects(programAdept(new SimAdeptBoard({ inUse: true }), bit), /the board cannot be opened \(Unable to claim interface\.\): another program may be using it/);
});

test('bitHeader: the design and part of a .bit; the part checked against the board\'s FPGA', async () => {
  const { bit } = fakeBit();
  assert.deepEqual(bitHeader(bit), { design: 'top.ncd', part: 'xc3s250e', package: 'cp132', date: '2026/10/12', time: '14:05:00' });
  assert.equal(bitHeader(new Uint8Array([1, 2, 3])), null);
  // the length word right but not the 9 bytes of the magic (#3048): not a .bit, as the server's parseBitHeader says
  for (const i of [2, 6, 10]) {
    const bad = bit.slice(); bad[i] ^= 0xff;
    assert.equal(bitHeader(bad), null, `byte ${i}`);
  }
  // the header's part wins over the one given
  await assert.rejects(programAdept(new SimAdeptBoard({ fpga: 'xc3s500e' }), bit, { part: 'xc3s500e' }), /the board's FPGA is a XC3S500E, the bitstream is for a XC3S250E/);
});

// #287: a wait of more than RTI_PAIRS clocks is not sent as TMS / TDI pairs (a byte every 4 clocks)
// but as one CLOCK_TCK between the stream's pieces; what is read comes back across them (the pieces
// not on byte boundaries); an IR shift's TDO only read when asked
test('JtagSeq: a long Run-Test/Idle wait sent as a CLOCK_TCK between the pieces of the stream, the reads across them', async () => {
  const board = new SimAdeptBoard();
  const a = await new Adept(board).open();
  const chain = new Chain(new Djtg(a, 0));
  await chain.init();
  const [prom, fpga] = chain.devices;
  const s = new JtagSeq(chain);
  assert.equal(s.ir(prom, 0xfe), null, 'an IR not read: no capture');
  const ir = s.ir(fpga, 0x09, true);
  s.rti(RTI_PAIRS + 5);   // over RTI_PAIRS: a CLOCK_TCK
  const id1 = s.dr(prom, 0, 32, true);
  s.rti(3);
  s.rti(RTI_PAIRS);   // up to RTI_PAIRS: pairs
  s.rti(3 * RTI_PAIRS);
  s.ir(prom, 0xff);   // the PROM in BYPASS, the FPGA's IDCODE through it
  const id2 = s.dr(fpga, 0, 32, true);
  const pairs = s.clocks, t0 = board.ticks;
  board.log.length = 0;
  await s.run();
  assert.equal(ir.num, 0x11, 'the FPGA\'s status (INIT)');
  assert.equal(id1.num, 0xd5045093);
  assert.equal(id2.num, 0x11c1a093);
  assert.equal(board.ticks - t0, pairs + RTI_PAIRS + 5 + 3 * RTI_PAIRS, 'every clock, in the pairs or the CLOCK_TCKs');
  // PUT_TMS_TDI_BITS (10) and its counts, CLOCK_TCK (7) and its counts, …
  assert.deepEqual(board.log.map(([, c]) => c), [10, 0x8a, 7, 0x87, 10, 0x8a, 7, 0x87, 10, 0x8a]);
  assert.equal(s.clocks, 0, 'the stream emptied');
  await a.close();
});

// #289: on the board the pairs are slow; a long DR shift (DR_TDI_BITS or more) goes as PUT_TDI_BITS
// (TMS low; a read of zeros as GET_TDO_BITS), its last bit a pair, as the FPGA's bitstream goes
test('JtagSeq: a long DR shift as PUT_TDI_BITS / GET_TDO_BITS, its last bit a pair; what it reads; the bytes per kind of command', async () => {
  const board = new SimAdeptBoard();
  const a = await new Adept(board).open();
  const chain = new Chain(new Djtg(a, 0));
  await chain.init();
  const [prom, fpga] = chain.devices;
  const st = { now: () => board.now() };
  const s = new JtagSeq(chain, st);
  s.ir(prom, 0xff);   // both in BYPASS
  s.ir(fpga, 0x3f);
  const data = Uint8Array.from({ length: 25 }, (_, i) => (i * 73 + 5) & 0xff);   // 200 bits
  const got = s.dr(prom, data, 200, true);
  const zeros = s.dr(prom, null, 200, true);
  const short = s.dr(prom, 0x5, DR_TDI_BITS, true);   // under DR_TDI_BITS + 1: pairs
  board.log.length = 0;
  await s.run();
  // TDI through the two 1-bit BYPASS registers (the FPGA's, then the PROM's): the data two bits later
  const bit = (b, i) => (b[i >> 3] >> (i & 7)) & 1;
  for (let i = 0; i < 200; i++) assert.equal(bit(got.bytes, i), i > 1 ? bit(data, i - 2) : 0, `bit ${i}`);
  assert.ok(zeros.bytes.every(b => b === 0));
  assert.equal(short.num, 0x5 << 2);
  // pairs, PUT_TDI_BITS (8), pairs, GET_TDO_BITS (9), pairs: each with its counts
  assert.deepEqual(board.log.map(([, c]) => c), [10, 0x8a, 8, 0x88, 10, 0x8a, 9, 0x89, 10, 0x8a]);
  assert.deepEqual([st.data.cmds, st.data.clocks, st.data.bytes], [2, 2 * 199, 25 * 2 + 25], 'the data both ways, the zeros\' only in');
  assert.equal(st.pairs.cmds, 3);
  assert.equal(st.waits, undefined);
  await a.close();
});

test('open() that fails after claiming the board releases it: the next attempt finds it free (#398)', async () => {
  // a control request that fails once the interface is claimed (a firmware that does not answer)
  const board = new SimAdeptBoard();
  const real = board.controlTransferIn.bind(board);
  let broken = true;
  board.controlTransferIn = async (setup, len) => (broken ? { status: 'stall', data: new DataView(new ArrayBuffer(0)) } : real(setup, len));
  await assert.rejects(new Adept(board).open(), /^Error: Adept USB: control request 0xe1 failed$/);
  assert.equal(board.claimed, false, 'the interface released');
  assert.equal(board.opened, false, 'the device closed');
  broken = false;
  const a = await new Adept(board).open();
  assert.equal(a.productName, 'Digilent Basys2');
  await a.close();
  // a board in use (the claim fails): the device opened for the attempt is closed again
  const used = new SimAdeptBoard({ inUse: true });
  await assert.rejects(new Adept(used).open(), /the board cannot be opened \(Unable to claim interface\.\)/);
  assert.equal(used.opened, false);
});
