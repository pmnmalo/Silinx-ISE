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
    const html = printHtml('t', bounds, 'x.svg', L, { autoPrint: false });
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
