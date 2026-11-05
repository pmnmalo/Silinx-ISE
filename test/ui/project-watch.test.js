// UI: the open project kept as it is on disk (#2843). What the MCP server (another process, the same functions of
// server/projects.js) changes in the project shows up without opening it again: a source written, its editor and the
// Design pane updated; a new source, its row in the Design pane; a source changed in the editor and on disk, the
// question asked (in Portuguese too), each answer kept; a run made outside the page, the processes' marks and the
// Design Summary updated. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, writeWs } from './harness.js';

let env, P;
before(async () => {
  env = await setupUi();
  // (the MCP server's own functions, on the server's workspace)
  process.env.SILINX_WORKSPACE = env.server.workspace;
  P = await import('../../server/projects.js');
});
after(async () => { await env?.teardown?.(); });
const E = () => env;

const A = (port = 'y') => `library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; ${port} : out std_logic); end a;\narchitecture r of a is begin ${port} <= x; end r;\n`;
const C = 'module c(input x, output y); assign y = ~x; endmodule\n';
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const editorText = (page, path) => page.eval((p) => window.SilinxApp.S.docs.find((d) => d.path === p)?.editor?.getValue(), path);
// a change of the user in the editor, not saved yet (its autosave held: the disk's change comes first)
const editUnsaved = (page, path, text) => page.eval((p, t) => {
  const d = window.SilinxApp.S.docs.find((o) => o.path === p);
  d.editor.setValue(t);
  clearTimeout(d._autosave);
  return d.dirty;
}, path, text);

uiTest('#2843 a source written and one made outside the page: its editor and the Design pane updated; one deleted, its editor closed; the page\'s own save not told back', E, async (page) => {
  await makeProject(env, { name: 'WatchPj', top: 'a', files: { 'src/a.vhd': A() } });
  await page.openProject('WatchPj');
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
  // written by the MCP server (write_file): the editor shows it, clean; the module's ports too
  await P.writeFile('WatchPj', 'src/a.vhd', A('z'));
  await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor?.getValue() === t, [A('z')], { what: 'the editor reloaded' });
  await page.waitConsole(/src\/a\.vhd reloaded: changed outside Silinx\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
  await page.waitFor(() => window.SilinxApp.S.modules.find((m) => m.name === 'a')?.portList?.some((p) => p.name === 'z'), [], { what: 'the module\'s new port' });
  // a new source (new_source): its row in the Design pane
  await P.writeFile('WatchPj', 'src/c.v', C);
  await page.waitFor(() => /\bc\b/.test(document.getElementById('hier').textContent) && window.SilinxApp.S.modules.some((m) => m.name === 'c'), [], { what: 'the new module\'s row' });
  await page.waitConsole(/Changed outside Silinx: .*src\/c\.v \(created\)/);
  // deleted outside (delete_file), not changed in the editor: closed
  await page.eval(() => window.SilinxApp.openFile('src/c.v'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/c.v')?.editor, [], { what: 'its editor' });
  await P.deleteFile('WatchPj', 'src/c.v');
  await page.waitFor(() => !window.SilinxApp.S.docs.some((d) => d.path === 'src/c.v') && !window.SilinxApp.S.modules.some((m) => m.name === 'c'), [], { what: 'closed, its row gone' });
  await page.waitConsole(/src\/c\.v was deleted outside Silinx: closed\./);
  // the page's own save: not told back (no reload line for it)
  const lines = () => page.eval(() => window.__console());
  const told0 = (await lines()).match(/(reloaded: changed outside Silinx|Changed outside Silinx)/g)?.length;
  await page.eval(() => { const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd'); d.editor.setValue(d.editor.getValue() + '-- mine\n'); });
  await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'saved' });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await lines()).match(/(reloaded: changed outside Silinx|Changed outside Silinx)/g)?.length, told0, 'the page\'s own write not told back');
  assert.equal(await readWs(env, 'WatchPj', 'src/a.vhd'), `${A('z')}-- mine\n`);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2843 a source changed in the editor and on disk: which to keep asked, each answer kept; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Clash', top: 'a', files: { 'src/a.vhd': A() } });
  await page.openProject('Clash');
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
  // Load from Disk: the disk's text in the editor
  assert.equal(await editUnsaved(page, 'src/a.vhd', `${A()}-- editor 1\n`), true);
  await P.writeFile('Clash', 'src/a.vhd', `${A()}-- disk 1\n`);
  assert.equal(await page.waitDialog('File Changed on Disk'), 'File Changed on Disk');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').textContent), /src\/a\.vhd.*This file was changed outside Silinx, and it has changes in the editor not saved yet\.\s*Which version do you keep\?/);
  await page.dialogButton('Load from Disk');
  await page.waitNoDialog();
  await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.getValue() === t, [`${A()}-- disk 1\n`], { what: 'the disk\'s text' });
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
  // Keep the Editor's, in Portuguese: the editor's text written over the disk's
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await editUnsaved(page, 'src/a.vhd', `${A()}-- editor 2\n`);
    await P.writeFile('Clash', 'src/a.vhd', `${A()}-- disk 2\n`);
    assert.equal(await page.waitDialog('Ficheiro Alterado no Disco'), 'Ficheiro Alterado no Disco');
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').textContent), /Este ficheiro foi alterado fora do Silinx e tem alterações no editor ainda não guardadas\.\s*Que versão mantém\?/);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons button')].map((b) => b.textContent)), ['Manter a do Editor', 'Carregar do Disco']);
    await page.dialogButton('Manter a do Editor');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'saved' });
  assert.equal(await readWs(env, 'Clash', 'src/a.vhd'), `${A()}-- editor 2\n`);
  assert.equal(await editorText(page, 'src/a.vhd'), `${A()}-- editor 2\n`);
  await page.waitConsole(/src\/a\.vhd: the editor's version kept, written over the disk's\./);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2843 a run made outside the page: the processes\' marks and the Design Summary updated', E, async (page) => {
  await makeProject(env, { name: 'RunOut', template: 'blinky', board: 'basys2' });
  await page.openProject('RunOut');
  const top = await page.eval(() => window.SilinxApp.S.project.top);
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => !!window.SilinxApp.findDoc('summary'), [], { what: 'the Design Summary' });
  assert.equal(await page.eval(() => window.SilinxApp.S.status.synth ?? null), null, 'not synthesized yet');
  // the MCP server's run_process synthesize writes the run's summary
  const SYNTH = { tool: 'Yosys', cells: 12, warnings: 0, errors: 0, utilization: [{ id: 'luts', name: 'Number of 4 input LUTs', used: 15, total: 4896, percent: 1 }] };
  await writeWs(env, 'RunOut', 'build/reports.json', JSON.stringify({ source: 'open', top, synthesis: SYNTH, simModels: {}, files: {}, summary: { synthesized: true } }));
  await page.waitFor(() => window.SilinxApp.S.status.synth === 'ok', [], { what: 'Synthesize marked done' });
  await page.waitConsole(/A run made outside Silinx: the processes' marks and the Design Summary updated\./);
  await page.waitFor(() => /Implementation State:\s*Synthesized/.test(window.SilinxApp.findDoc('summary').el.textContent) && /Device Utilization Summary \(after synthesis\)/.test(window.SilinxApp.findDoc('summary').el.textContent), [], { what: 'the summary after synthesis' });
  // kept for the next opening (the page's own write of its marks: not told back)
  let saved = null;
  for (let k = 0; k < 50 && saved?.status?.synth !== 'ok'; k++) { await new Promise((r) => setTimeout(r, 100)); try { saved = JSON.parse(await readWs(env, 'RunOut', 'build/silinx-status.json')); } catch { /* not yet */ } }
  assert.equal(saved?.status?.synth, 'ok');
  assert.deepEqual(warnings(page), []);
});
