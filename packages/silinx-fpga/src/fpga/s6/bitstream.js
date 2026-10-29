// Silinx - Spartan-6 configuration bitstreams (.bit files): reading and writing (browser + Node), #724.
//
// The configuration packets of UG380 (Spartan-6 FPGA Configuration User Guide): 16-bit words after the
// sync word AA99 5566; a Type 1 header [15:13] = 001, [12:11] opcode (0 NOOP, 1 read, 2 write), [10:5]
// the register, [4:0] the word count; a Type 2 header the same with [15:13] = 010 and the count in the
// two words that follow. A write of several words to a register writes them all to it (FAR_MAJ's two
// words: FAR_MAJ then FAR_MIN as bitgen means them, IDCODE's two halves). The packet sequence written
// here is the one ISE's bitgen writes for the XC6SLX16 and the XC6SLX45 (research/s6, stage S6-A), so the
// same frame data gives a byte-identical file.
//
// What ISE's bitgen taught (research/s6/README.md, #724):
// - the CRC is 22 bits, one step per word written to a register: c = (c << 1) ^ (bit 21 of c ? 0x9081 : 0),
//   then c ^= register << 16 | word; RCRC (CMD 7) sets it to 0; bitgen writes it as two words (6 + 16
//   bits) after the frame data (the auto CRC, which does not reset it) and in the CRC register at the end;
//   with -g CRC:Disable both are the fixed words 9876 DEFC;
// - FDRI's data: for each row (FAR_MAJ [11:8]) its columns (FAR_MAJ [7:0]) in order, each column its
//   frames of 65 words (FAR_MIN), then 2 frames of pad; then the block RAM's frames (FAR_MAJ block type 1,
//   [15:12]); then the I/O words, as many as FLR says; then one word;
// - a design with a block RAM has one frame of the block RAM's column written again after them (FAR,
//   WCFG, a Type 2 FDRI of that frame and a frame of pad, its auto CRC): the frame's content is the bit
//   database's (#728), the writer takes it as given (rewrites).

/** The configuration registers by address (UG380). */
export const REG6 = ['CRC', 'FAR_MAJ', 'FAR_MIN', 'FDRI', 'FDRO', 'CMD', 'CTL', 'MASK', 'STAT', 'LOUT', 'COR1', 'COR2', 'PWRDN_REG', 'FLR',
  'IDCODE', 'CWDT', 'HC_OPT_REG', null, 'CSBO', 'GENERAL1', 'GENERAL2', 'GENERAL3', 'GENERAL4', 'GENERAL5', 'MODE_REG', 'PU_GWE', 'PU_GTS',
  'MFWR', 'CCLK_FREQ', 'SEU_OPT', 'EXP_SIGN', 'RDBK_SIGN', 'BOOTSTS', 'EYE_MASK', 'CBC_REG'];
const R = Object.fromEntries(REG6.map((n, i) => [n, i]).filter(([n]) => n));
/** Commands written to CMD. */
export const CMD6 = { NULL: 0, WCFG: 1, MFW: 2, LFRM: 3, RCFG: 4, START: 5, RCRC: 7, AGHIGH: 8, GRESTORE: 10, SHUTDOWN: 11, DESYNC: 13, IPROG: 14 };

/** The frame length in words, for every part. */
export const FRAME_WORDS = 65;
/** The frames of a column (its minors) in a row, the columns in their order (FAR_MAJ [7:0]), measured from
 *  bitgen's multi-frame writes of an empty design (-g Compress). The row's 2 frames of pad follow. */
const COLUMNS = {
  xc6slx16: [4, 30, 30, 31, 25, 30, 31, 24, 30, 31, 30, 31, 31, 31, 30, 31, 30, 31, 30, 24, 31, 30, 25, 31, 30, 30],
  xc6slx45: [4, 30, 30, 31, 25, 30, 31, 24, 30, 31, 30, 31, 30, 25, 31, 30, 31, 30, 31, 31, 31, 30, 31, 30, 31, 30, 25, 30, 31, 30, 31,
    30, 31, 31, 30, 25, 31, 30, 30],
};
const PAD_FRAMES = 2;

/** The parts: IDCODE, FLR (the I/O words), the rows, the block RAM's frames, the .bit header's part. */
export const S6_DEVICES = {
  xc6slx16: { device: 'xc6slx16', part: '6slx16csg324', idcode: 0x04002093, flr: 0x430, rows: 4, columns: COLUMNS.xc6slx16, bramFrames: 576 },
  xc6slx45: { device: 'xc6slx45', part: '6slx45csg324', idcode: 0x04008093, flr: 0x628, rows: 8, columns: COLUMNS.xc6slx45, bramFrames: 2304 },
};
for (const d of Object.values(S6_DEVICES)) {
  d.rowFrames = d.columns.reduce((a, b) => a + b, 0) + PAD_FRAMES;
  d.fdriWords = (d.rows * d.rowFrames + d.bramFrames) * FRAME_WORDS + d.flr + 1;
}

/** The format of a device ('xc6slx16', or a part such as 'xc6slx45csg324-3' / 'xc6slx45-csg324-3'); null when not known. */
export function bitFormat6(device) {
  const m = /^(?:xc)?(6slx\d+)/i.exec(String(device || ''));
  return (m && S6_DEVICES[`xc${m[1].toLowerCase()}`]) || null;
}

/**
 * Where FDRI's words are: { rows: [word offset of each row], bram (the block RAM's first word), iob (the
 * I/O words'), tail (the last word), words } for a device of S6_DEVICES.
 */
export function fdriLayout(dev) {
  const rowWords = dev.rowFrames * FRAME_WORDS;
  const rows = Array.from({ length: dev.rows }, (_, r) => r * rowWords);
  const bram = dev.rows * rowWords, iob = bram + dev.bramFrames * FRAME_WORDS;
  return { rows, bram, iob, tail: iob + dev.flr, words: dev.fdriWords };
}

/** The word offset in FDRI of frame (row, column, minor) of the logic (block type 0). */
export function frameOffset(dev, row, column, minor) {
  if (row < 0 || row >= dev.rows || column < 0 || column >= dev.columns.length || minor < 0 || minor >= dev.columns[column]) {
    throw new Error(`no frame row ${row} column ${column} minor ${minor} in the ${dev.device}`);
  }
  let f = row * dev.rowFrames + minor;
  for (let c = 0; c < column; c++) f += dev.columns[c];
  return f * FRAME_WORDS;
}

/** The frame data of the empty design as bitgen writes it: the rows' pad frames all ones, and three
 *  words of the first column (frame 3 word 4 of the even rows, frame 27 word 64 of row 0). */
export function emptyFdri(dev) {
  const fdri = new Uint16Array(dev.fdriWords);
  const { rows } = fdriLayout(dev);
  rows.forEach((o, r) => {
    fdri.fill(0xffff, o + (dev.rowFrames - PAD_FRAMES) * FRAME_WORDS, o + dev.rowFrames * FRAME_WORDS);
    if (r % 2 === 0) fdri[o + 3 * FRAME_WORDS + 4] = 0x0020;
  });
  fdri[27 * FRAME_WORDS + 64] = 0x3100;
  return fdri;
}

/** The CRC after one word written to a register (22 bits). */
export function crc6Update(crc, reg, word) {
  const c = ((crc << 1) & 0x3fffff) ^ (crc & 0x200000 ? 0x9081 : 0);
  return (c ^ (reg << 16) ^ word) >>> 0;
}
const CRC_OFF = [0x9876, 0xdefc];

/** COR1 for the options used here: StartUpClk Cclk (bitgen's default) / UserClk / JtagClk, the CRC
 *  checked unless crc is false. */
export function cor1Value({ crc = true, startupClk = 'Cclk' } = {}) {
  const clk = String(startupClk).toLowerCase();
  return 0x3d00 | (clk === 'jtagclk' ? 2 : clk === 'userclk' ? 1 : 0) | (crc ? 0 : 0x10);
}

const NOOP = 0x2000;
const type1 = (reg, n) => 0x3000 | (reg << 5) | n;
const ascii = s => Array.from(String(s), ch => ch.charCodeAt(0) & 0xff);

/** The .bit file of a configuration: { fdri (Uint16Array of the device's fdriWords), rewrites ([{ far:
 *  [FAR_MAJ, FAR_MIN], words (Uint16Array: the frame and its pad, 130 words) }]: frames written again after
 *  the others), name ('top.ncd;UserID=0xFFFFFFFF'), part (default the device's), date ('2026/10/27'), time
 *  ('12:00:00'), crc (true: bitgen's default; false: -g CRC:Disable), startupClk ('Cclk' | 'UserClk' |
 *  'JtagClk'), device (S6_DEVICES) }. Returns a Uint8Array. */
export function writeBit6({ fdri, rewrites = [], name = 'design.ncd', part = null, date = '2026/01/01', time = '00:00:00', crc = true, startupClk = 'Cclk', device = S6_DEVICES.xc6slx16 }) {
  part ||= device.part;
  if (fdri.length !== device.fdriWords) throw new Error(`frame data: ${fdri.length} words, expected ${device.fdriWords}`);
  for (const r of rewrites) if (r.words.length !== 2 * FRAME_WORDS) throw new Error(`a frame written again: ${r.words.length} words, expected ${2 * FRAME_WORDS}`);
  const words = [0xaa99, 0x5566];
  let c = 0;
  const noop = n => { for (let i = 0; i < n; i++) words.push(NOOP); };
  const write = (reg, ...data) => {
    words.push(type1(R[reg], data.length), ...data);
    for (const d of data) c = R[reg] === R.CMD && d === CMD6.RCRC ? 0 : crc6Update(c, R[reg], d);
  };
  const crcWords = () => (crc ? [c >>> 16, c & 0xffff] : CRC_OFF);
  write('CMD', CMD6.RCRC);
  noop(1);
  write('FLR', device.flr);
  write('COR1', cor1Value({ crc, startupClk }));
  write('COR2', 0x09ee);
  write('IDCODE', device.idcode >>> 16, device.idcode & 0xffff);
  write('MASK', 0x00cf);
  write('CTL', 0x0081);
  noop(17);
  write('CCLK_FREQ', 0x3cc8);
  write('PWRDN_REG', 0x0881);
  write('EYE_MASK', 0);
  write('HC_OPT_REG', 0x001f);
  write('CWDT', 0xffff);
  write('PU_GWE', 0x0005);
  write('PU_GTS', 0x0004);
  write('MODE_REG', 0x0100);
  for (const g of ['GENERAL1', 'GENERAL2', 'GENERAL3', 'GENERAL4', 'GENERAL5']) write(g, 0);
  write('SEU_OPT', 0x1be2);
  write('EXP_SIGN', 0, 0);
  noop(2);
  // the frames: one Type 2 write from FAR 0, then the auto CRC; the frames written again likewise
  const frames = (far, data) => {
    write('FAR_MAJ', ...far);
    write('CMD', CMD6.WCFG);
    words.push(0x5000 | (R.FDRI << 5), data.length >>> 16, data.length & 0xffff);
    for (let i = 0; i < data.length; i++) { words.push(data[i]); c = crc6Update(c, R.FDRI, data[i]); }
    words.push(...crcWords());
  };
  frames([0, 0], fdri);
  noop(24);
  for (const r of rewrites) frames(r.far, r.words);
  write('CMD', CMD6.GRESTORE);
  write('CMD', CMD6.LFRM);
  noop(4);
  write('CMD', CMD6.GRESTORE);
  write('CMD', CMD6.START);
  write('MASK', 0x00ff);
  write('CTL', 0x0081);
  words.push(type1(R.CRC, 2), ...crcWords());
  write('CMD', CMD6.DESYNC);
  noop(14);
  // header: a field preamble, the fields a (design), b (part), c (date), d (time), e (length), then 16 bytes FF
  const head = [0x00, 0x09, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x00, 0x00, 0x01];
  const field = (key, s) => { const b = [...ascii(s), 0]; head.push(key.charCodeAt(0), b.length >> 8, b.length & 0xff, ...b); };
  field('a', name); field('b', part); field('c', date); field('d', time);
  const len = 16 + words.length * 2;
  head.push('e'.charCodeAt(0), (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...new Array(16).fill(0xff));
  const out = new Uint8Array(head.length + words.length * 2);
  out.set(head, 0);
  let p = head.length;
  for (const w of words) { out[p++] = w >>> 8; out[p++] = w & 0xff; }
  return out;
}

/** The header fields of a .bit (a design, b part, c date, d time) and where its configuration data starts. */
export function readHeader6(b) {
  const header = {};
  let p = 13;   // the preamble: 00 09, 9 bytes, 00 01
  while (p < b.length) {
    const key = String.fromCharCode(b[p]);
    if (key === 'e') return { header, start: p + 5 };
    if (!'abcd'.includes(key)) throw new Error(`not a .bit header (field '${key}' at byte ${p})`);
    const n = (b[p + 1] << 8) | b[p + 2];
    header[key] = String.fromCharCode(...b.subarray(p + 3, p + 3 + n - 1));
    p += 3 + n;
  }
  throw new Error('not a .bit header (no field e)');
}

/**
 * Read a Spartan-6 .bit (or its configuration data alone): { header (null without one), packets: [{ op,
 * reg, data }] (a NOOP run as { noop: k }, an auto CRC as { autoCrc, computed }), fdri (Uint16Array, the
 * words of the first write to FDRI), rewrites ([{ far: [FAR_MAJ, FAR_MIN], words }]: the later writes to
 * FDRI and the FAR each starts at), registers ({ name: the last words written }), crcChecks: [{ expected, computed,
 * auto }] (with the CRC on), crc (false when bitgen wrote 9876 DEFC), cor1, startupClk, device (the
 * S6_DEVICES entry of its IDCODE, or null) }. Throws if there is no sync word.
 */
export function readBit6(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let header = null, start = 0;
  if (b[0] === 0x00 && b[1] === 0x09) ({ header, start } = readHeader6(b));
  let s = start;
  while (s + 4 <= b.length && !(b[s] === 0xaa && b[s + 1] === 0x99 && b[s + 2] === 0x55 && b[s + 3] === 0x66)) s++;
  if (s + 4 > b.length) throw new Error('no sync word AA995566');
  const n = (b.length - s - 4) >> 1, w = new Uint16Array(n);
  for (let k = 0; k < n; k++) w[k] = (b[s + 4 + 2 * k] << 8) | b[s + 5 + 2 * k];
  const packets = [], registers = {}, crcChecks = [], chunks = [];
  let c = 0, crcOn = null;
  const check = (hi, lo, auto) => {
    const expected = ((hi << 16) | lo) >>> 0;
    if (hi === CRC_OFF[0] && lo === CRC_OFF[1]) crcOn = false;
    else { crcOn ??= true; crcChecks.push({ expected, computed: c, auto }); }
  };
  for (let k = 0; k < n;) {
    const h = w[k++], type = h >>> 13, op = (h >>> 11) & 3, reg = (h >>> 5) & 0x3f;
    if (type === 1 && op === 0) {
      const last = packets[packets.length - 1];
      if (last?.noop) last.noop++; else packets.push({ noop: 1 });
      continue;
    }
    let count;
    if (type === 1) count = h & 0x1f;
    else if (type === 2) { count = ((w[k] << 16) | w[k + 1]) >>> 0; k += 2; } else { packets.push({ unknown: h, at: k - 1 }); continue; }
    const data = w.subarray(k, k + count);
    k += count;
    const name = REG6[reg] || `R${reg}`;
    packets.push({ op, reg: name, data });
    if (op !== 2) continue;
    if (reg === R.CRC) { if (count === 2) check(data[0], data[1], false); continue; }
    for (const d of data) c = reg === R.CMD && d === CMD6.RCRC ? 0 : crc6Update(c, reg, d);
    if (reg === R.FDRI) {
      if (count) chunks.push({ far: [...(registers.FAR_MAJ || [0, 0])], words: data });
      if (type === 2 && k + 2 <= n) { check(w[k], w[k + 1], true); packets.push({ autoCrc: ((w[k] << 16) | w[k + 1]) >>> 0, computed: c }); k += 2; }
    } else registers[name] = [...data];
  }
  const fdri = Uint16Array.from(chunks[0]?.words || []);
  const rewrites = chunks.slice(1).map(x => ({ far: x.far, words: Uint16Array.from(x.words) }));
  const cor1 = registers.COR1?.[0] ?? null;
  const idcode = registers.IDCODE ? ((registers.IDCODE[0] << 16) | registers.IDCODE[1]) >>> 0 : null;
  return {
    header, packets, fdri, rewrites, registers, crcChecks, crc: crcOn !== false, cor1,
    startupClk: cor1 === null ? null : ['Cclk', 'UserClk', 'JtagClk', null][cor1 & 3],
    device: Object.values(S6_DEVICES).find(d => d.idcode === idcode) || null,
  };
}

/** A packet as one line: "W COR1 1: 3d00", "W FDRI 242450 words", "NOOP x8", "auto CRC 0028ee80". */
export const packetLine6 = p => (p.noop ? `NOOP x${p.noop}` : p.unknown !== undefined ? `? ${p.unknown.toString(16).padStart(4, '0')}`
  : p.autoCrc !== undefined ? `auto CRC ${p.autoCrc.toString(16).padStart(8, '0')}`
    : `${['NOOP', 'R', 'W', '?'][p.op]} ${p.reg} ${p.data.length}${p.data.length > 8 ? ' words' : `: ${[...p.data].map(x => x.toString(16).padStart(4, '0')).join(' ')}`}`);
