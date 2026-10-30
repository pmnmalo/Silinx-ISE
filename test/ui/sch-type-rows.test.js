// UI: a symbol with a pin per bit has its type inside each row's shape, as the one-bit symbol (#2122): AND2 ×3 (and
// turned 90°), OR3B1 ×3, INV ×4, BUF ×3, BUFE5, BUFT3, M2_1 ×3, each label in a shape of its own; a triangle turned
// 90°, as the one-bit one, its type once, under the stack. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2122 schematic: pins per bit, the type inside each row\'s shape (gates, triangles, multiplexer)', E, async (page) => {
  const doc = newDoc('tr', 'vhdl');
  const sym = (id, type, x, y, params, rot = 0) => ({ id, type, x, y, rot, mirror: false, name: `U${id.slice(1)}`, params: { width: 1, ...params } });
  doc.symbols.push(sym('S1', 'and2', 100, 100, { width: 3, bits: true }), sym('S2', 'and2', 250, 100, { width: 3, bits: true }, 90),
    sym('S3', 'or3b1', 450, 100, { width: 3, bits: true }), sym('S4', 'inv', 100, 400, { width: 4, bits: true }),
    sym('S5', 'buf', 250, 400, { width: 3, bits: true }), sym('S6', 'tbuf', 400, 400, { width: 5, bits: true, enable: 'E' }),
    sym('S7', 'tbuf', 550, 400, { width: 3, bits: true, enable: 'T' }), sym('S8', 'mux2', 700, 100, { width: 3, bits: true }),
    sym('S9', 'inv', 700, 400, { width: 4, bits: true }, 90));
  await makeProject(env, { name: 'TypeRows', files: { 'src/tr.sch.json': JSON.stringify(doc) } });
  await page.openProject('TypeRows');
  await page.eval(() => window.SilinxApp.openSch('src/tr.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 9, [D], { what: 'drawn' });
  // each symbol's labels, and in how many of its shapes (filled paths: the gates, triangles, trapezoids) each one's
  // centre is
  const labels = await page.eval((d) => Object.fromEntries([...document.querySelectorAll(`${d} .se-svg g.sym`)].map((g) => {
    const shapes = [...g.querySelectorAll('path.gate:not(.nofill)')].map((p) => p.getBoundingClientRect());
    return [g.dataset.id, [...g.querySelectorAll('.stype')].map((t) => {
      const b = t.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      return { name: t.textContent, inside: t.classList.contains('inside'),
        shape: shapes.findIndex((s) => x > s.left && x < s.right && y > s.top && y < s.bottom) };
    })];
  })), D);
  const EXPECTED = { S1: ['AND2', 3], S2: ['AND2', 3], S3: ['OR3B1', 3], S4: ['INV', 4], S5: ['BUF', 3], S6: ['BUFE', 5], S7: ['BUFT', 3], S8: ['M2_1', 3] };
  for (const [id, [name, n]] of Object.entries(EXPECTED)) {
    const ls = labels[id];
    assert.deepEqual(ls.map((l) => [l.name, l.inside]), Array(n).fill([name, true]), `${id}: ${name} in each row`);
    // each in a shape, a shape of its own
    assert.deepEqual(ls.map((l) => l.shape).sort(), [...Array(n).keys()], `${id}: ${JSON.stringify(ls)}`);
  }
  // INV4 turned 90°: once, outside its triangles, as the one-bit INV turned
  assert.deepEqual(labels.S9, [{ name: 'INV', inside: false, shape: -1 }]);
  assert.deepEqual(page.dialogs, []);
});
