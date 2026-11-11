// Silinx - a walk through a bound tree (core/elaborate.js's statements and expressions): every node, before the nodes
// in it (not into a signal, a type, a function, a value, a location or triggers), in the same order as a recursive walk
// but with a stack of its own, as an if … elsif chain of thousands of branches nests as deep (#2577); f(node) === false
// skips the nodes in it.
export function walk(n, f) {
  const stack = [n];
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (Array.isArray(x)) { for (let i = x.length - 1; i >= 0; i--) stack.push(x[i]); continue; }
    if (f(x) === false) continue;
    const at = stack.length;
    for (const key in x) {
      if (key === 'sig' || key === 't' || key === 'fn' || key === 'val' || key === 'loc' || key === 'triggers') continue;
      const v = x[key];
      if (v && typeof v === 'object') stack.push(v);
    }
    for (let i = at, j = stack.length - 1; i < j; i++, j--) [stack[i], stack[j]] = [stack[j], stack[i]];
  }
}
