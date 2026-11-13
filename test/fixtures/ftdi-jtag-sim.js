// A simulated board with an FTDI FT2232H in MPSSE mode on a JTAG chain (#2298), for core/ftdi-jtag.js's tests: WebUSB's
// USBDevice methods; the MPSSE's commands as FTDI's AN_108 defines them (bytes and bits LSB first, TMS commands with TDI at
// bit 7, clocks with no data, a read of n bits shifted in from bit 7, a bad command answered FA <op>); an IEEE 1149.1 TAP on
// each clock; and one device behind it:
//   - an Artix-7 (UG470): IR of 6 bits, its capture 01 with INIT_COMPLETE (bit 4) and DONE (bit 5); IDCODE (09), JPROGRAM
//     (0B: cleared, INIT back after a while), CFG_IN (05: the bits taken), JSTART (0C: in Run-Test/Idle, the start-up: DONE
//     when the configuration, from its sync word AA995566, holds the IDCODE packet 30018001 with this device's IDCODE);
//   - a Gowin GW1NR-9C (UG290): IR of 8 bits; IDCODE (11), STATUS (41, 32 bits), CONFIG_ENABLE (15) / CONFIG_DISABLE (3A)
//     the configuration mode, ERASE_SRAM (05, in that mode: MEMORY_ERASE set after clocks in Run-Test/Idle), XFER_DONE (09),
//     INIT_ADDR (12), XFER_WRITE (17: the bits taken, in that mode, after an erase), NOOP (02); on CONFIG_DISABLE the SRAM's
//     bytes (MSB first) checked: its IDCODE command 06 00 00 00 <IDCODE> this device's, else ID_VERIFY_FAILED; DONE when it is.
// What breaks the protocol (an erase or a write outside the configuration mode, a write before an erase) goes to errors.
//   - an ECP5 (the ULX3S's, for test/fixtures/ft231x-sim.js): see Ecp5 below.
//   const { usb, st } = ftdiJtagBoard({ device: 'xc7a35t' }); st.dev.config: the bytes taken, st.dev.done.

const XC7 = { xc7a35t: 0x0362d093, xc7a100t: 0x13631093 };
const SYNC = 0xaa995566;
const NEXT = {
  TLR: ['RTI', 'TLR'], RTI: ['RTI', 'SDS'], SDS: ['CDR', 'SIS'], CDR: ['SDR', 'E1D'], SDR: ['SDR', 'E1D'], E1D: ['PDR', 'UDR'],
  PDR: ['PDR', 'E2D'], E2D: ['SDR', 'UDR'], UDR: ['RTI', 'SDS'], SIS: ['CIR', 'TLR'], CIR: ['SIR', 'E1I'], SIR: ['SIR', 'E1I'],
  E1I: ['PIR', 'UIR'], PIR: ['PIR', 'E2I'], E2I: ['SIR', 'UIR'], UIR: ['RTI', 'SDS'],
};
// bits (in order) as bytes, each byte's first bit its most significant
const msbBytes = bits => { const out = new Uint8Array(bits.length >> 3); for (let k = 0; k < out.length * 8; k++) out[k >> 3] |= bits[k] << (7 - (k & 7)); return out; };
const word = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

class Artix7 {
  constructor(name, { initDelay = 30, startClocks = 8 } = {}) {
    Object.assign(this, { name, irLen: 6, idcode: XC7[name], initAfter: initDelay, startAfter: startClocks, done: false, init: true, config: null, stream: [], wait: 0, clocks: 0 });
    this.reset();
  }
  reset() { this.ir = 0x09; }
  captureIr() { return 0x01 | (this.init ? 0x10 : 0) | (this.done ? 0x20 : 0); }
  captureDr() { return this.ir === 0x09 ? [this.idcode, 32] : [0, 1]; }
  update() {
    if (this.ir === 0x0b) { this.done = false; this.init = false; this.wait = this.initAfter; this.stream = []; this.config = null; }
    if (this.ir === 0x0c) this.clocks = 0;
  }
  shiftedIn(bit) { if (this.ir === 0x05 && this.init) this.stream.push(bit); }
  clock(state) {
    if (!this.init && --this.wait <= 0) this.init = true;
    if (state === 'RTI' && this.ir === 0x0c && ++this.clocks >= this.startAfter && !this.done) this.start();
  }
  start() {
    let w = 0;
    const bits = this.stream;
    for (let i = 0; i < bits.length; i++) {
      w = ((w << 1) | bits[i]) >>> 0;
      if (w !== SYNC || i < 31) continue;
      const cfg = msbBytes(bits.slice(i - 31));
      this.config = cfg;
      for (let k = 4; k + 8 <= cfg.length; k += 4) if (word(cfg, k) === 0x30018001) { this.done = word(cfg, k + 4) === this.idcode; return; }
      return;
    }
  }
}

const G = { NOOP: 0x02, ERASE_SRAM: 0x05, XFER_DONE: 0x09, IDCODE: 0x11, INIT_ADDR: 0x12, CONFIG_ENABLE: 0x15, XFER_WRITE: 0x17, CONFIG_DISABLE: 0x3a, STATUS: 0x41 };
class Gw1n {
  constructor(name, { eraseClocks = 50, idcode = 0x1100481b } = {}) {
    Object.assign(this, { name, irLen: 8, idcode, eraseClocks, edit: false, erased: false, erasing: 0, written: false, done: false, idFail: false, config: null, stream: [], errors: [], ops: [] });
    this.reset();
  }
  reset() { this.ir = G.IDCODE; }
  captureIr() { return 0x01; }
  status() { return (this.idFail ? 4 : 0) | (this.erased ? 0x20 : 0) | (this.edit ? 0x80 : 0) | (this.done ? 0x2000 : 0); }
  captureDr() { return this.ir === G.IDCODE ? [this.idcode, 32] : this.ir === G.STATUS ? [this.status(), 32] : [0, 1]; }
  update() {
    const ir = this.ir;
    if (ir !== G.STATUS && ir !== G.NOOP) this.ops.push(ir);
    if (ir === G.CONFIG_ENABLE) this.edit = true;
    else if (ir === G.ERASE_SRAM) {
      if (!this.edit) { this.errors.push('ERASE_SRAM outside the configuration mode'); return; }
      this.done = false; this.erased = false; this.erasing = this.eraseClocks; this.written = false; this.config = null; this.idFail = false;
    } else if (ir === G.XFER_WRITE) {
      if (!this.edit) this.errors.push('XFER_WRITE outside the configuration mode');
      else if (!this.erased) this.errors.push('XFER_WRITE before the SRAM was erased');
      this.stream = [];
    } else if (ir === G.CONFIG_DISABLE) {
      this.edit = false;
      if (this.written) this.check();
    }
  }
  shiftedIn(bit) { if (this.ir === G.XFER_WRITE && this.edit && this.erased) { this.stream.push(bit); this.written = true; } }
  clock(state) { if (state === 'RTI' && this.erasing && --this.erasing === 0) this.erased = true; }
  check() {
    const cfg = msbBytes(this.stream);
    this.config = cfg;
    for (let k = 0; k + 8 <= Math.min(cfg.length, 64); k++) {
      if (cfg[k] === 0x06 && !cfg[k + 1] && !cfg[k + 2] && !cfg[k + 3]) { this.idFail = word(cfg, k + 4) !== this.idcode; this.done = !this.idFail; return; }
    }
    this.done = true;   // (no IDCODE check in the stream: taken)
  }
}

// The ECP5 (Lattice's sysCONFIG, TN1260; the instructions openFPGALoader's SRAM path uses): IR of 8 bits; IDCODE (E0, and the
// DR after Test-Logic-Reset), LSC_READ_STATUS (3C, 32 bits: DONE 8, ISC_EN 9, BUSY 12, FAIL 13, the configuration check's code
// 23..26), ISC_ENABLE (C6, its DR 0x00: SRAM), ISC_ERASE (0E, its DR 0x01: SRAM; BUSY for a while), LSC_INIT_ADDRESS (46),
// LSC_BITSTREAM_BURST (7A: the bits taken, once enabled and erased), ISC_DISABLE (26: DONE when the configuration is good),
// PRELOAD (1C), BYPASS (FF). The configuration (MSB first), checked at the burst's end, good when it has the preamble FF FF BD B3
// and VERIFY_ID (E2 00 00 00 <IDCODE>) of this device (another IDCODE: the check's code 1 and FAIL); DONE once ISC mode is left.
const E = { IDCODE: 0xe0, STATUS: 0x3c, ISC_ENABLE: 0xc6, ISC_ERASE: 0x0e, INIT_ADDRESS: 0x46, BURST: 0x7a, ISC_DISABLE: 0x26, BYPASS: 0xff };
class Ecp5 {
  constructor(name, { idcode = 0x41113043, eraseClocks = 40 } = {}) {
    Object.assign(this, { name, irLen: 8, idcode, eraseClocks, isc: false, erased: false, busy: 0, done: false, fail: false, check: 0, config: null, stream: [], dr8: null, errors: [], ops: [] });
    this.reset();
  }
  reset() { this.ir = E.IDCODE; }
  captureIr() { return 0x01; }
  status() { return ((this.done ? 1 : 0) << 8 | (this.isc ? 1 : 0) << 9 | (this.busy ? 1 : 0) << 12 | (this.fail ? 1 : 0) << 13 | this.check << 23) >>> 0; }
  captureDr() { return this.ir === E.IDCODE ? [this.idcode, 32] : this.ir === E.STATUS ? [this.status(), 32] : this.ir === E.ISC_ENABLE || this.ir === E.ISC_ERASE ? [0, 8] : [0, 1]; }
  update() {
    if (![E.STATUS, E.BYPASS, 0x1c].includes(this.ir)) this.ops.push(this.ir);
    if (this.ir === E.BURST) {
      if (!this.isc) this.errors.push('LSC_BITSTREAM_BURST outside ISC mode');
      else if (!this.erased) this.errors.push('LSC_BITSTREAM_BURST before the SRAM was erased');
      this.stream = [];
    }
    if (this.ir === E.ISC_DISABLE) { this.done = this.good; this.isc = false; }
  }
  // the 8-bit DRs of ISC_ENABLE and ISC_ERASE, their value on Update-DR; the burst's end: the configuration checked
  updateDr(bits) {
    if (this.ir === E.BURST && this.stream.length) { this.verify(); return; }
    const v = bits.reduce((a, b, i) => a | (b << i), 0);
    if (this.ir === E.ISC_ENABLE) { if (v !== 0) this.errors.push(`ISC_ENABLE ${v}: not the SRAM's`); this.isc = true; this.done = false; }
    if (this.ir === E.ISC_ERASE) {
      if (!this.isc) { this.errors.push('ISC_ERASE outside ISC mode'); return; }
      if (v !== 1) this.errors.push(`ISC_ERASE ${v}: not the SRAM's`);
      this.erased = false; this.busy = this.eraseClocks; this.done = false; this.good = false; this.check = 0; this.fail = false;
    }
  }
  shiftedIn(bit) { if (this.ir === E.BURST && this.isc && this.erased) this.stream.push(bit); }
  clock(state) { if (state === 'RTI' && this.busy && --this.busy === 0) this.erased = true; }
  verify() {
    const cfg = msbBytes(this.stream);
    this.config = cfg;
    let at = -1;
    for (let k = 0; k + 4 <= Math.min(cfg.length, 64); k++) if (cfg[k] === 0xff && cfg[k + 1] === 0xff && cfg[k + 2] === 0xbd && cfg[k + 3] === 0xb3) { at = k; break; }
    if (at < 0) { this.check = 4; this.fail = true; return; }   // (no preamble)
    for (let k = at + 4; k + 8 <= Math.min(cfg.length, at + 64); k++) {
      if (cfg[k] === 0xe2 && !cfg[k + 1] && !cfg[k + 2] && !cfg[k + 3]) { if (word(cfg, k + 4) !== this.idcode) { this.check = 1; this.fail = true; return; } break; }
    }
    this.good = true;   // (DONE once ISC mode is left)
  }
}

/** A device of the simulated chain by its name: an Artix-7, a Gowin GW1N or an ECP5. */
export function simDevice(name, opts = {}) {
  return /^gw/.test(name) ? new Gw1n(name, opts) : /^lfe5/.test(name) ? new Ecp5(name, opts) : new Artix7(name, opts);
}

/** The TAP with one device: tck(tms, tdi) its TDO sampled before the edge; tdo() what it drives now. */
export function simTap(dev, st = {}) {
  Object.assign(st, { state: 'TLR', ir: 0, dr: [], clocks: 0 });
  const tdoNow = () => (st.state === 'SDR' ? st.dr[0] ?? 0 : st.state === 'SIR' ? st.ir & 1 : 0);
  function tck(tms, tdi) {
    st.clocks++;
    const tdo = tdoNow();
    if (st.state === 'CIR') st.ir = dev.captureIr();
    else if (st.state === 'SIR') st.ir = (st.ir >> 1) | (tdi << (dev.irLen - 1));
    else if (st.state === 'CDR') { const [v, n] = dev.captureDr(); st.dr = Array.from({ length: n }, (_, i) => Number((BigInt(v) >> BigInt(i)) & 1n)); } else if (st.state === 'SDR') { dev.shiftedIn(tdi); st.dr.shift(); st.dr.push(tdi); }
    const next = NEXT[st.state][tms ? 1 : 0];
    if (next === 'UIR') { dev.ir = st.ir; dev.update(); }
    if (next === 'UDR') dev.updateDr?.(st.dr);
    if (next === 'TLR') dev.reset();
    st.state = next;
    dev.clock(st.state);
    return tdo;
  }
  return { tck, tdo: tdoNow };
}

export function ftdiJtagBoard({ device = 'xc7a35t', deviceOptions = {}, packet = 512, mpsse = true, claimError = null } = {}) {
  const dev = simDevice(device, deviceOptions);
  const st = { dev, tms: 0, low: null, high: null, mode: null, rx: [], controls: [], badCommands: [] };
  const { tck } = simTap(dev, st);
  // a read of n bits: shifted in from bit 7
  const readBits = bits => { let v = 0; for (const b of bits) v = (v >> 1) | (b << 7); return v; };

  function mpsseStream(d) {
    for (let i = 0; i < d.length;) {
      const op = d[i++];
      if (op === 0x80) { st.low = [d[i], d[i + 1]]; st.tms = (d[i] >> 3) & 1; i += 2; } else if (op === 0x82) { st.high = [d[i], d[i + 1]]; i += 2; } else if (op === 0x86) i += 2;
      else if ([0x8a, 0x97, 0x8d, 0x85, 0x87].includes(op)) { /* the clock's settings, send immediate */ } else if (op === 0x19 || op === 0x39) {
        const n = d[i] + (d[i + 1] << 8) + 1, bytes = d.slice(i + 2, i + 2 + n);
        i += 2 + n;
        for (const b of bytes) { let r = 0; for (let k = 0; k < 8; k++) r |= tck(st.tms, (b >> k) & 1) << k; if (op === 0x39) st.rx.push(r); }
      } else if (op === 0x1b || op === 0x3b) {
        const n = d[i] + 1, b = d[i + 1];
        i += 2;
        const got = [];
        for (let k = 0; k < n; k++) got.push(tck(st.tms, (b >> k) & 1));
        if (op === 0x3b) st.rx.push(readBits(got));
      } else if (op === 0x4b || op === 0x6b) {
        const n = d[i] + 1, b = d[i + 1], tdi = (b >> 7) & 1;
        i += 2;
        const got = [];
        for (let k = 0; k < n; k++) { st.tms = (b >> k) & 1; got.push(tck(st.tms, tdi)); }
        if (op === 0x6b) st.rx.push(readBits(got));
      } else if (op === 0x8e) { const n = d[i++] + 1; for (let k = 0; k < n; k++) tck(st.tms, 0); } else if (op === 0x8f) {
        const n = (d[i] + (d[i + 1] << 8) + 1) * 8;
        i += 2;
        for (let k = 0; k < n; k++) tck(st.tms, 0);
      } else { st.badCommands.push(op); st.rx.push(0xfa, op); }
    }
  }

  const usb = {
    vendorId: 0x0403, productId: 0x6010, configuration: null,
    async open() {},
    async selectConfiguration() { usb.configuration = { interfaces: [{ alternate: { endpoints: [{ direction: 'in', packetSize: packet }, { direction: 'out', packetSize: packet }] } }] }; },
    async claimInterface() { if (claimError) throw new Error(claimError); },
    async releaseInterface() {},
    async close() {},
    async controlTransferOut(setup) {
      st.controls.push([setup.request, setup.value]);
      if (setup.request === 0x0b) st.mode = setup.value >> 8;
      return { status: 'ok' };
    },
    async transferOut(ep, data) {
      if (ep !== 2) throw new Error(`endpoint ${ep}`);
      if (st.mode === 2 && mpsse) mpsseStream(data instanceof Uint8Array ? data : new Uint8Array(data));
      return { status: 'ok', bytesWritten: data.length };
    },
    async transferIn(ep, len) {
      if (ep !== 1) throw new Error(`endpoint ${ep}`);
      const out = [];
      do { out.push(0x32, 0x60, ...st.rx.splice(0, packet - 2)); } while (st.rx.length && out.length + packet <= len);
      return { status: 'ok', data: new DataView(new Uint8Array(out).buffer) };
    },
  };
  return { usb, st };
}

/** A small 7-series .bit's configuration: dummy words, the sync word, the IDCODE packet, some frames. */
export function xc7Bitstream(idcode = XC7.xc7a35t, words = 64) {
  const w = [0xffffffff, 0xffffffff, 0x000000bb, 0x11220044, 0xffffffff, SYNC, 0x20000000, 0x30018001, idcode >>> 0, 0x30008001, 0x00000007];
  for (let k = 0; k < words; k++) w.push((k * 0x01010101 + 0x5a) >>> 0);
  w.push(0x30008001, 0x00000005, 0x20000000);
  const b = new Uint8Array(w.length * 4);
  w.forEach((v, k) => { b[k * 4] = v >>> 24; b[k * 4 + 1] = (v >>> 16) & 0xff; b[k * 4 + 2] = (v >>> 8) & 0xff; b[k * 4 + 3] = v & 0xff; });
  return b;
}
