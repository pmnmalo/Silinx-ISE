// The Platform Flash (XCF01S / XCF02S / XCF04S) programmed over the Digilent Adept USB (core/xcf.js,
// the browser edition's PROM programmer) against a simulated board (test/fixtures/adept-sim.js: the
// Adept firmware and a JTAG chain whose PROM implements the ISC instructions, holds its memory and
// checks the protocol), through the WebUSB calls the browser makes: erase, program, verify, read,
// reconfigure (the FPGA configured from the PROM's bits), the image's bit order, the errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promAdept, promImage, bitFields, xcfSize, Xcf, NOT_DONE } from '../core/xcf.js';
import { Adept, Djtg, Chain } from '../core/adept.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';

const FAST = { tckHz: 20000, sleep: async () => {} };   // fewer simulated TCK clocks per wait

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
  const r = await promAdept(board, { op: 'program', bit, reconfigure: true, log: l => lines.push(l), ...FAST });
  assert.deepEqual(r, { op: 'program', prom: 'xcf02s', done: true });
  const n = Math.ceil(data.length * 8 / 4096);
  assert.deepEqual(lines, [
    'Programmer: Digilent Basys2 (serial 10146A2B3C4D)',
    'JTAG chain: xcf02s(d5045093), xc3s250e(11c1a093)',
    'PROM xcf02s: 2048 Kbit, 4096-bit blocks',
    bitLines(data),
    'erasing...', 'programming...', ...blockLines(n), 'verifying...', 'verify OK',
    'reconfiguring the FPGA from the PROM...', 'STATUS: DONE',
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
  await promAdept(board, { op: 'program', bit, verify: false, log: l => lines.push(l), ...FAST });
  assert.deepEqual(lines.slice(3), [bitLines(data), 'erasing...', 'programming...', '  programmed block 1/18', '  programmed block 17/18', '  programmed block 18/18']);
  assert.equal(board.done, false, 'the FPGA not reloaded');
  const v = [];
  await promAdept(board, { op: 'verify', bit, log: l => v.push(l), ...FAST });
  assert.deepEqual(v.slice(3), [bitLines(data), 'verifying...', 'verify OK']);
  const rd = [];
  const r = await promAdept(board, { op: 'read', log: l => rd.push(l), ...FAST });
  assert.equal(r.data.length, 262144);
  assert.deepEqual([...r.data.subarray(0, data.length)], [...data]);
  assert.ok(r.data.subarray(data.length).every(b => b === 0xff));
  assert.deepEqual(rd.slice(3), [`read 262144 bytes (${data.length} bytes before the erased tail)`]);
  assert.deepEqual(board.promDev.errors, []);
});

test('erase: the whole PROM back to 1s; reconfigure alone', async () => {
  const board = new SimAdeptBoard();
  const { bit } = fakeBit(3000);
  await promAdept(board, { op: 'program', bit, ...FAST });
  const lines = [];
  await promAdept(board, { op: 'erase', log: l => lines.push(l), ...FAST });
  assert.deepEqual(lines.slice(3), ['erasing...', 'erased']);
  assert.ok(board.promDev.mem.every(b => b === 1));
  // programmed again, then the FPGA reloaded from it on its own
  await promAdept(board, { op: 'program', bit, verify: false, ...FAST });
  const rc = [];
  await promAdept(board, { op: 'reconfigure', log: l => rc.push(l), ...FAST });
  assert.deepEqual(rc.slice(3), ['reconfiguring the FPGA from the PROM...', 'STATUS: DONE']);
  assert.ok(board.done);
  assert.deepEqual(board.promDev.errors, []);
});

test('the Nexys2-500\'s XCF04S, and an XCF01S (2048-bit blocks)', async () => {
  const nexys = new SimAdeptBoard({ fpga: 'xc3s500e', prom: 'xcf04s', product: 'Nexys2' });
  const a = fakeBit(12000, '3s500efg320');
  const lines = [];
  await promAdept(nexys, { op: 'program', bit: a.bit, reconfigure: true, log: l => lines.push(l), ...FAST });
  assert.deepEqual(lines.slice(1, 3), ['JTAG chain: xcf04s(d5046093), xc3s500e(11c22093)', 'PROM xcf04s: 4096 Kbit, 4096-bit blocks']);
  assert.ok(nexys.done);
  assert.deepEqual(nexys.promDev.errors, []);
  const small = new SimAdeptBoard({ fpga: 'xc3s100e', prom: 'xcf01s' });
  const b = fakeBit(5000, '3s100ecp132');
  const l2 = [];
  await promAdept(small, { op: 'program', bit: b.bit, log: l => l2.push(l), ...FAST });
  const n = Math.ceil(b.data.length * 8 / 2048);
  assert.deepEqual(l2.slice(2), ['PROM xcf01s: 1024 Kbit, 2048-bit blocks', bitLines(b.data, '3s100ecp132'), 'erasing...', 'programming...', ...blockLines(n), 'verifying...', 'verify OK']);
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
