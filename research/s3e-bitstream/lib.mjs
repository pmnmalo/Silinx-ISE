// Shared helpers of the bitstream experiments.
const lits = a => [1, 2, 3, 4].map(k => ((a >> (k - 1)) & 1 ? `A${k}` : `~A${k}`)).join('*');
/** XDL LUT equation from its 16 bits (bit a = output for address a = A4A3A2A1). */
export function eqOf(bits) {
  const ones = bits.map((b, a) => (b ? a : -1)).filter(a => a >= 0);
  if (!ones.length) return 'D=(A1*~A1)';
  if (ones.length === 16) return 'D=(A1+~A1)';
  return `D=(${ones.map(a => `(${lits(a)})`).join('+')})`;
}
