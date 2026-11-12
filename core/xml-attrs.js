// A start tag's attributes for the ISE schematic reader (core/isesch.js parseXml), read in one pass (#3557): the
// regular expression it had, /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g, went back over a long name with
// no '=' from each of its characters (quadratic). The same matches; a quote found missing from a point on is not
// looked for again.

/** The [name, raw value] pairs of a start tag's text after its name, as that expression matched them. */
export function attrPairs(s) {
  const out = [], n = s.length, sp = c => /\s/.test(c), missing = { '"': Infinity, "'": Infinity };
  let p = 0;
  while (p < n) {
    // a name: the characters up to a space or '=' (a name with no '=' after it: none, read on after it)
    while (p < n && (sp(s[p]) || s[p] === '=')) p++;
    let q = p;
    while (q < n && !sp(s[q]) && s[q] !== '=') q++;
    if (q === p) break;
    let k = q;
    while (k < n && sp(s[k])) k++;
    if (s[k] !== '=') { p = q; continue; }
    k++;
    while (k < n && sp(s[k])) k++;
    // its value: quoted, or the characters up to a space, a quote or '>'
    const c = s[k];
    let e;
    if (c === '"' || c === "'") {
      e = k + 1 >= missing[c] ? -1 : s.indexOf(c, k + 1);
      if (e < 0) { missing[c] = Math.min(missing[c], k + 1); p = q; continue; }
      out.push([s.slice(p, q), s.slice(k + 1, e)]);
      p = e + 1;
      continue;
    }
    for (e = k; e < n && !sp(s[e]) && s[e] !== '"' && s[e] !== "'" && s[e] !== '>';) e++;
    if (e === k) { p = q; continue; }
    out.push([s.slice(p, q), s.slice(k, e)]);
    p = e;
  }
  return out;
}
