// The example projects (examples/<name>), in the order the interface lists them: from the first
// steps (gates: combinational logic drawn as a schematic; traffic: a state diagram and a truth table)
// to the larger designs; uart, serial communication with a terminal (#2537). Isomorphic.

export const EXAMPLE_ORDER = ['gates', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart'];

/** Example names in the listing order: the known ones first (EXAMPLE_ORDER), then any other, by name. */
export function orderExamples(names) {
  const rank = n => { const i = EXAMPLE_ORDER.indexOf(n); return i < 0 ? EXAMPLE_ORDER.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}
