// UI: the parts of the ASM chart editor (#405: out of mountAsmEditor in web/js/asm-editor.js), on a chart opened in the
// editor: the view (asm-view.js: Fit, the zooms), Arrange (asm-layout.js: the boxes moved, undone), the model's
// operations (asm-ops.js: a state box added with a name of its own, Delete, undone) and the pointer and keys
// (asm-pointer.js: a box selected, dragged and snapped to the grid, Escape). The editor's whole use: test/ui/diagrams.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeModel } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 ASM editor parts: the view, Arrange, a box added and deleted, a box selected, dragged and snapped', E, async (page) => {
  const chart = normalizeModel({
    name: 'ctl', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    inputs: [{ name: 'start', width: 1 }, { name: 'op', width: 2 }], outputs: [{ name: 'busy', width: 1, default: '0' }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', x: 200, y: 80, actions: [] },
      { id: 'd1', type: 'decision', x: 200, y: 190, cond: 'start' },
      { id: 's2', type: 'state', name: 'RUN', x: 200, y: 300, actions: ['busy = 1'] },
      { id: 'c1', type: 'case', x: 200, y: 410, expr: 'op' },
      { id: 's3', type: 'state', name: 'DONE', x: 200, y: 540, actions: [] },
    ],
    edges: [
      { id: 'e1', from: 's1', to: 'd1', port: 'next' }, { id: 'e2', from: 'd1', to: 's2', port: 'true' }, { id: 'e3', from: 'd1', to: 's1', port: 'false' },
      { id: 'e4', from: 's2', to: 'c1', port: 'next' }, { id: 'e5', from: 'c1', to: 's3', port: '01' }, { id: 'e6', from: 'c1', to: 's1', port: 'others' },
      { id: 'e7', from: 's3', to: 's1', port: 'next', points: [{ x: 400, y: 540 }, { x: 400, y: 80 }] },
    ],
    initial: 's1',
  });
  await makeProject(env, { name: 'AsmParts', files: { 'src/ctl.asm.json': JSON.stringify(chart, null, 2) } });
  await page.openProject('AsmParts');
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json' && document.querySelector('.doc:not([hidden]) [data-node=s3]'), [], { what: 'ASM editor' });
  const D = '.doc:not([hidden])';
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const problems = () => page.eval(() => window.Silinx.active.asmEditor.validate().map((d) => `${d.severity}: ${d.message}`));
  // (Undo / Redo: the main toolbar's buttons, #220)
  const tool0 = (label) => (/^[↶↷]$/.test(label) ? page.click(`${D} .asm-toolbar .tb-btn[title=${label === '↶' ? 'Undo' : 'Redo'}]`) : page.click(`${D} .asm-toolbar .asm-btn`, { text: label }));
  const tool = async (label) => { if (/^(Arrange|# Snap)$/.test(label)) await page.click('.doc:not([hidden]) .tb-more-btn'); return tool0(label); };   // (in the menu, #2261)
  const side = (label) => page.click(`${D} .asm-selection .asm-btn`, { text: label });
  const edges = async () => (await model()).edges.map((e) => `${e.id}:${e.from}>${e.to}:${e.port}`).join(' ');
  const E0 = 'e1:s1>d1:next e2:d1>s2:true e3:d1>s1:false e4:s2>c1:next e5:c1>s3:01 e6:c1>s1:others e7:s3>s1:next';
  const zoom = () => page.eval((d) => document.querySelector(`${d} .asm-zoom`).textContent, D);
  assert.equal(await edges(), E0);
  assert.deepEqual(await problems(), []);
  // a point on top in a node (boxes may touch), or in the middle of a connection
  const nodeAt = (id) => page.eval((d, i) => {
    const e = document.querySelector(`${d} [data-node="${i}"]`);
    const r = e.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('[data-node]') === e) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, D, id);
  const edgeAt = (id) => page.eval((d, i) => {
    const p = document.querySelector(`${d} [data-edge="${i}"] .asm-edge-hit`);
    const c = p.getScreenCTM(), L = p.getTotalLength();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const q = p.getPointAtLength(L * f);
      const x = c.a * q.x + c.c * q.y + c.e, y = c.b * q.x + c.d * q.y + c.f;
      if (document.elementFromPoint(x, y)?.closest('[data-edge]')?.dataset.edge === i) return { x, y };
    }
    return null;
  }, D, id);
  const pick = async (what, id) => {
    for (let k = 0; k < 20; k++) {
      const ok = await page.eval((d, w, i) => (w === 'edge' ? !!document.querySelector(`${d} [data-edge="${i}"].sel`) : !!document.querySelector(`${d} [data-node="${i}"].sel`)), D, what, id);
      if (ok) return;
      const p = what === 'edge' ? await edgeAt(id) : await nodeAt(id);
      if (p) await page.click(p);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`${what} ${id} not selected`);
  };

  const xy = async () => (await model()).nodes.map((n) => `${n.id}:${n.x},${n.y}`).join(' ');
  await new Promise((r) => setTimeout(r, 300));   // (the fit when it opened)
  // ---- the view: Fit, + and −, the label following the scale
  await tool('Fit');
  const k = parseFloat(await page.eval((d) => /scale\(([\d.]+)\)/.exec(document.querySelector(`${d} .asm-vp`).getAttribute('transform'))[1], D));
  assert.equal(await zoom(), `${Math.round(k * 100)}%`);
  await tool('+');
  assert.equal(await zoom(), `${Math.round(k * 120)}%`);
  await tool('−');
  await tool('Fit');
  // ---- Arrange: the boxes moved, the connections the same; undone
  const xy0 = await xy();
  await tool('Arrange');
  for (let i = 0; i < 20 && (await xy()) === xy0; i++) await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(await xy(), xy0);
  assert.equal(await edges(), E0);
  await tool('↶');
  assert.equal(await xy(), xy0);
  // ---- a state box added: a name of its own, selected; Delete takes it away; undone, redone
  await tool('State');
  let m = await model();
  assert.equal(m.nodes.length, 6);
  const added = m.nodes[5];
  assert.equal(added.type, 'state');
  assert.ok(!['IDLE', 'RUN', 'DONE'].includes(added.name), added.name);
  await page.waitFor((d, i) => document.querySelector(`${d} [data-node="${i}"]`)?.classList.contains('sel'), [D, added.id], { what: 'the new box selected' });
  await page.key('Delete');
  assert.equal((await model()).nodes.length, 5);
  await tool('↶');
  assert.equal((await model()).nodes.length, 6);
  await tool('↶');
  assert.equal((await model()).nodes.length, 5);
  // ---- the pointer: DONE selected, dragged by 43 px: moved, on the grid (20); Escape: nothing selected
  await pick('node', 's3');
  const p = await nodeAt('s3');
  const s3 = (await model()).nodes.find((n) => n.id === 's3');
  await page.drag(p, { x: p.x + 43, y: p.y });
  const s3b = (await model()).nodes.find((n) => n.id === 's3');
  assert.ok(s3b.x > s3.x && s3b.x % 20 === 0 && s3b.y === s3.y, `${s3.x},${s3.y} -> ${s3b.x},${s3b.y}`);
  await page.key('Escape');
  await page.waitFor((d) => !document.querySelector(`${d} [data-node].sel`), [D], { what: 'nothing selected' });
});
