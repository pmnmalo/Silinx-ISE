// Safe output (#2830): what a project names (a module, a port, a label, a comment, a file) reaches the page only as text.
// A project imported from outside carries anyone's text in every one of those fields, so:
// - every HTML sink of web/js (innerHTML / outerHTML assigned, insertAdjacentHTML, document.write, h()'s html:) is
//   given a constant string, or is one of the sinks reviewed below, whose project text goes through an escaping helper
//   (web/js/dom.js esc, highlightHdl, svgText…): a new sink built from a non-constant string fails here until it is
//   reviewed and listed (the counts only shrink);
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

// the HTML sinks of a source: the offset where each one's value starts
const SINKS = /\.(?:innerHTML|outerHTML)\s*\+?=(?!=)\s*|\binsertAdjacentHTML\(\s*[^,]+,\s*|\bdocument\.write(?:ln)?\(\s*|[{,]\s*html:\s*/g;

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
  const out = [];
  for (const m of src.matchAll(SINKS)) {
    const at = m.index + m[0].length;
    if (constantAt(src, at)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ line, text: src.split('\n')[line - 1].trim().slice(0, 120) });
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
