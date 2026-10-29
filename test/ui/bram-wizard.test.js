// UI: New Source ▸ Block Memory ▸ Wizard (#794, #958). On a Basys2 project (XC3S250E, 12 RAMB16): width x depth, one port or two, the
// write mode, the block RAMs it takes against the device's (one that does not fit refused), its initial contents from
// a .mem file of the project (a wrong file refused); the module written (the generator's own output for the file,
// compiling and elaborating with no warning), the Design pane's [Block Memory] base, reopened by its process and
// written again as a ROM. On a Nexys3 project (Spartan-6): the halves of 9 Kbit, a module in Verilog of RAMB8BWER.
// Every page in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { readWizardSpec } from '../../core/clocking.js';
import { memoryModule, readInitFile } from '../../core/blockram.js';
import { newSourceWizardOf } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Source ▸ Block Memory, the file name, Wizard (#958)
const openMemoryWizard = (page, name = 'bram') => newSourceWizardOf(page, 'Block Memory', name, 'Block Memory');
const pageTitle = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const text = (page, sel) => page.eval((s) => document.querySelector(`.dlg-overlay ${s}`)?.textContent ?? null, sel);
const hierRows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.badge'))
  .map((r) => `${r.querySelector('.lbl').textContent} ${[...r.querySelectorAll('.badge')].map((b) => `[${b.textContent}${b.classList.contains('base') ? '*' : ''}]`).join(' ')}`));
const diagnostics = (path, code, top) => {
  const src = [{ path, lang: path.endsWith('.v') ? 'verilog' : 'vhdl', text: code }];
  const lib = compile([...primitiveSources(src), ...src]);
  const d = elaborate(lib, top);
  return [...lib.errors, ...d.diags].filter((x) => x.file === path).map((x) => `${x.severity}: ${x.message}`);
};
const MEM = '// a table\n001 002 003\n@800 1ff\n';

uiTest('Block Memory on the Basys2: the block RAMs it takes, a memory too large refused, the contents of a .mem; the module in the Design pane, reopened and written again', E, async (page) => {
  await makeProject(env, { name: 'BwPj', board: 'basys2', files: { 'src/msg.mem': MEM, 'src/wide.mem': '3ff\n' } });
  await page.openProject('BwPj');
  await openMemoryWizard(page);
  // its first page, the memory (#2082: the name, the location and the language typed on New Source)
  assert.equal(await pageTitle(page), 'Memory');
  assert.equal(await text(page, '.bw-count'), 'Block RAMs on this device: 12 RAMB16 of 18 Kbit');
  // the default: 1024 x 8, one RAMB16_S9
  assert.equal(await text(page, '.bw-usage'), 'Block RAMs: 1 RAMB16 of the 12 on this device; RAMB16_S9 of 2048 x 9, 1 side by side.');
  // too large: refused, said under the fields
  await page.fill('.dlg-overlay .bw-width', '64');
  await page.fill('.dlg-overlay .bw-depth', '16384');
  await page.waitFor(() => /make it smaller/.test(document.querySelector('.dlg-overlay .bw-errors').textContent));
  assert.equal(await text(page, '.bw-errors'), 'It takes 64 block RAMs and the device has 12: make it smaller.');
  await page.dialogButton('Next >');
  await page.waitFor(() => /make it smaller/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  // two ports, 9 x 4096: two rows of RAMB16_S9_S9
  await page.fill('.dlg-overlay .bw-width', '9');
  await page.fill('.dlg-overlay .bw-depth', '4096');
  await page.fill('.dlg-overlay .bw-ports', 'dual');
  await page.fill('.dlg-overlay .bw-mode', 'WRITE_FIRST');
  await page.waitFor(() => /S9_S9/.test(document.querySelector('.dlg-overlay .bw-usage').textContent));
  assert.equal(await text(page, '.bw-usage'), 'Block RAMs: 2 RAMB16 of the 12 on this device; RAMB16_S9_S9 of 2048 x 9, 1 side by side, 2 deep.');
  assert.equal(await text(page, '.bw-errors'), '');
  // the project's .mem files offered; one with a word too wide refused
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .bw-init option')].map((o) => o.value)), ['', 'src/msg.mem', 'src/wide.mem']);
  await page.fill('.dlg-overlay .bw-width', '8');
  await page.fill('.dlg-overlay .bw-init', 'src/wide.mem');
  await page.dialogButton('Next >');
  await page.waitFor(() => /wider/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await errText(page), 'src/wide.mem: word 0 (3ff) is wider than 8 bits.');
  await page.fill('.dlg-overlay .bw-width', '9');
  await page.fill('.dlg-overlay .bw-init', 'src/msg.mem');
  await next(page, 'Summary');
  assert.equal(await text(page, '.bw-summary'), ['The wizard will create src/bram.vhd (VHDL): the module bram.', '',
    'RAM: 4096 words of 9 bits, two ports, WRITE_FIRST', 'Written as: 2 RAMB16_S9_S9',
    'Block RAMs: 2 RAMB16 of the 12 on this device; RAMB16_S9_S9 of 2048 x 9, 1 side by side, 2 deep.', 'Initial contents: src/msg.mem'].join('\n'));
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'bram'), [], { what: 'bram in the project' });
  const code = await readWs(env, 'BwPj', 'src/bram.vhd');
  const spec = readWizardSpec(code);
  assert.deepEqual(spec, { wizard: 'memory', version: 1, name: 'bram', lang: 'vhdl', family: 'spartan3e', kind: 'ram', ports: 'dual', width: 9, depth: 4096,
    writeMode: 'WRITE_FIRST', style: 'primitive', init: 'src/msg.mem' });
  assert.equal(code, memoryModule(spec, readInitFile(MEM, 'src/msg.mem', 9, 4096).words).code);
  // the contents in the blocks: words 1, 2, 3 at 0 (the first row), 0x1FF at 0x800 (the second row: data FF, parity 1)
  assert.match(code, /u_ram_0_0 : RAMB16_S9_S9\n[\s\S]*?INIT_00 +=> X"0{58}030201",/);
  assert.match(code, /u_ram_1_0 : RAMB16_S9_S9\n[\s\S]*?INIT_00 +=> X"0{62}FF",[\s\S]*?INITP_00 +=> X"0{63}1"/);
  assert.deepEqual(diagnostics('src/bram.vhd', code, 'bram'), []);
  await page.waitConsole(/Block Memory: created src\/bram\.vhd, the module bram: 4096 x 9, 2 RAMB16_S9_S9\./);
  // the Design pane and the process
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'Block Memory'), [], { what: 'the wizard badge' });
  assert.deepEqual(await hierRows(page), ['bram [Block Memory*] [VHDL]']);
  await page.treeRow('#hier', 'bram');
  await page.treeRow('#procs', 'View/Edit Block Memory', { dbl: true });
  await page.waitDialog('Block Memory');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .bw-name').disabled), true);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .bw-edited')), null);
  await next(page, 'Memory');
  assert.deepEqual(await page.eval(() => ['.bw-width', '.bw-depth', '.bw-ports', '.bw-mode', '.bw-init'].map((s) => document.querySelector(`.dlg-overlay ${s}`).value)),
    ['9', '4096', 'dual', 'WRITE_FIRST', 'src/msg.mem']);
  // a ROM now: no write mode
  await page.fill('.dlg-overlay .bw-kind', 'rom');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .bw-mode').disabled), true);
  await next(page, 'Summary');
  assert.match(await text(page, '.bw-summary'), /^The wizard will write again src\/bram\.vhd \(VHDL\): the module bram\.\n\nROM: 4096 words of 9 bits, two ports\n/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => !/wea/.test(window.Silinx.sources.find((s) => s.path === 'src/bram.vhd')?.text || 'wea'), [], { what: 'bram written again' });
  const again = await readWs(env, 'BwPj', 'src/bram.vhd');
  assert.equal(readWizardSpec(again).kind, 'rom');
  assert.deepEqual(diagnostics('src/bram.vhd', again, 'bram'), []);
});

uiTest('Block Memory on the Nexys3 (Spartan-6): its 9 Kbit halves, a Verilog module of RAMB8BWER; the inferable HDL', E, async (page) => {
  await makeProject(env, { name: 'BwS6', board: 'nexys3', preferredLanguage: 'verilog' });
  await page.openProject('BwS6');
  await openMemoryWizard(page);
  assert.equal(await pageTitle(page), 'Memory');
  assert.equal(await text(page, '.bw-count'), 'Block RAMs on this device: 32 of 18 Kbit (64 halves of 9 Kbit)');
  assert.equal(await text(page, '.bw-usage'), 'Block RAMs: 1 RAMB8BWER (1 of the 64 halves of 9 Kbit on this device); RAMB8BWER of 1024 x 9, 1 side by side.');
  await page.fill('.dlg-overlay .bw-width', '64');
  await page.fill('.dlg-overlay .bw-depth', '16384');
  await page.waitFor(() => /make it smaller/.test(document.querySelector('.dlg-overlay .bw-errors').textContent));
  assert.equal(await text(page, '.bw-errors'), 'It takes 128 halves of 9 Kbit and the device has 64: make it smaller.');
  await page.fill('.dlg-overlay .bw-width', '12');
  await page.fill('.dlg-overlay .bw-depth', '5000');
  await page.waitFor(() => /3 deep/.test(document.querySelector('.dlg-overlay .bw-usage').textContent));
  assert.equal(await text(page, '.bw-usage'), 'Block RAMs: 9 RAMB8BWER (9 of the 64 halves of 9 Kbit on this device); RAMB8BWER of 2048 x 4, 3 side by side, 3 deep.');
  await next(page, 'Summary');
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'bram'), [], { what: 'bram in the project' });
  const code = await readWs(env, 'BwS6', 'src/bram.v');
  assert.equal(code, memoryModule(readWizardSpec(code), []).code);
  assert.equal([...code.matchAll(/^ {2}RAMB8BWER #\(/gm)].length, 9);
  assert.deepEqual(diagnostics('src/bram.v', code, 'bram'), []);
  assert.deepEqual(await hierRows(page), ['bram [Block Memory*] [Verilog]']);
  // the inferable HDL: written again as an array
  await page.treeRow('#hier', 'bram', { dbl: true });
  await page.waitDialog('Block Memory');
  await next(page, 'Memory');
  await page.fill('.dlg-overlay .bw-style', 'inferred');
  await next(page, 'Summary');
  assert.match(await text(page, '.bw-summary'), /\nWritten as: inferable HDL\n/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => /reg \[11:0\] mem \[0:4999\];/.test(window.Silinx.sources.find((s) => s.path === 'src/bram.v')?.text || ''), [], { what: 'bram as an array' });
  assert.deepEqual(diagnostics('src/bram.v', await readWs(env, 'BwS6', 'src/bram.v'), 'bram'), []);
});

uiTest('Portuguese: the Block Memory wizard\'s pages, its messages, the Design pane\'s badge and the process are translated', E, async (page) => {
  await makeProject(env, { name: 'BwPt', board: 'basys2', files: { 'src/wide.mem': 'zz\n' } });
  await page.openProject('BwPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const both = async (what, root = '.dlg-overlay') => {
    await setLang('en');
    const en = await page.eval((r) => window.__uiTexts(document.querySelector(r)), root);
    await setLang('pt');
    const pt = await page.eval((r) => window.__uiTexts(document.querySelector(r)), root);
    for (const s of untranslated(en, pt, [/^RAMB/])) missing.push(`${what}: ${s}`);
    await setLang('en');
  };
  await openMemoryWizard(page);
  assert.equal(await pageTitle(page), 'Memory');
  await both('Memory');
  await page.fill('.dlg-overlay .bw-width', '64');
  await page.fill('.dlg-overlay .bw-depth', '16384');
  await page.waitFor(() => /make it smaller/.test(document.querySelector('.dlg-overlay .bw-errors').textContent));
  await both('Memory (too large)');
  await page.fill('.dlg-overlay .bw-width', '8');
  await page.fill('.dlg-overlay .bw-depth', '3000');
  await page.fill('.dlg-overlay .bw-init', 'src/wide.mem');
  await page.dialogButton('Next >');
  await page.waitFor(() => /hexadecimal/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  await both('Memory (a wrong file)');
  await page.fill('.dlg-overlay .bw-init', '');
  await next(page, 'Summary');
  await both('Summary');
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'Block Memory'), [], { what: 'the wizard badge' });
  await page.treeRow('#hier', 'bram');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((l) => l.textContent === 'View/Edit Block Memory'));
  await both('Processes', '#procs');
  await setLang('pt');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row .badge')].map((b) => `${b.textContent} (${b.title})`)),
    ['Memória de Bloco (Base: o HDL é gerado pelo assistente)', 'VHDL (Gerado pela Memória de Bloco)']);
  await setLang('en');
  assert.deepEqual(missing, []);
});
