// An iCE40 board's FTDI FT2232H (the iCEBreaker's, #2298) over WebUSB, for the browser edition: the .bin written into the
// board's SPI flash, then the FPGA released to load it. The protocol of IceStorm's iceprog (github.com/YosysHQ/icestorm,
// ISC licence), on the FT2232H's channel A in MPSSE mode:
//   ADBUS0 SCK, ADBUS1 MOSI (to the flash's SI), ADBUS2 MISO, ADBUS4 the flash's CS (low: selected), ADBUS6 CDONE (in),
//   ADBUS7 CRESET_B (low: the FPGA held in reset, its SPI pins off the flash).
//
// usb: a WebUSB USBDevice (navigator.usb), or anything with its methods (the tests' simulated board, test/fixtures/ftdi-sim.js):
// open, selectConfiguration, claimInterface, releaseInterface, close, controlTransferOut(setup), transferOut(endpoint, data),
// transferIn(endpoint, length). Every packet the FT2232H sends begins with its two modem status bytes.

export const FTDI_VENDOR = 0x0403, FT2232H = 0x6010;
export const FTDI_FILTERS = [{ vendorId: FTDI_VENDOR, productId: FT2232H }];

const SIO_RESET = 0x00, SIO_SET_LATENCY = 0x09, SIO_SET_BITMODE = 0x0b;
const RESET_SIO = 0, PURGE_RX = 1, PURGE_TX = 2;
const BITMODE_RESET = 0x00, BITMODE_MPSSE = 0x02;
// MPSSE commands
const SET_LOW = 0x80, GET_LOW = 0x81, LOOPBACK_OFF = 0x85, DIVISOR = 0x86, SEND_IMMEDIATE = 0x87, DIV5_OFF = 0x8a, THREE_PHASE_OFF = 0x8d, ADAPTIVE_OFF = 0x97;
const OUT_BYTES = 0x11, INOUT_BYTES = 0x31;   // (MSB first, written on the falling edge, read on the rising one: SPI mode 0)
const CS = 0x10, CDONE = 0x40, CRESET = 0x80, DIRECTION = 0x93;   // (SCK, MOSI, CS and CRESET_B driven)
// the flash's commands (Winbond W25Q and the like)
const POWER_UP = 0xab, POWER_DOWN = 0xb9, JEDEC_ID = 0x9f, WRITE_ENABLE = 0x06, READ_STATUS = 0x05, BLOCK_ERASE_64K = 0xd8, PAGE_PROGRAM = 0x02, READ = 0x03;
export const BLOCK = 0x10000, PAGE = 256;
const CHUNK = 4096;   // the bytes a read asks at a time

const fail = msg => { throw new Error(`FTDI USB: ${msg}`); };
const hex = (b, n = 2) => `0x${b.toString(16).padStart(n, '0')}`;
const addr24 = a => [(a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff];
const wait = ms => new Promise(r => setTimeout(r, ms));

/** The FT2232H's channel A in MPSSE mode, and the SPI flash behind it. */
export class FtdiSpi {
  constructor(usb, { sleep = wait } = {}) { this.usb = usb; this.sleep = sleep; this.rx = []; }

  async open() {
    const u = this.usb;
    await u.open();
    if (u.configuration == null) await u.selectConfiguration(1);
    try { await u.claimInterface(0); } catch (e) { fail(`the board is in use (another program, or the operating system's FTDI driver: ${e.message})`); }
    this.packet = u.configuration?.interfaces?.[0]?.alternate?.endpoints?.find(e => e.direction === 'in')?.packetSize || 512;
    const ctrl = (request, value) => u.controlTransferOut({ requestType: 'vendor', recipient: 'device', request, value, index: 1 });
    await ctrl(SIO_RESET, RESET_SIO);
    await ctrl(SIO_RESET, PURGE_RX);
    await ctrl(SIO_RESET, PURGE_TX);
    await ctrl(SIO_SET_LATENCY, 1);
    await ctrl(SIO_SET_BITMODE, (BITMODE_RESET << 8) | 0xff);
    await ctrl(SIO_SET_BITMODE, (BITMODE_MPSSE << 8) | 0xff);
    this.ctrl = ctrl;
    // in step with the MPSSE: a bad command (0xAA) is answered 0xFA 0xAA
    await this.write([0xaa, SEND_IMMEDIATE]);
    const sync = await this.read(2);
    if (sync[0] !== 0xfa || sync[1] !== 0xaa) fail(`the FT2232H did not answer in MPSSE mode (${[...sync].map(b => hex(b)).join(' ')})`);
    // a 6 MHz SPI clock (60 MHz / ((1 + 4) * 2)), as iceprog's
    await this.write([DIV5_OFF, ADAPTIVE_OFF, THREE_PHASE_OFF, LOOPBACK_OFF, DIVISOR, 4, 0]);
  }

  async close() {
    try { await this.ctrl?.(SIO_SET_BITMODE, (BITMODE_RESET << 8) | 0xff); await this.usb.releaseInterface(0); } catch { /* gone */ }
    try { await this.usb.close(); } catch { /* gone */ }
  }

  write(bytes) { return this.usb.transferOut(2, new Uint8Array(bytes)); }

  async read(n) {
    for (let tries = 0; this.rx.length < n; tries++) {
      if (tries > 2000) fail(`no answer from the FT2232H (${this.rx.length} of ${n} bytes)`);
      const r = await this.usb.transferIn(1, 512);
      const b = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      // every packet: 2 status bytes, then data (512-byte packets at high speed, 64 at full speed)
      for (let i = 0; i < b.length; i += this.packet) this.rx.push(...b.subarray(i + 2, Math.min(i + this.packet, b.length)));
    }
    return new Uint8Array(this.rx.splice(0, n));
  }

  /** CS (high: the flash deselected) and CRESET_B (low: the FPGA held in reset). */
  gpio(cs, creset) { return this.write([SET_LOW, (cs ? CS : 0) | (creset ? CRESET : 0), DIRECTION]); }

  async cdone() {
    await this.write([GET_LOW, SEND_IMMEDIATE]);
    return ((await this.read(1))[0] & CDONE) !== 0;
  }

  /** One flash command, the flash selected for it: the bytes read back while out goes out (in: how many after out). */
  async command(out, inBytes = 0) {
    const data = [...out, ...new Array(inBytes).fill(0)];
    await this.write([SET_LOW, 0, DIRECTION]);   // (CS low, CRESET_B held low)
    for (let i = 0; i < data.length; i += 0x10000) {
      const part = data.slice(i, i + 0x10000), n = part.length - 1;
      await this.write([inBytes ? INOUT_BYTES : OUT_BYTES, n & 0xff, n >> 8, ...part]);
    }
    await this.write([SET_LOW, CS, DIRECTION, ...(inBytes ? [SEND_IMMEDIATE] : [])]);
    return inBytes ? (await this.read(data.length)).subarray(out.length) : null;
  }

  async busyWait(what, limit = 5000) {
    for (let i = 0; i < limit; i++) {
      if (!((await this.command([READ_STATUS], 1))[0] & 1)) return;
      await this.sleep(1);
    }
    fail(`the flash stayed busy (${what})`);
  }
}

/**
 * The .bin of an iCE40 into the board's SPI flash, read back and compared, then the FPGA released to load it (CDONE).
 * The lines of the full application's job (server/programmer.js): { size, flashId, cdone }.
 */
export async function programIce40Flash(usb, bin, { log = () => {}, sleep = wait, now = () => performance.now() } = {}) {
  if (!bin?.length) fail('no .bin to write');
  const f = new FtdiSpi(usb, { sleep });
  const t = now();
  log(`Configuration file: ${bin.length} bytes (an iCE40's .bin)`);
  log('Programming (SPI flash, non-volatile) through the board\'s FT2232H (WebUSB)');
  await f.open();
  try {
    // the FPGA held in reset (its SPI pins let go of the flash), the flash woken up
    await f.gpio(true, false);
    await sleep(100);
    await f.command([POWER_UP]);
    const id = await f.command([JEDEC_ID], 3);
    const flashId = [...id].map(b => b.toString(16).padStart(2, '0')).join(' ');
    if (id.every(b => b === 0xff) || id.every(b => b === 0)) fail(`no SPI flash answers (JEDEC id ${flashId}): is the board an iCE40's with its flash on the FT2232H?`);
    log(`Flash JEDEC id: ${flashId}`);
    const blocks = Math.ceil(bin.length / BLOCK);
    log(`Erasing ${blocks} block(s) of 64 KB...`);
    for (let b = 0; b < blocks; b++) {
      await f.command([WRITE_ENABLE]);
      await f.command([BLOCK_ERASE_64K, ...addr24(b * BLOCK)]);
      await f.busyWait('erasing');
    }
    log(`Writing ${bin.length} bytes...`);
    for (let a = 0; a < bin.length; a += PAGE) {
      await f.command([WRITE_ENABLE]);
      await f.command([PAGE_PROGRAM, ...addr24(a), ...bin.subarray(a, a + PAGE)]);
      await f.busyWait('writing');
    }
    log('Verifying...');
    for (let a = 0; a < bin.length; a += CHUNK) {
      const n = Math.min(CHUNK, bin.length - a), got = await f.command([READ, ...addr24(a)], n);
      const k = got.findIndex((v, i) => v !== bin[a + i]);
      if (k >= 0) fail(`verification failed at ${hex(a + k, 6)}: ${hex(got[k])} read, ${hex(bin[a + k])} written`);
    }
    await f.command([POWER_DOWN]);
    // the FPGA released: it loads the flash, then raises CDONE
    await f.gpio(true, true);
    let cdone = false;
    for (let i = 0; i < 50 && !cdone; i++) { await sleep(10); cdone = await f.cdone(); }
    if (!cdone) fail('the FPGA did not raise CDONE after loading the flash (configuration failed)');
    log(`STATUS: CDONE high: the FPGA loaded the design (${((now() - t) / 1000).toFixed(1)} s)`);
    log('Programming finished.');
    return { size: bin.length, flashId, cdone };
  } finally { await f.close(); }
}
