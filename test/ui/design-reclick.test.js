// UI (#1621): a view clicked again in the Design pane stays open and in front. A C module's HDL (and every view made
// again each time it is opened: its ASM chart, a C model) closed the old document without waiting for it, so a second
// click found it still there, only brought it forward, and the close then removed it. Every row kind's badges, clicked
// twice and double-clicked, and every row double-clicked twice: the drawings (FSM, truth table and its schematic,
// schematic, Petri net), plain VHDL and Verilog, C (combinational and sequential);
// View C Model run twice; a text report (the power report) shown twice. Both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, tick, ROOT } from './harness.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GCD = `unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
`;
const ADD = 'int add(int a, int b) { return a + b; }\n';
const SCH = fs.readFileSync(path.join(ROOT, 'examples/gates/src/gates.sch.json'), 'utf8');

// the document in front, once it has settled (a view made again opens after an await)
const settled = async (page) => { await tick(400); return page.eval(() => { const a = window.Silinx.active; return a && window.Silinx.docs.includes(a) && !a.closed ? a.id : null; }); };

uiTest('#1621 a view clicked again in the Design pane stays open and in front: every row kind\'s badges and rows, a C module\'s HDL and ASM, View C Model', E, async (page) => {
  await makeProject(env, { name: 'Reclick', template: 'traffic', files: { 'src/gcd.c': GCD, 'src/add.c': ADD, 'src/gates.sch.json': SCH, 'src/net.pn.json': JSON.stringify(newPetri('net', 'vhdl')) } });
  await page.openProject('Reclick');
  await page.leftTab('design');
  await page.waitFor(() => ['gcd', 'add', 'gates', 'net', 'traffic', 'lamps'].every((n) => window.SilinxApp.S.modules.some((m) => m.name === n)), [], { what: 'the modules' });
  // the reported case, with the mouse: a C module's VHDL clicked twice, then double-clicked
  for (const [name, id] of [['add', 'chdl:src/add.c'], ['gcd', 'chdl:src/gcd.c']]) {
    const sel = await page.eval((n) => { const rows = [...document.querySelectorAll('#hier .row')]; const i = rows.findIndex((r) => r.querySelector('.lbl')?.textContent.trim() === n); rows[i].scrollIntoView({ block: 'nearest' }); return i; }, name);
    const badge = () => page.eval((i) => { const b = [...document.querySelectorAll('#hier .row')][i].querySelector('.badge:last-of-type'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
    await page.click(await badge());
    await page.waitFor((x) => window.Silinx.active?.id === x, [id], { what: `${name}'s VHDL` });
    await page.click(await badge());
    assert.equal(await settled(page), id, `${name}'s VHDL clicked again`);
    await page.dblclick(await badge());
    assert.equal(await settled(page), id, `${name}'s VHDL double-clicked`);
  }
  // every row (the collapsed ones shown) and every badge: clicked twice, then double-clicked; the row double-clicked twice
  await page.eval(() => document.querySelectorAll('#hier ul[hidden]').forEach((u) => { u.hidden = false; }));
  const rows = await page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => ({ lbl: r.querySelector('.lbl')?.textContent.trim(), badges: [...r.querySelectorAll('.badge')].map((b) => b.textContent) })));
  const kinds = new Set(rows.flatMap((r) => r.badges));
  for (const k of ['FSM', 'Algebra', 'Schematic', 'Petri', 'VHDL', 'Verilog', 'C', 'ASM']) assert.ok(kinds.has(k), `a ${k} badge`);
  const opened = [];
  for (const [i, r] of rows.entries()) {
    const act = (how, b) => page.eval((i, b, how) => {
      const row = [...document.querySelectorAll('#hier .row')][i];
      const el = b == null ? row : row.querySelectorAll('.badge')[b];
      const ev = (t, detail) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, detail }));
      if (how === 'dbl') { ev('click', 1); ev('click', 2); ev('dblclick', 2); } else ev('click', 1);
    }, i, b, how);
    for (const [b, text] of r.badges.entries()) {
      await act('click', b);
      const id = await settled(page);
      assert.ok(id, `${r.lbl} [${text}] opens a view`);
      await act('click', b);
      assert.equal(await settled(page), id, `${r.lbl} [${text}] clicked again`);
      await act('dbl', b);
      assert.equal(await settled(page), id, `${r.lbl} [${text}] double-clicked`);
      opened.push(id);
    }
    await act('dbl');
    const id = await settled(page);
    if (!id) continue;
    await act('dbl');
    assert.equal(await settled(page), id, `${r.lbl} double-clicked again`);
  }
  for (const id of ['chdl:src/gcd.c', 'casm:src/gcd.c', 'chdl:src/add.c', 'file:src/traffic.vhd', 'file:src/sevenseg.v']) assert.ok(opened.includes(id), id);
  // View C Model run again: its model stays open
  await page.eval(async () => { const { openCModel } = await import('/js/c-model.js'); await openCModel('lamps'); await openCModel('lamps'); });
  assert.equal(await settled(page), 'cmodel:lamps');
  // a text report shown again (the power report, made again at each Generate Power Data): it stays open
  await page.eval(async () => { const { showTextDoc } = await import('/js/implement.js'); await showTextDoc('top.pwr', 'Power 1'); await showTextDoc('top.pwr', 'Power 2'); });
  assert.equal(await settled(page), 'text:top.pwr');
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .report-text')?.textContent), 'Power 2');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
