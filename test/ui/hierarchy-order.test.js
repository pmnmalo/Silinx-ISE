// UI (#3819): the Design pane's roots in natural order: x_1, x_2, x_10 (not x_1, x_10, x_2), the Implementation view's
// top first; the Simulation view's (the ISE style interface's) and Simulate's test bench choice (the Silinx interface's)
// alike; a module's instances by their names too (u_10, u_2, u_1 written: u_1, u_2, u_10). Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const leaf = n => `module ${n}(input a, output y); assign y = a; endmodule\n`;
// (its instances written in the order u_10, u_2, u_1: listed by their names)
const TOP = 'module top(input a, output y); wire w1, w2; x_10 u_10(.a(a), .y(w1)); x_2 u_2(.a(w1), .y(w2)); x_1 u_1(.a(w2), .y(y)); endmodule\n';
const bench = n => `module ${n}; reg a; wire y; top uut(.a(a), .y(y)); endmodule\n`;
// the modules written in the files' order 10, 2, 1: the order is the names'
const FILES = {
  'src/x_10.v': leaf('x_10'), 'src/x_2.v': leaf('x_2'), 'src/x_1.v': leaf('x_1'),
  'src/y_10.v': leaf('y_10'), 'src/y_2.v': leaf('y_2'), 'src/y_1.v': leaf('y_1'),
  'src/top.v': TOP,
  'sim/tb_10.v': bench('tb_10'), 'sim/tb_2.v': bench('tb_2'), 'sim/tb_1.v': bench('tb_1'),
};
const ROLES = { 'sim/tb_10.v': 'sim', 'sim/tb_2.v': 'sim', 'sim/tb_1.v': 'sim' };
// the modules' rows of the tree, in their order, indented by their depth under the roots (the interfaces' trees nest
// them at depths of their own)
const rows = async (page) => {
  const all = await page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
    let d = 0;
    for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
    return { d, label: r.querySelector('.lbl').textContent };
  }).filter((r) => /\b(top|[xy]_\d+|tb_\d+)$/.test(r.label)));
  const root = Math.min(...all.map((r) => r.d));
  return all.map((r) => `${'  '.repeat(r.d - root)}${r.label}`);
};
const IMPL = ['top', '  u_1 - x_1', '  u_2 - x_2', '  u_10 - x_10', 'y_1', 'y_2', 'y_10'];

uiTest('#3819 the Design pane\'s roots in natural order (x_2 before x_10), the top first; the Simulation\'s too; a module\'s instances too', E, async (page) => {
  await makeProject(env, { name: 'HierOrder', top: 'top', simTop: 'tb_1', files: FILES, roles: ROLES });
  await page.openProject('HierOrder');
  await page.leftTab('design');
  await page.waitFor((n) => document.querySelectorAll('#hier .row').length >= n, [IMPL.length], { what: 'the hierarchy' });
  assert.deepEqual(await rows(page), IMPL);
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    // the Silinx interface: Simulate's choice, the test benches then the design's modules (its top first), in natural order
    await page.click('#task-switch .task-btn[data-task="sim"]');
    const want = ['tb_1', 'tb_2', 'tb_10', 'top', 'x_1', 'x_2', 'x_10', 'y_1', 'y_2', 'y_10'];
    const got = await page.waitFor((n) => {
      const o = [...(document.getElementById('task-bench')?.options || [])].filter((x) => x.value && !x.disabled).map((x) => x.value);
      return o.length === n ? o : null;
    }, [want.length], { what: 'the test bench choice' });
    assert.deepEqual(got, want);
    await page.click('#task-switch .task-btn[data-task="edit"]');
  } else {
    await page.click('input[name=view][value=sim]');
    await page.waitFor(() => window.Silinx.view === 'sim', [], { what: 'the Simulation view' });
    const SIM = ['tb_1', '  uut - top', '    u_1 - x_1', '    u_2 - x_2', '    u_10 - x_10', 'tb_2', '  uut - top', '    u_1 - x_1', '    u_2 - x_2', '    u_10 - x_10',
      'tb_10', '  uut - top', '    u_1 - x_1', '    u_2 - x_2', '    u_10 - x_10', 'y_1', 'y_2', 'y_10'];
    await page.waitFor((n) => document.querySelectorAll('#hier .row').length >= n, [SIM.length], { what: 'the Simulation hierarchy' });
    assert.deepEqual(await rows(page), SIM);
    await page.click('input[name=view][value=impl]');
    await page.waitFor(() => window.Silinx.view === 'impl', [], { what: 'the Implementation view' });
  }
  // another top: first, the others after it in natural order
  await page.treeRow('#hier', 'y_10', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project.top === 'y_10', [], { what: 'y_10 the top' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].find((l) => /^(top|y_\d+)$/.test(l.textContent))?.textContent === 'y_10', [], { what: 'y_10 first' });
  assert.deepEqual(await rows(page), ['y_10', 'top', '  u_1 - x_1', '  u_2 - x_2', '  u_10 - x_10', 'y_1', 'y_2']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
