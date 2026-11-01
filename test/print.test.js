// Tests for web/js/print.js (page layout and tiling of printed diagrams).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// web/js/ui.js registers window listeners when it is loaded
globalThis.addEventListener ??= () => {};
const { pageLayout, printHtml } = await import('../web/js/print.js');

const mmVals = (html, re) => [...html.matchAll(re)].map((m) => +m[1]);

test('tiled printing: rows of tiles step by exactly the height shown per page (no lost strip)', () => {
  for (const [bounds, opts] of [[{ w: 2000, h: 3000 }, { paper: 'A4', across: 2 }], [{ w: 3000, h: 1200 }, { paper: 'A3', across: 3 }], [{ w: 900, h: 2500 }, { paper: 'Letter', orient: 'landscape', across: 2 }]]) {
    const L = pageLayout(bounds, opts);
    assert.ok(L.rows > 1, 'several rows');
    const html = printHtml('t', bounds, 'x.svg', L);
    const art = /\.art \{[^}]*height: ([\d.]+)mm/.exec(html);
    assert.ok(art, 'drawing window height');
    const shown = +art[1];
    const tops = [...new Set(mmVals(html, /<img [^>]*top:(-?[\d.]+)mm/g))].sort((a, b) => b - a);
    assert.equal(tops.length, L.rows);
    for (let r = 1; r < tops.length; r++) assert.ok(Math.abs(tops[r - 1] - tops[r] - shown) < 1e-6, `row ${r}: step ${tops[r - 1] - tops[r]} mm, window ${shown} mm`);
    // the drawing is covered down to its bottom edge
    assert.ok(shown * L.rows >= bounds.h * L.scale - 1e-6);
    // the page box fits in the printable height
    const page = +/\.page \{[^}]*height: ([\d.]+)mm/.exec(html)[1];
    assert.ok(page < L.ph - 20, `page box ${page} mm`);
  }
});

// #487: the page written into the print window keeps the opener's Content-Security-Policy, which runs
// no inline script: the print page has none (the opener prints it)
test('#487 the print page has no script', () => {
  const bounds = { w: 800, h: 600 };
  const html = printHtml('t', bounds, 'blob:x', pageLayout(bounds, { paper: 'A4' }));
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<img /);
  // what goes into the page is the known paper and the image's URL as an attribute's text
  assert.equal(pageLayout(bounds, { paper: 'A4; } body { display:none' }).paper, 'A4');
  assert.equal(pageLayout(bounds, { paper: 'toString' }).paper, 'A4');
  assert.match(printHtml('t', bounds, 'x" onerror="y', pageLayout(bounds, {})), /<img src="x&quot; onerror=&quot;y" alt=""/);
  // the @page size is a name from the module's own table, whatever the layout says (CodeQL js/xss-through-dom)
  const L = pageLayout(bounds, { paper: 'Letter' });
  assert.match(printHtml('t', bounds, 'blob:x', L), /@page \{ size: letter /);
  for (const paper of ['A4; } </style><script>alert(1)</script>', 'toString', undefined]) {
    const page = printHtml('t', bounds, 'blob:x', { ...L, paper });
    assert.match(page, /@page \{ size: A4 /, String(paper));
    assert.doesNotMatch(page, /<script|alert/i, String(paper));
  }
});

// #1509: the page's header has the project and the file; the print view of a source (web/js/print-view.js)
test('#1509 the header of a diagram\'s page: its title and the project and file, escaped', () => {
  const bounds = { w: 800, h: 600 };
  const html = printHtml('ASM <x>', bounds, 'blob:x', pageLayout(bounds, {}), 'Project: P&Q  ·  File: src/a.asm.json');
  assert.match(html, /<header><b>ASM &lt;x&gt;<\/b><span>Project: P&amp;Q {2}· {2}File: src\/a\.asm\.json<\/span><\/header>/);
  assert.match(printHtml('t', bounds, 'blob:x', pageLayout(bounds, {})), /<header><b>t<\/b><\/header>/, 'no project: the title alone');
});

test('#1509 the print view of a source: every line numbered, HDL highlighted, escaped; a light page with no script', async () => {
  const { textBody, printPageHtml, metaLine, TEXT_CSS } = await import('../web/js/print-view.js');
  const code = 'entity e is -- a <b>\n  port (a : in bit);\n\nend e;\n';
  const body = textBody(code, 'vhdl');
  assert.deepEqual([...body.matchAll(/<td class="n">(\d+)<\/td>/g)].map((m) => +m[1]), [1, 2, 3, 4]);
  assert.match(body, /<td><span class="tk-kw">entity<\/span> e <span class="tk-kw">is<\/span> <span class="tk-com">-- a &lt;b&gt;<\/span><\/td>/);
  assert.match(body, /<td class="n">3<\/td><td> <\/td>/, 'an empty line kept');
  assert.match(textBody('a <b> & c', null), /<td>a &lt;b&gt; &amp; c<\/td>/, 'a text file: escaped, not highlighted');
  assert.equal(metaLine({ project: 'P', file: 'src/e.vhd' }), 'Project: P  ·  File: src/e.vhd');
  assert.equal(metaLine({ project: 'P' }), 'Project: P');
  const page = printPageHtml({ title: 'Source <e>', meta: 'Project: P', body, css: TEXT_CSS });
  assert.match(page, /^<!doctype html><html data-ui="ise" data-theme="light"/);
  assert.match(page, /<header class="pv-head"><b>Source &lt;e&gt;<\/b><span>Project: P<\/span><\/header>/);
  assert.match(page, /background: #fff !important/);
  assert.doesNotMatch(page, /<script/i);
});

// #1923: the page of a print view: the paper and orientation chosen; automatic turns a wide copy to landscape
test('#1923 the page of a print view: paper and orientation chosen, automatic by the copy\'s width', async () => {
  const { printPage, fitToPage } = await import('../web/js/print-view.js');
  const px = (mm) => mm * 96 / 25.4;
  assert.deepEqual(printPage(), { paper: 'A4', land: false, pw: 210, ph: 297, rule: '@page { size: A4 portrait; margin: 10mm; }' });
  assert.deepEqual(printPage({ orient: 'landscape' }), { paper: 'A4', land: true, pw: 297, ph: 210, rule: '@page { size: A4 landscape; margin: 10mm; }' });
  assert.equal(printPage({ paper: 'A3', orient: 'landscape' }).rule, '@page { size: A3 landscape; margin: 10mm; }');
  assert.deepEqual([printPage({ paper: 'A3', orient: 'landscape' }).pw, printPage({ paper: 'A3' }).ph], [420, 420]);
  assert.equal(printPage({ paper: 'Letter', orient: 'portrait' }).rule, '@page { size: letter portrait; margin: 10mm; }');
  // automatic: landscape only when the copy is wider than the portrait page's width and than it is high
  assert.equal(printPage({ orient: 'auto' }, px(190) + 1, 100).land, true);
  assert.equal(printPage({ orient: 'auto' }, px(190) - 1, 100).land, false, 'fits the portrait width');
  assert.equal(printPage({ orient: 'auto' }, px(250), px(300)).land, false, 'higher than wide');
  assert.equal(printPage({ paper: 'A3', orient: 'auto' }, px(250), 100).land, false, 'fits A3 in portrait');
  // the choice wins over the copy's shape
  assert.equal(printPage({ orient: 'portrait' }, 5000, 100).land, false);
  assert.equal(printPage({ orient: 'landscape' }, 100, 5000).land, true);
  // an unknown paper or orientation: A4, automatic; the rule only from the module's table
  for (const paper of ['A4; } </style><script>', 'toString', undefined]) assert.equal(printPage({ paper }).rule, '@page { size: A4 portrait; margin: 10mm; }');
  assert.equal(printPage({ orient: 'sideways' }).land, false);
  // fitToPage: the rule written in the window; a copy zoomed to the page's width (one page: its height too)
  const win = (w, hh) => {
    const styles = [], copy = w == null ? null : { scrollWidth: w, scrollHeight: hh, style: {} };
    return { styles, copy, document: { querySelector: () => copy, createElement: () => ({}), head: { append: (s) => styles.push(s.textContent) } } };
  };
  let W = win();
  fitToPage(W, { orient: 'landscape', paper: 'A3' });
  assert.deepEqual(W.styles, ['@page { size: A3 landscape; margin: 10mm; }'], 'a source: the page only');
  W = win(px(190) * 2, 100);
  fitToPage(W, { orient: 'portrait' });
  assert.deepEqual([W.styles[0], W.copy.style.zoom], ['@page { size: A4 portrait; margin: 10mm; }', '0.5']);
  W = win(px(190) * 2, 100);
  fitToPage(W, {});
  assert.deepEqual([W.styles[0], +W.copy.style.zoom], ['@page { size: A4 landscape; margin: 10mm; }', +(277 / 380).toFixed(4)]);
  W = win(100, px(400));
  fitToPage(W, { page: true, orient: 'landscape' });
  assert.equal(+W.copy.style.zoom, +((210 - 20 - 14 - 4) / 400).toFixed(4), 'one page: the landscape page\'s height');
  W = win(100, 100);
  fitToPage(W, { page: true });
  assert.equal(W.copy.style.zoom, '1', 'never enlarged');
});
