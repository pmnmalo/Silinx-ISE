// #1443: every ${…} inside a template literal of HTML / SVG markup in web/js (innerHTML, h(…, { html }), the SVG
// strings of the drawings) is escaped (esc), a number, a literal, or one of the listed safe shapes. The renderers
// build their markup as strings and escape per call site: this test is the tripwire for a new interpolation that
// forgets to. It scans the sources as test/web-i18n.test.js scans the labels (test/js-literals.js), classifies each
// interpolation and fails on the ones it cannot place; the allowlist below is by the shape of the expression (never by
// file), each entry with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templatesOf } from './js-literals.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');

// ---- what is a markup template: one of its static parts opens or closes one of these tags (a `<top>` in a message is not one)
const TAGS = 'a b br button circle clipPath code dd defs details div dl dt ellipse em fieldset foreignObject g h1 h2 h3 h4 h5 h6 head header hr html i img input kbd label legend li line linearGradient link marker meta ol option p path pattern polygon polyline pre rect section select small span stop strong style sub summary sup svg table tbody td text textarea th thead title tr tspan ul use'.split(' ');
const TAG_RE = new RegExp(`<(?:/?(?:${TAGS.join('|')})(?=[\\s>/])|!doctype)`, 'i');
export const isMarkup = parts => parts.some(p => TAG_RE.test(p));

// ---- the context of an interpolation: the markup before it, read as a browser would
// 'text' (an element's content), 'tag' (between attributes), or the attribute whose quoted value it is in ('attr:x')
export function contextOf(before) {
  let state = 'text', tag = '', quote = '', attr = '';
  for (const c of before) {
    if (state === 'text') { if (c === '<') { state = 'tag'; tag = ''; } }
    else if (state === 'tag') {
      if (c === '>') state = 'text';
      else if (c === '"' || c === "'") { quote = c; attr = (/([\w:-]+)\s*=\s*$/.exec(tag) || [])[1] || ''; state = 'attr'; }
      else tag += c;
    } else if (c === quote) { state = 'tag'; tag += ' '; }
  }
  return state === 'attr' ? `attr:${attr}` : state;
}

// the attributes whose value is a number, a list of numbers or a path: a string that is not a number breaks
// nothing there, but a quote would; the renderers put their coordinates in them (numbers: the models are normalized
// when they are loaded, core/asm.js normalizeModel, core/fsm.js normalizeFsm, core/schdoc.js normalizeDoc)
const NUMERIC_ATTRS = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'width', 'height', 'd', 'points',
  'viewBox', 'transform', 'font-size', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'textLength', 'colspan', 'rowspan']);
// functions that return a number (or a CSS length, mm) from numbers; DIG_X: a digit's place on a board's drawing (emulator-*.js),
// PIN_X: a pin's of the Cmod S6's DIP (#3745)
const NUMERIC_FNS = /^(?:Math\.\w+|Number|parseInt|parseFloat|mm|r1|snap|textW|DIG_X|PIN_X)$/;

// ---- the safe shapes of an expression, in any context
// (and the boards drawn as the real ones, #3706 / #3745: pmodSide, unit, expTop, pins, header40, of numbers and a name
// put through text, #3728; the ULX3S's, Tang Nano 9K's and Papilio One's headers, pins, holes, breadboards and wings, #3745)
const BOARD = 'text|ic|microUsb|hdmiTop|audio|pmodTop|pmod12Top|dsub|dsubLeft|header6|header12|tact|modules|holes|wire|pmodSide|unit|expTop|pins|header40|header|pins2|headerRow|pinNames|holeRows|breadboard|topBreadboard|bottomBreadboard|wing';
const SAFE = [
  // escaped: esc(…) around the whole expression, or every item of a list escaped
  [/^esc\(.*\)$/s, 'esc'],
  [/^[\w.]+\.map\(esc\)\.join\(.*\)$/, 'esc'],
  // a string or number written in the source, or a template of its own (each of them scanned on its own)
  [/^'(?:[^'\\]|\\.)*'$/s, 'literal'], [/^"(?:[^"\\]|\\.)*"$/s, 'literal'], [/^-?\d+(?:\.\d+)?$/, 'literal'], [/^`.*`$/s, 'literal'],
  // a translated label (web/js/i18n.js: the dictionary's text) and a module's upper-case constant (an icon, a size, a namespace),
  // or one of its table's entries by a name (editor-icons.js ICON[icon]: the SVG of the icons, strings of the code)
  [/^t\('(?:[^'\\]|\\.)*'\)$/, 'literal'], [/^(?:[A-Z][A-Z0-9_]*)(?:\.\w+|\[\w+\])?$/, 'constant'],
  // a number made of numbers: unary +, a numeric function (mm: a CSS length from one, print.js; snap: to the grid, core/schdoc.js),
  // a length, an arithmetic expression whose result is NaN for a string (- * / %)
  [/^\+[\w.?[\]]+$/, 'number'], [/^(?:Math\.\w+|Number|parseInt|parseFloat|mm|snap)\(/, 'number'], [/^[\w.?[\]]+\.length$/, 'number'],
  [/^-\s*[\w.?[\]()\s+\-*/%]+$/, 'number'],
  [/^[\w.?[\]()\s+\-*/%]*[\w)\]]\s*[-*/%]\s*[\w.?[\]()\s+\-*/%]+$/, 'number'],
  // the id the editor makes for its markers and patterns (asm-editor.js, fsm-editor.js, sch-dom.js: `${name}-${counter}`)
  [/^uidE?$/, 'id'],
  // markup made by another template (scanned on its own): a local that collects it, a symbol's drawing (s.body), or a function
  // of this module that returns it
  [/^(?:inner|body|s\.body|label|svg|rows|rows\.join\(''\)|labels|holes|lcdChars|extra|eh|jh|nh|ch|pts|line|css|dip|base|board0|anWires|ioWires|pages\.join\('\\n'\)|content\(\))$/, 'markup'],
  // the Board Emulator's drawing helpers (#2478..#2481): emulator-pcb.js's svgText (imported as text) and ic escape their labels,
  // and the layouts' connectors, switches and modules are made of them and of numbers; a list of them joined
  [new RegExp(`^(?:${BOARD})\\(.*\\)$`, 's'), 'markup'],
  [new RegExp(`^(?:[\\w.]+|\\[[^\\]\`]*\\])\\.map\\((?:${BOARD}|\\([^)]*\\)\\s*=>\\s*(?:${BOARD})\\(.*\\))\\)\\.join\\(''\\)$`, 's'), 'markup'],
  [new RegExp(`^Array\\.from\\(\\{[^}]*\\},\\s*\\([^)]*\\)\\s*=>\\s*(?:${BOARD})\\(.*\\)\\)\\.join\\(''\\)$`, 's'), 'markup'],
  [/^(?:bodySvg|symbolSvg|textsSvg|matrixOf|previewSvg|badgesHtml|pmod|pmod12|db|chip|holes4|pathD|hopPath|cv\.hopD|curve\.previewD|lvClass|domSnapshot|appCss|img)\(.*\)$/s, 'markup'],
  // a copy of the page's own elements (print-view.js: the browser escapes their text and attributes) and a canvas's picture
  [/^clone\.outerHTML$/, 'markup'], [/^\w+\.toDataURL\('image\/png'\)$/, 'data URL'],
  // a loop's index counted from 1
  [/^[ijkn] \+ 1$/, 'number'],
  // a class name or a selector's marker chosen among literals by the renderer
  [/^(?:cls|cls\.join\(' '\)|selc|hot|free|kcls|midClass|bus|lv|tick|shape|ico|bg|fill|silk)$/, 'class'],
];

// an expression that chooses among safe values: a ? b : c, a || b, a ?? b, (a)
function safeShape(e, ctx) {
  e = e.trim();
  const top = splitTop(e);
  if (top.kind === 'ternary') return safeShape(top.yes, ctx) && safeShape(top.no, ctx);
  if (top.kind === 'or') return top.parts.every(p => safeShape(p, ctx));
  if (top.kind === 'paren') return safeShape(top.inner, ctx);
  for (const [re, kind] of SAFE) if (re.test(e)) return kind;
  // a list of templates joined: markup ones are scanned on their own; a list of coordinates (`${p.x},${p.y}`) in a numeric attribute
  if (/^(?:(?:\[[^`]*\]|[^+`]*)\.map|Array\.from)\([^`]*`.*`\)\.join\(.*\)$/s.test(e) && (isMarkup([e]) || numeric(ctx))) return 'markup';
  // in a numeric attribute, a name or an arithmetic expression of names: a coordinate (see NUMERIC_ATTRS)
  if (numeric(ctx) && numericShape(e)) return 'coordinate';
  return null;
}
const numeric = ctx => ctx.startsWith('attr:') && NUMERIC_ATTRS.has(ctx.slice(5));
// identifiers, numbers and arithmetic only, the functions among NUMERIC_FNS; a choice `c ? a : b` counts when both its
// branches are numbers (the condition is not written out)
function numericShape(e) {
  e = e.trim();
  if (!(e.match(/[\w.]+(?=\()/g) || []).every(f => NUMERIC_FNS.test(f))) return false;
  const t = splitTop(e);
  if (t.kind === 'ternary') return numericShape(t.yes) && numericShape(t.no);
  // the parenthesized parts, innermost first, each a number
  for (let prev = ''; prev !== e; e = e.replace(/\(([^()]*)\)/g, (m, inner) => (numericShape(inner) ? '0' : m))) prev = e;
  // (a shift, i >> 1, is a number too, #3728)
  return /^[\w.?[\]\s+\-*/%,]*$/.test(e.replace(/\.\.\./g, '').replace(/>>>?|<</g, '+'));
}

// the top-level structure of an expression: `c ? a : b`, `a || b`, `(a)`; strings, templates and brackets skipped
function splitTop(e) {
  let depth = 0, q = '', qm = -1, cm = -1; const ors = [];
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (!depth) {
      if (c === '?' && e[i + 1] !== '?' && e[i + 1] !== '.' && qm < 0) qm = i;
      else if (c === ':' && qm >= 0 && cm < 0) cm = i;
      else if ((c === '|' && e[i + 1] === '|') || (c === '?' && e[i + 1] === '?')) { if (qm < 0) ors.push(i); i++; }
    }
  }
  if (qm >= 0 && cm > qm) return { kind: 'ternary', yes: e.slice(qm + 1, cm), no: e.slice(cm + 1) };
  if (ors.length) { const parts = []; let s = 0; for (const i of ors) { parts.push(e.slice(s, i)); s = i + 2; } parts.push(e.slice(s)); return { kind: 'or', parts }; }
  if (e.startsWith('(') && e.endsWith(')') && depth === 0) { let d = 0; for (let i = 0; i < e.length - 1; i++) { if (e[i] === '(') d++; else if (e[i] === ')' && --d === 0) return { kind: 'leaf' }; } return { kind: 'paren', inner: e.slice(1, -1) }; }
  return { kind: 'leaf' };
}

// every interpolation of the markup templates of a source, classified
export function scan(src, file = '') {
  const out = [];
  for (const t of templatesOf(src).templates) {
    if (!isMarkup(t.parts)) continue;
    let before = '';
    t.exprs.forEach((e, k) => {
      before += t.parts[k];
      const ctx = contextOf(before);
      out.push({ file, line: t.line, expr: e, ctx, kind: safeShape(e, ctx) });
      before += '0';
    });
  }
  return out;
}

test('#1443 the scanner: the context of an interpolation and the shapes it accepts', () => {
  assert.equal(contextOf('<g class="a" transform="translate('), 'attr:transform');
  assert.equal(contextOf('<path d="M'), 'attr:d');
  assert.equal(contextOf('<text x="1" y="2">'), 'text');
  assert.equal(contextOf('<rect x="1" '), 'tag');
  assert.equal(contextOf('<span class="x">a</span><div>'), 'text');
  assert.equal(contextOf('<input value="'), 'attr:value');
  assert.equal(contextOf('<div class=\'a\' title="'), 'attr:title');
  assert.ok(isMarkup(['<div class="a">', '</div>']));
  assert.ok(isMarkup(['', '<tspan x="30">']));
  assert.ok(!isMarkup(['no bitstream ', ' in this browser (it writes build/<top>_prom.bit)']));
  assert.ok(!isMarkup(['a < b and ', ' > c']));
  const ok = (e, ctx = 'text') => assert.ok(safeShape(e, ctx), `${e} in ${ctx}`);
  const bad = (e, ctx = 'text') => assert.ok(!safeShape(e, ctx), `${e} in ${ctx}`);
  ok('esc(n.name)'); ok('esc(a) '); ok("n.params.map(esc).join(', ')"); ok("'<b>'"); ok('`<i>${esc(x)}</i>`'); ok('12'); ok('ICON.run'); ok('GRID');
  ok('+n.x'); ok('Number(v)'); ok('Math.round(x)'); ok('list.length'); ok('n.w - 1'); ok('-w / 2'); ok('x * 2'); ok('(a + b) / 2');
  ok("x ? 'a' : ''"); ok("x ? `<b>${esc(y)}</b>` : ''"); ok("esc(a) || ''"); ok("'a' ?? 'b'"); ok("(c ? 1 : 2)"); ok("e.port === 'true' ? '1' : '0'");
  ok('n.x', 'attr:x'); ok('p.x + 5', 'attr:x'); ok('x0 + PW - 8', 'attr:points'); ok('Math.min(...xs)', 'attr:d'); ok('mm(x)', 'attr:width'); ok('mm(x)', 'attr:style');
  ok("a || ''", 'attr:x'); ok('x + (vertical ? 8 : 10)', 'attr:x'); ok("t.y + (def.shape === 'vcc' ? -2 : 6)", 'attr:y'); ok('p.y + (v[1] > 0 ? L + 10 : -(L + 4))', 'attr:y');
  ok("pts.map(p => `${p.x},${p.y}`).join(' ')", 'attr:points'); ok("items.map(x => `<li>${esc(x)}</li>`).join('')"); ok("Array.from({ length: 3 }, (_, i) => `<rect x=\"${i}\"/>`).join('')");
  bad('n.x'); bad('n.name'); bad('n.name', 'attr:class'); bad('v', 'attr:value'); bad('a + b'); bad('x + 8'); bad('String(v)'); bad('f(x)', 'attr:x');
  bad("x ? n.name : ''"); bad("n.name || ''"); bad("a || ''"); bad('x', 'attr:data-port'); bad('html(x)', 'attr:d'); bad('esc(a) + b');
  bad("pts.map(p => `${p.x},${p.y}`).join(' ')"); bad("pts.map(p => `${p.x},${p.y}`).join(' ')", 'attr:class');
  // #2588: an icon of the table by its name, the Board Emulator's drawing helpers (their labels escaped by svgText), a digit's place
  ok('ICON[icon]'); ok("text(455, 308, (board.device?.part || 'X').toUpperCase(), { size: 8 })"); ok("segs.map((s, i) => text(580, 383 + i * 8, s)).join('')");
  ok("[N, S, WEST, EAST].map(tact).join('')"); ok("Array.from({ length: 8 }, (_, i) => text(i, 0, `LD${7 - i}`)).join('')");
  ok("[[a + 1, b], [c, d]].map(([x, y]) => `<circle cx=\"${x}\" cy=\"${y}\"/>`).join('')"); ok('DIG_X(1) + 33', 'attr:cx');
  // #3728: the boards drawn as the real ones (#3706, #3745): their connectors' helpers, a shift in a coordinate
  ok("pmodSide(false, 140, 'JA')"); ok('unit(4)'); ok("expTop(76, 344, 'A1')"); ok('pins(140, 406, 1, 2)'); ok("header40(364, 228, 'J2')");
  ok('86 + (i >> 1) * 23', 'attr:x'); ok('PIN_X(i)', 'attr:cx'); ok('dip'); ok('anWires'); ok("pinNames(J7, J7_Y + 26)"); bad('PIN_X(i)'); ok('x + 4 + (i >> 1) * 9.8', 'attr:x'); bad('i >> 1'); bad('a > b', 'attr:x'); bad('pinsOf(x)');
  bad('ICON[f(x)]'); bad('icon[name]'); bad("segs.map((s) => s.name).join('')"); bad("segs.map((s) => f(s)).join('')"); bad('DIG_X(1) + 33'); bad('textOf(x)');
  // an injection the context rule would miss if it read the attribute wrong
  assert.equal(contextOf('<circle class="asm-port" data-port="'), 'attr:data-port');
  assert.deepEqual(scan('el.innerHTML = `<b x="${n.x}">${n.name}</b>`;').map(r => [r.ctx, r.kind]), [['attr:x', 'coordinate'], ['text', null]]);
  assert.deepEqual(scan('const s = `<span>${esc(a)}</span>` + items.map(i => `<li>${i}</li>`).join("");').map(r => [r.line, r.ctx, r.kind]), [[1, 'text', 'esc'], [1, 'text', null]]);
});

test('#1443 every interpolation of a markup template in web/js is escaped, a number, a literal or a listed safe shape', () => {
  const files = fs.readdirSync(WEB).filter(f => f.endsWith('.js')).sort();
  const all = files.flatMap(f => scan(fs.readFileSync(path.join(WEB, f), 'utf8'), f));
  assert.ok(all.length > 900, `${all.length} interpolations scanned`);
  const bad = all.filter(r => !r.kind).map(r => `${r.file}:${r.line} (${r.ctx}): \${${r.expr}}`);
  assert.deepEqual(bad, [], 'wrap it in esc(…), coerce it to a number (+x), or add its shape to SAFE with its reason');
  // the categories seen (a sanity check that the scanner reads the sources: the renderers' coordinates, the escapes)
  const kinds = {};
  for (const r of all) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  assert.ok(kinds.esc > 100 && kinds.coordinate > 300 && kinds.literal > 50, JSON.stringify(kinds));
});
