// Shared helpers of the bitstream experiments.
const lits = a => [1, 2, 3, 4].map(k => ((a >> (k - 1)) & 1 ? `A${k}` : `~A${k}`)).join('*');
/** XDL LUT equation from its 16 bits (bit a = output for address a = A4A3A2A1). */
export function eqOf(bits) {
  const ones = bits.map((b, a) => (b ? a : -1)).filter(a => a >= 0);
  if (!ones.length) return 'D=(A1*~A1)';
  if (ones.length === 16) return 'D=(A1+~A1)';
  return `D=(${ones.map(a => `(${lits(a)})`).join('+')})`;
}

/** Codewords told apart in tiles that share a frame / bit window (#48): CLKL_X0Y17 and
 *  LIOIS_CLK_PCI_X0Y17, CLKR and RIBUFS_CLK_PCI, GCLKVC and its CLB start at the same frame and bit,
 *  so ana-pipdrop.mjs cannot tell which of two PIPs with the same codeword there a bit belongs to (it
 *  took the first: the bits of the clock tile's switch given to the I/O tile's). A PIP whose codeword
 *  another tile of its window already has gets the first codeword the window has not used (no random
 *  draw, so the designs without such a clash stay as they were). key: { tile: [{ code }, …] }
 *  (changed in place); words: the codewords; windowOf(tile): a key of the tile's window or null.
 *  Returns the number of codewords changed. */
export function separateWindows(key, words, windowOf) {
  const byWin = new Map();
  for (const t of Object.keys(key)) { const w = windowOf(t); if (w != null) { if (!byWin.has(w)) byWin.set(w, []); byWin.get(w).push(t); } }
  let n = 0;
  for (const tiles of byWin.values()) {
    if (tiles.length < 2) continue;
    const owner = new Map();   // codeword -> the first tile of the window with it
    for (const t of tiles) for (const p of key[t]) owner.has(p.code.join(',')) || owner.set(p.code.join(','), t);
    const seen = new Map();
    for (const t of tiles) for (const p of key[t]) {
      const c = p.code.join(',');
      if (!seen.has(c)) { seen.set(c, t); continue; }
      if (seen.get(c) === t) continue;
      const free = words.find(x => !owner.has(x.join(',')));
      if (!free) throw new Error(`window of ${tiles.join(', ')}: more PIPs than codewords`);
      p.code = free; owner.set(free.join(','), t); seen.set(free.join(','), t); n++;
    }
  }
  return n;
}

/** Artefacts among different patterns of one PIP: a LUT turned to the constant 0 when its output
 *  lost its only route (8 or more bits of one 16-bit LUT block), a cleared bit (the pin's input
 *  multiplexer falling back to another setting), no bits while others have bits (bits given to a
 *  neighbouring tile). Each filter applies only when it leaves a pattern.
 *  pats: [[pattern ("df,db df,db …"), tiles], …] sorted by count; returns the patterns left, same order. */
export function resolvePatterns(pats) {
  const lutRun = p => { const n = new Map(); for (const s of p.split(' ')) { const [f, b] = s.replace('!', '').split(',').map(Number); const k = `${f}:${Math.floor(b / 16)}`; n.set(k, (n.get(k) || 0) + 1); } return [...n.values()].some(c => c >= 8); };
  for (const bad of [p => p && lutRun(p), p => p.includes('!'), p => !p]) {
    const keep = pats.filter(([p]) => !bad(p));
    if (keep.length) pats = keep;
  }
  return pats;
}

/** A PIP's measured bits without a LUT turned into the constant 0 (8 or more bits of one 16-bit LUT
 *  block of one frame): removing the only route of a LUT's output makes bitgen clear the LUT, which
 *  is not the PIP's. bits: ["df,db" | "!df,db", …] (relative or absolute). */
export function stripLutRuns(bits) {
  const key = s => { const [f, b] = s.replace('!', '').split(',').map(Number); return `${f}:${Math.floor(b / 16)}`; };
  const n = new Map();
  for (const s of bits) n.set(key(s), (n.get(key(s)) || 0) + 1);
  return bits.filter(s => n.get(key(s)) < 8);
}
