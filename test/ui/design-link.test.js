// UI: a design opened from a link (#2826, web/js/link-open.js) and Copy Link… (web/js/link-copy.js), in both
// interfaces: an example's link into Try it (the schematic's live simulation running), a project's link made with
// Copy Link… (the Design tree's project and module menus, the File menu, the Start page) and opened again into the
// simulation (the same project, kept); the board emulator; a changed project replaced only when the user says so; a
// zip at an outside address asked first (Cancel: nothing fetched); a broken or hostile link said in the console (#2829),
// the workspace as it was; in Portuguese. No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, readWs, writeWs, makeProject } from './harness.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const consoleWarnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^WARNING/.test(l.trim()));
const linkOpened = (page) => page.waitFor(() => window.Silinx.linkOpened, [], { what: 'the link opened', timeout: 60000 });
// the app at a link (a query first: a new page, not a jump in the same one)
async function openLink(page, hash, query = 'l=1') {
  await page.goto(`${env.server.url}/?${query}#${hash}`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
}
const projects = async () => (await fs.readdir(env.server.workspace)).filter((f) => !f.startsWith('.')).sort();
const exists = (p) => fs.access(path.join(env.server.workspace, p)).then(() => true, () => false);
async function contextMenu(page, row, item) {
  // (on its name: the row's middle may be one of its badges)
  await page.rightClick('#hier .row .lbl', { index: row });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()));
  if (item) await page.click('body > .menu-popup .mi', { text: item });
  return items;
}
const dialogLink = (page) => page.waitFor(() => document.querySelector('.dlg-overlay .link-out')?.value || null, [], { what: 'the link in the dialog' });

uiTest('#2826 an example\'s link opens it into Try it: the schematic\'s live simulation running; the address cleared', E, async (page) => {
  await openLink(page, 'open=example:gates&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating, [], { what: 'Try it running', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.project.name), 'gates');
  await page.waitConsole(/Opened 'gates' from a link \(a new project\): Try it\./);
  assert.equal(await page.eval(() => location.hash), '', 'the link\'s options cleared from the address');
  assert.deepEqual(await consoleWarnings(page), []);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2869 view=try on a state diagram: traffic\'s FSM opened in its Try it panel', E, async (page) => {
  await openLink(page, 'open=example:traffic&top=traffic&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json')?.fsmEditor?.panel === 'sim', [], { what: 'the FSM\'s Try it panel', timeout: 30000 });
  assert.equal(await page.eval(() => window.Silinx.active?.id), 'fsm:src/traffic.fsm.json');
  await page.waitConsole(/Opened 'traffic' from a link( \(a new project\))?: Try it\./);
  assert.deepEqual(await consoleWarnings(page), []);
});

uiTest('#2881 view=try on an ASM chart: blinky\'s speed_ctrl opened, its simulation panel when the ASM editor has one, else the chart and the console\'s line', E, async (page) => {
  await openLink(page, 'open=example:blinky&top=speed_ctrl&view=try', 'asm=1');
  await linkOpened(page);
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/speed_ctrl.asm.json', [], { what: 'the ASM chart open', timeout: 30000 });
  const hasSim = await page.eval(() => typeof window.SilinxApp.findDoc('asm:src/speed_ctrl.asm.json')?.asmEditor?.showPanel === 'function');
  if (hasSim) await page.waitFor(() => window.SilinxApp.findDoc('asm:src/speed_ctrl.asm.json').asmEditor.panel === 'sim', [], { what: 'the ASM chart\'s simulation' });
  else await page.waitConsole(/Open from a link: src\/speed_ctrl\.asm\.json opened; the ASM chart's simulation is not in this version yet\./);
  assert.doesNotMatch(await page.consoleText(), /ERROR: Open from a link/);
  assert.deepEqual(await consoleWarnings(page), []);
});

uiTest('#2869 a Petri net: Share Module… chooses Try it; the link opens the net in its Try it panel', E, async (page) => {
  await makeProject(env, { name: 'PnLink', top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('PnLink');
  const row = await page.waitFor(() => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => /\bctl\b/.test(r.textContent)); return i > 0 ? i : null; }, [], { what: 'the net\'s row' });
  await contextMenu(page, row, 'Share Module…');
  await page.waitDialog('Share Module');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), 'try');
  const link = await page.waitFor(() => /&view=try(&ui=[A-Za-z0-9_-]+)?$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the link' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await openLink(page, new URL(link).hash.slice(1), 'pn=1');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('pn:src/ctl.pn.json')?.petriEditor?.panel === 'sim', [], { what: 'the net\'s Try it panel', timeout: 30000 });
  await page.waitConsole(/Opened 'PnLink' from a link: Try it\./);
  assert.equal(await page.dialogCount(), 0, 'the same project: no question');
  assert.deepEqual(await consoleWarnings(page), []);
});

uiTest('#2826 Copy Link…: the project\'s and a module\'s menus, the File menu, the Start page; the link opened again into the simulation, the same project kept', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  await page.waitFor(() => document.querySelector('#hier .row'), [], { what: 'the Design tree' });
  // the project's menu
  assert.ok((await contextMenu(page, 0)).includes('Share Project…'));
  await page.closeMenus();
  await page.menu('File', 'Share Project…');
  assert.equal(await page.waitDialog('Share Project'), 'Share Project');
  const plain = await dialogLink(page);
  assert.match(plain, new RegExp(`^${env.server.url.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}/#design=[A-Za-z0-9_-]+(&ui=[A-Za-z0-9_-]+)?$`));
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^\d+ characters: some slide tools cut a link longer than 2000 \(export the project as a \.zip, host it, and link to it with #open=\)\.$/);
  // a view the design does not have: said in the dialog, no link
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=view]'); s.value = 'try'; s.dispatchEvent(new Event('change')); });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-error').textContent), 'Try it: \'top\' is not a schematic, a state diagram, a Petri net or an ASM chart.');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=view]'); s.value = 'simulate'; s.dispatchEvent(new Event('change')); });
  const link = await page.waitFor(() => /&view=simulate(&ui=[A-Za-z0-9_-]+)?$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the simulation\'s link' });
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  await page.waitConsole(/Share Project: the link of 'traffic' \(Simulation, tb_traffic\) copied, \d+ characters\./);
  assert.deepEqual(await consoleWarnings(page), [`WARNING: Share Project: the link is ${link.length} characters long: some slide tools cut a link longer than 2000.`]);
  // a module's menu: its module chosen (the Start page's command: the same dialog)
  const row = await page.eval(() => [...document.querySelectorAll('#hier .row')].findIndex((r) => /\btimer\b/.test(r.textContent)));
  assert.ok(row > 0);
  await contextMenu(page, row, 'Share Module…');
  await page.waitDialog('Share Module');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=module]').value), 'timer');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(() => window.SilinxApp.showLeftPage('start'));
  await page.waitFor(() => [...document.querySelectorAll('#start-page .start-btns .btn')].some((b) => b.textContent === 'Open Project…' && b.getClientRects().length), [], { what: 'the Start page' });
  // the link opened: the same project (unchanged) kept, its test bench simulated
  await openLink(page, new URL(link).hash.slice(1), 'l=2');
  await linkOpened(page);
  await page.waitConsole(/Opened 'traffic' from a link: the simulation\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => /^isim:/.test(d.id)), [], { what: 'the simulation open', timeout: 60000 });
  assert.deepEqual((await projects()).filter((p) => /^traffic/.test(p)), ['traffic']);
  assert.equal(await page.dialogCount(), 0, 'no question: the project is the link\'s');
});

uiTest('#3230 regression, the project\'s Copy Link… with Open the project only: no module in the link (its list disabled), the project opened with no source', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  const field = (f) => `.dlg-overlay [data-field=${f}]`;
  assert.equal(await page.eval((s) => document.querySelector(s).value, field('view')), '');
  assert.equal(await page.eval((s) => document.querySelector(s).disabled, field('module')), true);
  // (a module other than the top set in the list anyway, and the view left out: still no module in the link)
  await page.eval((s, u) => { const m = document.querySelector(s); m.value = 'timer'; m.dispatchEvent(new Event('change')); const c = document.querySelector(u); c.checked = false; c.dispatchEvent(new Event('change')); }, field('module'), field('ui'));
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the link' });
  assert.match(link, /#design=[A-Za-z0-9_-]+$/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await openLink(page, new URL(link).hash.slice(1), 'n=1');
  await linkOpened(page);
  await page.waitFor(() => document.querySelector('#hier .row'), [], { what: 'the Design tree' });
  assert.equal(await page.eval(() => window.Silinx.active?.path ?? null), null, 'no source open');
  assert.deepEqual(await consoleWarnings(page), [], 'no warnings');
});

uiTest('#2871 regression, Share Module… with Open the project only: the link opens the project on that module, selected, its source open; the top too; with a view', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  // the module's link, made in the dialog (no view)
  const linkOf = async (module) => {
    const row = await page.waitFor((m) => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.module === m); return i >= 0 ? i : null; }, [module], { what: `${module}'s row` });
    await contextMenu(page, row, 'Share Module…');
    await page.waitDialog('Share Module');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), '');
    const link = await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the link' });
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
    return link;
  };
  const selected = () => page.eval(() => document.querySelector('#hier .row.sel')?.dataset.module ?? null);
  for (const [module, doc, q] of [['timer', 'src/timer.vhd', 'm=1'], ['top', 'src/top.vhd', 'm=2']]) {
    const link = await linkOf(module);
    assert.match(link, new RegExp(`#design=[A-Za-z0-9_-]+&top=${module}(&ui=[A-Za-z0-9_-]+)?$`));
    await openLink(page, new URL(link).hash.slice(1), q);
    await linkOpened(page);
    await page.waitFor((m) => document.querySelector('#hier .row.sel')?.dataset.module === m, [module], { what: `${module} selected` });
    await page.waitFor((d) => window.Silinx.active?.path === d, [doc], { what: `${doc} open`, timeout: 30000 });
    assert.equal(await page.eval(() => window.Silinx.sel?.module), module);
    await page.waitConsole(/Opened 'traffic' from a link\./);
    assert.deepEqual(await consoleWarnings(page), []);
  }
  // with a view: the module selected, its view open
  await openLink(page, 'open=example:traffic&top=traffic&view=try', 'm=3');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json')?.fsmEditor?.panel === 'sim', [], { what: 'the FSM\'s Try it panel', timeout: 30000 });
  assert.equal(await selected(), 'traffic');
});

const INV = "library ieee;\nuse ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is begin y <= not a; end rtl;\n";
const tbOf = (n) => `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${n} is end ${n};\narchitecture sim of ${n} is\n  signal a, y : std_logic := '0';\nbegin\n  uut : entity work.inv port map (a => a, y => y);\n  process begin a <= '1'; wait for 10 ns; wait; end process;\nend sim;\n`;

uiTest('#2878 Copy Link…: the Module list follows Open in: Simulation the test benches (the project\'s first), the others the design\'s modules; the link simulates the chosen test bench', E, async (page) => {
  await makeProject(env, { name: 'TwoTb', top: 'inv', simTop: 'tb_a',
    files: { 'src/inv.vhd': INV, 'sim/tb_a.vhd': tbOf('tb_a'), 'sim/tb_b.vhd': tbOf('tb_b') },
    roles: { 'sim/tb_a.vhd': 'sim', 'sim/tb_b.vhd': 'sim' } });
  await page.openProject('TwoTb');
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  const options = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay select[data-field=module] option')].map((o) => `${o.textContent}${o.selected ? ' *' : ''}`));
  const setView = (v) => page.eval((x) => { const s = document.querySelector('.dlg-overlay select[data-field=view]'); s.value = x; s.dispatchEvent(new Event('change')); }, v);
  // the project only, Try it, the emulator: no test bench
  for (const v of ['', 'try', 'emulate']) { await setView(v); assert.deepEqual(await options(), ['inv (top) *'], v); }
  // the simulation: the test benches, the project's first and chosen
  await setView('simulate');
  assert.deepEqual(await options(), ["tb_a (the project's) *", 'tb_b']);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), /#design=[A-Za-z0-9_-]+&view=simulate(&ui=[A-Za-z0-9_-]+)?$/);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=module]'); s.value = 'tb_b'; s.dispatchEvent(new Event('change')); });
  const link = await page.waitFor(() => /&top=tb_b&view=simulate(&ui=[A-Za-z0-9_-]+)?$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'tb_b\'s link' });
  // back to the project only: the design's module again; then the simulation: tb_b kept
  await setView('');
  assert.deepEqual(await options(), ['inv (top) *']);
  await setView('simulate');
  assert.deepEqual(await options(), ["tb_a (the project's)", 'tb_b *']);
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  await page.waitConsole(/Share Project: the link of 'TwoTb' \(Simulation, tb_b\) copied, \d+ characters\./);
  // the link simulates tb_b, not the project's tb_a
  await openLink(page, new URL(link).hash.slice(1), 'tb=1');
  await linkOpened(page);
  await page.waitConsole(/Opened 'TwoTb' from a link: the simulation\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'isim:tb_b'), [], { what: 'tb_b simulated', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.docs.some((d) => d.id === 'isim:tb_a')), false);
  // a test bench in a link with another view: refused, said in the console
  await openLink(page, new URL(link).hash.slice(1).replace('&view=simulate', ''), 'tb=2');
  await linkOpened(page);
  await page.waitConsole(/ERROR: Open from a link: 'tb_b' is a test bench: a link opens it in the simulation\./);
});

uiTest('#2883 a test bench\'s Share Module… in the Simulation hierarchy: Simulation, that test bench chosen; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TbLink', top: 'inv', simTop: 'tb_a',
    files: { 'src/inv.vhd': INV, 'sim/tb_a.vhd': tbOf('tb_a'), 'sim/tb_b.vhd': tbOf('tb_b') },
    roles: { 'sim/tb_a.vhd': 'sim', 'sim/tb_b.vhd': 'sim' } });
  await page.openProject('TbLink');
  // the Simulation hierarchy: Tasks ▸ Simulate's panel (the Silinx interface), the Design pane's Simulation view (ISE style)
  const tasks = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
  const benchMenu = async (item) => {
    if (tasks) {
      // (Simulate's task, unless shown: its button again would fold it)
      const shown = () => page.eval(() => [...document.querySelectorAll('#task-sim-panel .task-sim-bench .row')].some((r) => r.getClientRects().length));
      if (!await shown()) await page.click('#task-switch .task-btn[data-task="sim"]');
      await page.waitFor(() => [...document.querySelectorAll('#task-sim-panel .task-sim-bench .row')].some((r) => r.getClientRects().length && /tb_b/.test(r.textContent)), [], { what: 'the test benches' });
      await page.rightClick('#task-sim-panel .task-sim-bench .row .lbl', { text: 'tb_b' });
    } else {
      await page.click('input[name=view][value=sim]');
      await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent === 'tb_b'), [], { what: 'the Simulation view' });
      await page.rightClick('#hier .row .lbl', { text: 'tb_b' });
    }
    await page.waitForSelector('body > .menu-popup');
    await page.click('body > .menu-popup .mi', { text: item });
  };
  await benchMenu('Share Module…');
  await page.waitDialog('Share Module');
  // (a test bench: a copy only, Live disabled with its reason, #3698)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .share-how input')].map((r) => [r.value, r.checked, r.disabled, r.closest('label').title])),
    [['copy', true, false, ''], ['live', false, true, 'A test bench is shared as a copy only.']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), 'simulate');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=module]').value), 'tb_b');
  const link = await page.waitFor(() => /&top=tb_b&view=simulate(&ui=[A-Za-z0-9_-]+)?$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'tb_b\'s link' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await benchMenu('Partilhar Módulo…');
    assert.equal(await page.waitDialog('Partilhar Módulo'), 'Partilhar Módulo');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view] option:checked').textContent), 'Simulação');
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  // the link simulates tb_b
  await openLink(page, new URL(link).hash.slice(1), 'tbl=1');
  await linkOpened(page);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'isim:tb_b'), [], { what: 'tb_b simulated', timeout: 60000 });
});

uiTest('#2884 regression, Board Emulator: the Module list disabled on the top, the link names no module; a link\'s other top= refused; Portuguese', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  const row = await page.waitFor(() => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.module === 'timer'); return i >= 0 ? i : null; }, [], { what: 'timer\'s row' });
  await contextMenu(page, row, 'Share Module…');
  await page.waitDialog('Share Module');
  await page.eval(() => { const v = document.querySelector('.dlg-overlay select[data-field=view]'); v.value = 'emulate'; v.dispatchEvent(new Event('change')); });
  const state = () => page.eval(() => { const m = document.querySelector('.dlg-overlay select[data-field=module]'); return { disabled: m.disabled, options: [...m.options].map((o) => `${o.textContent}${o.selected ? ' *' : ''}`) }; });
  assert.deepEqual(await state(), { disabled: true, options: ['top (top) *'] });
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), /#design=[A-Za-z0-9_-]+&view=emulate(&ui=[A-Za-z0-9_-]+)?$/);
  // back to the project only: timer again, the list enabled
  await page.eval(() => { const v = document.querySelector('.dlg-overlay select[data-field=view]'); v.value = ''; v.dispatchEvent(new Event('change')); });
  assert.equal((await state()).disabled, false);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=module]').value), 'timer');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // a link that would emulate another module: refused, the reason in the console
  await openLink(page, 'open=example:traffic&top=timer&view=emulate', 'emu=1');
  await linkOpened(page);
  await page.waitConsole(/ERROR: Open from a link: the board emulator emulates the top module, 'top', not 'timer'\./);
  assert.equal(await page.eval(() => window.Silinx.docs.some((d) => d.id === 'emulator')), false);
  // in Portuguese, the dialog's refusal
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const { t } = await page.eval(async () => ({ t: (await import('/js/i18n.js')).t('The board emulator emulates the top module, \'top\', not \'timer\'.') }));
    assert.equal(t, 'O emulador da placa emula o módulo de topo, \'top\', não \'timer\'.');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

uiTest('#2876 regression, a schematic named in another case than its module (Gates, the HDL\'s gates): Share Module… offers Try it, no error; the link opens it', E, async (page) => {
  const sch = JSON.parse(await fs.readFile(new URL('../../examples/gates/src/gates.sch.json', import.meta.url), 'utf8'));
  // (as the user's ALU_4bit: the schematic's name as typed, its HDL file generated from it, the compiled module in
  // lower case)
  sch.name = 'Gates';
  const hdl = await fs.readFile(new URL('../../examples/gates/src/gates.vhd', import.meta.url), 'utf8');
  await makeProject(env, { name: 'CaseLink', top: 'gates', files: { 'src/gates.sch.json': JSON.stringify(sch, null, 1), 'src/gates.vhd': hdl } });
  await page.openProject('CaseLink');
  const row = await page.waitFor(() => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => (r.dataset.module || '').toLowerCase() === 'gates'); return i >= 0 ? i : null; }, [], { what: 'the schematic\'s row' });
  await contextMenu(page, row, 'Share Module…');
  await page.waitDialog('Share Module');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), 'try');
  const link = await page.waitFor(() => /&view=try(&ui=[A-Za-z0-9_-]+)?$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the link' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-error').textContent), '');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await openLink(page, new URL(link).hash.slice(1), 'case=1');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating, [], { what: 'Try it running', timeout: 60000 });
  assert.doesNotMatch(await page.consoleText(), /ERROR: Open from a link/);
});

uiTest('#2882 regression, a C module (Silinx HLS): Share Module… makes its link, no error; the link opens the project on it', E, async (page) => {
  await makeProject(env, { name: 'CLink', template: 'fir' });
  await page.openProject('CLink');
  const row = await page.waitFor(() => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.module === 'fir'); return i >= 0 ? i : null; }, [], { what: 'the C module\'s row' });
  await contextMenu(page, row, 'Share Module…');
  await page.waitDialog('Share Module');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the link' });
  assert.match(link, /#design=[A-Za-z0-9_-]+&top=fir(&ui=[A-Za-z0-9_-]+)?$/);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-error').textContent), '');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await openLink(page, new URL(link).hash.slice(1), 'c=1');
  await linkOpened(page);
  await page.waitFor(() => document.querySelector('#hier .row.sel')?.dataset.module === 'fir', [], { what: 'fir selected' });
  await page.waitFor(() => window.Silinx.active?.path === 'src/fir.c', [], { what: 'the C source open', timeout: 30000 });
  assert.doesNotMatch(await page.consoleText(), /ERROR: Open from a link/);
});

uiTest('#2886 the link carries Silinx\'s view: tabs, the one in front, the split and (the Silinx interface) the panels; opened elsewhere as it was, not kept as the viewer\'s layout', E, async (page, env) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  const tasks = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
  // the teacher's Silinx: three tabs, timer's HDL on the right side, the state diagram in front; folded side panel, maximized
  await page.eval(async () => {
    const A = window.SilinxApp;
    await A.openFile('src/timer.vhd'); await A.openFsm('src/traffic.fsm.json'); await A.openSummary();
    const { moveToSide } = await import('/js/split-view.js');
    moveToSide(A.findDoc('file:src/timer.vhd'), 'b');
    A.activateDoc(A.findDoc('fsm:src/traffic.fsm.json'));
  });
  if (tasks) {
    await page.click('#task-view [data-act=side]');
    await page.click('#task-view [data-act=max]');
    await page.waitFor(() => document.documentElement.dataset.side === 'folded' && document.documentElement.dataset.max === 'on', [], { what: 'folded and maximized' });
  }
  const shown = (p) => p.eval(() => ({
    docs: window.Silinx.docs.map((d) => d.reopen || d.id).filter((k) => /^(file|fsm|summary)/.test(k)).sort(),
    active: window.Silinx.active?.reopen || window.Silinx.active?.id,
    right: window.Silinx.docs.filter((d) => d.side === 'b').map((d) => d.reopen || d.id),
    layout: document.documentElement.dataset.layout === 'tasks' ? { task: document.documentElement.dataset.task, side: document.documentElement.dataset.side, max: document.documentElement.dataset.max } : null,
  }));
  const before = await shown(page);
  assert.deepEqual(before.docs, ['file:src/timer.vhd', 'fsm:src/traffic.fsm.json', 'summary']);
  assert.equal(before.active, 'fsm:src/traffic.fsm.json');
  assert.deepEqual(before.right, ['file:src/timer.vhd']);
  // Copy Link…: the current view included (checked)
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=ui]').checked), true);
  const link = await page.waitFor(() => /&ui=[A-Za-z0-9_-]+$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the link with its view' });
  await page.eval(() => { const c = document.querySelector('.dlg-overlay input[data-field=ui]'); c.checked = false; c.dispatchEvent(new Event('change')); });
  assert.doesNotMatch(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), /&ui=/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // another viewer (a browser of its own): the link opens Silinx as it was
  const p2 = await env.newPage(`${env.server.url}/?view=1${new URL(link).hash}`);
  try {
    await p2.waitFor(() => window.Silinx?.linkOpened, [], { what: 'the link opened', timeout: 60000 });
    await p2.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the state diagram in front' });
    const after = await shown(p2);
    assert.deepEqual({ ...after, layout: null }, { ...before, layout: null });
    if (tasks) assert.deepEqual(after.layout, before.layout);
    assert.doesNotMatch(await p2.eval(() => window.__console()), /WARNING|ERROR/);
    // not kept as that viewer's layout: a reload of the page (no link) shows the defaults
    if (tasks) {
      assert.doesNotMatch(await p2.eval(() => localStorage.getItem('silinx.tasks') || ''), /"max":true/);
      await p2.reload();
      assert.equal(await p2.eval(() => document.documentElement.dataset.max), 'off');
    }
  } finally { await p2.close(); }
  // a hostile view (a path that leaves the project, an unknown field): left out, said; the project opens (#2829)
  const evil = Buffer.from(JSON.stringify({ o: ['file:../../etc/passwd', 'file:src/timer.vhd'], a: 'file:src/timer.vhd', zz: 1 })).toString('base64url');
  await openLink(page, `open=example:traffic&ui=${evil}`, 'evil=1');
  await linkOpened(page);
  await page.waitConsole(/WARNING: Open from a link: the link's view left out a document 'file:\.\.\/\.\.\/etc\/passwd', 'zz'\./);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/timer.vhd', [], { what: 'the sound part of the view' });
});

uiTest('#2826 #2875 a changed project: replaced only when the user says so; or the link\'s design opened as <name>_2, _3, the student\'s kept (Keep Mine, Open as, Replace)', E, async (page) => {
  await openLink(page, 'open=example:blinky');
  await linkOpened(page);
  const name = (await fs.readdir(path.join(env.server.workspace, 'blinky', 'sim')))[0];
  await writeWs(env, 'blinky', `sim/${name}`, '-- the student\'s work\n');
  await openLink(page, 'open=example:blinky&view=emulate', 'l=2');
  assert.equal(await page.waitDialog('Open from a Link'), 'Open from a Link');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^A project named 'blinky' already exists, with changes of its own\.\s+Replace it with the link's design\? The existing project is moved to the workspace \.trash folder\. Or open the link's design as a new project, 'blinky_2', yours kept as it is\.$/);
  // (the one that loses nothing first, the primary: Enter's)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => `${b.textContent}${b.classList.contains('primary') ? ' (primary)' : ''}`)), ['Open as blinky_2 (primary)', 'Replace', 'Keep Mine']);
  await page.dialogButton('Keep Mine');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: the project 'blinky' was kept as it is; the link's design was not opened\./);
  assert.equal(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
  // Open as blinky_2, then blinky_3: the link's design beside the student's project, which stays as it is
  for (const [n, q] of [['blinky_2', 'l=4'], ['blinky_3', 'l=5']]) {
    await openLink(page, 'open=example:blinky&top=speed_ctrl', q);
    await page.waitDialog('Open from a Link');
    await page.dialogButton(`Open as ${n}`);
    await linkOpened(page);
    await page.waitConsole(new RegExp(`Opened '${n}' from a link \\(a new project; 'blinky' kept as it is\\)\\.`));
    assert.equal(await page.eval(() => window.Silinx.project.name), n);
    await page.waitFor(() => document.querySelector('#hier .row.sel')?.dataset.module === 'speed_ctrl', [], { what: 'the link\'s module selected' });
    assert.notEqual(await readWs(env, n, `sim/${name}`), '-- the student\'s work\n');
  }
  assert.equal(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
  assert.deepEqual(await consoleWarnings(page), []);
  // Replace: the example's again, in the board emulator
  await openLink(page, 'open=example:blinky&view=emulate', 'l=3');
  await page.waitDialog('Open from a Link');
  await page.dialogButton('Replace');
  await linkOpened(page);
  await page.waitConsole(/Opened 'blinky' from a link: the board emulator\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'emulator'), [], { what: 'the emulator open', timeout: 60000 });
  assert.notEqual(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
});

uiTest('#2829 a zip at another site is asked first (Cancel: nothing fetched); broken and hostile links said in the console, nothing made', E, async (page) => {
  const before = await projects();
  await openLink(page, 'open=https://example.org/lecture3.zip&view=simulate');
  await page.waitDialog('Open from a Link');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^This link opens a project from another site:\s+https:\/\/example\.org\/lecture3\.zip\s+Open it\? Its files are copied into a new project of your workspace; nothing runs until you run it\.$/);
  await page.dialogButton('Cancel');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: cancelled\./);
  for (const [hash, msg] of [
    ['open=javascript:alert(1)', 'the link\'s open= is not an https address (\'javascript:alert(1)\')'],
    ['open=https://192.168.1.1/a.zip', 'the link\'s open= is an address of this computer or of a local network (\'192.168.1.1\')'],
    ['open=example:gates&top=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', 'the link\'s top \'<img src=x onerror=alert(1)>\' is not a module name'],
    ['design=abc%24', 'the design in the link is not base64url'],
    ['open=example:nothere', 'no example \'nothere\''],
    ['open=example:gates&view=simulate&top=nothere', 'the design has no module \'nothere\''],
  ]) {
    await openLink(page, hash, `l=${encodeURIComponent(hash)}`);
    await page.waitFor(() => window.Silinx.startupChecked, [], { what: 'boot' });
    await page.waitFor((m) => window.__console().includes(`ERROR: Open from a link: ${m}.`), [msg], { what: msg, timeout: 30000 }).catch(async (e) => { throw new Error(`${e.message}\n${await page.consoleText()}`); });
    assert.equal(await page.eval(() => document.querySelectorAll('#console img, .dlg-overlay img').length), 0, 'no markup from the link');
  }
  assert.deepEqual(await projects(), before);
  assert.equal(await exists('nothere'), false);
});

uiTest('#3042 a zip at another site that redirects: the redirection not followed (fetched with redirect: manual), refused, said in the console, nothing made', E, async (page) => {
  const before = await projects();
  const msg = 'ERROR: Open from a link: https://example.org/lecture3.zip redirects to another address, not followed: the link must give the zip\'s own address.';
  // (the site's answer as the browser's fetch reports it: an opaque redirection with redirect: 'manual' (#3042);
  // a redirection followed (#2962), to this computer, a local network or http, refused too)
  for (const [answer, n] of [['manual', 1], ['https://[::7f00:1]/a.zip', 2], ['https://192.168.1.1/a.zip', 3], ['http://example.org/a.zip', 4]]) {
    await openLink(page, 'open=https://example.org/lecture3.zip', `r=${n}`);
    await page.waitDialog('Open from a Link');
    await page.eval((a) => {
      window.__fetched = [];
      // (the application's own requests, such as a late /api/workspace, go to the real fetch and are not recorded, #3174)
      const real = window.__realFetch || (window.__realFetch = window.fetch);
      window.fetch = async (u, o) => {
        if (String(u).startsWith('/api/')) return real(u, o);
        window.__fetched.push([String(u), o.redirect, o.credentials]);
        return a === 'manual' ? { type: 'opaqueredirect', ok: false, status: 0, statusText: '', redirected: false, url: String(u), body: null }
          : { type: 'cors', ok: true, status: 200, statusText: 'OK', redirected: true, url: a, body: new Response(new Uint8Array([80, 75, 5, 6])).body };
      };
    }, answer);
    await page.dialogButton('Open');
    await page.waitFor((m) => window.__console().includes(m), [msg], { what: msg, timeout: 30000 }).catch(async (e) => { throw new Error(`${e.message}\n${await page.consoleText()}`); });
    assert.deepEqual(await page.eval(() => window.__fetched), [['https://example.org/lecture3.zip', 'manual', 'omit']]);
    assert.deepEqual(await consoleWarnings(page), [], 'no warnings');
  }
  assert.deepEqual(await projects(), before);
  assert.equal(await exists('lecture3'), false);
});

uiTest('#2829 a link never sets the local server\'s token: only its own address (the token alone) does; the link still opened', E, async (page) => {
  await openLink(page, 'token=evilEvil1&open=example:gates', 't=1');
  await linkOpened(page);
  await page.waitConsole(/Opened 'gates' from a link/);
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), null);
  await openLink(page, 'token=good-Token_2', 't=2');
  await page.waitFor(() => window.Silinx.startupChecked, [], { what: 'boot' });
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), 'good-Token_2');
  assert.equal(await page.eval(() => location.hash), '');
  // a link afterwards keeps it
  await openLink(page, 'token=evilEvil3&open=example:gates', 't=3');
  await linkOpened(page);
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), 'good-Token_2');
});

uiTest('#2826 in Portuguese: Copy Link… and the replace question', E, async (page) => {
  await openLink(page, 'open=example:gates');
  await linkOpened(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Ficheiro', 'Partilhar Projeto…');
  assert.equal(await page.waitDialog('Partilhar Projeto'), 'Partilhar Projeto');
  const t = await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').innerText);
  for (const s of ['Abrir em:', 'Abrir só o projeto', 'Experimentar (a simulação de um desenho)', 'Incluir a vista atual: os separadores abertos, a divisão, os painéis', 'Módulo:', 'Placa:', 'Uma ligação que abre \'gates\' no Silinx', 'caracteres']) assert.ok(t.includes(s), `${s} in:\n${t}`);
  // the simulation's Module list: the test bench, marked the project's (#2878)
  await page.eval(() => { const v = document.querySelector('.dlg-overlay select[data-field=view]'); v.value = 'simulate'; v.dispatchEvent(new Event('change')); });
  assert.deepEqual(await page.waitFor(() => { const o = [...document.querySelectorAll('.dlg-overlay select[data-field=module] option')].map((x) => x.textContent); return o.length && o; }, [], { what: 'the test benches' }), ['tb_gates (o do projeto)']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Copiar Ligação', 'Cancelar']);
  await page.dialogButton('Cancelar');
  await writeWs(env, 'gates', 'sim/tb_gates.vhd', '-- mine\n');
  await openLink(page, 'open=example:gates', 'l=pt');
  await page.waitDialog('Abrir a partir de uma Ligação');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^Já existe um projeto chamado 'gates', com alterações próprias\./);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Abrir como gates_2', 'Substituir', 'Manter o Meu']);
  await page.dialogButton('Manter o Meu');
  await linkOpened(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
