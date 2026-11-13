// JTAG through the ULX3S's FTDI FT231X over WebUSB, for the browser edition (#2298). The FT231X has no MPSSE: its pins are
// driven in bit-bang mode, two bytes a TCK clock (TCK low, then high), as openFPGALoader's ft231X cable and ujprog do. The
// ULX3S's wiring (openFPGALoader's ulx3s board, ujprog's FT231X map): TCK on DSR (0x20), TMS on DCD (0x40), TDI on RI (0x80),
// TDO on CTS (0x08). Without a read, asynchronous bit-bang (mode 1: the bytes only written); with one, synchronous bit-bang
// (mode 4: each byte answered with the pins as they were just before it, so a clock's TDO is the answer to its TCK-high byte),
// in pieces that fit the chip's 512-byte RX FIFO.
// Ft231xJtag is a JTAG port with the Adept's methods (core/adept.js Djtg), so the Adept's Chain and JtagSeq drive it; the ECP5's
// SRAM loaded as Lattice's sysCONFIG says (programEcp5Sram: ISC_ENABLE, ISC_ERASE, LSC_INIT_ADDRESS, LSC_BITSTREAM_BURST, the
// status, ISC_DISABLE; the instructions openFPGALoader's SRAM path uses).
import { Chain, JtagSeq, byterev, secs } from './adept.js';
import { ecp5BitInfo, idHex } from './open-bitstream.js';

export const FT231X_FILTERS = [{ vendorId: 0x0403, productId: 0x6015 }];

const TCK = 0x20, TMS = 0x40, TDI = 0x80, TDO = 0x08, OUTPUTS = TCK | TMS | TDI;
const SIO_RESET = 0x00, SIO_SET_BAUDRATE = 0x03, SIO_SET_LATENCY = 0x09, SIO_SET_BITMODE = 0x0b;
const ASYNC = 0x01, SYNC = 0x04;
const PIECE = 256;   // the bytes of a synchronous write (their answers kept by the 512-byte RX FIFO)
const WRITE = 1 << 14;   // the bytes of an asynchronous write

const fail = msg => { throw new Error(`FT231X USB: ${msg}`); };
const ours = async f => { try { return await f(); } catch (e) { if (/^Adept USB: /.test(e.message)) e.message = e.message.replace(/^Adept USB: /, 'FT231X USB: '); throw e; } };
const wait = ms => new Promise(r => setTimeout(r, ms));

/** The FT231X as a JTAG port (core/adept.js Djtg's methods). */
export class Ft231xJtag {
  constructor(usb) { Object.assign(this, { usb, mode: null, rx: [] }); }

  async open() {
    const u = this.usb;
    await u.open();
    if (u.configuration == null) await u.selectConfiguration(1);
    try { await u.claimInterface(0); } catch (e) { fail(`the board is in use (another program, or the operating system's FTDI driver: ${e.message})`); }
    this.packet = u.configuration?.interfaces?.[0]?.alternate?.endpoints?.find(e => e.direction === 'in')?.packetSize || 64;
    this.ctrl = (request, value, index = 1) => u.controlTransferOut({ requestType: 'vendor', recipient: 'device', request, value, index });
    await this.ctrl(SIO_RESET, 0);
    await this.ctrl(SIO_RESET, 1);
    await this.ctrl(SIO_RESET, 2);
    await this.ctrl(SIO_SET_LATENCY, 1);
    await this.ctrl(SIO_SET_BAUDRATE, 3, 0);   // (1 MBaud: 3 MHz / 3, as ujprog's)
    await this.setMode(ASYNC);
    return this;
  }
  async close() {
    try { await this.ctrl?.(SIO_SET_BITMODE, 0); await this.usb.releaseInterface(0); } catch { /* gone */ }
    try { await this.usb.close(); } catch { /* gone */ }
  }
  async setMode(m) { if (this.mode !== m) { await this.ctrl(SIO_SET_BITMODE, (m << 8) | OUTPUTS); this.mode = m; } }
  async enable() { /* the pins set by open() */ }
  async disable() { /* close() resets the bit mode */ }

  async read(n) {
    for (let tries = 0; this.rx.length < n; tries++) {
      if (tries > 2000) fail(`no answer from the FT231X (${this.rx.length} of ${n} bytes)`);
      const r = await this.usb.transferIn(1, 512);
      const b = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      for (let i = 0; i < b.length; i += this.packet) this.rx.push(...b.subarray(i + 2, Math.min(i + this.packet, b.length)));
    }
    return this.rx.splice(0, n);
  }

  // n clocks, their TMS and TDI from tms(i), tdi(i); read: their TDO, LSB first
  async clocks(n, tms, tdi, read) {
    const bytes = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) { const v = (tms(i) ? TMS : 0) | (tdi(i) ? TDI : 0); bytes[2 * i] = v; bytes[2 * i + 1] = v | TCK; }
    if (!read) {
      await this.setMode(ASYNC);
      for (let a = 0; a < bytes.length; a += WRITE) await this.usb.transferOut(2, bytes.subarray(a, a + WRITE));
      return null;
    }
    await this.setMode(SYNC);
    const out = new Uint8Array((n + 7) >> 3);
    for (let a = 0; a < bytes.length; a += PIECE) {
      const piece = bytes.subarray(a, a + PIECE);
      await this.usb.transferOut(2, piece);
      const got = await this.read(piece.length);
      // (the answer to a clock's TCK-high byte: the pins with TCK still low, TDO as the TAP drives it before the edge)
      for (let k = 1; k < got.length; k += 2) { const i = (a + k) >> 1; if (got[k] & TDO) out[i >> 3] |= 1 << (i & 7); }
    }
    return out;
  }

  putTmsTdiBits(oe, bits, data) {
    const pair = i => (data[i >> 2] >> ((i & 3) << 1)) & 3;
    return this.clocks(bits, i => pair(i) >> 1, i => pair(i) & 1, oe);
  }
  putTdiBits(oe, tms, bits, data) { return this.clocks(bits, () => tms, i => (data[i >> 3] >> (i & 7)) & 1, oe); }
  getTdoBits(tms, tdi, bits) { return this.clocks(bits, () => tms, () => tdi, true); }
  async clockTck(tms, tdi, bits) { await this.clocks(bits, () => tms, () => tdi, false); }
}

// The ECP5's JTAG configuration (Lattice's TN1260; openFPGALoader's SRAM path): its instructions (8-bit IR), its status's bits
export const ECP5 = { IDCODE: 0xe0, STATUS: 0x3c, ISC_ENABLE: 0xc6, ISC_ERASE: 0x0e, INIT_ADDRESS: 0x46, BURST: 0x7a, ISC_DISABLE: 0x26, BYPASS: 0xff };
export const ECP5_STATUS = { DONE: 1 << 8, ISC_EN: 1 << 9, BUSY: 1 << 12, FAIL: 1 << 13, CHECK_SHIFT: 23, CHECK_MASK: 0x0f << 23 };

/** Open the ULX3S's FT231X and scan its chain: { devices } (nearest TDI first). */
export async function scanFt231x(usb, { log = () => {} } = {}) {
  const port = await new Ft231xJtag(usb).open();
  try {
    log('Programmer: the board\'s FT231X (JTAG, bit-bang), from the browser (WebUSB)');
    const chain = new Chain(port);
    await ours(() => chain.init());
    const devices = [...chain.devices].reverse().map(d => ({ name: d.name, idcode: d.idcode, kind: d.kind }));
    devices.forEach((d, i) => log(`Position ${i + 1}: ${d.name.toUpperCase()} (IDCODE ${idHex(d.idcode)})`));
    return { devices };
  } finally { await port.close(); }
}

/**
 * An ECP5's SRAM loaded with a .bit (ecppack's) through the ULX3S's FT231X: ISC mode entered for the SRAM, the SRAM erased
 * (BUSY waited for), the configuration from its preamble on sent with LSC_BITSTREAM_BURST (each byte its most significant bit
 * first, as the FPGA reads it), its check read in the status, ISC mode left; DONE read in the status.
 */
export async function programEcp5Sram(usb, bit, { idcode = null, log = () => {}, maxPolls = 2000, sleep = wait, now = () => performance.now() } = {}) {
  let info;
  try { info = ecp5BitInfo(bit); } catch (e) { fail(e.message); }
  const data = bit.subarray(info.dataOffset);
  const port = await new Ft231xJtag(usb).open();
  const start = now();
  try {
    log('Programmer: the board\'s FT231X (JTAG, bit-bang), from the browser (WebUSB)');
    const chain = new Chain(port);
    await ours(() => chain.init());
    const fpga = chain.devices.find(d => d.kind === 'fpga' && /^lfe5/.test(d.name));
    if (!fpga) fail(`no ECP5 FPGA on the JTAG chain (found ${chain.devices.map(d => d.name).join(', ') || 'nothing'})`);
    log(`JTAG chain: ${[...chain.devices].reverse().map(d => d.name.toUpperCase()).join(' → ')}`);
    if (idcode != null && (fpga.idcode >>> 0) !== (idcode >>> 0)) fail(`the board's FPGA is a ${fpga.name.toUpperCase()} (IDCODE ${idHex(fpga.idcode)}), the bitstream is for ${idHex(idcode)}`);
    const seq = () => new JtagSeq(chain);
    const status = async () => { const s = seq(); s.ir(fpga, ECP5.STATUS); const c = s.dr(fpga, 0, 32, true); await s.run(); return c.num >>> 0; };
    const hex = v => `0x${v.toString(16).padStart(8, '0')}`;
    const notBusy = async what => {
      for (let polls = 0; ; polls++) {
        const st = await status();
        if (!(st & ECP5_STATUS.BUSY)) return st;
        if (polls >= maxPolls) fail(`the FPGA stayed busy (${what}, status ${hex(st)})`);
        await sleep(1);
      }
    };
    // ISC mode, for the SRAM (its DR 0x00); then the SRAM erased (0x01)
    let s = seq();
    s.ir(fpga, ECP5.ISC_ENABLE); s.dr(fpga, 0x00, 8); s.rti(1000);
    await s.run();
    let st = await notBusy('ISC_ENABLE');
    if (!(st & ECP5_STATUS.ISC_EN)) fail(`the FPGA did not enter its configuration mode (status ${hex(st)})`);
    log('Erasing the SRAM');
    s = seq();
    s.ir(fpga, ECP5.ISC_ERASE); s.dr(fpga, 0x01, 8); s.rti(1000);
    await s.run();
    await notBusy('erasing');
    log(`LSC_BITSTREAM_BURST: ${data.length} bytes`);
    const t = now();
    s = seq();
    s.ir(fpga, ECP5.INIT_ADDRESS); s.rti(1000);
    s.ir(fpga, ECP5.BURST); s.rti(2);
    s.dr(fpga, byterev(data), data.length * 8);
    s.rti(1000);
    await s.run();
    log(`  bitstream: ${data.length * 8} bits in ${secs(now() - t)}`);
    st = await status();
    const check = (st & ECP5_STATUS.CHECK_MASK) >>> ECP5_STATUS.CHECK_SHIFT;
    if (check === 1) fail('the FPGA refused the bitstream: its IDCODE is another device\'s');
    if (check || (st & ECP5_STATUS.FAIL)) fail(`the FPGA refused the bitstream (status ${hex(st)}, configuration check ${check}): a corrupt file?`);
    s = seq();
    s.ir(fpga, ECP5.ISC_DISABLE); s.rti(1000);
    await s.run();
    st = await notBusy('ISC_DISABLE');
    s = seq(); s.ir(fpga, ECP5.BYPASS); await s.run();
    if (st & ECP5_STATUS.ISC_EN) fail(`the FPGA did not leave its configuration mode (status ${hex(st)})`);
    if (!(st & ECP5_STATUS.DONE)) fail(`DONE did not go high (status ${hex(st)}): the bitstream was not accepted`);
    log(`DONE: the FPGA is configured in ${secs(now() - start)}`);
    return { fpga: fpga.name, status: st };
  } finally { await port.close(); }
}
