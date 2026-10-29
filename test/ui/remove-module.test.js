// UI: Remove from Project of a drawn module (#234). A module drawn as a Petri net, schematic, truth
// table, ASM chart or state diagram has one row in the Design pane, its HDL file generated from the
// drawing (#207, #220). Remove from Project there (the row's menu, the drawing's badge, the HDL's
// badge) removes the drawing and its HDL file together, one command: one Undo brings both back, linked
// as before, Redo removes both again; both files stay in the project folder, unchanged. The Files view
// removes one file: the drawing alone leaves its HDL file a plain HDL module (its HDL file alone: the
// drawing a module by itself with [No HDL], #231, test/ui/hdl-clash.test.js). Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';
import { newDoc } from '../../core/schdoc.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the tree, indented by its depth: "icon label [base*] [badge] (meta)"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}${x.classList.contains('warn') ? '!' : ''}]`);
  return `${'  '.repeat(d - 1)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').filter((l) => re.test(l));
const topText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent);
const project = (name) => env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
const pjFiles = async (name) => (await project(name)).files.map((f) => f.path);
const excluded = async (name) => (await project(name)).excluded || [];
const linkedTo = (page, hdl, file) => page.waitFor((h, f) => window.Silinx.hdlToSch?.[h] === f, [hdl, file], { what: `${file} linked to ${hdl}` });
const noRows = (page) => page.waitFor(() => document.querySelectorAll('#hier .row').length === 2, [], { what: 'the module out of the Design pane' });
// the badge `text` of the row `label` (a right-click)
const badgeRight = async (page, label, text) => {
  const at = await page.waitFor((l, t) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl').textContent === l && x.getClientRects().length);
    const b = r && [...r.querySelectorAll('.badge')].find((x) => x.textContent === t);
    if (!b) return null;
    const k = b.getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  }, [label, text], { what: `badge ${text} of ${label}` });
  return page.click(at, { button: 'right' });
};
const filesRow = (page, file) => page.waitFor((f) => { const i = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === f); return i >= 0 ? i + 1 : 0; }, [file], { what: `${file} in the Files view` }).then((i) => i - 1);
// the question of Remove from Project: its text; answered
const answer = async (page, button = 'Yes', title = 'Remove Source') => {
  await page.waitDialog(title);
  const text = await topText(page);
  await page.dialogButton(button);
  await page.waitNoDialog();
  return text;
};

const DRAWN = [
  { kind: 'Petri net', file: 'src/ctl.pn.json', mod: 'ctl', ico: 'petri', badge: 'Petri', model: newPetri('ctl', 'vhdl') },
  { kind: 'schematic', file: 'src/gate.sch.json', mod: 'gate', ico: 'schematic', badge: 'Schematic', model: newDoc('gate', 'vhdl') },
  { kind: 'truth table', file: 'src/maj.tt.json', mod: 'maj', ico: 'truthtable', badge: 'Algebra', views: ' [Schematic]', model: { ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', table: { f: '00010111' } } },
  { kind: 'ASM chart', file: 'src/seq.asm.json', mod: 'seq', ico: 'asm', badge: 'ASM', model: newModel('seq', 'vhdl') },
  { kind: 'state diagram', file: 'src/st.fsm.json', mod: 'st', ico: 'fsm', badge: 'FSM', model: newFsm('st', 'vhdl') },
];
const QUESTION = (d, hdl) => `Remove '${d}' and its HDL file '${hdl}' from the project?\n(The files stay in the project folder: Undo or Add to Project in the Files view brings them back.)`;
const REMOVED = (d, hdl) => `Removed ${d} and its HDL file ${hdl} from the project (the files are kept in the project folder).`;
const ROWS = (name, k) => [`project ${name}`, '  chip xc3s250e-4-cp132', `    moduleTop ${k.mod} [${k.badge}*]${k.views || ''} [VHDL] (${k.file.split('/').pop()})`];

// the drawing alone in the project: its HDL file generated and linked when the project is opened (#207)
async function openDrawn(page, name, k) {
  await makeProject(env, { name, top: k.mod, files: { [k.file]: JSON.stringify(k.model, null, 2) } });
  await page.openProject(name);
  const hdl = `src/${k.mod}.vhd`;
  await linkedTo(page, hdl, k.file);
  assert.deepEqual(await rows(page), ROWS(name, k));
  assert.deepEqual(await pjFiles(name), [hdl]);
  return hdl;
}

for (const k of DRAWN) {
  uiTest(`#234 Remove from Project of ${/^[AEIOU]/.test(k.kind) ? "an" : "a"} ${k.kind}'s row: the drawing and its HDL file leave the project together (kept in the folder, its editor closed); one Undo brings both back linked, Redo removes both again`, E, async (page) => {
    const name = `R_${k.ico}`;
    const hdl = await openDrawn(page, name, k);
    const drawing = await readWs(env, name, k.file), code = await readWs(env, name, hdl);
    // the drawing open in its editor
    await page.eval((f) => window.SilinxApp.openFile(f), k.file);
    await page.waitFor((f) => String(window.Silinx.active?.id || '').endsWith(`:${f}`), [k.file], { what: 'the drawing open' });
    await page.treeRow('#hier', k.mod, { right: true, exact: true });
    assert.ok((await menuLabels(page)).includes('Remove from Project'));
    await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
    assert.equal(await answer(page), QUESTION(k.file, hdl));
    await noRows(page);
    assert.deepEqual(await rows(page), [`project ${name}`, '  chip xc3s250e-4-cp132']);
    assert.deepEqual(await pjFiles(name), []);
    assert.deepEqual(await excluded(name), [k.file]);
    assert.equal(await page.eval((f) => window.Silinx.docs.some((d) => String(d.id || '').endsWith(`:${f}`)), k.file), false);
    // nothing written: both files in the folder as they were (the drawing still names its HDL file)
    assert.equal(await readWs(env, name, k.file), drawing);
    assert.equal(await readWs(env, name, hdl), code);
    assert.equal(JSON.parse(drawing).generatedFile, hdl);
    // one Undo (Edit menu): both back, linked
    await page.menu('Edit', 'Undo Remove from Project');
    await linkedTo(page, hdl, k.file);
    assert.deepEqual(await rows(page), ROWS(name, k));
    assert.deepEqual(await pjFiles(name), [hdl]);
    assert.deepEqual(await excluded(name), []);
    // Redo (Edit menu): both out again, no question
    await page.menu('Edit', 'Redo Remove from Project');
    await noRows(page);
    assert.equal(await page.dialogCount(), 0);
    assert.deepEqual(await pjFiles(name), []);
    assert.deepEqual(await excluded(name), [k.file]);
    // Undo again (the toolbar's): back
    await page.click('#toolbar .tb-btn[title=Undo]');
    await linkedTo(page, hdl, k.file);
    assert.deepEqual(await rows(page), ROWS(name, k));
    assert.deepEqual(await consoleLines(page, /^(Removed|Undo:|Redo:) /), [REMOVED(k.file, hdl), 'Undo: Remove from Project.', 'Redo: Remove from Project.', 'Undo: Remove from Project.']);
    assert.deepEqual(await warnings(page), []);
    assert.equal(await readWs(env, name, k.file), drawing);
    assert.equal(await readWs(env, name, hdl), code);
  });
}

uiTest('#234 Remove from Project from the drawing\'s badge and from the HDL\'s badge: both leave the project (No: nothing changes), the toast\'s Undo brings both back; the Files view removes the drawing alone, its HDL file a plain HDL module', E, async (page) => {
  const k = DRAWN[0];
  const hdl = await openDrawn(page, 'R_badges', k);
  // the drawing's badge: its commands, Remove from Project last; No: nothing changes
  await badgeRight(page, 'ctl', 'Petri');
  assert.deepEqual(await menuLabels(page), ['Open', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  assert.equal(await answer(page, 'No'), QUESTION(k.file, hdl));
  assert.deepEqual(await rows(page), ROWS('R_badges', k));
  assert.deepEqual(await pjFiles('R_badges'), [hdl]);
  // Yes: both out; the toast's Undo
  await badgeRight(page, 'ctl', 'Petri');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await answer(page);
  await noRows(page);
  assert.deepEqual(await pjFiles('R_badges'), []);
  assert.deepEqual(await excluded('R_badges'), [k.file]);
  await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Removed ctl.pn.json and ctl.vhd from the project')), [], { what: 'the toast' });
  await page.click('.toast .toast-action', { text: 'Undo' });
  await linkedTo(page, hdl, k.file);
  assert.deepEqual(await rows(page), ROWS('R_badges', k));
  // the HDL's badge: the module's menu, the same command
  await badgeRight(page, 'ctl', 'VHDL');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  assert.equal(await answer(page), QUESTION(k.file, hdl));
  await noRows(page);
  assert.deepEqual(await pjFiles('R_badges'), []);
  await page.menu('Edit', 'Undo Remove from Project');
  await linkedTo(page, hdl, k.file);
  // the Files view: the drawing alone; its HDL file stays in the project, a plain HDL module
  await page.leftTab('files');
  await page.rightClick('#files-page tr', { index: await filesRow(page, k.file) });
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  assert.equal(await answer(page), `Remove '${k.file}' from the project?\n(The file stays in the project folder: Undo or Add to Project in the Files view brings it back.)`);
  await page.leftTab('design');
  await page.waitFor(() => !Object.keys(window.Silinx.hdlToSch || {}).length, [], { what: 'the drawing out' });
  assert.deepEqual(await rows(page), ['project R_badges', '  chip xc3s250e-4-cp132', '    moduleTop ctl [VHDL*] (ctl.vhd)']);
  assert.deepEqual(await pjFiles('R_badges'), [hdl]);
  assert.deepEqual(await excluded('R_badges'), [k.file]);
  assert.deepEqual(await consoleLines(page, /^(Removed|Undo:|Redo:) /), [
    REMOVED(k.file, hdl), 'Undo: Remove from Project.', REMOVED(k.file, hdl), 'Undo: Remove from Project.',
    'Removed src/ctl.pn.json from the project (the file is kept in the project folder).',
  ]);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#234 in Portuguese: Remover do Projeto of a drawn module (the question, the toast) and of one file in the Files view', E, async (page) => {
  const k = DRAWN[1];
  const hdl = await openDrawn(page, 'R_pt', k);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.treeRow('#hier', k.mod, { right: true, exact: true });
    assert.ok((await menuLabels(page)).includes('Remover do Projeto'));
    await page.click('body > .menu-popup .mi', { text: 'Remover do Projeto' });
    assert.equal(await answer(page, 'Sim', 'Remover Fonte'), "Remover 'src/gate.sch.json' e o seu ficheiro HDL 'src/gate.vhd' do projeto?\n(Os ficheiros ficam na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-nos.)");
    await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Removidos gate.sch.json e gate.vhd do projeto')), [], { what: 'the toast in Portuguese' });
    assert.deepEqual(await pjFiles('R_pt'), []);
    assert.deepEqual(await excluded('R_pt'), [k.file]);
    await page.menu('Editar', 'Anular Remover do Projeto');
    await linkedTo(page, hdl, k.file);
    // one file (the Files view): its question in Portuguese; Não
    await page.leftTab('files');
    await page.rightClick('#files-page tr', { index: await filesRow(page, hdl) });
    await page.click('body > .menu-popup .mi', { text: 'Remover do Projeto' });
    assert.equal(await answer(page, 'Não', 'Remover Fonte'), "Remover 'src/gate.vhd' do projeto?\n(O ficheiro fica na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-no.)");
    assert.deepEqual(await pjFiles('R_pt'), [hdl]);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
