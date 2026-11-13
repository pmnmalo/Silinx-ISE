// Safe output (#2830): what a project names (a module, a port, a label, a comment, a file) reaches the page only as text.
// A project imported from outside carries anyone's text in every one of those fields, so:
// - every HTML sink of web/js (innerHTML / outerHTML assigned, insertAdjacentHTML, document.write, h()'s html:) is
//   given a constant string, or is one of the sinks reviewed below, whose project text goes through an escaping helper
//   (web/js/dom.js esc, highlightHdl, svgText…): a new sink built from a non-constant string fails here until it is
//   reviewed and listed (the counts only shrink); every spelling of a sink (#2986: ['innerHTML'], { html }, srcdoc,
//   parseFromString, setHTMLUnsafe…), in web/js and in the pages' inline scripts (web/*.html); the SVG and HTML
//   templates of core/ and server/ (graphicSvg…) escape their values too, or are reviewed;
// - the pages' Content Security Policy runs no inline script but the page's own (by hash), so an injection that
//   slipped through still could not run; 'unsafe-eval' is there for the compiled simulator alone, whose generated code
//   holds no name of the design (variables v<n>, numbers): the only dynamic code of the application is listed below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../server/csp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the sinks built from a non-constant string, reviewed (#2830): file -> how many. Their project text is escaped: esc()
// (web/js/dom.js), highlightHdl (web/js/highlight.js), sch-svg.js / schgraphics.js's escapers; the rest are numbers,
// counters, constant icons or values from a fixed list.
const REVIEWED = {
  'web/js/dom.js': 1,                 // h()'s html: option itself (each call site is scanned on its own)
  'web/js/asm-editor.js': 1,          // constant definitions, a counter in their ids
  'web/js/asm-pointer.js': 1,         // a path's points: numbers
  'web/js/asm-render.js': 3,          // text through esc; types and encodings from fixed lists; points numbers
  'web/js/editor-icons.js': 1,        // a constant icon and the editor's own label
  'web/js/editor.js': 1,              // a tooltip: names through esc
  'web/js/emulator-board.js': 1,      // an LCD's dots: numbers of the simulation
  'web/js/emulator-pcb.js': 1,        // the board's own art, its text through svgText
  'web/js/fsm-editor.js': 1,          // constant definitions, a counter in their ids
  'web/js/isim-dialogs.js': 1,        // names and values through esc
  'web/js/isim-menu.js': 1,           // the item's label through esc
  'web/js/isim-objects.js': 1,        // signal names and values through esc
  'web/js/isim-stimuli.js': 2,        // signal names and values through esc
  'web/js/isim-toolbar.js': 1,        // the time units (a fixed list) through esc
  'web/js/isim-tree.js': 3,           // instance and process names through esc; constant icons
  'web/js/isim.js': 1,                // the wave window's frame: constant
  'web/js/print-doc.js': 3,           // printPageHtml: the title and meta through esc, the body highlightHdl / esc / the live DOM
  'web/js/print.js': 1,               // document.write of that page into the print window
  'web/js/processes.js': 1,           // a constant status icon
  'web/js/sch-curve.js': 1,           // a handle: numbers
  'web/js/sch-dom.js': 1,             // the canvas: constant
  'web/js/sch-live-instance.js': 1,   // the symbol's name and module through esc
  'web/js/sch-live.js': 1,            // port names and values through esc
  'web/js/sch-palette.js': 1,         // a symbol's preview: geometry only
  'web/js/sch-panels.js': 1,          // a constant chevron
  'web/js/sch-render.js': 3,          // names, nets, descriptions through esc; geometry numbers (normalizeDoc)
  'web/js/sch-toolbar.js': 5,         // constant icons and labels; the graphics tools from a fixed list
  'web/js/schematic-hover.js': 1,     // names through esc; widths numbers
  'web/js/schematic-render.js': 1,    // labels through esc; kinds and gates constants (core/schematic.js)
  'web/js/schematic-view.js': 2,      // a constant frame (a counter in its ids); the breadcrumb through esc
  'web/js/side-fold.js': 1,           // a constant chevron
  'web/js/symbol-editor.js': 1,       // sch-svg.js's symbolSvg: pin and module names through its esc; geometry numbers (#3755)
  'web/js/symbol-info.js': 2,         // HDL through highlightHdl; the symbol's drawing escaped as sch-svg.js
  'web/js/tasks.js': 1,               // a constant icon
  'web/js/toolbar-menu.js': 1,        // a constant icon
  'web/js/truthtable.js': 1,          // a constant icon and the menu's own label
  'web/js/wizards.js': 1,             // a constant status icon
};

const files = () => {
  const out = [];
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${d.name}`;
      if (d.isDirectory()) { if (d.name !== 'vendor') walk(r); } else if (d.name.endsWith('.js')) out.push(r);
    }
  };
  walk('web/js');
  return out;
};

// the HTML sinks of a source: the offset where each one's value starts. Every spelling: a property assigned (.innerHTML,
// ['innerHTML'], an iframe's srcdoc), set in an object (h()'s html: and its { html } shorthand, Object.assign's
// innerHTML:), a call that parses HTML (insertAdjacentHTML, document.write, setHTMLUnsafe, createContextualFragment,
// DOMParser's parseFromString, Document.parseHTMLUnsafe)
const SINKS = new RegExp([
  String.raw`\.(?:innerHTML|outerHTML|srcdoc)\s*\+?=(?!=)\s*`,
  String.raw`\[\s*(['"${'`'}])(?:innerHTML|outerHTML|srcdoc)\1\s*\]\s*\+?=(?!=)\s*`,
  String.raw`\binsertAdjacentHTML\(\s*[^,]+,\s*`,
  String.raw`\bdocument\.write(?:ln)?\(\s*`,
  String.raw`\.(?:setHTMLUnsafe|createContextualFragment|parseFromString)\(\s*`,
  String.raw`\bDocument\.parseHTMLUnsafe\(\s*`,
  String.raw`[{,]\s*(?:html|(['"]?)(?:innerHTML|outerHTML|srcdoc)\2)\s*:\s*`,
  // (h()'s { html } shorthand: the variable named html is the value)
  String.raw`(?<=\bh\(\s*(?:'[^'\n]*'|"[^"\n]*"|[\w.]+)\s*,\s*\{(?:[^{};]*?,)?\s*)(?=html\s*[,}])`,
].join('|'), 'g');
// a sink's name as a string anywhere else (el[prop] = v with prop 'innerHTML', Reflect.set…): a sink whatever its value
const SINK_NAME = /(?<![.\w])(['"`])(?:innerHTML|outerHTML|srcdoc)\1(?!\s*\]\s*\+?=(?!=)|\s*:)/g;

// the application's constant icons (web/js/icons.js and the editors' ICON tables): markup of its own, no project text
const ICON_EXPR = /^(?:icons|ICON|ICONS|DESIGN_ICON)(?:\.\w+|\[[\w.'"]+\])?(?:\s*\|\|\s*(?:icons\.\w+|''))?\s*[;,)}\n]/;

/** Whether the expression at `src[i]` is a constant string: '…', "…", or `…` with no ${…}, alone; or a constant icon. */
export function constantAt(src, i) {
  if (ICON_EXPR.test(src.slice(i, i + 80))) return true;
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return false;
  let j = i + 1;
  for (; j < src.length && src[j] !== q; j++) {
    if (src[j] === '\\') j++;
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') return false;
    else if (q !== '`' && src[j] === '\n') return false;
  }
  // (the literal alone: not the start of a concatenation or a call)
  return /^\s*([;,)}\n]|$)/.test(src.slice(j + 1, j + 3));
}

/** The sinks of a source given a non-constant value: [{ line, text }]. */
export function nonConstantSinks(src) {
  const at = [];
  for (const m of src.matchAll(SINKS)) if (!constantAt(src, m.index + m[0].length)) at.push(m.index);
  for (const m of src.matchAll(SINK_NAME)) at.push(m.index);
  return at.sort((a, b) => a - b).map(i => {
    const line = src.slice(0, i).split('\n').length;
    return { line, text: src.split('\n')[line - 1].trim().slice(0, 120) };
  });
}

/** The inline scripts of an HTML page (not an import map, not a script of its own file): [{ src, line }], line the
 *  page's line the script starts on. */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|\btype\s*=\s*["']?importmap/i.test(m[1])) continue;
    out.push({ src: m[2], line: html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length });
  }
  return out;
}

test('the scanner: a constant string passes, anything built from a value is a sink to review', () => {
  const sinks = s => nonConstantSinks(s).length;
  assert.equal(sinks("el.innerHTML = '';"), 0);
  assert.equal(sinks('el.innerHTML = `<svg class="a"><rect/></svg>`;'), 0);
  assert.equal(sinks("h('div', { html: '<b>x</b>' })"), 0);
  assert.equal(sinks('el.innerHTML = name;'), 1);
  assert.equal(sinks('el.innerHTML = `<b>${name}</b>`;'), 1);
  assert.equal(sinks("el.innerHTML = '<b>' + name + '</b>';"), 1);
  assert.equal(sinks('el.innerHTML += row;'), 1);
  assert.equal(sinks('el.outerHTML = x;'), 1);
  assert.equal(sinks("el.insertAdjacentHTML('beforeend', `<i>${x}</i>`);"), 1);
  assert.equal(sinks("el.insertAdjacentHTML('beforeend', '<i></i>');"), 0);
  assert.equal(sinks('document.write(page);'), 1);
  assert.equal(sinks("h('div', { class: 'a', html: label })"), 1);
  assert.equal(sinks("h('button', { html: icons.remove, title: 'Remove' })"), 0, 'a constant icon');
  assert.equal(sinks("b.innerHTML = ICON[key];"), 0, 'a constant icon');
  assert.equal(sinks("b.innerHTML = icons[name] + label;"), 1);
  assert.equal(sinks('if (a.innerHTML === b) x();'), 0, 'a comparison is no sink');
  assert.equal(sinks('const s = host.outerHTML;'), 0, 'reading is no sink');

  // (#2986: the spellings the scan missed before, each a sink now)
  assert.equal(sinks("h('div', { class: 'a', html })"), 1, "h()'s { html } shorthand");
  assert.equal(sinks("h('div', { html, title: 't' })"), 1, "h()'s { html } shorthand");
  assert.equal(sinks('const { title, html } = view;'), 0, 'a destructuring is no sink');
  assert.equal(sinks("el['innerHTML'] = x;"), 1, 'a computed property');
  assert.equal(sinks("el['innerHTML'] = '';"), 0);
  assert.equal(sinks("const prop = 'innerHTML'; el[prop] = x;"), 1, "a property named in a string: el[prop] =");
  assert.equal(sinks("Object.assign(el, { innerHTML: x });"), 1, 'Object.assign');
  assert.equal(sinks("Object.assign(el, { innerHTML: '' });"), 0);
  assert.equal(sinks('frame.srcdoc = page;'), 1, "an iframe's srcdoc");
  assert.equal(sinks("new DOMParser().parseFromString(svg, 'image/svg+xml');"), 1, 'DOMParser');
  assert.equal(sinks('el.setHTMLUnsafe(x);'), 1, 'setHTMLUnsafe');
  assert.equal(sinks('Document.parseHTMLUnsafe(x);'), 1, 'Document.parseHTMLUnsafe');
  assert.equal(sinks('range.createContextualFragment(x);'), 1, 'createContextualFragment');
});

test("the pages' inline scripts: each one found with its line, not an import map nor a script of its own file", () => {
  const page = '<html>\n<script type="importmap">{"a": 1}</script>\n<script src="/x.js"></script>\n<script type="module">\n  el.innerHTML = name;\n</script>\n';
  const s = inlineScripts(page);
  assert.equal(s.length, 1);
  assert.equal(s[0].line, 4);
  assert.deepEqual(nonConstantSinks(s[0].src).map(x => s[0].line + x.line - 1), [5]);
});

test('every HTML sink of web/js is a constant string or a reviewed one (the reviewed counts only shrink)', () => {
  const got = {}, where = {};
  for (const f of files()) {
    const s = nonConstantSinks(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (s.length) { got[f] = s.length; where[f] = s.map(x => `${f}:${x.line}: ${x.text}`); }
  }
  const unreviewed = Object.keys(got).filter(f => got[f] > (REVIEWED[f] || 0)).flatMap(f => where[f]);
  assert.deepEqual(unreviewed, [], 'HTML built from a non-constant string: use textContent / h() children, or escape every project text (esc) and list the file in REVIEWED');
  // (a reviewed sink gone: its count lowered, so that none comes back unreviewed)
  assert.deepEqual(Object.fromEntries(Object.keys(REVIEWED).filter(f => (got[f] || 0) < REVIEWED[f]).map(f => [f, got[f] || 0])), {});
});

// the pages' inline scripts (web/*.html), reviewed as REVIEWED above (#2986)
const REVIEWED_PAGES = {
  'web/schematic-demo.html': 2,       // the hierarchy's names and the source's lines through esc; line numbers
};

test("every HTML sink of the pages' inline scripts (web/*.html) is a constant string or a reviewed one", () => {
  const got = {}, where = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'web')).filter(f => f.endsWith('.html')).map(f => `web/${f}`)) {
    const s = inlineScripts(fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .flatMap(({ src, line }) => nonConstantSinks(src).map(x => `${f}:${line + x.line - 1}: ${x.text}`));
    if (s.length) { got[f] = s.length; where[f] = s; }
  }
  const unreviewed = Object.keys(got).filter(f => got[f] > (REVIEWED_PAGES[f] || 0)).flatMap(f => where[f]);
  assert.deepEqual(unreviewed, [], 'HTML built from a non-constant string: use textContent, or escape every project text (esc) and list the page in REVIEWED_PAGES');
  assert.deepEqual(Object.fromEntries(Object.keys(REVIEWED_PAGES).filter(f => (got[f] || 0) < REVIEWED_PAGES[f]).map(f => [f, got[f] || 0])), {});
});

// The markup core/ and server/ build (#2986): an SVG or HTML template (`<g …>${…}</g>`) whose values are not all
// through an escaping helper. core/'s reach the page through the sinks above (graphicSvg into sch-render.js's), so
// each one is reviewed: file -> how many such templates.
const MARKUP = {
  'core/schgraphics.js': 4,           // graphicSvg (into sch-render.js's sink): the id and text through its esc; the kind from a
                                      // fixed list, the coordinates numbers (normalizeGraphic), the parts it joins
  'core/isesch-graphics.js': 5,       // an ISE .sch file's graphics (a file, not the page): coordinates, numbers
  'core/isesch-export.js': 4,         // the ISE .sch file's shapes (a file, not the page): coordinates, numbers
  'core/petri.js': 4,                 // a PNML file (not the page): positions and counts, numbers; names through xesc
  'core/qr.js': 1,                   // qrSvg (#3637): the size and the modules' places, numbers it computes; the link's text
                                      // never in it (its bits only)
  'core/asm-gen.js': 1,               // an HDL comment naming <input>_meta, not markup
  'server/csp.js': 1,                 // the Content Security Policy's <meta>, its content escaped (& and ")
  'server/open-page.js': 2,           // the launcher's redirect page (#3409): the URL escaped as an attribute (& " <) and as
                                      // a script string (JSON.stringify, < escaped); the URL is the server's own, with its code
};
const MARKUP_TAG = /<\/?(?:svg|g|text|tspan|path|rect|line|circle|polyline|polygon|ellipse|div|span|b|i|a|p|br|li|ul|ol|table|tr|td|th|button|img|style|script|meta|iframe|pre|code|em|strong|sub|sup|label|input|select|option|small|h[1-6]|foreignObject|use|defs|title)[\s>/]/;
const ESCAPED = /^\s*(?:esc|xesc|escXml|escAttr|svgText|highlightHdl)\(/;
// (a regular expression, not a division, after these)
const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|void|delete|throw|new|else|yield|await))\s*$/;

/** The template literals of a source: [{ line, text, values }], text its constant parts (each ${…} a \0), values the
 *  ${…} expressions' source; comments, strings and regular expressions skipped. */
export function templates(src) {
  const out = [];
  const code = (i, brace) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
      if (c === "'" || c === '"') { i++; while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; i++; continue; }
      if (c === '`') { i = template(i); continue; }
      if (c === '/' && REGEX_AFTER.test(src.slice(Math.max(0, i - 12), i))) {
        let cls = false;
        for (i++; i < src.length && src[i] !== '\n' && (cls || src[i] !== '/'); i++) {
          if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        }
        i++; continue;
      }
      if (c === '{') depth++;
      else if (c === '}') { if (brace && !depth) return i; depth--; }
      i++;
    }
    return i;
  };
  const template = (start) => {
    let j = start + 1, text = '';
    const values = [];
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') { text += src.slice(j, j + 2); j += 2; }
      else if (src[j] === '$' && src[j + 1] === '{') { const k = code(j + 2, true); values.push(src.slice(j + 2, k)); text += '\0'; j = k + 1; }
      else text += src[j++];
    }
    out.push({ line: src.slice(0, start).split('\n').length, text, values });
    return j + 1;
  };
  code(0, false);
  return out;
}

/** The markup templates of a source with a value not through an escaping helper: [line]. */
export function unescapedMarkup(src) {
  return templates(src).filter(t => MARKUP_TAG.test(t.text) && t.values.some(v => !ESCAPED.test(v))).map(t => t.line).sort((a, b) => a - b);
}

test('the markup scanner: a template of markup with a value not escaped, comments, strings and regular expressions skipped', () => {
  assert.deepEqual(unescapedMarkup('const a = `<g class="x">${name}</g>`;'), [1]);
  assert.deepEqual(unescapedMarkup('const a = `<g class="x">${esc(name)}</g>`;'), [], 'escaped');
  assert.deepEqual(unescapedMarkup('const a = `<g class="x"></g>`;'), [], 'constant');
  assert.deepEqual(unescapedMarkup('const a = `std::vector<${t}> v`;'), [], 'not markup');
  assert.deepEqual(unescapedMarkup('// `<b>${x}</b>`\nconst r = /`/, s = \'`\';\nconst a = `<text>${`${n}`}</text>`;'), [3],
    'a comment, a regular expression and a string skipped; a nested template is its own');
  assert.deepEqual(unescapedMarkup('const a = `<text x="${p.x}">${esc(p.label)}</text>`;'), [1], 'a number is reviewed too');
});

test('every markup template of core/ and server/ with a value not escaped is a reviewed one (the counts only shrink)', () => {
  const got = {}, where = {};
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${d.name}`;
      if (d.isDirectory()) { if (d.name !== 'vendor') walk(r); continue; }
      if (!d.name.endsWith('.js')) continue;
      const l = unescapedMarkup(fs.readFileSync(path.join(ROOT, r), 'utf8'));
      if (l.length) { got[r] = l.length; where[r] = l.map(n => `${r}:${n}`); }
    }
  };
  walk('core'); walk('server');
  const unreviewed = Object.keys(got).filter(f => got[f] > (MARKUP[f] || 0)).flatMap(f => where[f]);
  assert.deepEqual(unreviewed, [], 'SVG or HTML built from a value: escape every project text (esc) and list the file in MARKUP with its reason');
  assert.deepEqual(Object.fromEntries(Object.keys(MARKUP).filter(f => (got[f] || 0) < MARKUP[f]).map(f => [f, got[f] || 0])), {});
});

test("core/schgraphics.js's graphicSvg: a graphic's id and text reach the SVG as text", async () => {
  const { graphicSvg, normalizeGraphic } = await import('../core/schgraphics.js');
  const bad = `"><script>alert(1)</script><g x="`;
  const svg = graphicSvg(normalizeGraphic({ id: bad, kind: 'text', x: 10, y: 20, text: `a</text><script>x</script>\n<b>` }));
  assert.ok(!/<script|<b>/.test(svg), svg);
  assert.match(svg, /data-id="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&lt;g x=&quot;"/);
  assert.match(svg, /&lt;\/text&gt;&lt;script&gt;x&lt;\/script&gt;/);
  // (what it does not escape: the kind, from a fixed list, and the coordinates, numbers; normalizeGraphic keeps them so)
  assert.equal(normalizeGraphic({ id: 'g', kind: '"><script>', x: 1, y: 2, text: 't' }), null);
  assert.equal(normalizeGraphic({ id: 'g', kind: 'line', x1: '"><b>', y1: 0, x2: 10, y2: 10 }).x1, 0);
});

test('the escaping helper escapes every markup character', async () => {
  const { esc } = await import('../web/js/dom.js');
  assert.equal(esc(`<img src=x onerror="alert('1')">&`), '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
});

test('the Content Security Policy runs no injected script: no unsafe-inline script, no remote script but those given', () => {
  for (const meta of [false, true]) {
    const d = Object.fromEntries(contentSecurityPolicy({ hashes: ["'sha256-x'"], meta }).split('; ').map(x => { const [k, ...v] = x.split(' '); return [k, v]; }));
    assert.ok(!d['script-src'].includes("'unsafe-inline'"));
    assert.ok(!d['script-src'].some(s => /^(https?:|\*|data:|blob:)/.test(s)), d['script-src'].join(' '));
    assert.deepEqual(d['object-src'], ["'none'"]);
    assert.deepEqual(d['base-uri'], ["'none'"]);
    assert.deepEqual(d['default-src'], ["'self'"]);
  }
});

// 'unsafe-eval' stays for the compiled simulator alone: the application's dynamic code, each reviewed (#2830)
const DYNAMIC = {
  'core/compiled-sim.js': 2,              // new Function of the simulator's generated code: v<n>, m<k>, f<k> and numbers, no design name
  'web/js/nextpnr-ice40-browser.js': 1,   // AsyncFunction of the toolchain's own module, fetched from the application's URLs
};
test("the application's dynamic code (new Function, eval) is the reviewed one: 'unsafe-eval' runs no project text", () => {
  const got = {};
  for (const dir of ['core', 'web/js', 'server']) {
    const walk = (rel) => {
      for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const r = `${rel}/${d.name}`;
        if (d.isDirectory()) { if (d.name !== 'vendor') walk(r); continue; }
        if (!d.name.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(ROOT, r), 'utf8');
        // (eval( as a method's definition, `eval(e) {`, is not JavaScript's eval)
        const n = (src.match(/\bnew (?:Async)?Function\(|\bAsyncFunction\(|(?<![.\w])eval\((?![^)\n]*\)\s*\{)|\bset(?:Timeout|Interval)\(\s*['"`]/g) || []).length;
        if (n) got[r] = n;
      }
    };
    walk(dir);
  }
  assert.deepEqual(got, DYNAMIC);
});
