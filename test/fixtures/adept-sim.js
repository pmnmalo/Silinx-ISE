// A simulated Digilent board for the tests of core/adept.js: the Adept USB firmware (the commands
// of adepttool/device.py) behind WebUSB's USBDevice methods, and a JTAG chain of TAP controllers
// (IEEE 1149.1) with a Spartan-3E (IDCODE, BYPASS, JPROGRAM, CFG_IN, JSTART, the status in the
// captured IR) and a Platform Flash (IDCODE, BYPASS, its in-system programming for core/xcf.js).
// Runs in Node and in the browser (the UI test installs it as navigator.usb).
//   const board = new SimAdeptBoard({ fpga: 'xc3s250e' });  board.config: the bytes the FPGA took
//   (from its sync word), board.done: DONE; board.promDev: the PROM (mem, ops, errors).

const IDS = { xc3s100e: 0x11c10093, xc3s250e: 0x11c1a093, xc3s500e: 0x11c22093, xc3s1200e: 0x11c2e093, xcf01s: 0xd5044093, xcf02s: 0xd5045093, xcf04s: 0xd5046093 };
const SYNC = 0xaa995566;

// a data register: its bits (LSB, the next out on TDO, first); captureDr gives [value, length] or { bits }
const reg = c => {
  if (c.bits) return { bits: [...c.bits], off: 0, n: c.bits.length };
  const [v, n] = c, bits = [];
  for (let i = 0; i < n; i++) bits.push(Number((BigInt(v) >> BigInt(i)) & 1n));
  return { bits, off: 0, n };
};

// TAP states and their successors on TMS = 0 / 1
const NEXT = {
  TLR: ['RTI', 'TLR'], RTI: ['RTI', 'SDS'], SDS: ['CDR', 'SIS'], CDR: ['SDR', 'E1D'], SDR: ['SDR', 'E1D'], E1D: ['PDR', 'UDR'],
  PDR: ['PDR', 'E2D'], E2D: ['SDR', 'UDR'], UDR: ['RTI', 'SDS'], SIS: ['CIR', 'TLR'], CIR: ['SIR', 'E1I'], SIR: ['SIR', 'E1I'],
  E1I: ['PIR', 'UIR'], PIR: ['PIR', 'E2I'], E2I: ['SIR', 'UIR'], UIR: ['RTI', 'SDS'],
};

class Fpga {
  constructor(name) { Object.assign(this, { name, irLen: 6, idcode: IDS[name], idInstr: 0x09 }); this.reset(); this.done = false; this.init = true; this.config = null; this.stream = []; this.initDelay = 0; this.startClocks = 0; }
  reset() { this.ir = this.idInstr; }
  captureIr() { return 0x01 | (this.init ? 0x10 : 0) | (this.done ? 0x20 : 0); }
  update() {
    if (this.ir === 0x0b) { this.done = false; this.init = false; this.initDelay = 40; this.stream = []; this.config = null; }   // JPROGRAM
    if (this.ir === 0x0c) this.startClocks = 0;   // JSTART
  }
  captureDr() { return this.ir === this.idInstr ? [this.idcode, 32] : [0, 1]; }
  shiftedIn(bit) { if (this.ir === 0x05 && this.init) this.stream.push(bit); }   // CFG_IN
  clock(state) {
    if (!this.init && --this.initDelay <= 0) this.init = true;
    if (state === 'RTI' && this.ir === 0x0c && ++this.startClocks >= 8 && !this.done) this.start();
  }
  // the configuration of a Platform Flash (master serial: its bits in order, CCLK)
  configureFrom(bits) { this.done = false; this.config = null; this.stream = bits; this.start(); this.stream = []; }
  start() {
    // the configuration from the sync word on (MSB first, as the FPGA reads it)
    const bits = this.stream;
    let w = 0;
    for (let i = 0; i < bits.length; i++) {
      w = ((w << 1) | bits[i]) >>> 0;
      if (w === SYNC && i >= 31) {
        const from = i - 31, n = Math.floor((bits.length - from) / 8);
        const out = new Uint8Array(n);
        for (let k = 0; k < n * 8; k++) out[k >> 3] |= bits[from + k] << (7 - (k & 7));
        this.config = out;
        this.done = true;
        return;
      }
    }
  }
}
// the Platform Flash: IDCODE, BYPASS and its in-system programming (the instructions core/xcf.js
// uses, DS123 / the XCF0xS BSDL): the memory, erase and program taking TCK clocks in Run-Test/Idle,
// the ISC status, CONFIG (the FPGA configured from the memory, the mode jumper on ROM). What breaks
// the protocol (a program before an erase, ISC outside ISC mode, a wrong length…) goes to errors.
const ISC = { ENABLE: 0xe8, PROGRAM: 0xea, ADDRESS: 0xeb, ERASE: 0xec, DATA: 0xed, CONFIG: 0xee, READ: 0xef, DISABLE: 0xf0, STATUS: 0xe3 };
class Prom {
  constructor(name, { writeProtected = false, eraseClocks = 5000, programClocks = 200, failBlock = null } = {}) {
    const [size, block] = { xcf01s: [1 << 20, 2048], xcf02s: [2 << 20, 4096], xcf04s: [4 << 20, 4096] }[name];
    Object.assign(this, { name, irLen: 8, idcode: IDS[name], idInstr: 0xfe, size, block, writeProtected, eraseClocks, programClocks, failBlock });
    this.mem = new Uint8Array(size).fill(1);   // one bit per entry, in the order they are shifted in (and out to the FPGA)
    this.written = new Uint8Array(size / block);   // blocks programmed since the last erase
    this.isc = false; this.addr = 0; this.data = null; this.busy = 0; this.pendingOp = null;
    this.errors = []; this.ops = []; this.fpga = null; this.mode = 'rom';
    this.reset();
  }
  reset() { this.ir = this.idInstr; }
  captureIr() { return 0x01 | (this.writeProtected ? 0x08 : 0) | (this.isc ? 0x10 : 0); }
  error(m) { this.errors.push(m); }
  update() {
    const ir = this.ir;
    // an erase / a program runs while TCK clocks in Run-Test/Idle: another instruction meanwhile
    // (the next block's, a wait too short) cuts it short, and the block stays unprogrammed
    if (this.busy && ir !== ISC.STATUS && ir !== 0xff) {
      this.error(`${Object.keys(ISC).find(k => ISC[k] === ir) ?? `instruction 0x${ir.toString(16)}`} while the ${this.pendingOp} runs`);
      this.busy = 0; this.pendingOp = null; this.data = null;
    }
    if (ir === ISC.ERASE) {
      if (!this.isc) return this.error('ISC_ERASE outside ISC mode');
      if (this.addr !== 1) return this.error(`ISC_ERASE with the address ${this.addr} (not 1)`);
      if (this.writeProtected) return this.error('ISC_ERASE of a write-protected PROM');
      this.busy = this.eraseClocks; this.pendingOp = 'erase';
    } else if (ir === ISC.PROGRAM) {
      if (!this.isc) return this.error('ISC_PROGRAM outside ISC mode');
      if (!this.data) return this.error('ISC_PROGRAM with no data shifted');
      if (this.addr % 32) return this.error(`ISC_PROGRAM at frame ${this.addr} (not a block's first)`);
      const b = this.addr / 32;
      if (b >= this.written.length) return this.error(`ISC_PROGRAM past the end (block ${b})`);
      if (this.written[b]) return this.error(`block ${b} programmed twice without an erase`);
      for (let i = 0; i < this.block; i++) if (!this.mem[b * this.block + i]) return this.error(`block ${b} programmed before an erase`);
      this.busy = this.programClocks; this.pendingOp = 'program';
    } else if (ir === ISC.DISABLE) {
      if (this.isc) this.ops.push('disable');
      this.isc = false;
    } else if (ir === ISC.CONFIG) {
      if (this.isc) return this.error('CONFIG in ISC mode');
      this.ops.push('config');
      if (this.fpga && this.mode === 'rom') this.fpga.configureFrom(this.mem);
    }
  }
  finish() {
    if (this.pendingOp === 'erase') { this.mem.fill(1); this.written.fill(0); this.ops.push('erase'); }
    if (this.pendingOp === 'program') {
      const b = this.addr / 32;
      // a flash cell only goes from 1 to 0
      for (let i = 0; i < this.block; i++) this.mem[b * this.block + i] &= this.data[i] ^ (b === this.failBlock && i === 5 ? 1 : 0);
      this.written[b] = 1;
      this.ops.push(`program ${b}`);
      this.data = null;
    }
    this.pendingOp = null;
  }
  captureDr() {
    switch (this.ir) {
      case this.idInstr: return [this.idcode, 32];
      case ISC.ENABLE: return [0, 6];
      case ISC.ADDRESS: return [0, 16];
      case ISC.STATUS: return [this.busy ? 0x00 : 0x04, 8];
      case ISC.DATA: return { bits: new Array(this.block).fill(0) };
      case ISC.READ: {
        if (!this.isc) { this.error('ISC_READ outside ISC mode'); return { bits: new Array(this.block).fill(0) }; }
        const b = this.addr / 32;
        this.ops.push(`read ${b}`);
        return { bits: [...this.mem.subarray(b * this.block, (b + 1) * this.block)] };
      }
      default: return [0, 1];
    }
  }
  updateDr(bits) {
    const num = () => bits.reduce((v, b, i) => v | (b << i), 0);
    if (this.ir === ISC.ENABLE) {
      if (bits.length !== 6) return this.error(`ISC_ENABLE with ${bits.length} bits`);
      this.isc = true; this.enableCode = num(); this.ops.push(`enable 0x${this.enableCode.toString(16)}`);
    } else if (this.ir === ISC.ADDRESS) {
      if (bits.length !== 16) return this.error(`ISC_ADDRESS_SHIFT with ${bits.length} bits`);
      this.addr = num();
    } else if (this.ir === ISC.DATA) {
      if (bits.length !== this.block) return this.error(`ISC_DATA_SHIFT with ${bits.length} bits`);
      if (!this.isc) return this.error('ISC_DATA_SHIFT outside ISC mode');
      this.data = bits;
    }
  }
  shiftedIn() {}
  clock(state) { if (state === 'RTI' && this.busy && --this.busy === 0) this.finish(); }
}

export class SimAdeptBoard {
  /** chain: the devices from TDI to TDO (the Basys2: the FPGA, then the PROM). */
  /** promOptions: the Platform Flash's (writeProtected, eraseClocks, programClocks, failBlock); mode: the jumper ('rom' / 'jtag'). */
  /** tckHz: the JTAG port's TCK rate, as GET_SPEED says it (null: a firmware without the command). */
  constructor({ fpga = 'xc3s250e', prom = 'xcf02s', product = 'Basys2', serial = '10146A2B3C4D', inUse = false, promOptions = {}, mode = 'rom', tckHz = 4_000_000 } = {}) {
    this.fpgaDev = new Fpga(fpga);
    this.promDev = prom ? Object.assign(new Prom(prom, promOptions), { fpga: this.fpgaDev, mode }) : null;
    this.chain = [this.fpgaDev, ...(prom ? [this.promDev] : [])];
    Object.assign(this, { product, serial, inUse, tckHz, vendorId: 0x1443, productId: 0x0007, productName: `Digilent ${product}` });
    this.state = 'TLR';
    this.irs = this.chain.map(() => 0);
    this.drs = this.chain.map(() => reg([0, 1]));
    this.opened = false; this.configuration = null; this.claimed = false;
    this.replies = []; this.pending = null; this.log = [];
  }
  get done() { return this.fpgaDev.done; }
  get config() { return this.fpgaDev.config; }

  // ---- JTAG: one TCK; returns TDO (sampled before the edge)
  tck(tms, tdi) {
    const last = this.chain.length - 1;
    let tdo = 0;
    if (this.state === 'SDR') tdo = this.drs[last].bits[this.drs[last].off];
    if (this.state === 'SIR') tdo = this.irs[last] & 1;
    switch (this.state) {
      case 'CIR': this.irs = this.chain.map(d => d.captureIr()); break;
      case 'SIR': {
        let bit = tdi;
        this.chain.forEach((d, i) => { const out = this.irs[i] & 1; this.irs[i] = (this.irs[i] >> 1) | (bit << (d.irLen - 1)); bit = out; });
        break;
      }
      case 'CDR': this.drs = this.chain.map(d => reg(d.captureDr())); break;
      case 'SDR': {
        let bit = tdi;
        this.chain.forEach((d, i) => {
          d.shiftedIn(bit);
          const r = this.drs[i];
          const out = r.bits[r.off];
          r.bits[r.off + r.n] = bit; r.off++;
          bit = out;
        });
        break;
      }
      default:
    }
    const next = NEXT[this.state][tms ? 1 : 0];
    if (next === 'UIR') this.chain.forEach((d, i) => { d.ir = this.irs[i]; d.update(); });
    if (next === 'UDR') this.chain.forEach((d, i) => d.updateDr?.(this.drs[i].bits.slice(this.drs[i].off, this.drs[i].off + this.drs[i].n)));
    if (next === 'TLR') this.chain.forEach(d => d.reset());
    this.state = next;
    this.chain.forEach(d => d.clock(this.state));
    return tdo;
  }

  // ---- WebUSB's USBDevice
  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async selectConfiguration(n) { this.configuration = { configurationValue: n }; }
  async claimInterface(n) { if (this.inUse) throw new DOMException('Unable to claim interface.', 'NetworkError'); this.claimed = n === 0; }
  async releaseInterface() { this.claimed = false; }
  async controlTransferIn(setup, len) {
    const str = (s, n) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode(s).subarray(0, n)); return b; };
    const v = {
      0xe1: str(this.productName, 28), 0xe2: str('', 16), 0xe4: str(this.serial, 12), 0xe6: new Uint8Array([0x10, 0x01]),
      0xe7: new Uint8Array([0x05, 0, 0, 0, 0, 0, 0, 0]), 0xe9: new Uint8Array([0x00, 0x07, 0x40, 0x00]),
    }[setup.request];
    if (!v || v.length !== len) return { status: 'stall', data: new DataView(new ArrayBuffer(0)) };
    return { status: 'ok', data: new DataView(v.buffer) };
  }
  async transferOut(ep, data) {
    const b = new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
    if (!this.claimed) throw new DOMException('The interface is not claimed.', 'InvalidStateError');
    if (ep === 1) this.command(b);
    else if (ep === 3) this.stream(b);
    else throw new Error(`OUT endpoint ${ep}`);
    return { status: 'ok', bytesWritten: b.length };
  }
  async transferIn(ep, len) {
    if (ep === 2) {
      const r = this.replies.shift() || new Uint8Array(0);
      if (r.length > len) throw new Error('babble');
      return { status: 'ok', data: new DataView(r.buffer) };
    }
    if (ep === 4) {
      const p = this.pending;
      await p.ready;
      const out = p.tdo.subarray(0, len);
      return { status: 'ok', data: new DataView(out.slice().buffer) };
    }
    throw new Error(`IN endpoint ${ep}`);
  }

  reply(status, rest = []) { this.replies.push(new Uint8Array([rest.length + 1, status, ...rest])); }
  command(b) {
    const [, app, cmd, port] = b, p = b.subarray(4);
    this.log.push([app, cmd, port]);
    const le = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    const u32 = i => (p[i] | (p[i + 1] << 8) | (p[i + 2] << 16) | (p[i + 3] << 24)) >>> 0;
    if (app === 0 && cmd === 3) return this.reply(0, [0, 0, 0, 0]);
    if (app === 2 && cmd === 2) return this.reply(0, p[0] === 1 ? [1] : [1, ...le(0x1)]);
    if (app === 2 && (cmd === 0 || cmd === 1)) return this.reply(0);
    if (app === 2 && cmd === 4 && this.tckHz) return this.reply(0, le(this.tckHz));   // GET_SPEED
    if (app === 2 && cmd & 0x80) {
      const q = this.pending;
      this.pending = null;
      const flags = (q.sent !== null ? 0x80 : 0) | (q.recvd !== null ? 0x40 : 0);
      return this.reply(flags, [...(q.sent !== null ? le(q.sent) : []), ...(q.recvd !== null ? le(q.recvd) : [])]);
    }
    if (app === 2 && cmd >= 7 && cmd <= 10) {
      const q = { cmd, tdo: null, sent: null, recvd: null };
      let release;
      q.ready = new Promise(r => { release = r; });
      q.release = release;
      if (cmd === 7 || cmd === 9) {   // CLOCK_TCK / GET_TDO_BITS: tms, tdi, bits
        const [tms, tdi] = p, bits = u32(2);
        const tdo = new Uint8Array((bits + 7) >> 3);
        for (let i = 0; i < bits; i++) tdo[i >> 3] |= this.tck(tms, tdi) << (i & 7);
        if (cmd === 9) { q.tdo = tdo; q.recvd = bits; }
        q.release();
      } else {
        q.oe = !!p[0];
        q.tms = cmd === 8 ? p[1] : 0;
        q.bits = u32(cmd === 8 ? 2 : 1);
      }
      this.pending = q;
      return this.reply(0);
    }
    return this.reply(50);
  }
  stream(data) {
    const q = this.pending;
    const tdo = new Uint8Array((q.bits + 7) >> 3);
    for (let i = 0; i < q.bits; i++) {
      let tms = q.tms, tdi;
      if (q.cmd === 10) { const v = data[i >> 2] >> ((i & 3) * 2); tdi = v & 1; tms = (v >> 1) & 1; } else tdi = (data[i >> 3] >> (i & 7)) & 1;
      tdo[i >> 3] |= this.tck(tms, tdi) << (i & 7);
    }
    q.sent = q.bits;
    if (q.oe) { q.tdo = tdo; q.recvd = q.bits; }
    q.release();
  }
}

/** navigator.usb with this board plugged in (requestDevice: the user picks it). */
export function simUsb(board) {
  return {
    getDevices: async () => (board.granted ? [board] : []),
    requestDevice: async ({ filters }) => {
      if (!filters.some(f => f.vendorId === board.vendorId)) throw new DOMException('No device selected.', 'NotFoundError');
      board.granted = true;
      return board;
    },
  };
}
