// UI (#2834): a tab's menu in Design and Simulate, Show … Beside for every view related to its document, the same
// entries in View for the document in front. Per kind of document, the entries expected: a state diagram (its ASM chart,
// its HDL, the HDL's translation), Boolean algebra (its schematic, HDL), the generated HDL (its drawing, its
// translation), the table's schematic (the table, its HDL), an ASM chart (its state diagram, HDL), a Petri net (its state
// machine, HDL), a schematic (its HDL), an HDL source (its translation), a test bench (its translation, its unit under
// test), a C source (its HDL, its synthesis report), the report (the C, the HDL), a waveform of a test bench (the bench, its
// unit under test). Each entry opens the right view on the other side, the document kept in front; a view open already
// is brought to the front there, not made again; a view that cannot be made (an ASM chart that is not a plain state
// machine) says why in the console and leaves the split as it was. Portuguese; both interfaces. No warnings but that one.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a document's tab, by its title (a point on it)
const tab = (page, title) => page.eval((t) => {
  const el = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
}, title);
// its menu's Show … Beside entries (Mostrar … ao Lado)
const beside = async (page, title) => {
  await page.rightClick(await tab(page, title));
  const m = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the tab menu' });
  return m.filter((l) => /^(Show .* Beside|Mostrar .* ao Lado)$/.test(l));
};
// View's entries for the document in front
const viewMenu = (page) => page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'View').items().filter((x) => /^Show .* Beside$/.test(x?.label || '')).map((x) => x.label));
// the documents shown: side, id, * the one in front
const sides = (page) => page.eval(() => window.Silinx.docs.filter((d) => d.el.getClientRects().length)
  .map((d) => `${d.el.classList.contains('pane-a') ? 'a' : d.el.classList.contains('pane-b') ? 'b' : '-'}:${d.id}${d === window.Silinx.active ? '*' : ''}`).sort());
const open = async (page, path, id) => {
  await page.eval((p) => window.SilinxApp.openFile(p), path);
  await page.waitFor((x) => window.Silinx.active?.id === x, [id], { what: id });
};
// an entry of a tab's menu chosen: `want` beside it, the tab's document in front on the other side
const show = async (page, title, label, want) => {
  const from = await page.eval(() => window.Silinx.active.id);
  await beside(page, title);
  await page.click('body > .menu-popup .mi', { text: label });
  await page.waitFor((w, f) => { const d = window.Silinx.docs.find((x) => x.id === w); const a = window.Silinx.docs.find((x) => x.id === f); return d && a && d.el.getClientRects().length && window.Silinx.active === a && d.el.className !== a.el.className; }, [want, from], { what: `${want} beside ${from}` });
  return sides(page);
};
const close = (page, ids) => page.eval((xs) => Promise.all(window.Silinx.docs.filter((d) => xs.includes(d.id)).map((d) => window.SilinxApp.closeDoc(d))), ids);
const problems = async (page) => {
  const t = await page.consoleText();
  return t.split('\n').filter((l) => /WARNING|ERROR/.test(l));
};
const noWarnings = async (page) => {
  assert.deepEqual(await problems(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
};

uiTest('#2834 drawings and their views: a state diagram, Boolean algebra, the generated HDL, the table\'s schematic, a test bench; each beside, one open already brought to the front; View; Portuguese; no warnings', E, async (page) => {
  await makeProject(env, { name: 'Related', template: 'traffic' });
  await page.openProject('Related');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'tb_traffic'), [], { what: 'the modules' });
  const FSM = 'fsm:src/traffic.fsm.json';

  // a state diagram: its ASM chart, its HDL and the HDL's translation
  await open(page, 'src/traffic.fsm.json', FSM);
  assert.deepEqual(await beside(page, 'traffic.fsm.json'), ['Show ASM Chart Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();
  assert.deepEqual(await viewMenu(page), ['Show ASM Chart Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  assert.deepEqual(await show(page, 'traffic.fsm.json', 'Show ASM Chart Beside', 'fsmasm:src/traffic.fsm.json'), [`a:${FSM}*`, 'b:fsmasm:src/traffic.fsm.json']);
  // (read-only, the diagram's machine: its states)
  assert.deepEqual(await page.eval(() => { const d = window.Silinx.docs.find((x) => x.id === 'fsmasm:src/traffic.fsm.json'); return { banner: /Read-only, converted from/.test(d.el.querySelector('.gen-banner')?.textContent || ''), states: d.asmEditor.getModel().nodes.filter((n) => n.type === 'state').length > 1 }; }), { banner: true, states: true });
  assert.deepEqual(await show(page, 'traffic.fsm.json', 'Show VHDL Beside', 'file:src/traffic.vhd'), [`a:${FSM}*`, 'b:file:src/traffic.vhd']);
  assert.deepEqual(await show(page, 'traffic.fsm.json', 'Show Verilog Beside', 'tr:src/traffic.vhd'), [`a:${FSM}*`, 'b:tr:src/traffic.vhd']);
  assert.match(await page.eval(() => window.Silinx.docs.find((x) => x.id === 'tr:src/traffic.vhd').editor.getValue()), /module traffic/);

  // open already: the ASM chart, behind the test bench on its side, brought to the front there, the same document
  await page.eval(() => { window.Silinx.docs.find((x) => x.id === 'fsmasm:src/traffic.fsm.json').mark = 2834; });
  await page.click(await tab(page, 'traffic.vhd'));
  await open(page, 'sim/tb_traffic.vhd', 'file:sim/tb_traffic.vhd');
  await page.click(await tab(page, 'traffic.fsm.json'));
  await page.waitFor((id) => window.Silinx.active?.id === id, [FSM]);
  assert.deepEqual(await sides(page), [`a:${FSM}*`, 'b:file:sim/tb_traffic.vhd']);
  assert.deepEqual(await show(page, 'traffic.fsm.json', 'Show ASM Chart Beside', 'fsmasm:src/traffic.fsm.json'), [`a:${FSM}*`, 'b:fsmasm:src/traffic.fsm.json']);
  assert.equal(await page.eval(() => window.Silinx.docs.find((x) => x.id === 'fsmasm:src/traffic.fsm.json').mark), 2834);

  // the converted chart: the diagram, its HDL; the generated HDL: its drawing, its translation
  await page.click(await tab(page, 'traffic.asm'));
  assert.deepEqual(await beside(page, 'traffic.asm'), ['Show State Diagram Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();
  await page.click(await tab(page, 'traffic.vhd'));
  assert.deepEqual(await beside(page, 'traffic.vhd'), ['Show State Diagram Beside', 'Show Verilog Beside']);
  await page.closeMenus();

  // a test bench: its translation, its unit under test (the top)
  await page.click(await tab(page, 'tb_traffic.vhd'));
  assert.deepEqual(await beside(page, 'tb_traffic.vhd'), ['Show Verilog Beside', 'Show Unit Under Test Beside']);
  await page.closeMenus();
  const tb = await show(page, 'tb_traffic.vhd', 'Show Unit Under Test Beside', 'file:src/top.vhd');
  assert.ok(tb.includes('b:file:sim/tb_traffic.vhd*') && tb.includes('a:file:src/top.vhd'), JSON.stringify(tb));
  // a plain HDL source: its translation
  await page.click(await tab(page, 'top.vhd'));
  assert.deepEqual(await beside(page, 'top.vhd'), ['Show Verilog Beside']);
  await page.closeMenus();

  // Boolean algebra: its schematic, its HDL; the schematic: the table, its HDL
  await close(page, (await page.eval(() => window.Silinx.docs.map((d) => d.id))).filter((id) => id !== 'summary'));
  await open(page, 'src/lamps.bool.json', 'tt:src/lamps.bool.json');
  assert.deepEqual(await beside(page, 'lamps.bool.json'), ['Show Schematic Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();
  const tt = await show(page, 'lamps.bool.json', 'Show Schematic Beside', 'ttsch:src/lamps.bool.json');
  assert.ok(tt.includes('a:tt:src/lamps.bool.json*') && tt.includes('b:ttsch:src/lamps.bool.json'), JSON.stringify(tt));
  await page.click(await tab(page, 'lamps (Schematic)'));
  assert.deepEqual(await beside(page, 'lamps (Schematic)'), ['Show Boolean Algebra Beside', 'Show VHDL Beside', 'Show Verilog Beside']);

  // in Portuguese
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual(await beside(page, 'lamps.bool.json'), ['Mostrar o Esquemático ao Lado', 'Mostrar o VHDL ao Lado', 'Mostrar o Verilog ao Lado']);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
});

uiTest('#2834 an ASM chart that is not a plain state machine: Show State Diagram Beside says why in the console, the split as it was; a Petri net\'s state machine; a schematic\'s HDL', E, async (page) => {
  await makeProject(env, { name: 'RelatedAsm', template: 'blinky' });
  await page.openProject('RelatedAsm');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'speed_ctrl'), [], { what: 'the modules' });
  await open(page, 'src/speed_ctrl.asm.json', 'asm:src/speed_ctrl.asm.json');
  assert.deepEqual(await beside(page, 'speed_ctrl.asm.json'), ['Show State Diagram Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.click('body > .menu-popup .mi', { text: 'Show State Diagram Beside' });
  await page.waitFor(() => /The state diagram of "src\/speed_ctrl\.asm\.json"/.test(window.__console()), [], { what: 'the error in the console' });
  assert.deepEqual(await problems(page), ['ERROR: The state diagram of "src/speed_ctrl.asm.json": speed_ctrl.asm.json cannot be shown as a state diagram: it is not a plain state machine: it has internal registers (cnt_f, deb_f, cnt_s, deb_s, level, ticks); it has generics/parameters (DEBOUNCE); it has registered outputs (step); it synchronises inputs; it has logic that runs on every cycle besides the states']);
  assert.equal(await page.eval(() => document.getElementById('workspace').classList.contains('split')), false);
  assert.equal(await page.eval(() => window.Silinx.docs.some((d) => d.id === 'asmfsm:src/speed_ctrl.asm.json')), false);
  assert.equal(await page.eval(() => window.Silinx.active.id), 'asm:src/speed_ctrl.asm.json');

  // a Petri net: its state machine, its HDL
  await makeProject(env, { name: 'RelatedPn', top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('RelatedPn');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'ctl'), [], { what: 'the module' });
  await open(page, 'src/ctl.pn.json', 'pn:src/ctl.pn.json');
  assert.deepEqual(await beside(page, 'ctl.pn.json'), ['Show State Diagram Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();
  assert.deepEqual(await show(page, 'ctl.pn.json', 'Show State Diagram Beside', 'pnfsm:src/ctl.pn.json'), ['a:pn:src/ctl.pn.json*', 'b:pnfsm:src/ctl.pn.json']);
  await page.click(await tab(page, 'ctl.fsm'));
  assert.deepEqual(await beside(page, 'ctl.fsm'), ['Show Petri Net Beside', 'Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();

  // a schematic: its HDL, its translation
  await makeProject(env, { name: 'RelatedSch', template: 'gates' });
  await page.openProject('RelatedSch');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'gates'), [], { what: 'the modules' });
  await open(page, 'src/gates.sch.json', 'sch:src/gates.sch.json');
  assert.deepEqual(await beside(page, 'gates.sch.json'), ['Show VHDL Beside', 'Show Verilog Beside']);
  await page.closeMenus();
  assert.deepEqual(await show(page, 'gates.sch.json', 'Show Verilog Beside', 'tr:src/gates.vhd'), ['a:sch:src/gates.sch.json*', 'b:tr:src/gates.vhd']);
  await page.click(await tab(page, 'gates.v'));
  assert.deepEqual(await beside(page, 'gates.v'), ['Show Schematic Beside', 'Show VHDL Beside']);
  await page.closeMenus();
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

uiTest('#2834 a C source: its HDL and its synthesis report beside, the report\'s source; a waveform of a test bench: the bench and its unit under test; no warnings', E, async (page) => {
  await makeProject(env, { name: 'RelatedC', template: 'isqrt' });
  await page.openProject('RelatedC');
  await page.waitFor(() => window.SilinxApp.S.sources.some((s) => s.view && s.path === 'src/isqrt.c'), [], { what: 'the C module' });
  await open(page, 'src/isqrt.c', 'file:src/isqrt.c');
  assert.deepEqual(await beside(page, 'isqrt.c'), ['Show VHDL Beside', 'Show ASM Chart Beside', 'Show C Synthesis Report Beside']);
  await page.closeMenus();
  assert.deepEqual(await show(page, 'isqrt.c', 'Show C Synthesis Report Beside', 'crep:src/isqrt.c'), ['a:file:src/isqrt.c*', 'b:crep:src/isqrt.c']);
  assert.match(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'crep:src/isqrt.c').el.textContent), /isqrt/);
  await page.click(await tab(page, 'isqrt (C Synthesis Report)'));
  assert.deepEqual(await beside(page, 'isqrt (C Synthesis Report)'), ['Show C Source Beside', 'Show VHDL Beside', 'Show ASM Chart Beside']);
  await page.closeMenus();
  assert.deepEqual(await show(page, 'isqrt (C Synthesis Report)', 'Show VHDL Beside', 'chdl:src/isqrt.c'), ['a:chdl:src/isqrt.c', 'b:crep:src/isqrt.c*']);
  await noWarnings(page);

  // a waveform of a test bench: the bench, its unit under test
  await makeProject(env, { name: 'RelatedSim', template: 'gates' });
  await page.openProject('RelatedSim');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'tb_gates'), [], { what: 'the modules' });
  await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates', [], { what: 'the waveform', timeout: 30000 });
  assert.deepEqual(await beside(page, 'SSim (tb_gates)'), ['Show Test Bench Beside', 'Show Unit Under Test Beside']);
  await page.closeMenus();
  assert.deepEqual(await show(page, 'SSim (tb_gates)', 'Show Unit Under Test Beside', 'sch:src/gates.sch.json'), ['a:isim:tb_gates*', 'b:sch:src/gates.sch.json']);
  assert.deepEqual(await show(page, 'SSim (tb_gates)', 'Show Test Bench Beside', 'file:sim/tb_gates.vhd'), ['a:isim:tb_gates*', 'b:file:sim/tb_gates.vhd']);
  assert.deepEqual(await viewMenu(page), ['Show Test Bench Beside', 'Show Unit Under Test Beside']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual(await beside(page, 'SSim (tb_gates)'), ['Mostrar a Bancada de Teste ao Lado', 'Mostrar a Unidade em Teste ao Lado']);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
