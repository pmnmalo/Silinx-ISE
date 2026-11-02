// Silinx - the placers' common parts (the Spartan-3E's, fpga/place.js, and the Spartan-6's, fpga/s6/place.js): the
// placement's error, the seeded random numbers, the crossing-count correction of a net's wirelength (browser + Node).

// (hint: what to change, printed after the error by the flow; open-flow-core.js)
export class PlaceError extends Error {
  constructor(message, hint) { super(message); if (hint !== undefined) this.hint = hint; }
}

// ------------------------------------------------------------------ random numbers
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the expected wirelength of a net with n pins is more than its bounding box for n > 3 (VPR's
// crossing-count correction)
const CROSS = [1, 1, 1, 1, 1.0828, 1.1536, 1.2206, 1.2823, 1.3385, 1.3991, 1.4493, 1.4974, 1.5455, 1.5937, 1.6418, 1.6899, 1.7304, 1.7709, 1.8114, 1.8519, 1.8924, 1.9288, 1.9652, 2.0015, 2.0379, 2.0743, 2.1061, 2.1379, 2.1698, 2.2016, 2.2334, 2.2646, 2.2958, 2.3271, 2.3583, 2.3895, 2.4187, 2.4479, 2.4772, 2.5064, 2.5356, 2.5610, 2.5864, 2.6117, 2.6371, 2.6625, 2.6887, 2.7148, 2.7410, 2.7671, 2.7933];
export const crossing = n => (n < CROSS.length ? CROSS[n] : 2.7933 + 0.02616 * (n - 50));

