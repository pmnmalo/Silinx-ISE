// Small bitstreams of the open families in their own formats (#2298), for the programming's tests: an ECP5 .bit as ecppack
// writes it (FF 00, its "Part:" comment, FF, the preamble FF FF BD B3, VERIFY_ID with the IDCODE) and a Gowin .fs as gowin_pack
// writes it (lines of 0s and 1s, its IDCODE check 06 00 00 00 <IDCODE>). The real ones, the flows', are read in
// test/ecp5.test.js and test/gowin.test.js.

const be32 = v => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

/** An ECP5 .bit of n bytes for part (its comment) and idcode. */
export function ecp5Bit({ part = 'LFE5U-85F-6CABGA381', idcode = 0x41113043, size = 4096 } = {}) {
  const head = [0xff, 0x00, ...Buffer.from(`Part: ${part}`, 'latin1'), 0x00, 0xff,
    0xff, 0xff, 0xbd, 0xb3, 0xff, 0xff, 0xff, 0xff, 0x3b, 0, 0, 0, 0xe2, 0, 0, 0, ...be32(idcode)];
  const b = Buffer.alloc(Math.max(size, head.length), 0);
  b.set(head);
  for (let i = head.length; i < b.length; i++) b[i] = (i * 13) & 0xff;
  return b;
}

/** A Gowin .fs of frames lines for idcode (its text). */
export function gowinFs({ idcode = 0x1100481b, frames = 8, comment = true } = {}) {
  const bits = bytes => bytes.map(x => x.toString(2).padStart(8, '0')).join('');
  const lines = [...(comment ? ['//Silinx test .fs'] : []), bits(new Array(20).fill(0xff)), bits([0xa5, 0xc3]), bits([0x06, 0, 0, 0, ...be32(idcode)])];
  for (let f = 0; f < frames; f++) lines.push(bits(Array.from({ length: 12 }, (_, i) => (f * 31 + i * 7) & 0xff)));
  return `${lines.join('\n')}\n`;
}
