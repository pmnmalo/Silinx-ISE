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

export function ftdiJtagBoard({ device = 'xc7a35t', deviceOptions = {}, packet = 512, mpsse = true, claimError = null } = {}) {
  const dev = /^gw/.test(device) ? new Gw1n(device, deviceOptions) : new Artix7(device, deviceOptions);
  const st = { dev, state: 'TLR', ir: 0, dr: [], tms: 0, low: null, high: null, mode: null, rx: [], clocks: 0, controls: [], badCommands: [] };

  function tck(tms, tdi) {
    st.clocks++;
    let tdo = 0;
    if (st.state === 'SDR') tdo = st.dr[0] ?? 0;
    if (st.state === 'SIR') tdo = st.ir & 1;
    if (st.state === 'CIR') st.ir = dev.captureIr();
    else if (st.state === 'SIR') st.ir = (st.ir >> 1) | (tdi << (dev.irLen - 1));
    else if (st.state === 'CDR') { const [v, n] = dev.captureDr(); st.dr = Array.from({ length: n }, (_, i) => Number((BigInt(v) >> BigInt(i)) & 1n)); } else if (st.state === 'SDR') { dev.shiftedIn(tdi); st.dr.shift(); st.dr.push(tdi); }
    const next = NEXT[st.state][tms ? 1 : 0];
    if (next === 'UIR') { dev.ir = st.ir; dev.update(); }
    if (next === 'TLR') dev.reset();
    st.state = next;
    dev.clock(st.state);
    return tdo;
  }
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
