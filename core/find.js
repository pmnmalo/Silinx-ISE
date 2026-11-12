// Silinx find in the project (#1430): what is matched in a source's text (its lines) and in a drawing (the texts of
// its document: names, labels, expressions, notes), and the text with the matches replaced. No DOM: the page, its
// sources and its documents are web/js/find-project.js's.

/** The expression of a search: { text, matchCase, word, regex } → a global RegExp, or null (nothing to find, or a
 *  regular expression with an error: `error` its message). */
export function findPattern({ text = '', matchCase = false, word = false, regex = false } = {}) {
  if (!text) return { re: null };
  let src = regex ? text : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (word) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
  try { return { re: new RegExp(src, matchCase ? 'g' : 'gi') }; } catch (e) { return { re: null, error: e.message }; }
}

/** The matches in a text: [{ line (1-based), col (1-based), length, text (the line), index }], at most `max`. */
export function findInText(text, re, { max = 1000 } = {}) {
  const out = [];
  if (!re) return out;
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const lineOf = i => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return lo; };
  re.lastIndex = 0;
  for (let m; (m = re.exec(text)) && out.length < max;) {
    if (m[0] === '') { re.lastIndex++; continue; }   // (an empty match: on)
    const l = lineOf(m.index), end = text.indexOf('\n', starts[l]);
    out.push({ line: l + 1, col: m.index - starts[l] + 1, length: m[0].length, index: m.index, text: text.slice(starts[l], end < 0 ? text.length : end).replace(/\r$/, '') });
  }
  return out;
}

/** The text with every match replaced (`with`: a regular expression's $1… when `regex`), and how many. */
export function replaceInText(text, re, withText, { regex = false } = {}) {
  if (!re) return { text, count: 0 };
  let count = 0;
  const out = text.replace(re, (...a) => { count++; return regex ? a[0].replace(new RegExp(re.source, re.flags.replace('g', '')), withText) : withText; });
  return { text: out, count };
}

/** The matches in a drawing's document (its JSON text): [{ where (the key path, as name or states[2].label), text (the
 *  value), col, length }] over its string values. A text that is not JSON: none. */
export function findInDrawing(json, re, { max = 1000 } = {}) {
  const out = [];
  if (!re) return out;
  let doc;
  try { doc = JSON.parse(json); } catch { return out; }
  const walk = (v, at) => {
    if (out.length >= max) return;
    if (typeof v === 'string') {
      re.lastIndex = 0;
      for (let m; (m = re.exec(v)) && out.length < max;) {
        if (m[0] === '') { re.lastIndex++; continue; }
        out.push({ where: at, text: v, col: m.index + 1, length: m[0].length });
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
  };
  walk(doc, '');
  return out;
}

// ------------------------------------------------------------------ Find in Project (#3546: the page's and the MCP's)
/** The text sources Find in Project searches (their lines) and its drawings (their texts). */
export const FIND_TEXT_FILE = /\.(vhdl?|v|sv|ucf|mem|hex|coe|txt)$/i;
export const FIND_DRAWING = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;
/** The results of one file at most. */
export const FIND_MAX = 2000;

/** The paths Find in Project searches: the project's files (`tree`), its sources (`files`, the project's list) and its
 *  constraints, once each, sorted; its text sources and its drawings only: [{ path, drawing }]. */
export function findPaths(tree = [], files = [], constraints = null) {
  const paths = [...new Set([...tree, ...files.map(f => f.path), constraints].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return paths.filter(p => FIND_DRAWING.test(p) || FIND_TEXT_FILE.test(p)).map(path => ({ path, drawing: FIND_DRAWING.test(path) }));
}

/** Find in Project's results: the texts ([{ path, text, drawing, generated }]) with their matches (`hits`: findInText's
 *  or findInDrawing's), those with none left out. */
export function findInProject(texts, re, { max = FIND_MAX } = {}) {
  return texts.map(f => ({ ...f, hits: f.drawing ? findInDrawing(f.text, re, { max }) : findInText(f.text, re, { max }) })).filter(f => f.hits.length);
}
