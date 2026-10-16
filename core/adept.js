// The Digilent Adept USB programmer of the Basys2 / Nexys2 (Cypress FX2, Adept firmware) over
// WebUSB, for the browser edition: the JTAG chain scanned, the FPGA configured (SRAM) from a .bit.
// A JavaScript port of adepttool (github.com/mwkmwkmwk/adepttool, MIT licence, Copyright (C) 2018
// Marcin Kościelnicki; THIRD-PARTY-NOTICES.md), the driver the application uses (server/programmer.js).
//
// usb: a WebUSB USBDevice (navigator.usb), or anything with its methods (the tests' simulated board):
// open, selectConfiguration, claimInterface, releaseInterface, close, controlTransferIn(setup, len),
// transferOut(endpoint, data), transferIn(endpoint, len).
//
// The protocol: a command goes out on bulk endpoint 1 ([length, app, command, port, payload…]),
// its reply comes back on endpoint 2 ([length, status, …]); the JTAG data of a long command streams
// out on endpoint 3 and in on endpoint 4, then the command again with bit 7 set returns how many
// bits were sent and received.

import { splitBitPart } from './family.js';

export const ADEPT_VENDOR = 0x1443;
export const ADEPT_FILTERS = [{ vendorId: ADEPT_VENDOR }];

const CTRL = { productName: [0xe1, 28], userName: [0xe2, 16], serial: [0xe4, 12], fwVersion: [0xe6, 2], caps: [0xe7, 8], productId: [0xe9, 4] };
const APP_SYS = 0, APP_DMGT = 1, APP_DJTG = 2;
const CAPS_DJTG = 0x1;
const CMD_SYS_RESET = 3;
const CMD_APP_ENABLE = 0, CMD_APP_DISABLE = 1, CMD_APP_GET_PORTS = 2;
const CMD_DJTG_GET_SPEED = 4;
const CMD_DJTG_CLOCK_TCK = 7, CMD_DJTG_PUT_TDI_BITS = 8, CMD_DJTG_GET_TDO_BITS = 9, CMD_DJTG_PUT_TMS_TDI_BITS = 10;
const ERRORS = { 3: 'the JTAG port is in use (another program: Adept, iMPACT?)', 4: 'the port is disabled', 49: 'unknown application', 50: 'unknown command' };

const le32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const rd32 = (b, i = 0) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const bytesOf = dv => new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
const text = b => new TextDecoder().decode(b).replace(/\0[\s\S]*$/, '').trim();
const fail = msg => { throw new Error(`Adept USB: ${msg}`); };

/** The Adept firmware's commands (adepttool/device.py). */
export class Adept {
  constructor(usb) { this.usb = usb; }

  async open() {
    const u = this.usb;
    try {
      await u.open();
      if (u.configuration === null || u.configuration === undefined) await u.selectConfiguration(1);
      await u.claimInterface(0);
    } catch (e) {
      fail(`the board cannot be opened (${e.message}): another program may be using it (Digilent Adept, iMPACT, the Silinx application), or, on Windows, its driver is Digilent's (WinUSB is needed: see the help)`);
    }
    const ctrl = async ([req, len]) => {
      const r = await u.controlTransferIn({ requestType: 'vendor', recipient: 'device', request: req, value: 0, index: 0 }, len);
      if (r.status !== 'ok' || r.data.byteLength !== len) fail(`control request 0x${req.toString(16)} failed`);
      return bytesOf(r.data);
    };
    this.productName = text(await ctrl(CTRL.productName));
    this.userName = text(await ctrl(CTRL.userName));
    this.serial = text(await ctrl(CTRL.serial));
    const caps = await ctrl(CTRL.caps);
    this.caps = rd32(caps);
    this.productId = rd32(await ctrl(CTRL.productId));
    await this.cmd(APP_SYS, CMD_SYS_RESET, 0, le32(0), 4);
    if (!(this.caps & CAPS_DJTG)) fail(`${this.productName || 'the device'} has no JTAG port`);
    const n = (await this.cmd(APP_DJTG, CMD_APP_GET_PORTS, 0, [1], 1))[0];
    if (!n) fail('no JTAG port');
    return this;
  }

  async close() {
    try { await this.usb.releaseInterface(0); } catch { /* ignore */ }
    try { await this.usb.close(); } catch { /* ignore */ }
  }

  async cmd(app, cmd, port, payload = [], replyLen = 0, stats = false) {
    const out = new Uint8Array([payload.length + 3, app, cmd, port, ...payload]);
    await this.usb.transferOut(1, out);
    let reply;
    for (;;) {
      const r = await this.usb.transferIn(2, (replyLen ?? 0) + 10);
      reply = bytesOf(r.data);
      if (reply.length) break;
    }
    if (reply.length < 2 || reply[0] !== reply.length - 1) fail('malformed reply');
    const status = reply[1] & 0x3f;
    if (status) fail(ERRORS[status] || `command error ${status}`);
    let rest = reply.subarray(2);
    if (!stats) {
      if (reply[1] & 0xc0) fail('unexpected reply');
      if (replyLen !== null && rest.length !== replyLen) fail('reply of the wrong length');
      return rest;
    }
    let sent = null, recvd = null;
    if (reply[1] & 0x80) { sent = rd32(rest); rest = rest.subarray(4); }
    if (reply[1] & 0x40) { recvd = rd32(rest); rest = rest.subarray(4); }
    return { rest, sent, recvd };
  }

  // a command with a data stream: out on endpoint 3, in on endpoint 4 (both at once), then its counts
  async cmdLong(app, cmd, port, payload, send, recvLen) {
    await this.cmd(app, cmd, port, payload, 0);
    const [, got] = await Promise.all([
      send?.length ? this.usb.transferOut(3, send) : null,
      recvLen ? this.usb.transferIn(4, recvLen) : null,
    ]);
    const data = got ? bytesOf(got.data) : new Uint8Array(0);
    if (recvLen && data.length !== recvLen) fail('short JTAG read');
    const { sent, recvd } = await this.cmd(app, cmd | 0x80, port, [], 0, true);
    return { sent, recvd, data };
  }
}

/** One JTAG port of the Adept (the Djtg class of adepttool). */
export class Djtg {
  constructor(adept, port = 0) { Object.assign(this, { adept, port }); }
  cmd(c, payload, replyLen) { return this.adept.cmd(APP_DJTG, c, this.port, payload, replyLen); }
  long(c, payload, send, recvLen) { return this.adept.cmdLong(APP_DJTG, c, this.port, payload, send, recvLen); }
  enable() { return this.cmd(CMD_APP_ENABLE, [], 0); }
  disable() { return this.cmd(CMD_APP_DISABLE, [], 0); }
  // the TCK frequency the port runs at (Hz)
  async getSpeed() { return rd32(await this.cmd(CMD_DJTG_GET_SPEED, [], 4)); }

  async clockTck(tms, tdi, bits) {
    const { sent, recvd } = await this.long(CMD_DJTG_CLOCK_TCK, [+tms, +tdi, ...le32(bits)], null, 0);
    if (sent !== null || recvd !== null) fail('unexpected counts');
  }
  async putTdiBits(oe, tms, bits, data) {
    const nb = (bits + 7) >> 3;
    if (data.length !== nb) throw new RangeError('putTdiBits: data length');
    const r = await this.long(CMD_DJTG_PUT_TDI_BITS, [+oe, +tms, ...le32(bits)], data, oe ? nb : 0);
    if (r.sent !== bits || (oe ? r.recvd !== bits : r.recvd !== null)) fail('JTAG transfer incomplete');
    return r.data;
  }
  async getTdoBits(tms, tdi, bits) {
    const nb = (bits + 7) >> 3;
    const r = await this.long(CMD_DJTG_GET_TDO_BITS, [+tms, +tdi, ...le32(bits)], null, nb);
    if (r.recvd !== bits || r.sent !== null) fail('JTAG transfer incomplete');
    return r.data;
  }
  // two bits a clock: TDI (even bit), TMS (odd bit)
  async putTmsTdiBits(oe, bits, data) {
    const nb = (bits + 7) >> 3;
    if (data.length !== (bits + 3) >> 2) throw new RangeError('putTmsTdiBits: data length');
    const r = await this.long(CMD_DJTG_PUT_TMS_TDI_BITS, [+oe, ...le32(bits)], data, oe ? nb : 0);
    if (r.sent !== bits || (oe ? r.recvd !== bits : r.recvd !== null)) fail('JTAG transfer incomplete');
    return r.data;
  }
}

// ---- the JTAG chain (adepttool/jtag.py)
const BYTEREV = Uint8Array.from({ length: 256 }, (_, x) => { let r = 0; for (let b = 0; b < 8; b++) if (x & (1 << b)) r |= 1 << (7 - b); return r; });
export const byterev = data => { const out = new Uint8Array(data.length); for (let i = 0; i < data.length; i++) out[i] = BYTEREV[data[i]]; return out; };

// the devices of the Digilent boards' chains: IDCODE (version bits masked), name, IR length, kind
export const JTAG_DEVICES = [
  [0x01c10093, 'xc3s100e', 6, 'fpga'], [0x01c1a093, 'xc3s250e', 6, 'fpga'], [0x01c22093, 'xc3s500e', 6, 'fpga'],
  [0x01c2e093, 'xc3s1200e', 6, 'fpga'], [0x01c3a093, 'xc3s1600e', 6, 'fpga'],
  [0x05044093, 'xcf01s', 8, 'prom'], [0x05045093, 'xcf02s', 8, 'prom'], [0x05046093, 'xcf04s', 8, 'prom'],
];
const idMask = 0x0fffffff;
const bigOf = b => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
const bytesOfBig = (n, len) => { const b = new Uint8Array(len); for (let i = 0; i < len; i++) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; };

/** The JTAG chain behind a port: devices[0] is the one nearest TDO (the first IDCODE out). */
export class Chain {
  constructor(port) { this.port = port; this.devices = []; }

  async init() {
    await this.port.enable();
    // Test-Logic-Reset (IDCODE in every DR), Run-Test/Idle, Shift-DR
    await this.port.putTmsTdiBits(false, 9, new Uint8Array([0xaa, 0x22, 0x00]));
    this.devices = [];
    for (;;) {
      const id = rd32(await this.port.getTdoBits(false, false, 32));
      if (id === 0 || id === 0xffffffff) break;
      const known = JTAG_DEVICES.find(([c]) => (id & idMask) === c);
      if (!known) fail(`unknown JTAG device (IDCODE ${id.toString(16).padStart(8, '0')})`);
      this.devices.push({ idcode: id, name: known[1], irLen: known[2], kind: known[3], cur: (1 << known[2]) - 1 });
      if (this.devices.length > 8) fail('JTAG chain too long (no device answers?)');
    }
    if (!this.devices.length) fail('no device on the JTAG chain: is the board powered on?');
    await this.port.putTmsTdiBits(false, 2, new Uint8Array([0x0a]));   // Exit1-DR, Update-DR
  }
  close() { return this.port.disable(); }

  async shiftNum(num, length, last) {
    num = BigInt(num);
    if (!last) return bigOf(await this.port.putTdiBits(true, false, length, bytesOfBig(num, (length + 7) >> 3)));
    let res = length === 1 ? 0n : await this.shiftNum(num & ~(1n << BigInt(length - 1)), length - 1, false);
    const hi = (await this.port.putTdiBits(true, true, 1, new Uint8Array([Number((num >> BigInt(length - 1)) & 1n)])))[0] & 1;
    return res | (BigInt(hi) << BigInt(length - 1));
  }
  // a long DR (a bitstream): the data without its last bit, then the last bit with TMS (Exit1-DR);
  // read: returns what came out of TDO meanwhile (LSB first, as the data)
  async shiftBytes(data, length, read = false) {
    const got = new Uint8Array((length + 7) >> 3);
    if (length > 1) {
      const r = await this.port.putTdiBits(read, false, length - 1, data.subarray(0, (length + 6) >> 3));
      if (read) got.set(r.subarray(0, got.length));
    }
    const at = length - 1, fin = (data[at >> 3] >> (at % 8)) & 1;
    const last = await this.port.putTdiBits(read, true, 1, new Uint8Array([fin]));
    if (!read) return null;
    got[at >> 3] = (got[at >> 3] & ((1 << (at % 8)) - 1)) | ((last[0] & 1) << (at % 8));
    return got;
  }

  // every device's current instruction; returns what each captured (the status of a Xilinx device)
  async shiftIr() {
    await this.port.putTmsTdiBits(false, 4, new Uint8Array([0x0a]));   // Select-DR, Select-IR, Capture-IR, Shift-IR
    const res = [];
    for (const [i, d] of this.devices.entries()) res.push(Number(await this.shiftNum(d.cur, d.irLen, i === this.devices.length - 1)));
    await this.port.putTmsTdiBits(false, 1, new Uint8Array([0x02]));   // Update-IR
    return res;
  }
  async shiftDr(dev, shift) {
    await this.port.putTmsTdiBits(false, 3, new Uint8Array([0x02]));   // Select-DR, Capture-DR, Shift-DR
    const idx = this.devices.indexOf(dev);
    if (idx) await this.shiftNum(0, idx, false);   // the BYPASS bits of the devices nearer TDO
    const last = idx === this.devices.length - 1;
    await shift(last);
    if (!last) await this.shiftNum(0, this.devices.length - 1 - idx, true);
    await this.port.putTmsTdiBits(false, 1, new Uint8Array([0x02]));   // Update-DR
  }
  clockRti(n) { return this.port.clockTck(false, false, n + 1); }

  async instr(dev, cmd) { dev.cur = cmd; await this.shiftIr(); }
  async status(dev) { return (await this.shiftIr())[this.devices.indexOf(dev)]; }
}

// ---- whole JTAG operations in one stream
// Every command of the Adept costs about five USB transfers (command and reply, the data, the
// counts), each ~1 ms over WebUSB: a sequence of TAP moves, IR and DR shifts and Run-Test/Idle
// clocks is composed here as TMS / TDI pairs and sent with one PUT_TMS_TDI_BITS (in pieces of
// STREAM_CLOCKS, below the bitstreams the port already takes in one command), TDO captured only
// where a shift is read. A long wait in Run-Test/Idle (more than RTI_PAIRS clocks) is not sent as
// pairs (a byte every 4 clocks: at 4 MHz as much as full-speed USB carries) but as one CLOCK_TCK
// (no data) between the pieces. The TAP starts and ends in Run-Test/Idle or an Update state, as Chain's.
export const STREAM_CLOCKS = 1 << 19;   // 128 KB of TMS / TDI pairs a command
export const RTI_PAIRS = 1 << 13;   // 2 KB of pairs (~2 ms of USB): about what a command's round trips cost

// a read shift's bits out of the captured TDO: .bytes (LSB first), .num
class Capture {
  constructor(at, n) { Object.assign(this, { at, n, bytes: null }); }
  get num() { let v = 0n; for (let i = this.bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.bytes[i]); return Number(v); }
}
const bytesOfNum = (num, n) => bytesOfBig(BigInt(num), (n + 7) >> 3);

export class JtagSeq {
  constructor(chain) { this.chain = chain; this.buf = new Uint8Array(1 << 12); this.n = 0; this.reads = []; this.waits = []; }
  // the TMS / TDI pairs so far (the CLOCK_TCK waits not counted)
  get clocks() { return this.n; }
  clock(tms, tdi = 0) {
    if (this.n === this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; }
    this.buf[this.n++] = (tms ? 2 : 0) | (tdi ? 1 : 0);
  }
  // n bits of data (LSB first; null: zeros), TMS high on the last one when exit
  shift(data, n, exit = false) {
    for (let i = 0; i < n; i++) this.clock(exit && i === n - 1, data ? (data[i >> 3] >> (i & 7)) & 1 : 0);
  }
  // the TDO of the next n clocks, filled in by run()
  capture(n) { const c = new Capture(this.n, n); this.reads.push(c); return c; }
  // Run-Test/Idle, then n clocks there (Chain.clockRti); more than RTI_PAIRS: one CLOCK_TCK
  rti(n) {
    if (n > RTI_PAIRS) { this.clock(0); this.waits.push({ at: this.n, n }); return; }
    for (let i = 0; i <= n; i++) this.clock(0);
  }
  // every device's current instruction (dev's set to cmd) to Update-IR; read: returns what dev captured
  ir(dev, cmd, read = false) {
    const ds = this.chain.devices;
    dev.cur = cmd;
    this.clock(1); this.clock(1); this.clock(0); this.clock(0);   // Select-DR, Select-IR, Capture-IR, Shift-IR
    let got = null;
    ds.forEach((d, i) => {
      if (d === dev && read) got = this.capture(d.irLen);
      this.shift(bytesOfNum(d.cur, d.irLen), d.irLen, i === ds.length - 1);
    });
    this.clock(1);   // Update-IR
    return got;
  }
  // dev's data register (data: bytes LSB first, a number, or null: zeros) to Update-DR, the other
  // devices in BYPASS; read: returns what came out of dev's register
  dr(dev, data, n, read = false) {
    const ds = this.chain.devices, idx = ds.indexOf(dev), last = idx === ds.length - 1;
    if (typeof data === 'number' || typeof data === 'bigint') data = bytesOfNum(data, n);
    this.clock(1); this.clock(0); this.clock(0);   // Select-DR, Capture-DR, Shift-DR
    this.shift(null, idx);   // the BYPASS bits of the devices nearer TDO
    const got = read ? this.capture(n) : null;
    this.shift(data, n, last);
    if (!last) this.shift(null, ds.length - 1 - idx, true);
    this.clock(1);   // Update-DR
    return got;
  }
  // the stream out (TDO read only in the pieces that hold a capture), the long waits as CLOCK_TCK
  // between its pieces; the captures filled in
  async run() {
    const n = this.n, reads = this.reads, waits = this.waits, tdo = reads.length ? new Uint8Array((n + 7) >> 3) : null;
    for (let s = 0, w = 0; s < n || w < waits.length;) {
      const m = Math.min(STREAM_CLOCKS, n, w < waits.length ? waits[w].at : n) - s;
      if (m > 0) {
        const data = new Uint8Array((m + 3) >> 2);
        for (let i = 0; i < m; i++) data[i >> 2] |= this.buf[s + i] << ((i & 3) << 1);
        const oe = reads.some(c => c.at < s + m && c.at + c.n > s);
        const got = await this.chain.port.putTmsTdiBits(oe, m, data);
        if (oe) for (let i = 0; i < m; i++) tdo[(s + i) >> 3] |= ((got[i >> 3] >> (i & 7)) & 1) << ((s + i) & 7);
        s += m;
      }
      for (; w < waits.length && waits[w].at === s; w++) await this.chain.port.clockTck(false, false, waits[w].n);
    }
    for (const c of reads) {
      c.bytes = new Uint8Array((c.n + 7) >> 3);
      for (let i = 0; i < c.n; i++) c.bytes[i >> 3] |= ((tdo[(c.at + i) >> 3] >> ((c.at + i) & 7)) & 1) << (i & 7);
    }
    this.n = 0; this.reads = []; this.waits = [];
  }
}

// Spartan-3E configuration instructions and status bits (UG332)
const S3 = { CFG_IN: 0x05, JPROGRAM: 0x0b, JSTART: 0x0c };
const ST_INIT = 0x10, ST_DONE = 0x20;

/** The FPGA of the chain (or an error naming what was found). */
export function fpgaOf(chain) {
  const f = chain.devices.find(d => d.kind === 'fpga');
  if (!f) fail(`no Spartan-3E FPGA on the JTAG chain (found ${chain.devices.map(d => d.name).join(', ')})`);
  return f;
}

/**
 * The header of a .bit (server/programmer.js parseBitHeader, without Node's Buffer):
 * { design, part, package, date, time } (part: 'xc3s250e'), or null when it is not a .bit.
 */
export function bitHeader(bit) {
  if (bit.length < 13 || bit[0] !== 0 || bit[1] !== 9) return null;
  let o = 13;
  const out = { design: null, part: null, package: null, date: null, time: null };
  const str = () => { const n = (bit[o] << 8) | bit[o + 1]; o += 2; const v = new TextDecoder('latin1').decode(bit.subarray(o, o + n)).replace(/\0+$/, ''); o += n; return v; };
  while (o < bit.length) {
    const k = String.fromCharCode(bit[o++]);
    if (k === 'a') out.design = str().split(';')[0];
    else if (k === 'b') { const p = splitBitPart(str()); if (p) { out.part = p.part; out.package = p.package; } }
    else if (k === 'c') out.date = str();
    else if (k === 'd') out.time = str();
    else break;
  }
  return out.part ? out : null;
}

/** Open the board and scan its chain: { product, serial, devices: [{ name, idcode, kind }] } (nearest TDI first). */
export async function scanAdept(usb, { log = () => {} } = {}) {
  const a = await new Adept(usb).open();
  try {
    log(`Programmer: ${a.productName || 'Digilent Adept USB'}${a.serial ? ` (serial ${a.serial})` : ''}`);
    const chain = new Chain(new Djtg(a, 0));
    await chain.init();
    await chain.close();
    const devices = [...chain.devices].reverse().map(d => ({ name: d.name, idcode: d.idcode, kind: d.kind }));
    devices.forEach((d, i) => log(`Position ${i + 1}: ${d.name.toUpperCase()} (IDCODE 0x${d.idcode.toString(16).padStart(8, '0')})`));
    return { product: a.productName, serial: a.serial, devices };
  } finally { await a.close(); }
}

/**
 * Configure the FPGA (SRAM) with a .bit (the whole file: the FPGA skips the header up to its sync
 * word), as adepttool's basys2_prog.py does: JPROGRAM, wait for INIT, CFG_IN, JSTART, wait for DONE.
 * The part the .bit was built for (its header; else part, e.g. 'xc3s250e') must be the chain's FPGA.
 */
export async function programAdept(usb, bit, { part = null, log = () => {}, maxPolls = 2000 } = {}) {
  part = bitHeader(bit)?.part || part;   // the file says what it was built for
  const a = await new Adept(usb).open();
  try {
    log(`Programmer: ${a.productName || 'Digilent Adept USB'}${a.serial ? ` (serial ${a.serial})` : ''}`);
    const chain = new Chain(new Djtg(a, 0));
    await chain.init();
    const fpga = fpgaOf(chain);
    log(`JTAG chain: ${[...chain.devices].reverse().map(d => d.name.toUpperCase()).join(' → ')}`);
    if (part && fpga.name !== String(part).toLowerCase()) fail(`the board's FPGA is a ${fpga.name.toUpperCase()}, the bitstream is for a ${String(part).toUpperCase()}`);
    log('JPROGRAM: clearing the configuration');
    await chain.instr(fpga, S3.JPROGRAM);
    await chain.instr(fpga, S3.CFG_IN);
    let polls = 0;
    while (!((await chain.status(fpga)) & ST_INIT)) if (++polls > maxPolls) fail('the FPGA does not get ready (INIT_B stays low)');
    log(`CFG_IN: ${bit.length} bytes`);
    await chain.shiftDr(fpga, () => chain.shiftBytes(byterev(bit), bit.length * 8));
    log('JSTART');
    await chain.instr(fpga, S3.JSTART);
    await chain.clockRti(12);
    polls = 0;
    while (!((await chain.status(fpga)) & ST_DONE)) {
      if (++polls > maxPolls) fail('DONE did not go high: the bitstream was not accepted (wrong device or a corrupt file?)');
      await chain.clockRti(12);
    }
    await chain.clockRti(12);
    log('DONE: the FPGA is configured');
    await chain.close();
    return { fpga: fpga.name };
  } finally { await a.close(); }
}
