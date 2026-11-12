// The PNML reader's searches (core/petri.js fromPnml) in linear time (#3557): the regular expressions it had (an element's text to its
// end tag, an attribute, a position) went to the end of the text from each element with no end; each is the same first
// match, found by indexOf, the searches that found nothing remembered.
const isWord = c => c !== undefined && /\w/.test(c);
// the first `<name` from k with a word boundary after it (-1: none)
function openAt(s, name, k) {
  for (let p = s.indexOf('<' + name, k); p >= 0; p = s.indexOf('<' + name, p + 1)) if (!isWord(s[p + name.length + 1])) return p;
  return -1;
}
// indexOf(t, k) for k that grow: an answer serves until k passes it, and none, for every k after
function finder(s, t) {
  let from = Infinity, at = -1;
  return k => { if (k < from || (at >= 0 && k > at)) { from = k; at = s.indexOf(t, k); } return at; };
}
/** The text of the first <t …>…</t> of s (null: none): /<t\b[^>]*>([\s\S]*?)<\/t>/. */
export function pnmlTag(s, t) {
  const p = openAt(s, t, 0);
  const q = p < 0 ? -1 : s.indexOf('>', p);
  const e = q < 0 ? -1 : s.indexOf(`</${t}>`, q + 1);
  return e < 0 ? null : s.slice(q + 1, e);
}
/** The first <t …> of s, '' if none: /<t\b[^>]*>/. */
export function pnmlStartTag(s, t) {
  const p = openAt(s, t, 0);
  const q = p < 0 ? -1 : s.indexOf('>', p);
  return q < 0 ? '' : s.slice(p, q + 1);
}
/** The raw value of the first a="…" of s, a word boundary before it (null: none): /\ba="([^"]*)"/. */
export function pnmlAttr(s, a) {
  s = String(s);
  for (let p = s.indexOf(`${a}="`); p >= 0; p = s.indexOf(`${a}="`, p + 1)) {
    if (p > 0 && isWord(s[p - 1])) continue;
    const e = s.indexOf('"', p + a.length + 2);
    return e < 0 ? null : s.slice(p + a.length + 2, e);
  }
  return null;
}
/** The elements t of s as matchAll gave them: [head, body] of /<t\b([^>]*)>([\s\S]*?)<\/t>|<t\b([^>]*)\/>/g (body
 *  undefined for <t …/>), or, arcs (lazy), of /<t\b([^>]*?)(?:\/>|>([\s\S]*?)<\/t>)/g. */
export function pnmlElements(s, t, lazy = false) {
  const out = [], gt = finder(s, '>'), end = finder(s, `</${t}>`);
  for (let p = openAt(s, t, 0); p >= 0;) {
    const h = p + t.length + 1, q = gt(h);
    const self = q > h && s[q - 1] === '/';
    if (q >= 0 && lazy && self) { out.push([s.slice(h, q - 1), undefined]); p = openAt(s, t, q + 1); continue; }
    const e = q < 0 ? -1 : end(q + 1);
    if (e >= 0) { out.push([s.slice(h, q), s.slice(q + 1, e)]); p = openAt(s, t, e + t.length + 3); continue; }
    if (q >= 0 && !lazy && self) { out.push([s.slice(h, q - 1), undefined]); p = openAt(s, t, q + 1); continue; }
    p = openAt(s, t, p + 1);
  }
  return out;
}
const numChar = c => c === '-' || c === '.' || (c >= '0' && c <= '9');
/** The x and y of the first <position …> of s that has them: /<position\b[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"/ (the
 *  tag to its '>' or the end; the last y="…" in it, and the last x="…" before that). null: none. */
export function pnmlPosition(s) {
  const fx = finder(s, 'x="'), fy = finder(s, 'y="');
  const nums = (f, h, q) => {   // the c="number" of s[h, q)
    const out = [];
    for (let k = f(h); k >= 0 && k < q; k = f(k + 1)) {
      let e = k + 3;
      while (e < q && numChar(s[e])) e++;
      if (e > k + 3 && s[e] === '"') out.push([k, e + 1, s.slice(k + 3, e)]);
    }
    return out;
  };
  for (let p = openAt(s, 'position', 0); p >= 0;) {
    const h = p + 9, g = s.indexOf('>', h), q = g < 0 ? s.length : g;
    const ys = nums(fy, h, q), y = ys[ys.length - 1];
    const x = y && nums(fx, h, q).filter(([, e]) => e <= y[0]).pop();
    if (x) return [x[2], y[2]];
    if (g < 0) return null;
    p = openAt(s, 'position', q);
  }
  return null;
}
