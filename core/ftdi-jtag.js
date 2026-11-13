// JTAG through an FTDI FT2232H in MPSSE mode over WebUSB, for the browser edition (#2298): the boards whose USB-JTAG is an
// FT2232H (the Basys 3's and the Nexys A7's Digilent USB-JTAG) or behaves as one (the Tang Nano 9K's BL702). Its channel A:
//   ADBUS0 TCK, ADBUS1 TDI, ADBUS2 TDO (in), ADBUS3 TMS; the cable's other pins as openFPGALoader sets them (CABLES).
// FtdiJtag is a JTAG port with the methods of the Adept's (core/adept.js Djtg), so the Adept's Chain and JtagSeq drive it:
// an Artix-7 configured as a Spartan-3E is (configureXilinx, UG470), a Gowin GW1N as Gowin's JTAG configuration says
// (programGowinSram: its SRAM erased, then written; UG290's instructions).
//
// MPSSE commands (FTDI AN_108), LSB first, TDI / TMS out on TCK's falling edge, TDO read on its rising one:
//   0x19 / 0x39 bytes out / in and out, 0x1B / 0x3B bits, 0x4B / 0x6B TMS bits (TDI held at bit 7), 0x8E / 0x8F clocks with
//   no data (bits / bytes); a read of n bits comes back in one byte, shifted in from bit 7.
import { FtdiSpi, FTDI_VENDOR, FT2232H } from './ftdi-ice40.js';
import { Chain, JtagSeq, configureXilinx, byterev, secs } from './adept.js';

export const FTDI_JTAG_FILTERS = [{ vendorId: FTDI_VENDOR, productId: FT2232H }];

/** The boards' cables: the low and high byte's [value, direction] (openFPGALoader's cable list: digilent, ft2232). */
export const CABLES = {
  digilent: { low: [0xe8, 0xeb], high: [0x00, 0x60], what: 'the board\'s Digilent USB-JTAG (FT2232H)' },
  ft2232: { low: [0x08, 0x0b], high: [0x08, 0x0b], what: 'the board\'s USB-JTAG (an FT2232H, or its BL702)' },
};

const SET_LOW = 0x80, SET_HIGH = 0x82, SEND_IMMEDIATE = 0x87;
const BYTES_OUT = 0x19, BYTES_IO = 0x39, BITS_OUT = 0x1b, BITS_IO = 0x3b, TMS_OUT = 0x4b, TMS_IO = 0x6b, CLK_BITS = 0x8e, CLK_BYTES = 0x8f;
const MAX_BYTES = 0x10000;   // a command's bytes at most

const fail = msg => { throw new Error(`FTDI USB: ${msg}`); };
// (the errors of the Adept's chain and sequence, core/adept.js, said of this USB)
const ours = async f => { try { return await f(); } catch (e) { if (/^Adept USB: /.test(e.message)) e.message = e.message.replace(/^Adept USB: /, 'FTDI USB: '); throw e; } };
const pairAt = (data, i) => (data[i >> 2] >> ((i & 3) << 1)) & 3;   // (TDI even bit, TMS odd bit: Djtg's pairs)

/** A growing buffer of MPSSE commands, and the reads they make (bits each, in order). */
class Out {
  constructor() { this.b = new Uint8Array(256); this.n = 0; this.reads = []; }
  push(...v) { this.need(v.length); for (const x of v) this.b[this.n++] = x; }
  bytes(d) { this.need(d.length); this.b.set(d, this.n); this.n += d.length; }
  need(k) { if (this.n + k > this.b.length) { const nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); nb.set(this.b.subarray(0, this.n)); this.b = nb; } }
}

/** The FT2232H's channel A as a JTAG port (core/adept.js Djtg's methods). */
export class FtdiJtag {
  constructor(usb, cable = 'ft2232', { sleep } = {}) {
    this.cable = CABLES[cable] || fail(`unknown cable '${cable}'`);
    this.mp = new FtdiSpi(usb, sleep ? { sleep } : {});
  }
  async open() { await this.mp.open(); return this; }
  close() { return this.mp.close(); }
  async enable() {
    const { low, high } = this.cable, o = new Out();
    o.push(SET_LOW, ...low, SET_HIGH, ...high);
    await this.send(o);
  }
  async disable() { /* the pins stay as they are: close() resets the bit mode */ }

  // the commands out, then their reads back: the bits of each read, LSB first, packed one after another
  async send(o) {
    const bits = o.reads.reduce((a, r) => a + r, 0);
    if (bits) o.push(SEND_IMMEDIATE);
    await this.mp.usb.transferOut(2, o.b.slice(0, o.n));
    if (!bits) return null;
    // a read of 8k bits: k bytes; of fewer: one byte, its bits at the top
    const raw = await this.mp.read(o.reads.reduce((a, r) => a + Math.ceil(r / 8), 0));
    const out = new Uint8Array((bits + 7) >> 3);
    let at = 0, k = 0;
    for (const r of o.reads) {
      if (r % 8 === 0) for (let j = 0; j < r / 8; j++, at += 8) out[at >> 3] = raw[k++];
      else { const v = raw[k++] >> (8 - r); for (let j = 0; j < r; j++, at++) out[at >> 3] |= ((v >> j) & 1) << (at & 7); }
    }
    return out;
  }

  // TMS / TDI pairs (Djtg's): runs of up to 7 clocks with the same TDI as one TMS command
  async putTmsTdiBits(oe, bits, data) {
    const o = new Out();
    for (let i = 0; i < bits;) {
      const tdi = pairAt(data, i) & 1;
      let n = 0, tms = 0;
      while (i + n < bits && n < 7 && (pairAt(data, i + n) & 1) === tdi) { tms |= (pairAt(data, i + n) >> 1) << n; n++; }
      o.push(oe ? TMS_IO : TMS_OUT, n - 1, tms | (tdi << 7));
      if (oe) o.reads.push(n);
      i += n;
    }
    return this.send(o);
  }

  // bits of TDI, TMS held at tms (high: each bit a TMS command, as Chain's last bit of a shift is)
  async putTdiBits(oe, tms, bits, data) {
    const o = new Out();
    if (tms) {
      for (let i = 0; i < bits; i++) { o.push(oe ? TMS_IO : TMS_OUT, 0, 1 | (((data[i >> 3] >> (i & 7)) & 1) << 7)); if (oe) o.reads.push(1); }
      return this.send(o);
    }
    const whole = bits >> 3, rest = bits & 7;
    for (let a = 0; a < whole; a += MAX_BYTES) {
      const n = Math.min(MAX_BYTES, whole - a);
      o.push(oe ? BYTES_IO : BYTES_OUT, (n - 1) & 0xff, (n - 1) >> 8);
      o.bytes(data.subarray(a, a + n));
      if (oe) o.reads.push(n * 8);
    }
    if (rest) { o.push(oe ? BITS_IO : BITS_OUT, rest - 1, data[whole]); if (oe) o.reads.push(rest); }
    return this.send(o);
  }

  getTdoBits(tms, tdi, bits) {
    if (tms) fail('TDO read with TMS high');
    return this.putTdiBits(true, false, bits, new Uint8Array((bits + 7) >> 3).fill(tdi ? 0xff : 0));
  }

  // clocks with no data, TMS where it is (low: in Run-Test/Idle)
  async clockTck(tms, tdi, bits) {
    if (tms) fail('clocks with TMS high');
    const o = new Out();
    for (let k = bits >> 3; k > 0; k -= MAX_BYTES) { const n = Math.min(MAX_BYTES, k); o.push(CLK_BYTES, (n - 1) & 0xff, (n - 1) >> 8); }
    if (bits & 7) o.push(CLK_BITS, (bits & 7) - 1);
    await this.send(o);
  }
}

/** Open the board's USB-JTAG and scan its chain: { devices: [{ name, idcode, kind }] } (nearest TDI first). */
export async function scanFtdi(usb, { cable = 'ft2232', log = () => {} } = {}) {
  const port = await new FtdiJtag(usb, cable).open();
  try {
    log(`Programmer: ${CABLES[cable].what}, from the browser (WebUSB)`);
    const chain = new Chain(port);
    await ours(() => chain.init());
    const devices = [...chain.devices].reverse().map(d => ({ name: d.name, idcode: d.idcode, kind: d.kind }));
    devices.forEach((d, i) => log(`Position ${i + 1}: ${d.name.toUpperCase()} (IDCODE 0x${d.idcode.toString(16).padStart(8, '0')})`));
    return { devices };
  } finally { await port.close(); }
}

/** A Xilinx 7-series FPGA configured (SRAM) with a .bit through the board's FT2232H (the Basys 3, the Nexys A7). */
export async function programFtdiXilinx(usb, bit, { cable = 'digilent', part = null, log = () => {}, maxPolls = 2000, now = () => performance.now() } = {}) {
  const port = await new FtdiJtag(usb, cable).open();
  try {
    log(`Programmer: ${CABLES[cable].what}, from the browser (WebUSB)`);
    return await ours(() => configureXilinx(new Chain(port), bit, { part, family: 'Xilinx', log, maxPolls, now }));
  } finally { await port.close(); }
}

// The Gowin GW1N's JTAG configuration (Gowin's UG290): its instructions (8-bit IR) and its status register's bits
export const GOWIN = { NOOP: 0x02, ERASE_SRAM: 0x05, XFER_DONE: 0x09, IDCODE: 0x11, INIT_ADDR: 0x12, CONFIG_ENABLE: 0x15, XFER_WRITE: 0x17, CONFIG_DISABLE: 0x3a, STATUS: 0x41 };
export const GOWIN_STATUS = { CRC_ERROR: 1 << 0, BAD_COMMAND: 1 << 1, ID_VERIFY_FAILED: 1 << 2, TIMEOUT: 1 << 3, MEMORY_ERASE: 1 << 5, EDIT_MODE: 1 << 7, DONE: 1 << 13 };

/**
 * A Gowin GW1N's SRAM loaded with a .fs's bytes (core/open-bitstream.js gowinFsInfo) through the board's USB-JTAG (the Tang
 * Nano 9K's BL702): the configuration mode entered, the SRAM erased (its status's MEMORY_ERASE waited for), then the bytes
 * written (XFER_WRITE, each byte its most significant bit first, as the .fs lists them), the mode left; DONE read in the status.
 */
export async function programGowinSram(usb, bytes, { cable = 'ft2232', idcode = null, log = () => {}, maxPolls = 2000, now = () => performance.now() } = {}) {
  if (!bytes?.length) fail('no .fs to load');
  const port = await new FtdiJtag(usb, cable).open();
  const start = now();
  try {
    log(`Programmer: ${CABLES[cable].what}, from the browser (WebUSB)`);
    const chain = new Chain(port);
    await ours(() => chain.init());
    const fpga = chain.devices.find(d => d.kind === 'fpga' && /^gw/.test(d.name));
    if (!fpga) fail(`no Gowin FPGA on the JTAG chain (found ${chain.devices.map(d => d.name).join(', ') || 'nothing'})`);
    log(`JTAG chain: ${[...chain.devices].reverse().map(d => d.name.toUpperCase()).join(' → ')}`);
    if (idcode != null && (fpga.idcode >>> 0) !== (idcode >>> 0)) fail(`the board's FPGA has the IDCODE 0x${fpga.idcode.toString(16).padStart(8, '0')}, the bitstream is for 0x${(idcode >>> 0).toString(16).padStart(8, '0')}`);
    const seq = () => new JtagSeq(chain);
    // an instruction, then a few clocks in Run-Test/Idle for it to run
    const instr = (s, i) => { s.ir(fpga, i); s.rti(6); };
    const status = async () => { const s = seq(); instr(s, GOWIN.STATUS); const c = s.dr(fpga, 0, 32, true); await s.run(); return c.num >>> 0; };
    log('Erasing the SRAM');
    let s = seq();
    instr(s, GOWIN.CONFIG_ENABLE); instr(s, GOWIN.ERASE_SRAM); instr(s, GOWIN.NOOP);
    await s.run();
    let polls = 0, st;
    while (!((st = await status()) & GOWIN_STATUS.MEMORY_ERASE)) {
      if (++polls > maxPolls) fail(`the SRAM was not erased (status 0x${st.toString(16).padStart(8, '0')})`);
      s = seq(); s.rti(1000); await s.run();
    }
    s = seq();
    instr(s, GOWIN.XFER_DONE); instr(s, GOWIN.NOOP);
    log(`XFER_WRITE: ${bytes.length} bytes`);
    const t = now();
    instr(s, GOWIN.INIT_ADDR); instr(s, GOWIN.XFER_WRITE);
    s.dr(fpga, byterev(bytes), bytes.length * 8);
    instr(s, GOWIN.CONFIG_DISABLE); instr(s, GOWIN.NOOP);
    s.rti(1000);
    await s.run();
    log(`  bitstream: ${bytes.length * 8} bits in ${secs(now() - t)}`);
    st = await status();
    if (st & GOWIN_STATUS.ID_VERIFY_FAILED) fail('the FPGA refused the bitstream: its IDCODE is another device\'s');
    if (st & GOWIN_STATUS.CRC_ERROR) fail('the FPGA found a CRC error in the bitstream (a corrupt file?)');
    if (!(st & GOWIN_STATUS.DONE)) fail(`DONE did not go high (status 0x${st.toString(16).padStart(8, '0')}): the bitstream was not accepted`);
    log(`DONE: the FPGA is configured in ${secs(now() - start)}`);
    return { fpga: fpga.name, status: st };
  } finally { await port.close(); }
}
