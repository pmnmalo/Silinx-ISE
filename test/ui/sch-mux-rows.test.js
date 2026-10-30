// UI: a MUX / DEMUX with a pin per bit (#2127): every row with its selects' names (S1, S0 in each M4_1, S0 in each
// DEMUX1_2), the shared select lines behind the bodies, M4_1 inside each multiplexer (#2122). Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2127 schematic: MUX and DEMUX with pins per bit, the select names on each row, the select lines behind', E, async (page) => {
  const doc = newDoc('mr', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'mux4', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 3, bits: true } },
    { id: 'S2', type: 'demux', x: 400, y: 100, rot: 0, mirror: false, name: 'U2', params: { width: 2, bits: true, en: true } });
  await makeProject(env, { name: 'MuxRows', files: { 'src/mr.sch.json': JSON.stringify(doc) } });
  await page.openProject('MuxRows');
  await page.eval(() => window.SilinxApp.openSch('src/mr.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 2, [D], { what: 'drawn' });
  const seen = await page.eval((d) => Object.fromEntries([...document.querySelectorAll(`${d} .se-svg g.sym`)].map((g) => {
    const bodies = [...g.querySelectorAll('path.gate:not(.nofill)')];
    const boxes = bodies.map((p) => p.getBoundingClientRect());
    const row = (t) => {
      const b = t.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      return boxes.findIndex((s) => x > s.left && x < s.right && y > s.top && y < s.bottom);
    };
    const all = [...g.querySelectorAll('path')];
    // (the select lines: the nofill paths going down, not the enable's at the left)
    const lines = [...g.querySelectorAll('path.gate.nofill')].filter((p) => /^M(?!10,)[\d.]+,[\d.]+ V/.test(p.getAttribute('d')));
    return [g.dataset.id, {
      sels: Object.fromEntries(['S1', 'S0'].map((s) => [s, [...g.querySelectorAll('.pname')].filter((t) => t.textContent === s).map(row).sort()])),
      types: [...g.querySelectorAll('.stype')].map((t) => [t.textContent, row(t)]),
      behind: lines.length > 0 && lines.every((l) => all.indexOf(l) < all.indexOf(bodies[0])),
    }];
  })), D);
  assert.deepEqual(seen.S1, { sels: { S1: [0, 1, 2], S0: [0, 1, 2] }, types: [['M4_1', 0], ['M4_1', 1], ['M4_1', 2]], behind: true });
  // (DEMUX: its type above the stack, as the one-bit one's)
  assert.deepEqual(seen.S2, { sels: { S1: [], S0: [0, 1] }, types: [['DEMUX1_2E', -1]], behind: true });
  assert.deepEqual(page.dialogs, []);
});
