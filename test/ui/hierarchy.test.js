// UI: the Design pane's hierarchy (#207, #220): one row per module / instance, its base's icon on the
// left and a badge for each of its views after its name: the drawing's first ([Schematic] [ASM] [FSM]
// [Table] [Petri], the base, marked), its HDL's last, named by its language ([VHDL] / [Verilog]: first
// only when the module is only HDL); no child rows for the views. The examples in both views
// (Implementation / Simulation); a badge opens its view, its right-click shows that view's commands
// (no Convert to HDL / HDL as base / Remove Synchronized …, #220); the module's menu (no truth table
// of the module, no Export as ISE Schematic); a schematic's block (#175) is a plain HDL module; every
// source has its HDL: a new drawing of every kind gets its HDL file at once (in the project's
// preferred language), a project with a drawing without one gets it when it is opened; a project
// whose drawing had its HDL as the base (before #220) gets the drawing as the base without losing
// anything; the keyboard; Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';
import { viewHdl } from '../../core/view-hdl.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the tree (the collapsed ones too), indented by its depth: "icon label [base*] [badge] (meta)"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}]`);
  return `${'  '.repeat(d - 1)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
// the badges' tips of the rows that have badges: "label: badge (tip) badge (tip)"
const tips = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.badge'))
  .map((r) => `${r.querySelector('.lbl').textContent}: ${[...r.querySelectorAll('.badge')].map((b) => `${b.textContent} (${b.title})`).join(' ')}`));
const view = async (page, v) => { await page.click(`input[name=view][value=${v}]`); await page.waitFor((x) => window.Silinx.view === x, [v]); };
// the badge `text` of the row `label` (a click, a right-click)
const badge = async (page, label, text, opts = {}) => {
  const at = await page.waitFor((l, t) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl').textContent === l && x.getClientRects().length);
    const b = r && [...r.querySelectorAll('.badge')].find((x) => x.textContent === t);
    if (!b) return null;
    const k = b.getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  }, [label, text], { what: `badge ${text} of ${label}` });
  return page.click(at, opts);
};
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
const badgeMenu = async (page, label, text) => { await badge(page, label, text, { button: 'right' }); const m = await menuLabels(page); await page.closeMenus(); return m; };
// what the last opening of a project logged about its sources (before its "Project … opened" line):
// the lines on its files, the warnings and the errors
const consoleAfterOpen = async (page) => {
  const lines = (await page.consoleText()).split('\n');
  const opened = lines.flatMap((l, i) => (/^Project ".*" opened/.test(l) ? [i] : []));
  return lines.slice(opened.length > 1 ? opened.at(-2) + 1 : 0, opened.at(-1)).filter((l) => /^(WARNING|ERROR)\b|^src\//.test(l));
};

const EXAMPLES = {
  gates: {
    impl: [
      'project H_gates',
      '  chip xc3s250e-4-cp132',
      '    moduleTop gates [Schematic*] [VHDL] (gates.sch.json)',
      '    ucf gates.ucf',
    ],
    sim: [
      'project H_gates',
      '  sim Behavioral',
      '    vhdl tb_gates [VHDL*] (tb_gates.vhd)',
      '      schematic uut - gates [Schematic*] [VHDL] (gates.sch.json)',
    ],
    tips: ['gates: Schematic (Base: its HDL is generated from it) VHDL (Generated from the schematic)'],
  },
  traffic: {
    impl: [
      'project H_traffic',
      '  chip xc3s250e-4-cp132',
      '    moduleTop top [VHDL*] (top.vhd)',
      '      fsm u_fsm - traffic [FSM*] [VHDL] (traffic.fsm.json)',
      '      vhdl u_timer - timer [VHDL*] (timer.vhd)',
      '      truthtable u_lamps - lamps [Table*] [VHDL] (lamps.tt.json)',
      '      verilog u_display - sevenseg [Verilog*] (sevenseg.v)',
      '    ucf traffic.ucf',
    ],
    sim: [
      'project H_traffic',
      '  sim Behavioral',
      '    vhdl tb_traffic [VHDL*] (tb_traffic.vhd)',
      '      vhdl uut - top [VHDL*] (top.vhd)',
      '        fsm u_fsm - traffic [FSM*] [VHDL] (traffic.fsm.json)',
      '        vhdl u_timer - timer [VHDL*] (timer.vhd)',
      '        truthtable u_lamps - lamps [Table*] [VHDL] (lamps.tt.json)',
      '        verilog u_display - sevenseg [Verilog*] (sevenseg.v)',
    ],
    tips: [
      'top: VHDL (Open)',
      'u_fsm - traffic: FSM (Base: its HDL is generated from it) VHDL (Generated from the state diagram)',
      'u_timer - timer: VHDL (Open)',
      'u_lamps - lamps: Table (Base: its HDL is generated from it) VHDL (Generated from the truth table)',
      'u_display - sevenseg: Verilog (Open)',
    ],
  },
  blinky: {
    impl: [
      'project H_blinky',
      '  chip xc3s250e-4-cp132',
      '    moduleTop top [VHDL*] (top.vhd)',
      '      verilog u_pre - prescaler [Verilog*] (counter.v)',
      '      asm u_speed - speed_ctrl [ASM*] [VHDL] (speed_ctrl.asm.json)',
      '      vhdl u_knight - knight [VHDL*] (knight.vhd)',
      '    ucf top.ucf',
    ],
    sim: [
      'project H_blinky',
      '  sim Behavioral',
      '    vhdl tb_top [VHDL*] (tb_top.vhd)',
      '      vhdl uut - top [VHDL*] (top.vhd)',
      '        verilog u_pre - prescaler [Verilog*] (counter.v)',
      '        asm u_speed - speed_ctrl [ASM*] [VHDL] (speed_ctrl.asm.json)',
      '        vhdl u_knight - knight [VHDL*] (knight.vhd)',
    ],
    tips: [
      'top: VHDL (Open)',
      'u_pre - prescaler: Verilog (Open)',
      'u_speed - speed_ctrl: ASM (Base: its HDL is generated from it) VHDL (Generated from the state machine)',
      'u_knight - knight: VHDL (Open)',
    ],
  },
};

for (const [ex, want] of Object.entries(EXAMPLES)) {
  uiTest(`Design pane (#207, #220), the example ${ex}: one row per module, its views as badges after its name (the drawing's first, its HDL's last), in the Implementation and Simulation views`, E, async (page) => {
    await makeProject(env, { name: `H_${ex}`, template: ex });
    await page.openProject(`H_${ex}`);
    await page.waitFor((n) => document.querySelectorAll('#hier .row').length === n, [want.impl.length], { what: 'the Implementation hierarchy' });
    assert.deepEqual(await rows(page), want.impl);
    // the badges tell what they are: the drawing the base, its HDL generated from it
    assert.deepEqual(await tips(page), want.tips);
    await view(page, 'sim');
    await page.waitFor((n) => document.querySelectorAll('#hier .row').length === n, [want.sim.length], { what: 'the Simulation hierarchy' });
    assert.deepEqual(await rows(page), want.sim);
    await view(page, 'impl');
    assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR|generated from|made again|base/);
  });
}

// the menus of every module's row and badge in the examples: none of the commands removed by #220
uiTest('Design pane (#220): a badge opens its view, its right-click shows that view\'s commands; the module\'s menu; no Convert to HDL, HDL as base, Remove Synchronized, truth table of a module, Export as ISE Schematic on a module', E, async (page) => {
  await makeProject(env, { name: 'H_badges', template: 'gates' });
  await page.openProject('H_badges');
  await badge(page, 'gates', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd', [], { what: 'the HDL opened by its badge' });
  // its banner: generated from the schematic (its edits update the schematic)
  await page.waitFor(() => (() => { const b = document.querySelector('.doc:not([hidden]) [data-sync-banner]'); return !!b && b.hidden && b.textContent === ''; })(), [], { what: 'the HDL editor\'s banner' });
  await badge(page, 'gates', 'Schematic');
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/gates.sch.json', [], { what: 'the schematic opened by its badge' });
  // the row stays selected: its processes, the drawing's first (none to convert it or move its base)
  assert.equal(await page.eval(() => document.querySelector('#hier .row.sel .lbl').textContent), 'gates');
  const procs = await page.eval(() => [...document.querySelectorAll('#procs .lbl')].map((l) => l.textContent));
  assert.deepEqual(procs.slice(0, 2), ['View/Edit Schematic', 'Design Summary/Reports']);
  assert.ok(!procs.some((p) => /Convert to HDL|as base|Generate HDL/.test(p)), procs.join(' | '));
  // the schematic's commands (Export as ISE Schematic on the schematic, not on the module)
  assert.deepEqual(await badgeMenu(page, 'gates', 'Schematic'), ['Open', 'Export as ISE Schematic (.sch)…', 'Remove from Project']);
  // the HDL's: the module's, the same as the row's
  const MODULE = ['Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Create Test Bench (Wizard)…', 'New Source…', 'Add Copy of Source…', 'Remove from Project', 'Source Properties…'];
  assert.deepEqual(await badgeMenu(page, 'gates', 'VHDL'), MODULE);
  await page.treeRow('#hier', 'gates', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), MODULE);
  await page.closeMenus();
  // the HDL editor's menu opens the schematic
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor);
  const at = await page.eval(() => { const r = document.querySelector('.doc:not([hidden]) .CodeMirror').getBoundingClientRect(); return { x: r.left + 80, y: r.top + 40 }; });
  await page.click(at, { button: 'right' });
  const ed = await menuLabels(page);
  await page.closeMenus();
  assert.equal(ed.at(-1), 'Open Schematic', ed.join(' | '));
  assert.ok(!ed.some((l) => /Synchronized/.test(l)), ed.join(' | '));

  // the other drawings' badges: theirs only
  await makeProject(env, { name: 'H_badges2', template: 'traffic' });
  await page.openProject('H_badges2');
  assert.deepEqual(await badgeMenu(page, 'u_fsm - traffic', 'FSM'), ['Open', 'Convert to ASM chart', 'Remove from Project']);
  assert.deepEqual(await badgeMenu(page, 'u_lamps - lamps', 'Table'), ['Open', 'Remove from Project']);
  const PLAIN = ['Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Create Test Bench (Wizard)…',
    'Convert to Schematic (editable)…', 'Convert to State Machine (ASM)…', 'Convert to State Diagram (FSM)…', 'New Source…', 'Add Copy of Source…', 'Remove from Project', 'Source Properties…'];
  assert.deepEqual(await badgeMenu(page, 'u_timer - timer', 'VHDL'), PLAIN);
  assert.deepEqual(await badgeMenu(page, 'u_display - sevenseg', 'Verilog'), PLAIN);
  assert.deepEqual(await badgeMenu(page, 'u_lamps - lamps', 'VHDL'), MODULE);
  await makeProject(env, { name: 'H_badges3', template: 'blinky' });
  await page.openProject('H_badges3');
  assert.deepEqual(await badgeMenu(page, 'u_speed - speed_ctrl', 'ASM'), ['Open', 'Convert to State Diagram (FSM)…', 'Remove from Project']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

// the user's case: a schematic with a block (a 2-to-4 decoder with enable, an entity of its own in
// the schematic's HDL, #175), the schematic alone in the project (no HDL file, #177)
function esqDoc() {
  const doc = newDoc('esq', 'vhdl');
  const s = { id: 'S1', type: 'decoder', x: 200, y: 200, rot: 0, mirror: false, name: 'XLXI_1', params: { n: 2, en: true } };
  doc.symbols.push(s);
  for (const p of symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {})) {
    const at = { x: p.x + (p.dir === 'in' ? -40 : 40), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name: p.name.toLowerCase(), dir: p.dir, width: p.width || 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${doc.wires.length + 1}`, points: [at, { x: p.x, y: p.y }] });
  }
  return doc;
}

uiTest('every source has its HDL (#207): a schematic without an HDL file gets it when the project is opened; its block is a plain HDL module, never with the schematic\'s badge', E, async (page) => {
  const doc = esqDoc();
  const text = JSON.stringify(doc, null, 1);
  await makeProject(env, { name: 'teste', files: { 'src/esq.sch.json': text }, top: 'esq' });
  await page.openProject('teste');
  await page.waitConsole(/src\/esq\.vhd generated from src\/esq\.sch\.json \(every source has its HDL\)/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/esq.vhd'] === 'src/esq.sch.json', [], { what: 'linked' });
  // the file: the HDL made for the schematic, linked to it (the schematic the base), in the project
  assert.equal(await readWs(env, 'teste', 'src/esq.vhd'), viewHdl('src/esq.sch.json', text).text);
  const saved = JSON.parse(await readWs(env, 'teste', 'src/esq.sch.json'));
  assert.deepEqual([saved.generatedFile, saved.base], ['src/esq.vhd', undefined]);
  assert.ok((await page.eval(() => window.Silinx.project.files.map((f) => f.path))).includes('src/esq.vhd'));
  // logged once
  assert.equal((await page.consoleText()).match(/generated from src\/esq\.sch\.json/g).length, 1);
  assert.deepEqual(await rows(page), [
    'project teste',
    '  chip xc3s250e-4-cp132',
    '    moduleTop esq [Schematic*] [VHDL] (esq.sch.json)',
    '      vhdl xlxi_1 - esq_d2_4e [VHDL*] (esq.vhd)',
  ]);
  // the block's commands: the HDL module's, none of the schematic's
  await page.treeRow('#hier', 'xlxi_1 - esq_d2_4e', { right: true });
  assert.deepEqual(await menuLabels(page), ['Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Create Test Bench (Wizard)…', 'New Source…', 'Add Copy of Source…', 'Remove from Project', 'Source Properties…']);
  await page.closeMenus();
  // opened again: nothing more to generate, the same rows
  await page.openProject('teste');
  await page.waitFor(() => document.querySelectorAll('#hier .row').length === 4);
  assert.equal((await page.consoleText()).match(/generated from src\/esq\.sch\.json/g).length, 1);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

// New Source of every drawn type: its HDL file at once, in the project's preferred language; the
// row with both badges, the drawing's first
const KINDS = [
  { type: 'sch', name: 'g1', file: 'src/g1.sch.json', ico: 'schematic', badge: 'Schematic', id: 'sch:src/g1.sch.json' },
  { type: 'asm', name: 'c1', file: 'src/c1.asm.json', ico: 'asm', badge: 'ASM', id: 'asm:src/c1.asm.json' },
  { type: 'fsm', name: 'f1', file: 'src/f1.fsm.json', ico: 'fsm', badge: 'FSM', id: 'fsm:src/f1.fsm.json' },
  { type: 'tt', name: 't1', file: 'src/t1.tt.json', ico: 'truthtable', badge: 'Table', id: 'tt:src/t1.tt.json' },
  { type: 'petri', name: 'p1', file: 'src/p1.pn.json', ico: 'petri', badge: 'Petri', id: 'pn:src/p1.pn.json' },
];
for (const [lang, L, ext] of [['vhdl', 'VHDL', 'vhd'], ['verilog', 'Verilog', 'v']]) {
  uiTest(`every source has its HDL (#207): New Source of a schematic, ASM chart, state diagram, truth table and Petri net creates its HDL file at once; its row: [drawing*] [${L}] (preferred language ${L}, #220)`, E, async (page) => {
    const pj = `H_new_${lang}`;
    await makeProject(env, { name: pj, top: '', preferredLanguage: lang });
    await page.openProject(pj);
    for (const k of KINDS) {
      await page.eval(async (t) => { (await import('/js/wizards.js')).newSourceWizard({ type: t }); }, k.type);
      await page.waitDialog('New Source Wizard');
      await page.dialogButton('Next >');
      await page.fill('.dlg-overlay .wiz-main input[type=text]', k.name);
      await page.dialogButton('Next >');
      await page.dialogButton('Finish');
      await page.waitNoDialog();
      await page.waitFor((id) => window.Silinx.active?.id === id, [k.id], { what: `the editor of ${k.file}` });
      const hdl = `src/${k.name}.${ext}`;
      await page.waitConsole(new RegExp(`${hdl.replace('.', '\\.')} generated from ${k.file.replace(/\./g, '\\.')} \\(every source has its HDL\\)`));
      await page.waitFor((f, h) => window.Silinx.hdlToSch?.[h] === f, [k.file, hdl], { what: `${k.file} linked to ${hdl}` });
      const d = JSON.parse(await readWs(env, pj, k.file));
      assert.equal(d.generatedFile, hdl, k.file);
      assert.equal(await readWs(env, pj, hdl), viewHdl(k.file, JSON.stringify({ ...d, generatedFile: undefined })).text, hdl);
      await page.waitFor((n) => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent === n), [k.name]);
      const row = (await rows(page)).find((r) => r.trim().startsWith(`${k.ico} ${k.name} `));
      assert.equal(row?.trim(), `${k.ico} ${k.name} [${k.badge}*] [${L}] (${k.file.split('/').pop()})`);
    }
    assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  });
}

uiTest('Design pane (#207) from the keyboard: ↑ / ↓ select, ← / → collapse / expand, Enter opens the base, Tab reaches the selected row\'s badges, Enter on a badge opens that view', E, async (page) => {
  await makeProject(env, { name: 'H_keys', template: 'traffic' });
  await page.openProject('H_keys');
  await page.treeRow('#hier', 'top', { exact: true });
  await page.eval(() => document.querySelector('#hier .tree').focus());
  const sel = () => page.eval(() => document.querySelector('#hier .row.sel .lbl').textContent);
  await page.key('ArrowDown');
  assert.equal(await sel(), 'u_fsm - traffic');
  await page.key('ArrowDown');
  assert.equal(await sel(), 'u_timer - timer');
  await page.key('ArrowUp');
  assert.equal(await sel(), 'u_fsm - traffic');
  // ←: to the parent, again: collapsed; →: expanded
  await page.key('ArrowLeft');
  assert.equal(await sel(), 'top');
  await page.key('ArrowLeft');
  assert.equal(await page.eval(() => document.querySelector('#hier [data-key="m:top"]').nextElementSibling.hidden), true);
  await page.key('ArrowRight');
  assert.equal(await page.eval(() => document.querySelector('#hier [data-key="m:top"]').nextElementSibling.hidden), false);
  await page.key('ArrowRight');
  assert.equal(await sel(), 'u_fsm - traffic');
  // Enter: the base (the state diagram)
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the state diagram opened from the keyboard' });
  // Tab: the badges of the selected row ([FSM] first, then [VHDL]), Enter opens it
  await page.eval(() => document.querySelector('#hier .tree').focus());
  const at = () => page.eval(() => document.activeElement.closest('.row')?.querySelector('.lbl').textContent + ' ' + document.activeElement.textContent);
  await page.key('Tab');
  assert.equal(await at(), 'u_fsm - traffic FSM');
  await page.key('Tab');
  assert.equal(await at(), 'u_fsm - traffic VHDL');
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/traffic.vhd', [], { what: 'the HDL opened from its badge' });
  // only the selected row's badges are on the Tab path
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .badge[tabindex="0"]')].map((b) => b.closest('.row').querySelector('.lbl').textContent + ':' + b.textContent)), ['u_fsm - traffic:FSM', 'u_fsm - traffic:VHDL']);
});

uiTest('Design pane (#207, #220) in Portuguese: the badges [FSM] [Tabela] [VHDL] [Verilog] and their tips; a badge\'s menu', E, async (page) => {
  await makeProject(env, { name: 'H_pt', template: 'traffic' });
  await page.openProject('H_pt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.textContent === 'Tabela'), [], { what: 'the badges in Portuguese' });
    assert.deepEqual(await tips(page), [
      'top: VHDL (Abrir)',
      'u_fsm - traffic: FSM (Base: o seu HDL é gerado a partir daqui) VHDL (Gerado a partir do diagrama de estados)',
      'u_timer - timer: VHDL (Abrir)',
      'u_lamps - lamps: Tabela (Base: o seu HDL é gerado a partir daqui) VHDL (Gerado a partir da tabela de verdade)',
      'u_display - sevenseg: Verilog (Abrir)',
    ]);
    assert.deepEqual(await badgeMenu(page, 'u_lamps - lamps', 'Tabela'), ['Abrir', 'Remover do Projeto']);
    assert.deepEqual(await badgeMenu(page, 'u_fsm - traffic', 'FSM'), ['Abrir', 'Converter para fluxograma ASM', 'Remover do Projeto']);
    // the HDL editor's banner
    await badge(page, 'u_lamps - lamps', 'VHDL');
    await page.waitFor(() => (() => { const b = document.querySelector('.doc:not([hidden]) [data-sync-banner]'); return !!b && b.hidden && b.textContent === ''; })(), [], { what: 'the banner in Portuguese' });
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

// ---- projects made before #220: a drawing whose base was its HDL (`base: 'hdl'`) gets the drawing
// as the base, nothing lost; logged
// a file of an example as it ships
const example = (ex, file) => fs.readFileSync(new URL(`../../examples/${ex}/${file}`, import.meta.url), 'utf8');
const withBase = (ex, file) => ({ ...JSON.parse(example(ex, file)), base: 'hdl' });
const NOTE = '-- my own note, written by hand\n';

uiTest('a drawing whose base was its HDL (before #220), its HDL what the drawing makes: the drawing made the base, nothing else changed', E, async (page) => {
  const vhd = example('gates', 'src/gates.vhd');
  const sch = withBase('gates', 'src/gates.sch.json');
  await makeProject(env, { name: 'H_mig_same', template: 'gates', files: { 'src/gates.sch.json': JSON.stringify(sch, null, 1) } });
  await page.openProject('H_mig_same');
  await page.waitConsole(/src\/gates\.sch\.json is now the base/);
  assert.deepEqual(await consoleAfterOpen(page), [
    'src/gates.sch.json is now the base of src/gates.vhd (its base until now): that file is what the schematic makes, generated from it from now on.',
  ]);
  const saved = JSON.parse(await readWs(env, 'H_mig_same', 'src/gates.sch.json'));
  assert.deepEqual(saved, JSON.parse(JSON.stringify({ ...sch, base: undefined })));   // linked, no base
  assert.equal(await readWs(env, 'H_mig_same', 'src/gates.vhd'), vhd);
  assert.deepEqual(await rows(page), EXAMPLES.gates.impl.map((r) => r.replace('H_gates', 'H_mig_same')));
  // opened again: nothing more to do
  await page.openProject('H_mig_same');
  assert.deepEqual(await consoleAfterOpen(page), []);
});

uiTest('drawings whose base was their HDL (before #220), the HDL edited by hand: the state diagram, the truth table and the ASM chart made again from it and made the base, the HDL kept as it is (said)', E, async (page) => {
  const files = {};
  for (const [ex, f, hdl] of [['traffic', 'src/traffic.fsm.json', 'src/traffic.vhd'], ['traffic', 'src/lamps.tt.json', 'src/lamps.vhd'], ['blinky', 'src/speed_ctrl.asm.json', 'src/speed_ctrl.vhd']]) {
    (files[ex] ||= {})[f] = JSON.stringify(withBase(ex, f), null, 2);
    files[ex][hdl] = NOTE + example(ex, hdl);
  }
  await makeProject(env, { name: 'H_mig_fsm', template: 'traffic', files: files.traffic });
  await page.openProject('H_mig_fsm');
  await page.waitConsole(/src\/traffic\.fsm\.json made again/);
  assert.deepEqual(await consoleAfterOpen(page), [
    'src/lamps.tt.json made again from src/lamps.vhd (its base until now) and now its base: that file is generated from the truth table from now on.',
    'WARNING: src/lamps.tt.json: src/lamps.vhd is not what the truth table makes (edited by hand): it is kept as it is until the truth table is edited, which rewrites it',
    'src/traffic.fsm.json made again from src/traffic.vhd (its base until now) and now its base: that file is generated from the state diagram from now on.',
    'WARNING: src/traffic.fsm.json: src/traffic.vhd is not what the state diagram makes (edited by hand): it is kept as it is until the state diagram is edited, which rewrites it',
  ]);
  for (const [f, hdl] of [['src/traffic.fsm.json', 'src/traffic.vhd'], ['src/lamps.tt.json', 'src/lamps.vhd']]) {
    const d = JSON.parse(await readWs(env, 'H_mig_fsm', f));
    assert.deepEqual([d.generatedFile, d.base], [hdl, undefined], f);
    assert.equal(await readWs(env, 'H_mig_fsm', hdl), files.traffic[hdl], hdl);   // the user's HDL, as it was
  }
  assert.deepEqual(await rows(page), EXAMPLES.traffic.impl.map((r) => r.replace('H_traffic', 'H_mig_fsm')));
  await page.openProject('H_mig_fsm');
  assert.deepEqual(await consoleAfterOpen(page), []);

  await makeProject(env, { name: 'H_mig_asm', template: 'blinky', files: files.blinky });
  await page.openProject('H_mig_asm');
  await page.waitConsole(/src\/speed_ctrl\.asm\.json made again/);
  assert.deepEqual(await consoleAfterOpen(page), [
    'src/speed_ctrl.asm.json made again from src/speed_ctrl.vhd (its base until now) and now its base: that file is generated from the state machine from now on.',
    'WARNING: src/speed_ctrl.asm.json: the file was changed by hand after it was generated: regenerating it from the chart will rewrite it in the generator style',
  ]);
  const a = JSON.parse(await readWs(env, 'H_mig_asm', 'src/speed_ctrl.asm.json'));
  assert.deepEqual([a.generatedFile, a.base], ['src/speed_ctrl.vhd', undefined]);
  assert.equal(await readWs(env, 'H_mig_asm', 'src/speed_ctrl.vhd'), files.blinky['src/speed_ctrl.vhd']);
  assert.deepEqual(await rows(page), EXAMPLES.blinky.impl.map((r) => r.replace('H_blinky', 'H_mig_asm')));
});

uiTest('drawings whose base was their HDL (before #220) that cannot be made again from it (a schematic, HDL the diagram cannot show): the HDL kept as a plain module, the drawing out of the project (its file kept)', E, async (page) => {
  // a schematic whose VHDL was edited by hand
  const vhd = NOTE + example('gates', 'src/gates.vhd');
  const sch = withBase('gates', 'src/gates.sch.json');
  await makeProject(env, { name: 'H_mig_sch', template: 'gates', files: { 'src/gates.sch.json': JSON.stringify(sch, null, 1), 'src/gates.vhd': vhd } });
  await page.openProject('H_mig_sch');
  await page.waitConsole(/src\/gates\.sch\.json is removed from the project/);
  assert.deepEqual(await consoleAfterOpen(page), [
    'WARNING: src/gates.sch.json had its HDL src/gates.vhd as the base and cannot be made again from it (gates.vhd is not what the schematic makes): src/gates.vhd is kept as it is, a plain HDL module, and src/gates.sch.json is removed from the project (the file stays in the project folder).',
  ]);
  assert.equal(await readWs(env, 'H_mig_sch', 'src/gates.vhd'), vhd);
  const left = JSON.parse(await readWs(env, 'H_mig_sch', 'src/gates.sch.json'));
  assert.deepEqual(left, JSON.parse(JSON.stringify({ ...sch, base: undefined, generatedFile: undefined })));   // the drawing, kept
  assert.deepEqual(await page.eval(() => window.Silinx.project.excluded), ['src/gates.sch.json']);
  assert.deepEqual(await rows(page), [
    'project H_mig_sch',
    '  chip xc3s250e-4-cp132',
    '    moduleTop gates [VHDL*] (gates.vhd)',
    '    ucf gates.ucf',
  ]);
  await page.openProject('H_mig_sch');
  assert.deepEqual(await consoleAfterOpen(page), []);

  // a state diagram whose VHDL is no longer a state machine
  const plain = `library ieee; use ieee.std_logic_1164.all;
entity traffic is
    port (clk, rst, req, done, night : in std_logic; phase : out std_logic_vector(2 downto 0));
end entity traffic;
architecture rtl of traffic is
begin
    phase <= night & req & done;
end architecture rtl;
`;
  const fsm = withBase('traffic', 'src/traffic.fsm.json');
  await makeProject(env, { name: 'H_mig_plain', template: 'traffic', files: { 'src/traffic.fsm.json': JSON.stringify(fsm, null, 2), 'src/traffic.vhd': plain } });
  await page.openProject('H_mig_plain');
  await page.waitConsole(/src\/traffic\.fsm\.json is removed from the project/);
  const lines = await consoleAfterOpen(page);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^WARNING: src\/traffic\.fsm\.json had its HDL src\/traffic\.vhd as the base and cannot be made again from it \(the diagram cannot show it: .+\): src\/traffic\.vhd is kept as it is, a plain HDL module, and src\/traffic\.fsm\.json is removed from the project \(the file stays in the project folder\)\.$/);
  assert.equal(await readWs(env, 'H_mig_plain', 'src/traffic.vhd'), plain);
  assert.equal(JSON.parse(await readWs(env, 'H_mig_plain', 'src/traffic.fsm.json')).generatedFile, undefined);
  assert.deepEqual(await rows(page), [
    'project H_mig_plain',
    '  chip xc3s250e-4-cp132',
    '    moduleTop top [VHDL*] (top.vhd)',
    '      vhdl u_fsm - traffic [VHDL*] (traffic.vhd)',
    '      vhdl u_timer - timer [VHDL*] (timer.vhd)',
    '      truthtable u_lamps - lamps [Table*] [VHDL] (lamps.tt.json)',
    '      verilog u_display - sevenseg [Verilog*] (sevenseg.v)',
    '    ucf traffic.ucf',
  ]);
});

// a drawing's HDL language (its editor's HDL language, a schematic's Language): its HDL file made again in it, the other one
// removed (no Generate HDL any more, #220)
uiTest('a drawing\'s HDL language changed in its editor (ASM chart, state diagram, Petri net; a schematic\'s Language): its HDL file made again in that language, the other one removed (#220)', E, async (page) => {
  await makeProject(env, { name: 'H_lang', top: '' });
  await page.openProject('H_lang');
  for (const k of KINDS.filter((x) => x.type !== 'tt')) {
    await page.eval(async (t) => { (await import('/js/wizards.js')).newSourceWizard({ type: t }); }, k.type);
    await page.waitDialog('New Source Wizard');
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', k.name);
    await page.dialogButton('Next >');
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    await page.waitFor((id) => window.Silinx.active?.id === id, [k.id], { what: `the editor of ${k.file}` });
    await page.waitFor((f, h) => window.Silinx.hdlToSch?.[h] === f, [k.file, `src/${k.name}.vhd`], { what: `${k.file} linked to its VHDL` });
    for (const [lang, ext, other, L] of [['verilog', 'v', 'vhd', 'Verilog'], ['vhdl', 'vhd', 'v', 'VHDL']]) {
      await page.eval((l) => { const s = document.querySelector('.doc:not([hidden]) select[title="HDL language"]') || [...document.querySelectorAll('.doc:not([hidden]) .se-field')].find((f) => f.querySelector('label').textContent === 'Language').querySelector('select'); s.value = l; s.dispatchEvent(new Event('change')); }, lang);
      await page.waitFor((f, h, o) => window.Silinx.hdlToSch?.[h] === f && !window.Silinx.fileTree.includes(o), [k.file, `src/${k.name}.${ext}`, `src/${k.name}.${other}`], { what: `${k.file} in ${L}`, timeout: 15000 });
      await page.waitConsole(new RegExp(`${k.file.replace(/\./g, '\\.')}: its HDL is now in ${L}, src/${k.name}\\.${ext} \\(src/${k.name}\\.${other} removed\\)`));
      const d = JSON.parse(await readWs(env, 'H_lang', k.file));
      assert.deepEqual([d.lang, d.generatedFile], [lang, `src/${k.name}.${ext}`], k.file);
      assert.equal(await readWs(env, 'H_lang', `src/${k.name}.${ext}`), viewHdl(k.file, JSON.stringify({ ...d, generatedFile: undefined })).text);
      // the links and the file tree are set while the project is read again, the Design pane drawn after it
      await page.waitFor((n, l) => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent === n
        && [...r.querySelectorAll('.badge')].some((b) => b.textContent === l)), [k.name, L], { what: `the row of ${k.name} with [${L}]` });
      const row = (await rows(page)).find((r) => r.trim().startsWith(`${k.ico} ${k.name} `));
      assert.equal(row?.trim(), `${k.ico} ${k.name} [${k.badge}*] [${L}] (${k.file.split('/').pop()})`);
    }
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
