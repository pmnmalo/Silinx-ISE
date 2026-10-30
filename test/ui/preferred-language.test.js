// UI: the project's Preferred Language changed in Design Properties (#1477): every drawing switches to it, its HDL
// file made again in it (.vhd <-> .v), the old one removed (not left beside the new one); the project's file list, the
// drawing's link, an open editor's language and the Design pane's badges follow; the HDL written by hand stays as it
// is; the top module and the constraints keep working. Back to VHDL: the example's files as they were. (No new label:
// the dialog's are translated already.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the Design pane: "icon label [badge*] [badge] (meta)"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}]`);
  return `${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
// Design Properties: the Preferred Language chosen, then OK
async function preferLanguage(page, lang) {
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.eval((l) => {
    const s = [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === 'Preferred Language:').nextElementSibling;
    s.value = l; s.dispatchEvent(new Event('change'));
  }, lang);
  await page.dialogButton('OK');
  await page.waitNoDialog();
}
const exists = (project, rel) => fs.existsSync(path.join(env.server.workspace, project, rel));
const shipped = (rel) => fs.readFileSync(path.join(ROOT, 'examples', 'traffic', rel), 'utf8');
// the project's state: its preference, its files (silinx.json), the drawings' links, its top, its constraints, the errors
const state = (page) => page.eval(() => ({
  lang: window.Silinx.project.preferredLanguage,
  files: window.Silinx.project.files.map((f) => `${f.path}:${f.lang}`).sort(),
  links: { ...window.Silinx.hdlToSch },
  top: window.Silinx.project.top,
  ucf: window.Silinx.fileTree.includes(window.Silinx.project.constraints),
  errors: (window.Silinx.lib?.errors || []).filter((e) => e.severity === 'error').map((e) => e.message),
}));

uiTest('Design Properties, Preferred Language Verilog: the state diagram and the truth table get their HDL in Verilog, the VHDL files removed; the HDL written by hand as it is; back to VHDL, the files shipped (#1477)', E, async (page) => {
  await makeProject(env, { name: 'PrefLang', template: 'traffic' });
  await page.openProject('PrefLang');
  // the state diagram open in its editor: it follows
  await page.eval(async () => (await import('/js/drawings.js')).openFsm('src/traffic.fsm.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) select[title="HDL language"]'), [], { what: 'the state diagram editor' });
  const before = await rows(page);
  const was = await state(page);
  assert.deepEqual(was.links, { 'src/traffic.vhd': 'src/traffic.fsm.json', 'src/lamps.vhd': 'src/lamps.bool.json' });
  const hand = { 'src/top.vhd': await readWs(env, 'PrefLang', 'src/top.vhd'), 'src/timer.vhd': await readWs(env, 'PrefLang', 'src/timer.vhd'), 'src/sevenseg.v': await readWs(env, 'PrefLang', 'src/sevenseg.v') };

  await preferLanguage(page, 'verilog');
  await page.waitConsole(/^Preferred Language: Verilog \(2 drawing\(s\) now in it, their HDL made again in it\)\.$/m);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.v'] && window.Silinx.hdlToSch?.['src/lamps.v'], [], { what: 'the drawings linked to their Verilog' });
  const now = await state(page);
  assert.deepEqual(now, {
    lang: 'verilog',
    files: was.files.map((f) => f.replace(/^src\/(traffic|lamps)\.vhd:vhdl$/, 'src/$1.v:verilog')).sort(),
    links: { 'src/traffic.v': 'src/traffic.fsm.json', 'src/lamps.v': 'src/lamps.bool.json' },
    top: 'top', ucf: true, errors: [],
  });
  assert.deepEqual(['src/traffic.vhd', 'src/lamps.vhd'].map((f) => exists('PrefLang', f)), [false, false], 'the VHDL files removed');
  for (const [f, hdl] of [['src/traffic.fsm.json', 'src/traffic.v'], ['src/lamps.bool.json', 'src/lamps.v']]) {
    const d = JSON.parse(await readWs(env, 'PrefLang', f));
    assert.deepEqual([d.lang, d.generatedFile], ['verilog', hdl], f);
    assert.match(await readWs(env, 'PrefLang', hdl), /^\s*module \w+/m);
  }
  for (const [f, t] of Object.entries(hand)) assert.equal(await readWs(env, 'PrefLang', f), t, `${f} written by hand: as it is`);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) select[title="HDL language"]').value), 'verilog', 'the open editor in Verilog');
  // the Design pane: the drawings' HDL badge [Verilog], last; the HDL modules as they were
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent.endsWith('traffic') && [...r.querySelectorAll('.badge')].some((b) => b.textContent === 'Verilog')), [], { what: 'the row of traffic with [Verilog]' });
  assert.deepEqual(await rows(page), before.map((r) => (/^(fsm|algebra) /.test(r) ? r.replace('[VHDL]', '[Verilog]') : r)));
  assert.ok(before.some((r) => /^fsm .*\[FSM\*\] \[VHDL\]/.test(r)) && before.some((r) => /^algebra .*\[VHDL\]/.test(r)), before.join('\n'));
  // the editor's model in Verilog, linked to the Verilog file (its next edit keeps them)
  assert.deepEqual(await page.eval(() => { const m = window.Silinx.docs.find((d) => d.fsmEditor).fsmEditor.getModel(); return [m.lang, m.generatedFile]; }), ['verilog', 'src/traffic.v']);

  // back to VHDL: the files shipped with the example
  await preferLanguage(page, 'vhdl');
  await page.waitConsole(/^Preferred Language: VHDL \(2 drawing\(s\) now in it, their HDL made again in it\)\.$/m);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] && window.Silinx.hdlToSch?.['src/lamps.vhd'], [], { what: 'the drawings linked to their VHDL' });
  assert.deepEqual(await state(page), was);
  assert.deepEqual(['src/traffic.v', 'src/lamps.v'].map((f) => exists('PrefLang', f)), [false, false], 'the Verilog files removed');
  for (const f of ['src/traffic.vhd', 'src/lamps.vhd']) assert.equal(await readWs(env, 'PrefLang', f), shipped(f), f);
  await page.waitFor((n) => document.querySelectorAll('#hier .row').length === n && ![...document.querySelectorAll('#hier .badge')].some((b) => b.textContent === 'Verilog' && /fsm|algebra/.test(b.closest('.row').querySelector('.ico')?.dataset.ico)), [before.length], { what: 'the Design pane in VHDL' });
  assert.deepEqual(await rows(page), before);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Design Properties, Preferred Language Verilog: the top schematic gets its HDL in Verilog, still the top; the same language again changes nothing (#1477)', E, async (page) => {
  await makeProject(env, { name: 'PrefLangSch', template: 'gates' });
  await page.openProject('PrefLangSch');
  await preferLanguage(page, 'verilog');
  await page.waitConsole(/^Preferred Language: Verilog \(1 drawing\(s\) now in it, their HDL made again in it\)\.$/m);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/gates.v'] === 'src/gates.sch.json', [], { what: 'the schematic linked to its Verilog' });
  const s = await state(page);
  assert.deepEqual([s.top, s.ucf, s.errors, s.files], ['gates', true, [], ['sim/tb_gates.vhd:vhdl', 'src/gates.v:verilog']]);
  assert.equal(exists('PrefLangSch', 'src/gates.vhd'), false);
  assert.equal(JSON.parse(await readWs(env, 'PrefLangSch', 'src/gates.sch.json')).lang, 'verilog');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.ico')?.dataset.ico === 'moduleTop' && r.querySelector('.lbl').textContent === 'gates' && [...r.querySelectorAll('.badge')].map((b) => b.textContent).join(' ') === 'Schematic Verilog'), [], { what: 'the top row gates [Schematic] [Verilog]' });
  // Verilog again: nothing to do, nothing said but the device
  const lines = (await page.consoleText()).split('\n').length;
  await preferLanguage(page, 'verilog');
  await page.waitFor((n) => window.__console().split('\n').slice(n).some((l) => /Device set to/.test(l)), [lines], { what: 'Design Properties applied' });
  assert.doesNotMatch((await page.consoleText()).split('\n').slice(lines).join('\n'), /Preferred Language|its HDL is now/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Reloading the project keeps the drawings linked to their HDL while it reads them (#1543)', E, async (page) => {
  await makeProject(env, { name: 'ReloadLinks', template: 'traffic' });
  await page.openProject('ReloadLinks');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'], [], { what: 'the drawings linked' });
  // the links as they are at every file the project reads again, and after
  const seen = await page.eval(async () => {
    const { api } = await import('/js/api.js');
    const seen = new Set(), readFile = api.readFile;
    api.readFile = (...a) => { seen.add(Object.keys(window.Silinx.hdlToSch).sort().join(' ')); return readFile(...a); };
    try { await (await import('/js/project.js')).reloadProject(); } finally { api.readFile = readFile; }
    seen.add(Object.keys(window.Silinx.hdlToSch).sort().join(' '));
    return [...seen];
  });
  assert.deepEqual(seen, ['src/lamps.vhd src/traffic.vhd']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
