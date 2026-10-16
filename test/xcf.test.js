// The Platform Flash (XCF01S / XCF02S / XCF04S) programmed over the Digilent Adept USB (core/xcf.js,
// the browser edition's PROM programmer) against a simulated board (test/fixtures/adept-sim.js: the
// Adept firmware and a JTAG chain whose PROM implements the ISC instructions, holds its memory and
// checks the protocol), through the WebUSB calls the browser makes: erase, program, verify, read,
// reconfigure (the FPGA configured from the PROM's bits), the image's bit order, the errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promAdept, promImage, bitFields, xcfSize, Xcf, XCF, NOT_DONE, tckRate } from '../core/xcf.js';
import { Adept, Djtg, Chain } from '../core/adept.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';

const FAST = { tckHz: 20000, sleep: async () => {} };   // fewer simulated TCK clocks per wait
// and the time as the board's TCK clocks at that rate: the phases' times in the console exact
const fast = board => ({ ...FAST, now: () => board.now(FAST.tckHz) });

// a .bit: its header (with the 'e' field's length), dummy words, the sync word, then the configuration
function fakeBit(n = 20000, part = '3s250ecp132') {
  const field = (k, v) => [k.charCodeAt(0), 0, v.length + 1, ...[...v].map(c => c.charCodeAt(0)), 0];
  const len = n + 12;
  const head = Uint8Array.from([0, 9, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0, 0, 1, ...field('a', 'top.ncd;UserID=0xFFFFFFFF'), ...field('b', part),
    ...field('c', '2026/10/12'), ...field('d', '14:05:00'), 0x65, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
  const data = new Uint8Array(len);
  data.fill(0xff, 0, 8);
  data.set([0xaa, 0x99, 0x55, 0x66], 8);
  for (let i = 0; i < n; i++) data[12 + i] = (i * 37 + 11) & 0xff;
  const bit = new Uint8Array(head.length + len);
  bit.set(head); bit.set(data, head.length);
  return { bit, data };
}
const bitLines = (data, part = '3s250ecp132') => `bitstream: design top.ncd;UserID=0xFFFFFFFF part ${part} 2026/10/12 14:05:00, ${data.length} bytes`;
const blockLines = n => Array.from({ length: n }, (_, i) => i).filter(i => i % 16 === 0 || i === n - 1).map(i => `  programmed block ${i + 1}/${n}`);

test('promImage: each byte\'s bits reversed, padded with 0xFF to whole blocks', () => {
  const data = Uint8Array.from([0x01, 0x80, 0xaa, 0x0f, 0xc3]);
  const img = promImage(data, 2048);
  assert.equal(img.length, 256);
  // the reference: each byte's 8 bits as a string, reversed
  const rev = b => parseInt(b.toString(2).padStart(8, '0').split('').reverse().join(''), 2);
  assert.deepEqual([...img.subarray(0, 5)], [...data].map(rev));
  assert.ok(img.subarray(5).every(b => b === 0xff));
  assert.equal(promImage(new Uint8Array(512), 4096).length, 512, 'a whole block: no padding');
});

test('bitFields: the header fields and the configuration data (the \'e\' field); the errors', () => {
  const { bit, data } = fakeBit(100);
  const f = bitFields(bit);
  assert.deepEqual(f.fields, { a: 'top.ncd;UserID=0xFFFFFFFF', b: '3s250ecp132', c: '2026/10/12', d: '14:05:00' });
  assert.deepEqual([...f.data], [...data]);
  assert.throws(() => bitFields(bit.subarray(0, bit.length - 1)), /Adept USB: the \.bit file is truncated/);
  assert.throws(() => bitFields(bit.subarray(0, 60)), /no configuration data in the \.bit file/);
  assert.throws(() => bitFields(new Uint8Array(4)), /not a \.bit file/);
});

test('xcfSize: the XCF01S / 02S / 04S by IDCODE; another device refused', () => {
  assert.deepEqual(xcfSize(0xd5044093), { size: 1 << 20, block: 2048 });
  assert.deepEqual(xcfSize(0xd5045093), { size: 2 << 20, block: 4096 });
  assert.deepEqual(xcfSize(0x05046093), { size: 4 << 20, block: 4096 });
  assert.throws(() => xcfSize(0x05059093), /unsupported Platform Flash IDCODE 05059093/);
});

test('program: the Basys2\'s XCF02S erased, programmed by blocks, verified; the FPGA then loads from it (DONE)', async () => {
  const board = new SimAdeptBoard();
  const { bit, data } = fakeBit();
  const lines = [];
  const r = await promAdept(board, { op: 'program', bit, reconfigure: true, log: l => lines.push(l), ...fast(board) });
  assert.deepEqual(r, { op: 'program', prom: 'xcf02s', done: true });
  const n = Math.ceil(data.length * 8 / 4096);
  assert.deepEqual(lines, [
    'Programmer: Digilent Basys2 (serial 10146A2B3C4D)',
    'JTAG chain: xcf02s(d5045093), xc3s250e(11c1a093)',
    'PROM xcf02s: 2048 Kbit, 4096-bit blocks',
    bitLines(data),
    // each phase's time (here the simulated TCK clocks at 20 kHz, #287), the last block's program time (#289)
    'erasing...', 'erased in 0.5 s', 'programming...', ...blockLines(n),
    '  program time of the last block (ISCTESTSTATUS): 10.40 ms; each block waited 20.00 ms', '  USB: data shifts 40 x 20.5 KB in 8.2 s (3 KB/s); TAP moves 49 x 5.4 KB in 1.0 s (5 KB/s)',
    'programmed 40 blocks in 9.3 s', 'verifying...', '  USB: data shifts 40 x 20.5 KB in 8.2 s (3 KB/s); TAP moves 44 x 1.1 KB in 0.1 s (8 KB/s)', 'verify OK in 8.4 s',
    'reconfiguring the FPGA from the PROM...', 'STATUS: DONE', 'program done in 18.4 s',
  ]);
  const prom = board.promDev;
  assert.deepEqual(prom.errors, [], 'the ISC protocol kept');
  assert.deepEqual(prom.ops, ['enable 0x37', 'erase', 'disable', 'enable 0x37', ...Array.from({ length: n }, (_, i) => `program ${i}`), 'disable',
    'enable 0x34', ...Array.from({ length: n }, (_, i) => `read ${i}`), 'disable', 'config']);
  // the memory in the order the PROM sends it to the FPGA: each byte of the .bit MSB first, then erased (1)
  for (let j = 0; j < data.length; j++) for (let i = 0; i < 8; i++) if (prom.mem[8 * j + i] !== ((data[j] >> (7 - i)) & 1)) assert.fail(`bit ${i} of byte ${j}`);
  assert.ok(prom.mem.subarray(data.length * 8).every(b => b === 1));
  // the FPGA took the configuration from the sync word
  assert.ok(board.done);
  assert.deepEqual([...board.config.subarray(0, data.length - 8)], [...data.subarray(8)]);
  assert.equal(board.opened, false, 'the device is closed afterwards');
});

test('program without verify or reload; verify alone; read (backup) in the .bit\'s bit order', async () => {
  const board = new SimAdeptBoard();
  const { bit, data } = fakeBit(9000);
  const lines = [];
  await promAdept(board, { op: 'program', bit, verify: false, log: l => lines.push(l), ...fast(board) });
  assert.deepEqual(lines.slice(3), [bitLines(data), 'erasing...', 'erased in 0.5 s', 'programming...', '  programmed block 1/18', '  programmed block 17/18', '  programmed block 18/18',
    '  program time of the last block (ISCTESTSTATUS): 10.40 ms; each block waited 20.00 ms', '  USB: data shifts 18 x 9.2 KB in 3.7 s (3 KB/s); TAP moves 27 x 2.7 KB in 0.5 s (5 KB/s)', 'programmed 18 blocks in 4.3 s', 'program done in 4.9 s']);
  assert.equal(board.done, false, 'the FPGA not reloaded');
  const v = [];
  await promAdept(board, { op: 'verify', bit, log: l => v.push(l), ...fast(board) });
  assert.deepEqual(v.slice(3), [bitLines(data), 'verifying...', '  USB: data shifts 18 x 9.2 KB in 3.7 s (3 KB/s); TAP moves 22 x 0.5 KB in 0.1 s (7 KB/s)', 'verify OK in 3.9 s', 'verify done in 4.0 s']);
  const rd = [];
  const r = await promAdept(board, { op: 'read', log: l => rd.push(l), ...fast(board) });
  assert.equal(r.data.length, 262144);
  assert.deepEqual([...r.data.subarray(0, data.length)], [...data]);
  assert.ok(r.data.subarray(data.length).every(b => b === 0xff));
  assert.deepEqual(rd.slice(3), [`read 262144 bytes (${data.length} bytes before the erased tail)`, 'read done in 106.9 s']);
  assert.deepEqual(board.promDev.errors, []);
});

test('erase: the whole PROM back to 1s; reconfigure alone', async () => {
  const board = new SimAdeptBoard();
  const { bit } = fakeBit(3000);
  await promAdept(board, { op: 'program', bit, ...FAST });
  const lines = [];
  await promAdept(board, { op: 'erase', log: l => lines.push(l), ...fast(board) });
  assert.deepEqual(lines.slice(3), ['erasing...', 'erased in 0.5 s', 'erase done in 0.7 s']);
  assert.ok(board.promDev.mem.every(b => b === 1));
  // programmed again, then the FPGA reloaded from it on its own
  await promAdept(board, { op: 'program', bit, verify: false, ...FAST });
  const rc = [];
  await promAdept(board, { op: 'reconfigure', log: l => rc.push(l), ...fast(board) });
  assert.deepEqual(rc.slice(3), ['reconfiguring the FPGA from the PROM...', 'STATUS: DONE', 'reconfigure done in 0.1 s']);
  assert.ok(board.done);
  assert.deepEqual(board.promDev.errors, []);
});

test('the Nexys2-500\'s XCF04S, and an XCF01S (2048-bit blocks)', async () => {
  const nexys = new SimAdeptBoard({ fpga: 'xc3s500e', prom: 'xcf04s', product: 'Nexys2' });
  const a = fakeBit(12000, '3s500efg320');
  const lines = [];
  await promAdept(nexys, { op: 'program', bit: a.bit, reconfigure: true, log: l => lines.push(l), ...fast(nexys) });
  assert.deepEqual(lines.slice(1, 3), ['JTAG chain: xcf04s(d5046093), xc3s500e(11c22093)', 'PROM xcf04s: 4096 Kbit, 4096-bit blocks']);
  assert.ok(nexys.done);
  assert.deepEqual(nexys.promDev.errors, []);
  const small = new SimAdeptBoard({ fpga: 'xc3s100e', prom: 'xcf01s' });
  const b = fakeBit(5000, '3s100ecp132');
  const l2 = [];
  await promAdept(small, { op: 'program', bit: b.bit, log: l => l2.push(l), ...fast(small) });
  const n = Math.ceil(b.data.length * 8 / 2048);
  assert.deepEqual(l2.slice(2), ['PROM xcf01s: 1024 Kbit, 2048-bit blocks', bitLines(b.data, '3s100ecp132'), 'erasing...', 'erased in 0.5 s', 'programming...', ...blockLines(n),
    '  program time of the last block (ISCTESTSTATUS): 10.40 ms; each block waited 20.00 ms', '  USB: data shifts 20 x 5.1 KB in 2.0 s (3 KB/s); TAP moves 29 x 2.9 KB in 0.5 s (5 KB/s)',
    'programmed 20 blocks in 2.7 s', 'verifying...', '  USB: data shifts 20 x 5.1 KB in 2.0 s (3 KB/s); TAP moves 24 x 0.6 KB in 0.1 s (7 KB/s)', 'verify OK in 2.2 s', 'program done in 5.6 s']);
  assert.ok(small.promDev.ops.includes(`program ${n - 1}`));
  assert.deepEqual(small.promDev.errors, []);
});

test('the errors: a design too large for the PROM, another FPGA, no PROM, write protected, a verify mismatch, no DONE, an erase that does not end', async () => {
  // an XC3S500E's bitstream (2.27 Mbit) does not fit an XCF02S: refused before anything is erased
  const big = new SimAdeptBoard({ fpga: 'xc3s500e', prom: 'xcf02s' });
  const { bit: bigBit } = fakeBit(283000, '3s500efg320');
  await assert.rejects(promAdept(big, { op: 'program', bit: bigBit, ...FAST }),
    /^Error: Adept USB: bitstream \(2264096 bits\) does not fit the PROM \(2097152 bits\): the XCF02S holds 2048 Kbit$/);
  assert.deepEqual(big.promDev.ops, []);
  // a bitstream for another FPGA
  const { bit } = fakeBit(2000);
  await assert.rejects(promAdept(new SimAdeptBoard({ fpga: 'xc3s100e', prom: 'xcf02s' }), { op: 'program', bit, ...FAST }),
    /^Error: Adept USB: the board's FPGA is a XC3S100E, the bitstream is for a XC3S250E$/);
  // a chain with no Platform Flash
  await assert.rejects(promAdept(new SimAdeptBoard({ prom: null }), { op: 'erase', ...FAST }), /no XCF Platform Flash in the JTAG chain \(found XC3S250E\)/);
  // write protected: said in the PROM's line, and the erase refused
  const wp = new SimAdeptBoard({ promOptions: { writeProtected: true } });
  const lines = [];
  await assert.rejects(promAdept(wp, { op: 'program', bit, log: l => lines.push(l), ...FAST }), /^Error: Adept USB: the PROM is write protected$/);
  assert.equal(lines[2], 'PROM xcf02s: 2048 Kbit, 4096-bit blocks, WRITE PROTECTED');
  assert.deepEqual(wp.promDev.ops, []);
  // a cell that does not program: the verify says where
  const bad = new SimAdeptBoard({ promOptions: { failBlock: 1 } });
  await assert.rejects(promAdept(bad, { op: 'program', bit, ...FAST }), /^Error: Adept USB: verify FAILED at byte 512 \(block 1\): read [0-9a-f]{2} expected [0-9a-f]{2}$/);
  assert.equal(bad.promDev.isc, false, 'the PROM left out of ISC mode');
  // the mode jumper on JTAG: the FPGA does not load from the PROM
  const jtag = new SimAdeptBoard({ mode: 'jtag' });
  const rc = [];
  await assert.rejects(promAdept(jtag, { op: 'program', bit, reconfigure: true, log: l => rc.push(l), ...FAST, donePolls: 3 }), new RegExp(`^Error: Adept USB: ${NOT_DONE.replace(/[()?]/g, '\\$&')}$`));
  assert.equal(rc.at(-1), 'STATUS: FPGA did not assert DONE (is the mode jumper set to ROM, and was the bitstream built with StartUpClk:CCLK?)');
  // an erase that never ends (polled every 0.1 s for 20 s)
  await assert.rejects(promAdept(new SimAdeptBoard({ promOptions: { eraseClocks: 1e9 } }), { op: 'erase', ...FAST }), /^Error: Adept USB: erase did not complete \(timeout 20\.0 s\)$/);
  // the operation, and its file
  await assert.rejects(promAdept(new SimAdeptBoard(), { op: 'format' }), /unknown PROM operation 'format' \(valid: program, verify, erase, read, reconfigure\)/);
  await assert.rejects(promAdept(new SimAdeptBoard(), { op: 'program' }), /program needs a \.bit file/);
});

test('the PROM model checks the protocol: a program over a programmed block, without an erase, is flagged', async () => {
  const board = new SimAdeptBoard();
  const { bit, data } = fakeBit(1000);
  await promAdept(board, { op: 'program', bit, verify: false, ...FAST });
  const a = await new Adept(board).open();
  const chain = new Chain(new Djtg(a, 0));
  await chain.init();
  const x = new Xcf(chain, chain.devices[0], { tckHz: 20000 });
  await x.program(data);
  assert.deepEqual(board.promDev.errors, ['block 0 programmed twice without an erase', 'block 1 programmed twice without an erase']);
  await a.close();
});

// the port against the full application's programmer (scripts/xcf_prog.py): its instructions, and
// the blocks it shifts for the same .bit (run with stand-ins for its USB modules, when Python 3 is here)
test('the same instructions and blocks as the full application\'s scripts/xcf_prog.py', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('../scripts/xcf_prog.py', import.meta.url));
  const py = fs.readFileSync(script, 'utf8');
  const { XCF, FRAMES_PER_BLOCK } = await import('../core/xcf.js');
  for (const [k, v] of Object.entries(XCF)) assert.match(py, new RegExp(`\\b${k}\\b[^\\n]*=[^\\n]*0x${v.toString(16)}\\b`, 'i'), k);
  assert.match(py, new RegExp(`FRAMES_PER_BLOCK = ${FRAMES_PER_BLOCK}\\b`));
  const { bit } = fakeBit(1500);
  const tmp = fs.mkdtempSync(`${os.tmpdir()}/xcf-`);
  fs.writeFileSync(`${tmp}/top.bit`, bit);
  const code = `
import sys, types
for m in ('usb1', 'adepttool', 'adepttool.device', 'adepttool.jtag'): sys.modules[m] = types.ModuleType(m)
sys.modules['adepttool.device'].get_devices = None
j = sys.modules['adepttool.jtag']
j.Chain = j.Spartan3 = j.PlatformFlashSerial = object
j.byterev = lambda d: bytes(int('{:08b}'.format(b)[::-1], 2) for b in d)
g = {'__name__': 'xcf_prog'}
exec(compile(open(sys.argv[1]).read(), 'xcf_prog.py', 'exec'), g)
g['log'] = lambda *a: None
data, hdr = g['parse_bit'](sys.argv[2])
class Dev: idcode, IR_LEN = 0xd5045093, 8
class Ch: devices = []
x = g['Xcf'](Ch(), Dev())
out = []
x.ir = x.wait = x.enable = x.disable = x.address = x.wait_ready = lambda *a: 0
x.dr_bytes = lambda d, n: out.append(bytes(d))
x.program(data)
sys.stdout.write(b''.join(out).hex())`;
  const run = spawnSync('python3', ['-I', '-c', code, script, `${tmp}/top.bit`], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (run.error) return;   // no Python 3 on this machine
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, Buffer.from(promImage(bitFields(bit).data, 4096)).toString('hex'));
});

// #274: each Adept command is ~5 USB transfers (~1 ms each over WebUSB); a JTAG step a command made
// an XC3S250E design (331 blocks) ~100,000 transfers, now streams. #287: the bytes too (full-speed
// USB carries ~1 MB/s): each block's wait was 20 ms of TMS / TDI pairs (~20 KB a block at 4 MHz) and
// every IR shift read its TDO back, 6.97 MB out and 3.48 MB in to program 331 blocks; a wait now a
// CLOCK_TCK without data. Counted: the transfers, the bytes both ways and the TCK clocks of the
// CLOCK_TCKs, per phase
const counted = board => {
  const n = { all: 0, bytes: 0, tck: 0 }, out = board.transferOut.bind(board), inn = board.transferIn.bind(board), cmd = board.command.bind(board);
  board.transferOut = (ep, d) => { n.all++; n.bytes += d.length; return out(ep, d); };
  board.transferIn = async (...a) => { n.all++; const r = await inn(...a); n.bytes += r.data.byteLength; return r; };
  board.command = b => { if (b[2] === 7) n.tck += (b[6] | (b[7] << 8) | (b[8] << 16) | (b[9] << 24)) >>> 0; return cmd(b); };   // DJTG CLOCK_TCK
  return n;
};
// a program at the board's 4 MHz, its time the board's TCK clocks: { lines, per: { 'programming...': { all, bytes, tck }, … }, all }
async function countedProgram(board, bit, opts = {}) {
  const c = counted(board), per = {}, lines = [];
  let phase = 'setup', at = { ...c };
  const close = () => { per[phase] = Object.fromEntries(Object.keys(c).map(k => [k, c[k] - at[k]])); at = { ...c }; };
  await promAdept(board, { op: 'program', bit, sleep: async () => {}, now: () => board.now(), log: l => { lines.push(l); if (/^(erasing|programming|verifying)\.\.\.$/.test(l)) { close(); phase = l; } }, ...opts });
  close();
  return { lines, per, all: c.all };
}
const WAIT = 80000;   // PROGRAM_S at the board's 4 MHz

test('program + verify of an XC3S250E design (331 blocks): each block\'s data a PUT_TDI_BITS, its 20 ms wait a CLOCK_TCK, under 250 KB over USB', async () => {
  const board = new SimAdeptBoard();   // GET_SPEED: 4 MHz; the PROM programs a block in 200 TCK clocks
  const { bit, data } = fakeBit(169000);
  const n = Math.ceil(data.length * 8 / 4096);
  assert.equal(n, 331);
  const { lines, per, all } = await countedProgram(board, bit);
  assert.deepEqual(lines.slice(4), ['erasing...', 'erased in 0.3 s', 'programming...', ...blockLines(n),
    '  program time of the last block (ISCTESTSTATUS): 0.06 ms; each block waited 20.00 ms', '  USB: data shifts 331 x 169.5 KB in 0.3 s (500 KB/s); TAP moves 669 x 9.4 KB in 0.0 s (1098 KB/s); waits 331 x in 6.6 s',
    'programmed 331 blocks in 7.1 s', 'verifying...',
    '  USB: data shifts 331 x 169.5 KB in 0.3 s (500 KB/s); TAP moves 337 x 33.7 KB in 0.0 s (1507 KB/s)', 'verify OK in 0.5 s', 'program done in 8.0 s']);
  assert.deepEqual(board.promDev.errors, []);
  assert.deepEqual(board.promDev.ops.filter(o => /^program/.test(o)), Array.from({ length: n }, (_, i) => `program ${i}`));
  const p = per['programming...'], info = JSON.stringify(per);
  // #289: per block its moves and its last bit as pairs, its data as PUT_TDI_BITS, its wait a CLOCK_TCK
  // (4 commands, ~19 transfers; the pairs are slow on the board); to verify, per block the moves and
  // the 200-clock read wait as pairs and the block a GET_TDO_BITS (~11 transfers)
  assert.ok(p.all < 20 * n && per['verifying...'].all < 12 * n, `${all} transfers: ${info}`);
  assert.equal(p.tck, 330 * WAIT + 4001 + 440001 + 2 + 2001 + (WAIT - 253), info);
  assert.ok(p.bytes < 250000 && per['verifying...'].bytes < 250000, `bytes: ${info}`);   // (programming was 10.4 MB, #287)
  // the block data out of the pairs: the bytes per kind of command (JtagSeq's stats)
  const a = await new Adept(new SimAdeptBoard()).open(), chain = new Chain(new Djtg(a, 0));
  await chain.init();
  const x = new Xcf(chain, chain.devices[0], { tckHz: 4e6 });
  x.stats = { now: () => 0 };
  await x.erase();
  x.stats = { now: () => 0 };
  await x.program(data);
  const { data: d, pairs, waits } = x.stats;
  assert.deepEqual([d.cmds, d.bytes, d.clocks], [n, n * 512, n * 4095], 'each block\'s data a PUT_TDI_BITS of 4095 bits (its last bit a pair)');
  assert.ok(pairs.bytes < 30 * n, `${pairs.bytes} bytes of pairs`);
  assert.deepEqual([waits.cmds, waits.clocks], [331, 330 * WAIT + WAIT - 253], 'the waits of the blocks (the last one\'s after its polls)');
  await a.close();
  // the 330 blocks before the last each waited PROGRAM_S as a CLOCK_TCK, and the ISC_DISABLEs around
  // (1 ms before, 110 ms after); the last block's wait (its polls, then the rest of PROGRAM_S) and
  // the final status check's 0.5 ms
});

// #289: on the board, #287's measured waits left block 0 unprogrammed (verify FAILED at byte 4
// (block 0): read ff expected 55): its measurement shifted ISCTESTSTATUS right after ISC_PROGRAM,
// and an ISC operation only starts in Run-Test/Idle (IEEE 1532); the simulated PROM now so too
test('#289: an ISC_PROGRAM followed by another instruction before Run-Test/Idle never starts: the status says ready, the block stays erased', async () => {
  const board = new SimAdeptBoard();
  const a = await new Adept(board).open();
  const chain = new Chain(new Djtg(a, 0));
  await chain.init();
  const x = new Xcf(chain, chain.devices[0], { tckHz: 4e6 });
  await x.erase();
  await x.enable();
  // f0c62d8's measurement of block 0: ISCTESTSTATUS at once after ISC_PROGRAM
  const s = x.seq();
  s.ir(x.dev, XCF.ISC_DATA_SHIFT);
  s.dr(x.dev, new Uint8Array(512), 4096);
  x.address(s, 0);
  s.ir(x.dev, XCF.ISC_PROGRAM);
  s.ir(x.dev, XCF.ISCTESTSTATUS);
  s.rti(1);
  const st = s.dr(x.dev, 0, 8, true);
  await s.run();
  assert.equal(st.num & 0x04, 0x04, 'ready: the PROM was not busy');
  assert.deepEqual(board.promDev.errors, ['ISC_PROGRAM never started: no Run-Test/Idle before the next instruction']);
  assert.ok(board.promDev.mem.subarray(0, 4096).every(b => b === 1), 'block 0 still erased');
  // the polls as xcf_prog.py's (Run-Test/Idle first): the program runs, measured
  const s2 = x.seq();
  s2.ir(x.dev, XCF.ISC_DATA_SHIFT);
  s2.dr(x.dev, new Uint8Array(512), 4096);
  x.address(s2, 0);
  s2.ir(x.dev, XCF.ISC_PROGRAM);
  assert.equal(await x.readyClocks(s2, 80000), 253, 'ready at the first poll (250 clocks, ISCTESTSTATUS, 1 more; the PROM takes 200)');
  assert.ok(board.promDev.mem.subarray(0, 4096).every(b => b === 0), 'block 0 programmed');
  assert.equal(board.promDev.errors.length, 1);
  await a.close();
});

test('#289: the measured waits (option measure, off by default): 1 ms on a fast PROM, every block programmed, the measured blocks too', async () => {
  const board = new SimAdeptBoard();
  const { bit, data } = fakeBit(169000);
  const n = Math.ceil(data.length * 8 / 4096);
  const { lines, per } = await countedProgram(board, bit, { measure: true });
  assert.deepEqual(lines.slice(4), ['erasing...', 'erased in 0.3 s', 'programming...', ...blockLines(n),
    '  block program time: 0.06 ms measured, 1.00 ms waited', '  program time of the last block (ISCTESTSTATUS): 0.06 ms; each block waited 1.00 ms',
    '  USB: data shifts 331 x 169.5 KB in 0.3 s (500 KB/s); TAP moves 674 x 21.5 KB in 0.0 s (1297 KB/s); waits 324 x in 0.3 s',
    'programmed 331 blocks in 0.8 s', 'verifying...',
    '  USB: data shifts 331 x 169.5 KB in 0.3 s (500 KB/s); TAP moves 337 x 33.7 KB in 0.0 s (1507 KB/s)', 'verify OK in 0.5 s', 'program done in 1.7 s']);
  assert.deepEqual(board.promDev.errors, []);
  assert.deepEqual(board.promDev.ops.filter(o => /^program/.test(o)), Array.from({ length: n }, (_, i) => `program ${i}`));
  assert.ok(per['programming...'].bytes < 250000, JSON.stringify(per));
});

test('#289: measured waits on a slow PROM (12 ms a block): 20 ms (PROGRAM_S) waited, every block programmed', async () => {
  const board = new SimAdeptBoard({ promOptions: { programClocks: Math.floor(0.012 * 4e6) } });
  const { bit, data } = fakeBit(9000);
  const n = Math.ceil(data.length * 8 / 4096);
  const { lines } = await countedProgram(board, bit, { measure: true });
  assert.deepEqual(lines.slice(4, 7), ['erasing...', 'erased in 0.3 s', 'programming...']);
  assert.deepEqual(lines.filter(l => /program time/.test(l)), ['  block program time: 12.28 ms measured, 20.00 ms waited', '  program time of the last block (ISCTESTSTATUS): 12.28 ms; each block waited 20.00 ms']);
  assert.deepEqual(board.promDev.errors, []);
  assert.deepEqual(board.promDev.ops.filter(o => /^program/.test(o)), Array.from({ length: n }, (_, i) => `program ${i}`));
  // the default: a PROM that takes the whole PROGRAM_S still programs every block
  const slowest = new SimAdeptBoard({ promOptions: { programClocks: WAIT - 10 } });
  const { lines: l2 } = await countedProgram(slowest, fakeBit(3000).bit);
  assert.deepEqual(slowest.promDev.errors, []);
  assert.ok(l2.includes('  program time of the last block (ISCTESTSTATUS): 20.47 ms; each block waited 20.00 ms'), l2.join('\n'));
});

test('the program wait: TCK_HZ at least, the PROM\'s 10 MHz when the port does not say its rate', async () => {
  const a = await new Adept(new SimAdeptBoard({ tckHz: 6_000_000 })).open();
  assert.equal(await tckRate(new Djtg(a, 0)), 6_000_000);
  const b = await new Adept(new SimAdeptBoard({ tckHz: 1_000_000 })).open();
  assert.equal(await tckRate(new Djtg(b, 0)), 2_000_000);
  const board = new SimAdeptBoard({ tckHz: null });
  const c = await new Adept(board).open();
  assert.equal(await tckRate(new Djtg(c, 0)), 10_000_000);
  // and the commands after the refused one still work
  await promAdept(board, { op: 'program', bit: fakeBit(1000).bit, sleep: async () => {} });
  assert.deepEqual(board.promDev.errors, []);
});

test('#289: measured waits on a PROM slower later: measured again every 64 blocks; slower in the middle of a stream, the status at its end measures it again, and the verify fails', async () => {
  // 0.05 ms a block, then from block 64 (measured) 5 ms: the wait follows, twice that
  const { bit, data } = fakeBit(51000);
  const n = Math.ceil(data.length * 8 / 4096);
  assert.equal(n, 100);
  const board = new SimAdeptBoard({ promOptions: { programClocks: b => (b < 64 ? 200 : 20000) } });
  const { lines } = await countedProgram(board, bit, { measure: true });
  assert.deepEqual(lines.filter(l => /program time/.test(l)), ['  block program time: 5.11 ms measured, 10.22 ms waited', '  program time of the last block (ISCTESTSTATUS): 5.11 ms; each block waited 10.22 ms']);
  assert.deepEqual(board.promDev.errors, []);
  // 5 ms from block 70: blocks 70..126 waited 1 ms, each cut short by the next block's ISC_DATA_SHIFT;
  // block 127's (the stream's last) status still busy: polled to its end, 5 ms measured, the wait twice that
  const { bit: bit2 } = fakeBit(75000);
  const later = new SimAdeptBoard({ promOptions: { programClocks: b => (b < 70 ? 200 : 20000) } });
  const l2 = [];
  await assert.rejects(promAdept(later, { op: 'program', bit: bit2, measure: true, sleep: async () => {}, log: l => l2.push(l) }), /^Error: Adept USB: verify FAILED at byte 35840 \(block 70\): read [0-9a-f]{2} expected [0-9a-f]{2}$/);
  assert.ok(l2.some(l => /^ {2}block program time: 5\.\d\d ms measured, 1\d\.\d\d ms waited$/.test(l)), l2.join('\n'));
  assert.deepEqual(later.promDev.errors, Array(57).fill('DATA while the program runs'));
  assert.equal(later.promDev.ops.filter(o => /^program/.test(o)).length, 147 - 57);
  assert.equal(later.promDev.isc, false, 'the PROM left out of ISC mode');
  // one block, still programming after the status polls: the existing error
  const one = new SimAdeptBoard({ promOptions: { programClocks: 1e6 } });
  await assert.rejects(promAdept(one, { op: 'program', bit: fakeBit(100).bit, ...FAST }), /^Error: Adept USB: programming block 0 did not complete \(timeout 0\.1 s\)$/);
});
