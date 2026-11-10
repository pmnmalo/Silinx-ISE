// A text's diff by lines (#3197): an HDL file between two versions, side by side, as the history's Compare shows it and
// the MCP's git_diff says it. Myers's algorithm (the shortest edit script, O((N+M)D)), the lines kept, removed and
// added in order; side by side, a removed line beside the added one that replaced it. Isomorphic.

const lines = t => { const l = String(t ?? '').split('\n'); if (l.at(-1) === '') l.pop(); return l; };

/** The edit script from a to b: [{ op: '=' | '-' | '+', text, a (its line in a, 1-based) , b (in b) }]. */
export function diffLines(aText, bText) {
  const a = lines(aText), b = lines(bText);
  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2), trace = [];
  let found = n === 0 && m === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) { found = true; trace.push(v.slice()); break; }
    }
  }
  // the path back through the trace
  const out = [];
  let x = n, y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const w = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && w[max + k - 1] < w[max + k + 1]) ? k + 1 : k - 1;
    const px = d === 0 ? 0 : w[max + prevK], py = px - prevK;
    while (x > px && y > py) { out.push({ op: '=', text: a[x - 1], a: x, b: y }); x--; y--; }
    if (d === 0) break;
    if (x === px) { out.push({ op: '+', text: b[y - 1], a: null, b: y }); y--; }
    else { out.push({ op: '-', text: a[x - 1], a: x, b: null }); x--; }
  }
  while (x > 0 && y > 0) { out.push({ op: '=', text: a[x - 1], a: x, b: y }); x--; y--; }
  return out.reverse();
}

/** Side by side: rows { left: { line, text } | null, right: … , op: '=' | '-' | '+' | '~' (changed) }. */
export function sideBySide(aText, bText) {
  const ops = diffLines(aText, bText), rows = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i].op === '=') { rows.push({ op: '=', left: { line: ops[i].a, text: ops[i].text }, right: { line: ops[i].b, text: ops[i].text } }); i++; continue; }
    const del = [], add = [];
    while (i < ops.length && ops[i].op !== '=') (ops[i].op === '-' ? del : add).push(ops[i++]);
    for (let j = 0; j < Math.max(del.length, add.length); j++) {
      const l = del[j], r = add[j];
      rows.push({ op: l && r ? '~' : l ? '-' : '+', left: l ? { line: l.a, text: l.text } : null, right: r ? { line: r.b, text: r.text } : null });
    }
  }
  return rows;
}

/** A unified diff's text (the MCP's): the changes with `context` lines around them, @@ hunks as git's. */
export function unifiedDiff(aText, bText, { from = 'a', to = 'b', context = 3 } = {}) {
  const ops = diffLines(aText, bText);
  if (!ops.some(o => o.op !== '=')) return '';
  const out = [`--- ${from}`, `+++ ${to}`];
  const changed = ops.map((o, i) => (o.op !== '=' ? i : -1)).filter(i => i >= 0);
  let i = 0;
  while (i < changed.length) {
    let start = Math.max(0, changed[i] - context), end = Math.min(ops.length - 1, changed[i] + context);
    while (i + 1 < changed.length && changed[i + 1] - context <= end + 1) { i++; end = Math.min(ops.length - 1, changed[i] + context); }
    const hunk = ops.slice(start, end + 1);
    const aStart = (hunk.find(o => o.a)?.a ?? ops.slice(0, start).filter(o => o.a).length + 1), bStart = (hunk.find(o => o.b)?.b ?? ops.slice(0, start).filter(o => o.b).length + 1);
    const aLen = hunk.filter(o => o.op !== '+').length, bLen = hunk.filter(o => o.op !== '-').length;
    out.push(`@@ -${aLen ? aStart : aStart - 1},${aLen} +${bLen ? bStart : bStart - 1},${bLen} @@`);
    for (const o of hunk) out.push(`${o.op === '=' ? ' ' : o.op}${o.text}`);
    i++;
  }
  return `${out.join('\n')}\n`;
}
