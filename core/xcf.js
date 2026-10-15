// The Xilinx Platform Flash (XCF01S / XCF02S / XCF04S, the serial PROM of the Basys2 / Nexys2)
// programmed over the JTAG of the board's Digilent Adept USB (core/adept.js), for the browser
// edition: a JavaScript port of the full application's scripts/xcf_prog.py, with the same steps
// and the same console lines.
//
// The IEEE 1532 in-system-programming flow of Xilinx's XCF0xS BSDL / ISC files (DS123): ISC_ENABLE,
// ISC_ERASE, then per block (32 frames: 4096 bits, 2048 on the XCF01S) ISC_DATA_SHIFT,
// ISC_ADDRESS_SHIFT and ISC_PROGRAM; ISC_READ to verify; ISC_DISABLE; CONFIG (the FPGA reloads from
// the PROM). Every ISC wait clocks TCK in Run-Test/Idle: the PROM erases, programs, reads and updates
// its status only while TCK runs.
//
// The image: the .bit's configuration data (its 'e' field), each byte's bits reversed (the PROM
// sends a byte's bit 0 first, the FPGA reads a byte MSB first), padded with 0xFF to whole blocks.
// The .bit for the PROM is generated with StartUpClk:CCLK (build/<top>_prom.bit).

import { Adept, Djtg, Chain, JtagSeq, STREAM_CLOCKS, byterev, bitHeader } from './adept.js';

// XCF instructions (8-bit IR)
export const XCF = {
  ISC_ENABLE: 0xe8, ISC_PROGRAM: 0xea, ISC_ADDRESS_SHIFT: 0xeb, ISC_ERASE: 0xec, ISC_DATA_SHIFT: 0xed,
  CONFIG: 0xee, ISC_READ: 0xef, ISC_DISABLE: 0xf0, ISCTESTSTATUS: 0xe3, BYPASS: 0xff,
};
export const FRAMES_PER_BLOCK = 32;
const TCK_HZ = 2_000_000;   // a conservative effective TCK rate of the Adept JTAG port (nominal 4 MHz)
const MAX_TCK_HZ = 10_000_000;   // the XCF0xS's fastest TCK (DS123, TAP timing: TCKMIN 100 ns)
// the longest a block takes to program: 14 ms (the fixed wait after ISC_PROGRAM of Xilinx's XCF00S
// algorithm, as xc3sprog's progalgxcf.cpp has it, also its poll limit of 28 x 0.5 ms), with margin
export const PROGRAM_S = 0.02;
// the XCF0xS by IDCODE bits 19..12: [size in bits, bits per block]
const SIZES = { 0x44: [1 << 20, 2048], 0x45: [2 << 20, 4096], 0x46: [4 << 20, 4096] };
const ST_DONE = 0x20;   // the Spartan-3E's DONE in its captured IR
export const NOT_DONE = 'the FPGA did not load from the PROM (mode jumper on ROM? PROM bitstream with StartUpClk:Cclk?)';

const fail = msg => { throw new Error(`Adept USB: ${msg}`); };
const hex8 = n => n.toString(16).padStart(8, '0');
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

/**
 * A .bit's header fields (a: design;UserID=…, b: part, c: date, d: time) and its configuration
 * data (the 'e' field), as xcf_prog.py's parse_bit.
 */
export function bitFields(bit) {
  if (bit.length < 13) fail('not a .bit file');
  const n = (bit[0] << 8) | bit[1];
  let i = 2 + n + 2;
  const fields = {};
  while (i < bit.length) {
    const key = String.fromCharCode(bit[i++]);
    if (key === 'e') {
      const len = ((bit[i] << 24) | (bit[i + 1] << 16) | (bit[i + 2] << 8) | bit[i + 3]) >>> 0;
      i += 4;
      if (i + len > bit.length) fail('the .bit file is truncated');
      return { fields, data: bit.subarray(i, i + len) };
    }
    const len = (bit[i] << 8) | bit[i + 1];
    i += 2;
    fields[key] = new TextDecoder('latin1').decode(bit.subarray(i, i + len)).replace(/\0+$/, '');
    i += len;
  }
  fail('no configuration data in the .bit file');
}

/** The PROM image of a configuration (bits of each byte reversed, padded with 0xFF to whole blocks). */
export function promImage(data, blockBits) {
  const bpb = blockBits / 8, blocks = Math.ceil(data.length / bpb);
  const image = new Uint8Array(blocks * bpb).fill(0xff);
  image.set(byterev(data));
  return image;
}

/** The size of an XCF0xS from its IDCODE: { size (bits), block (bits) }, or an error. */
export function xcfSize(idcode) {
  const s = SIZES[(idcode >>> 12) & 0xff];
  if (!s) fail(`unsupported Platform Flash IDCODE ${hex8(idcode)}`);
  return { size: s[0], block: s[1] };
}

/** The PROM of a chain (core/adept.js Chain) and its ISC operations (xcf_prog.py's class Xcf). */
// Each operation goes out as one JTAG stream (core/adept.js JtagSeq), the blocks of a program or a
// read several to a stream: a few USB transfers where a command a step took hundreds a block.
export class Xcf {
  constructor(chain, dev, { tckHz = TCK_HZ } = {}) {
    Object.assign(this, { chain, dev, tckHz }, xcfSize(dev.idcode));
    for (const d of chain.devices) d.cur = (1 << d.irLen) - 1;   // everything else in BYPASS
  }

  seq() { return new JtagSeq(this.chain); }
  // TCK cycles for at least `seconds` (and minTck)
  clocks(seconds, minTck = 1) { return Math.max(minTck, Math.floor(seconds * this.tckHz)); }
  // one instruction: what the PROM captured in its IR (its status bits)
  async ir(cmd) { const s = this.seq(), got = s.ir(this.dev, cmd); await s.run(); return got.num; }
  // stay in Run-Test/Idle clocking TCK for at least `seconds` (and minTck cycles)
  wait(seconds, minTck = 1) { return this.chain.clockRti(this.clocks(seconds, minTck)); }
  // ISC_ADDRESS_SHIFT of a frame, into a stream
  address(s, frame) {
    s.ir(this.dev, XCF.ISC_ADDRESS_SHIFT);
    s.rti(1);
    s.dr(this.dev, frame, 16);
    s.rti(1);
  }

  async status() {
    const s = this.seq();
    s.ir(this.dev, XCF.ISCTESTSTATUS);
    s.rti(1);
    const got = s.dr(this.dev, 0, 8, true);
    await s.run();
    return got.num;
  }
  // the ISC status's 'done' bit (0x04), TCK clocked between the polls
  async waitReady(step, timeout, what) {
    for (let t = 0; t < timeout - 1e-9; t += step) {
      await this.wait(step);
      if ((await this.status()) & 0x04) return;
    }
    fail(`${what} did not complete (timeout ${timeout.toFixed(1)} s)`);
  }
  async enable(code = 0x37) {
    const s = this.seq();
    s.ir(this.dev, XCF.ISC_ENABLE);
    s.dr(this.dev, code, 6);
    s.rti(1);
    await s.run();
  }
  async disable() {
    await this.ir(XCF.ISC_DISABLE);
    await this.wait(0.11);
    await this.ir(XCF.BYPASS);
    await this.wait(0, 1);
  }
  async writeProtected() {
    await this.ir(XCF.ISC_DISABLE);
    await this.wait(0.11);
    return !!((await this.ir(XCF.BYPASS)) & 0x08);
  }
  blocks(nbits) { return Math.ceil(nbits / this.block); }

  async erase() {
    if (await this.writeProtected()) fail('the PROM is write protected');
    await this.enable();
    const s = this.seq();
    this.address(s, 1);
    s.ir(this.dev, XCF.ISC_ERASE);
    await s.run();
    await this.waitReady(0.1, 20, 'erase');   // typically ~4 s on an XCF02S
    await this.disable();
  }
  checkFits(data) {
    const nbits = data.length * 8;
    if (nbits > this.size) fail(`bitstream (${nbits} bits) does not fit the PROM (${this.size} bits): the ${this.dev.name.toUpperCase()} holds ${this.size / 1024} Kbit`);
  }
  // per block ISC_DATA_SHIFT, ISC_ADDRESS_SHIFT, ISC_PROGRAM and the block's program time clocked in
  // Run-Test/Idle (PROGRAM_S: no poll a block), blocks streamed together; the status checked once,
  // after the last block (a block that did not program shows in the verify)
  async program(data, log = () => {}) {
    this.checkFits(data);
    const bpb = this.block / 8, image = promImage(data, this.block), n = image.length / bpb;
    await this.ir(XCF.ISC_DISABLE);
    await this.wait(0.001);
    await this.enable();
    const s = this.seq(), wait = this.clocks(PROGRAM_S);
    for (let i = 0, from = 0; i < n; i++) {
      s.ir(this.dev, XCF.ISC_DATA_SHIFT);
      s.dr(this.dev, image.subarray(i * bpb, (i + 1) * bpb), this.block);
      this.address(s, i * FRAMES_PER_BLOCK);
      s.ir(this.dev, XCF.ISC_PROGRAM);
      s.rti(wait);
      if (s.clocks + wait + 2 * this.block > STREAM_CLOCKS || i === n - 1) {
        await s.run();
        for (; from <= i; from++) if (from % 16 === 0 || from === n - 1) log(`  programmed block ${from + 1}/${n}`);
      }
    }
    await this.waitReady(0.0005, 0.05, `programming block ${n - 1}`);
    await this.disable();
  }
  // the first nbits of the PROM, as stored (bits of each byte reversed): per block its address,
  // ISC_READ, the read's TCK cycles and the block shifted out, blocks streamed together
  async read(nbits) {
    const bpb = this.block / 8, n = this.blocks(nbits), out = new Uint8Array(n * bpb);
    await this.enable(0x34);
    const s = this.seq(), wait = this.clocks(0.00005, 1);   // the read happens during these TCK cycles
    let got = [];
    for (let i = 0; i < n; i++) {
      this.address(s, i * FRAMES_PER_BLOCK);
      s.ir(this.dev, XCF.ISC_READ);
      s.rti(wait);
      got.push([i, s.dr(this.dev, null, this.block, true)]);
      if (s.clocks + wait + 2 * this.block > STREAM_CLOCKS || i === n - 1) {
        await s.run();
        for (const [j, c] of got) out.set(c.bytes, j * bpb);
        got = [];
      }
    }
    await this.disable();
    return out.subarray(0, (nbits + 7) >> 3);
  }
  async verify(data) {
    const got = await this.read(data.length * 8), want = byterev(data);
    for (let i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) fail(`verify FAILED at byte ${i} (block ${Math.floor(i * 8 / this.block)}): read ${got[i].toString(16).padStart(2, '0')} expected ${want[i].toString(16).padStart(2, '0')}`);
    }
  }
  async reconfigure() {
    await this.ir(XCF.CONFIG);
    await this.wait(0.001, 1);
    await this.ir(XCF.BYPASS);
    await this.wait(0, 1);
  }
}

/**
 * The TCK rate the waits are counted at: the port's (DJTG GET_SPEED), at least TCK_HZ (a wait then
 * lasts at least its time); when the port does not say, the PROM's maximum TCK (DS123: 10 MHz).
 */
export async function tckRate(port) {
  try {
    const hz = await port.getSpeed();
    if (hz > 0) return Math.max(TCK_HZ, hz);
  } catch { /* an Adept without the command */ }
  return MAX_TCK_HZ;
}

export const PROM_OPS = ['program', 'verify', 'erase', 'read', 'reconfigure'];

/**
 * A Platform Flash operation over the board's Adept USB (xcf_prog.py's main): op 'program' (erase,
 * program, then verify unless verify is false), 'verify', 'erase', 'read' (the whole PROM: returns
 * { data }, the bytes in the .bit's bit order) or 'reconfigure'; reconfigure with 'program': the FPGA
 * then reloads from the PROM (DONE checked). bit: the .bit (program / verify), checked against the
 * chain's FPGA. The console lines are those of the full application.
 */
export async function promAdept(usb, { op, bit = null, verify = true, reconfigure = false, log = () => {}, tckHz, sleep = sleepMs, donePolls = 25 } = {}) {
  if (!PROM_OPS.includes(op)) fail(`unknown PROM operation '${op}' (valid: ${PROM_OPS.join(', ')})`);
  let parsed = null;
  if (op === 'program' || op === 'verify') {
    if (!bit) fail(`${op} needs a .bit file`);
    parsed = bitFields(bit);
  }
  const a = await new Adept(usb).open();
  let chain = null;
  try {
    log(`Programmer: ${a.productName || 'Digilent Adept USB'}${a.serial ? ` (serial ${a.serial})` : ''}`);
    chain = new Chain(new Djtg(a, 0));
    await chain.init();
    log(`JTAG chain: ${chain.devices.map(d => `${d.name}(${hex8(d.idcode)})`).join(', ')}`);
    const prom = chain.devices.find(d => d.kind === 'prom');
    if (!prom) fail(`no XCF Platform Flash in the JTAG chain (found ${chain.devices.map(d => d.name.toUpperCase()).join(', ')})`);
    const fpga = chain.devices.find(d => d.kind === 'fpga') || null;
    const x = new Xcf(chain, prom, { tckHz: tckHz ?? await tckRate(chain.port) });
    const wp = await x.writeProtected();
    log(`PROM ${prom.name}: ${x.size / 1024} Kbit, ${x.block}-bit blocks${wp ? ', WRITE PROTECTED' : ''}`);
    let result = { op, prom: prom.name };
    if (parsed) {
      const part = bitHeader(bit)?.part;
      if (part && fpga && fpga.name !== part) fail(`the board's FPGA is a ${fpga.name.toUpperCase()}, the bitstream is for a ${part.toUpperCase()}`);
      x.checkFits(parsed.data);
    }
    try {
      if (op === 'read') {
        const data = byterev(await x.read(x.size));
        let used = data.length;
        while (used && data[used - 1] === 0xff) used--;
        log(`read ${data.length} bytes (${used} bytes before the erased tail)`);
        result.data = data;
      } else if (op === 'erase') {
        log('erasing...'); await x.erase(); log('erased');
      } else if (parsed) {
        const f = parsed.fields;
        log(`bitstream: design ${f.a ?? '?'} part ${f.b ?? '?'} ${f.c ?? ''} ${f.d ?? ''}, ${parsed.data.length} bytes`);
        if (op === 'program') {
          log('erasing...'); await x.erase();
          log('programming...'); await x.program(parsed.data, log);
        }
        if (op === 'verify' || verify) { log('verifying...'); await x.verify(parsed.data); log('verify OK'); }
      }
      if (op === 'reconfigure' || (op === 'program' && reconfigure)) {
        log('reconfiguring the FPGA from the PROM...');
        await x.reconfigure();
        let ok = false;
        if (fpga) {
          for (let i = 0; i < donePolls && !ok; i++) {
            await sleep(200);
            ok = !!((await chain.status(fpga)) & ST_DONE);
          }
        }
        log(ok ? 'STATUS: DONE' : 'STATUS: FPGA did not assert DONE (is the mode jumper set to ROM, and was the bitstream built with StartUpClk:CCLK?)');
        if (!ok) fail(NOT_DONE);
        result.done = true;
      }
    } catch (e) {
      // the PROM not left in ISC mode (it would neither configure the FPGA nor answer as usual)
      try { await x.disable(); } catch { /* the board is gone */ }
      throw e;
    }
    return result;
  } finally {
    if (chain) try { await chain.close(); } catch { /* ignore */ }
    await a.close();
  }
}
