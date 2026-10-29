// UI: every path through New Source follows the type selected last (#974): a type, Next >, < Back, another type, Next >:
// the pages, the steps on the side, the Source type shown, the buttons (Next > / Finish, Wizard) and the source made
// are the new type's; < Back works from every page; Cancel and New Source again start afresh.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ADDER = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity adder is\n  port (a, b : in std_logic; s : out std_logic);\nend adder;\narchitecture rtl of adder is\nbegin\n  s <= a xor b;\nend rtl;\n';
// each type: the pages after Select Source Type, its wizard (Wizard enabled), only a wizard, the file it makes
const TYPES = {
  'Boolean Algebra': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.tt.json' },
  'Module (HDL)': { pages: ['File Name and Location', 'Define Module', 'Summary'], wiz: true, file: 'src/NAME.vhd' },
  'Schematic': { pages: ['File Name and Location', 'Summary'], wiz: true, file: 'src/NAME.sch.json' },
  'Finite State Machine (FSM)': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.fsm.json' },
  'Algorithmic State Machine (ASM)': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.asm.json' },
  'Petri Net': { pages: ['File Name and Location', 'Summary'], wiz: true, file: 'src/NAME.pn.json' },
  'Clock Manager (DCM / PLL)': { pages: ['File Name and Location'], wiz: true, only: true },
  'Block Memory': { pages: ['File Name and Location'], wiz: true, only: true },
  'Test Bench': { pages: ['File Name and Location', 'Associate Source', 'Summary'], wiz: true, file: 'sim/NAME.vhd' },
  'Implementation Constraints File': { pages: ['File Name and Location', 'Summary'], file: 'constraints/NAME.ucf' },
  'Memory Initialization File (.mem)': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.mem' },
  'C Function (HLS)': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.c' },   // (#1531)
  'C++ Function (HLS)': { pages: ['File Name and Location', 'Summary'], file: 'src/NAME.cpp' },   // (#1590)
};
const NAMES = Object.keys(TYPES);

// the dialog now: its page, the steps on the side, the type shown, the buttons shown (disabled marked)
const state = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  const grid = [...d.querySelectorAll('.wiz-main .form-grid > *')];
  const k = grid.findIndex((e) => e.textContent === 'Source type:');
  return {
    page: d.querySelector('.wiz-main h3')?.textContent,
    steps: [...d.querySelectorAll('.wiz-side .step')].map((s) => s.textContent),
    cur: d.querySelector('.wiz-side .step.cur')?.textContent,
    type: k >= 0 ? grid[k + 1].textContent : null,
    selected: d.querySelector('.src-types .st.sel')?.lastChild.textContent.trim() ?? null,
    buttons: [...d.querySelectorAll('.dlg-buttons .btn')].filter((b) => b.getClientRects().length).map((b) => `${b.textContent.trim()}${b.disabled ? ' (disabled)' : ''}`),
  };
});
// the buttons expected on page `i` (0: Select Source Type) of type `t`
const expectButtons = (t, i) => {
  const T = TYPES[t], last = i === T.pages.length;
  const primary = `${last ? 'Finish' : 'Next >'}${T.only && i === 1 ? ' (disabled)' : ''}`;
  return [...(i === 1 ? [`Wizard${T.wiz ? '' : ' (disabled)'}`] : []), `< Back${i === 0 ? ' (disabled)' : ''}`, primary, 'Cancel'];
};
const expectPage = async (page, t, i, what) => {
  const s = await state(page);
  const pages = ['Select Source Type', ...TYPES[t].pages];
  assert.equal(s.page, pages[i], `${what}: the page`);
  assert.deepEqual(s.steps, pages, `${what}: the steps`);
  assert.equal(s.cur, pages[i], `${what}: the current step`);
  assert.deepEqual(s.buttons, expectButtons(t, i), `${what}: the buttons`);
  if (pages[i] === 'File Name and Location') assert.equal(s.type, t, `${what}: the source type shown`);
  if (i === 0) assert.equal(s.selected, t, `${what}: the type selected`);
};
const openNewSource = async (page) => {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await waitNewSourcePage(page, 'Select Source Type');
};
const forward = async (page, title) => { await page.dialogButton('Next >'); await waitNewSourcePage(page, title); };
const back = async (page, title) => { await page.dialogButton('< Back'); await waitNewSourcePage(page, title); };
const close = async (page) => { await page.dialogButton('Cancel'); await page.waitNoDialog(); };

uiTest('New Source: a type, Next >, < Back, every other type, Next >: the new type\'s pages, steps and buttons; < Back from every page', E, async (page) => {
  await makeProject(env, { name: 'NsPaths', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('NsPaths');
  for (const a of NAMES) {
    await openNewSource(page);
    await pickSourceType(page, a);
    await expectPage(page, a, 0, `${a}`);
    await forward(page, 'File Name and Location');
    await expectPage(page, a, 1, `${a}, Next >`);
    for (const b of NAMES.filter((x) => x !== a)) {
      await back(page, 'Select Source Type');
      await pickSourceType(page, b);
      await expectPage(page, b, 0, `${a} → ${b}`);
      await forward(page, 'File Name and Location');
      await expectPage(page, b, 1, `${a} → ${b}, Next >`);
    }
    await close(page);
  }
});

uiTest('New Source: after another type, every page of the type selected last forward and back, then the source it makes', E, async (page) => {
  await makeProject(env, { name: 'NsMade', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('NsMade');
  for (const [k, b] of NAMES.entries()) {
    if (TYPES[b].only) continue;
    // first the type before it (the one after it for the first), a page into it, then back
    const a = NAMES[k === 0 ? NAMES.length - 1 : k - 1];
    await openNewSource(page);
    await pickSourceType(page, a);
    await forward(page, 'File Name and Location');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'first');
    await back(page, 'Select Source Type');
    await pickSourceType(page, b);
    await forward(page, 'File Name and Location');
    const name = `n${k}`;
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    // forward to the last page, back to the first, forward again
    const pages = TYPES[b].pages;
    for (let i = 2; i <= pages.length; i++) { await forward(page, pages[i - 1]); await expectPage(page, b, i, `${a} → ${b}, page ${i}`); }
    for (let i = pages.length - 1; i >= 0; i--) { await back(page, i ? pages[i - 1] : 'Select Source Type'); await expectPage(page, b, i, `${a} → ${b}, back to ${i}`); }
    for (let i = 1; i <= pages.length; i++) await forward(page, pages[i - 1]);
    if (pages.at(-1) === 'Summary') assert.match(await page.eval(() => document.querySelector('.dlg-overlay .code-box').textContent), new RegExp(`Source Type: ${b.replace(/[()./+]/g, '\\$&')}`), `${b}: the summary`);
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    const file = TYPES[b].file.replace('NAME', name);
    await page.waitFor((f) => (window.Silinx.fileTree || []).includes(f), [file], { what: `${b}: ${file}` });
    assert.ok((await readWs(env, 'NsMade', file)).length > 0, file);
  }
  // nothing made of a type visited first
  assert.ok(!(await page.eval(() => (window.Silinx.fileTree || []).some((f) => /\/first\./.test(f)))));
});

uiTest('New Source: Cancel and New Source again start afresh (the default type, an empty file name); Wizard follows the type selected last', E, async (page) => {
  await makeProject(env, { name: 'NsAgain', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('NsAgain');
  await openNewSource(page);
  await pickSourceType(page, 'Boolean Algebra');
  await forward(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'kept');
  await close(page);
  await openNewSource(page);
  await expectPage(page, 'Module (HDL)', 0, 'New Source again');
  await forward(page, 'File Name and Location');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main input[type=text]').value), '');
  // a type with no wizard, back, a type with one: Wizard opens that one
  await back(page, 'Select Source Type');
  await pickSourceType(page, 'Boolean Algebra');
  await forward(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'w1');
  await back(page, 'Select Source Type');
  await pickSourceType(page, 'Petri Net');
  await forward(page, 'File Name and Location');
  // the file name typed is kept across a change of type (as ISE does)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main input[type=text]').value), 'w1');
  await page.dialogButton('Wizard');
  await page.waitDialog('Petri Net Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-name').value), 'w1');
  await close(page);
}, { timeout: 120000 });
