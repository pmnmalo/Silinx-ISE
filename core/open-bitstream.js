// The open families' bitstreams read before a board is programmed with them (#2298): the ECP5's .bit (ecppack's, Lattice's
// format: no Xilinx header) and the Gowin's .fs (gowin_pack's: text, a line of 0s and 1s per frame), their device found in
// them and checked against the project's, as a Xilinx .bit's header is (server/programmer.js checkBitPart). Isomorphic: the
// server reads them, and the browser edition before it sends them over WebUSB.
//
// The ECP5's .bit: FF 00, comment strings each ending in a 0 ("Part: LFE5U-85F-6CABGA381"), FF, then the configuration: its
// preamble FF FF BD B3, a few FF, then its commands, VERIFY_ID (E2 00 00 00 <IDCODE>) among the first.
// The Gowin's .fs: lines of '0'/'1' (a byte each 8), "//" comments; its commands, among the first the IDCODE check
// (06 00 00 00 <IDCODE>).

/** The JTAG IDCODEs of the ECP5's parts (Lattice's ECP5 sysCONFIG guide, TN1260), by their name in Silinx. */
export const ECP5_IDCODES = {
  'lfe5u-12f': 0x21111043, 'lfe5u-25f': 0x41111043, 'lfe5u-45f': 0x41112043, 'lfe5u-85f': 0x41113043,
  'lfe5um-25f': 0x01111043, 'lfe5um-45f': 0x01112043, 'lfe5um-85f': 0x01113043,
  'lfe5um5g-25f': 0x81111043, 'lfe5um5g-45f': 0x81112043, 'lfe5um5g-85f': 0x81113043,
};
/** The Gowin's (the Tang Nano 9K's GW1NR-9C, the GW1N-9C's die with its PSRAM). */
export const GOWIN_IDCODES = { 'gw1nr-9c': 0x1100481b, 'gw1n-9c': 0x1100481b };

const PREAMBLE = [0xff, 0xff, 0xbd, 0xb3];
export const idHex = id => `0x${(id >>> 0).toString(16).padStart(8, '0')}`;
const word = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const findSeq = (b, seq, from = 0, to = b.length) => {
  for (let i = from; i + seq.length <= Math.min(to, b.length); i++) if (seq.every((v, k) => b[i + k] === v)) return i;
  return -1;
};

/** An ECP5 .bit: { part (its comment's, e.g. 'LFE5U-85F-6CABGA381', or null), idcode (VERIFY_ID's, or null), size }; not one: an error. */
export function ecp5BitInfo(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let at = 0, part = null;
  if (b[0] === 0xff && b[1] === 0x00) {
    // the comments: strings ending in 0, up to the FF that closes them
    let i = 2;
    while (i < b.length && b[i] !== 0xff) {
      let j = i;
      while (j < b.length && b[j] !== 0) j++;
      const s = new TextDecoder('latin1').decode(b.subarray(i, j)), m = /^Part:\s*(\S+)/.exec(s);
      if (m) part = m[1];
      i = j + 1;
    }
    at = i;
  }
  const pre = findSeq(b, PREAMBLE, at, at + 64);
  if (pre < 0) throw new Error('not an ECP5 bitstream (no Lattice preamble FF FF BD B3)');
  const v = findSeq(b, [0xe2, 0, 0, 0], pre + 4, pre + 64);
  return { part, idcode: v >= 0 && v + 8 <= b.length ? word(b, v + 4) : null, size: b.length, dataOffset: pre };
}

/** A Gowin .fs (its text): { bytes (the configuration, a Uint8Array), idcode (its check's, or null), frames }; not one: an error. */
export function gowinFsInfo(text) {
  const s = typeof text === 'string' ? text : new TextDecoder().decode(text);
  const lines = [];
  for (const [k, raw] of s.split('\n').entries()) {
    const l = raw.trim();
    if (!l || l.startsWith('//')) continue;
    if (!/^[01]+$/.test(l) || l.length % 8) throw new Error(`not a Gowin .fs (line ${k + 1}: not 8-bit groups of 0s and 1s)`);
    lines.push(l);
  }
  if (!lines.length) throw new Error('not a Gowin .fs (no frame)');
  const bits = lines.join(''), bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const v = findSeq(bytes, [0x06, 0, 0, 0], 0, 64);
  return { bytes, idcode: v >= 0 && v + 8 <= bytes.length ? word(bytes, v + 4) : null, frames: lines.length };
}

/** An open family's bitstream against the project's device: a warning's text, or null (an unknown part: not checked). */
export function checkOpenBitstream(family, info, device) {
  const part = String(device?.part || '').toLowerCase();
  if (family === 'ecp5') {
    if (info.part && !info.part.toLowerCase().startsWith(`${part}-`)) return `bitstream was built for '${info.part}' but the target device is '${part.toUpperCase()}'`;
    const want = ECP5_IDCODES[part];
    if (want != null && info.idcode != null && info.idcode !== want) return `bitstream is for the IDCODE ${idHex(info.idcode)} but the target device '${part.toUpperCase()}' is ${idHex(want)}`;
  }
  if (family === 'gowin') {
    const want = GOWIN_IDCODES[part];
    if (want != null && info.idcode != null && info.idcode !== want) return `bitstream is for the IDCODE ${idHex(info.idcode)} but the target device '${part.toUpperCase()}' is ${idHex(want)}`;
  }
  return null;
}
