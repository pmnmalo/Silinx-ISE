// UI: projects — New Project wizard (every board, every device family), open / switch / close,
// Add Copy of Source (overwrite confirmation), files view rename / remove, Silinx and Xilinx zip
// export + import, a failing import keeps the project it would replace.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, waitDownload, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Project wizard: page 1 name (+ template), page 2 board / device / language, page 3 summary
async function newProject(page, { name, template = 'empty', board = '', family, part, lang, top }) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  if (template !== 'empty') await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  if (board) await page.fill('.dlg-overlay .wiz-main select', board, { index: 0 });
  if (family) await page.fill('.dlg-overlay .wiz-main select', family, { index: 2 });
  if (part) await page.fill('.dlg-overlay .wiz-main select', part, { index: 3 });
  if (lang) await page.fill('.dlg-overlay .wiz-main select', lang, { index: 9 });
  if (top) await page.fill('.dlg-overlay .wiz-main select', top, { index: 6 });   // Top-Level Source Type
  const settings = await page.eval(() => {
    const s = [...document.querySelectorAll('.dlg-overlay .wiz-main select')];
    return { board: s[0].value, family: s[2].value, part: s[3].value, pkg: s[4].value, speed: s[5].value, disabled: s[2].disabled, parts: [...s[3].options].map((o) => o.value) };
  });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  const summary = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent);
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n, [name], { what: `project ${name} open` });
  return { settings, summary, project: await page.eval(() => window.Silinx.project) };
}

uiTest('New Project wizard: one project per evaluation board (board fixes the device)', E, async (page) => {
  const db = await env.server.api('GET', '/api/devices');
  assert.ok(db.boards.length >= 3);
  for (const b of db.boards) {
    const name = `B_${b.id.replace(/\W/g, '_')}`;
    const r = await newProject(page, { name, board: b.id, lang: b.id === 'nexys2' ? 'verilog' : undefined });
    assert.equal(r.settings.disabled, true, `${b.id}: device fields follow the board`);
    assert.equal(r.settings.part, b.device.part);
    assert.match(r.summary, new RegExp(`Board:\\s+${b.name.replace(/[()+.]/g, '\\$&')}`));
    assert.equal(r.project.board, b.id);
    assert.deepEqual({ part: r.project.device.part, package: r.project.device.package }, { part: b.device.part, package: b.device.package });
    assert.equal(r.project.preferredLanguage, b.id === 'nexys2' ? 'verilog' : 'vhdl');
    // the status bar and the hierarchy follow the new project a moment after it opens
    await page.waitFor((part, id) => { const t = document.getElementById('status-device').textContent; return t.includes(part) && t.includes(id); }, [b.device.part, b.id], { what: `status bar shows ${b.id}` });
    await page.waitFor((n) => document.querySelector('#hier .row .lbl')?.textContent === n, [name], { what: `hierarchy shows ${name}` });
  }
  const list = await env.server.api('GET', '/api/projects');
  assert.equal(list.filter((p) => p.name.startsWith('B_')).length, db.boards.length);
});

uiTest('New Project wizard: every device family (no board), the device list follows the family; an example template', E, async (page) => {
  const db = await env.server.api('GET', '/api/devices');
  const families = db.families.filter((f) => (f.parts || []).length);
  assert.ok(families.length >= 5);
  for (const f of families) {
    const parts = db.parts.filter((p) => p.family === f.id);
    const last = parts[parts.length - 1];
    const r = await newProject(page, { name: `F_${f.id}`, family: f.id, part: last.part });
    assert.deepEqual(r.settings.parts, parts.map((p) => p.part), `${f.id}: device list`);
    assert.equal(r.settings.disabled, false);
    assert.equal(r.project.board, null);
    assert.equal(r.project.device.part, last.part);
    assert.ok(Object.keys(last.packages).includes(r.project.device.package));
    assert.ok(last.speeds.includes(r.project.device.speed));
  }
  // from the blinky example: its sources, hierarchy and constraints
  const r = await newProject(page, { name: 'FromExample', template: 'blinky', board: 'basys2' });
  assert.equal(r.project.top, 'top');
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_knight - knight'));
  const files = r.project.files.map((x) => x.path).sort();
  assert.ok(files.includes('src/top.vhd') && files.includes('sim/tb_top.vhd'), files.join(','));
  assert.equal(await readWs(env, 'FromExample', 'src/counter.v').then((t) => /module prescaler/.test(t)), true);
});

uiTest('New Project wizard: the synthesis tool, Silinx by default (no ISE); Design Properties switches it to XST', E, async (page) => {
  const procs = () => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((e) => e.textContent));
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'SynthTool');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  const tool = await page.eval(() => {
    const l = [...document.querySelectorAll('.dlg-overlay .wiz-main label')].find((x) => x.textContent === 'Synthesis Tool:');
    const sel = l.nextElementSibling;
    return { value: sel.value, options: [...sel.options].map((o) => o.textContent) };
  });
  assert.deepEqual(tool, { value: 'silinx', options: ['Silinx (VHDL/Verilog; no ISE needed)', 'XST (VHDL/Verilog; Xilinx ISE)'] });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent), /Synthesis Tool: {5}Silinx \(VHDL\/Verilog; no ISE needed\)/);
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'SynthTool', [], { what: 'project open' });
  assert.equal(await page.eval(() => window.Silinx.project.synthTool), 'silinx');
  // (Toolchain Settings here: an ISE mode) the project's processes are the Silinx toolchain's
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((e) => e.textContent === 'Synthesize - Yosys'), [], { what: 'Silinx processes' });
  assert.ok(!(await procs()).includes('Synthesize - XST'));
  // Design Properties: XST
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.eval(() => {
    const l = [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === 'Synthesis Tool:');
    l.nextElementSibling.value = 'xst'; l.nextElementSibling.dispatchEvent(new Event('change'));
  });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // (the project is saved and reloaded asynchronously: wait for the setting, then select the top until
  // its processes are drawn again — a selection made before the reload is lost)
  await page.waitFor(() => window.Silinx.project?.synthTool === 'xst', [], { what: 'the setting saved' });
  for (let k = 0; ; k++) {
    await page.treeRow('#hier', 'top');
    try { await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((e) => e.textContent === 'Synthesize - XST'), [], { what: 'XST processes', timeout: 3000 }); break; } catch (e) { if (k >= 4) throw e; }
  }
  assert.equal((await env.server.api('GET', '/api/projects/SynthTool')).synthTool, 'xst');
});

// an example opened from the Start page (#776): New Project…, then its template in "Start from"
async function newFromExample(page, t) {
  // (the Start page is drawn again asynchronously after the project closes: a click on the link it replaces is
  // lost, so click until the wizard opens)
  for (let k = 0; ; k++) {
    await page.click('#start-page .entry a', { text: 'New Project…' });
    try { await page.waitDialog('New Project Wizard', { timeout: 3000 }); break; } catch (e) { if (k >= 4) throw e; }
  }
  await page.fill('.dlg-overlay .wiz-main select', t);
}

uiTest('Start page: no Open Example entries (#776); New Project… lists the seven examples, gates first, traffic second; pong for the Nexys2-1200: the game with the Nexys2\'s pins', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.waitForSelector('#start-page .start-box');
  // (drawn again asynchronously after the project closes: wait for its Project Commands)
  await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'New Project…'), [], { what: 'the Start page' });
  // the examples are New Project's templates now, not entries of their own (#776)
  const entries = await page.eval(() => [...document.querySelectorAll('#start-page .entry a')].map((a) => a.textContent));
  assert.deepEqual(entries.filter((e) => /^Open Example/.test(e)), []);
  assert.deepEqual(entries.slice(0, 4), ['New Project…', 'Open Project…', 'Import Silinx ISE Project (.zip)…', 'Import Xilinx ISE Project (.zip)…']);
  await newFromExample(page, 'pong');
  // the wizard's list of templates: the empty project, then the examples in their order
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .wiz-main select').options].map((o) => [o.value, o.textContent])),
    [['empty', 'Empty project'], ...['gates', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga'].map((t) => [t, `Example: ${t}`])]);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'PongN2');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  await page.fill('.dlg-overlay .wiz-main select', 'nexys2', { index: 0 });
  await page.fill('.dlg-overlay .wiz-main select', 'xc3s1200e', { index: 3 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'PongN2', [], { what: 'project PongN2 open' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.equal(pj.top, 'pong');
  assert.deepEqual([pj.device.part, pj.device.package], ['xc3s1200e', 'fg320']);
  assert.ok(pj.files.some((f) => f.path === 'sim/tb_pong.v' && f.role === 'sim'));
  // the constraints are the Nexys2's (BTN0 on B18, LD0 on J14), not the Basys2's the example ships
  const ucf = await readWs(env, 'PongN2', 'constraints/top.ucf');
  assert.match(ucf, /NET "btn<0>" +LOC = "B18"/);
  assert.match(ucf, /NET "led<0>" +LOC = "J14"/);
  assert.doesNotMatch(ucf, /"G12"/);
});

uiTest('Example gates (New Project…): the schematic of the gates, synchronized with its VHDL; the test bench checks the 16 inputs: Simulation finished OK', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.waitForSelector('#start-page .start-box');
  await newFromExample(page, 'gates');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Gates');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Gates' && window.Silinx.hdlToSch?.['src/gates.vhd'] === 'src/gates.sch.json', [], { what: 'project Gates open, its schematic linked to gates.vhd' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.top, pj.simTop, pj.board, pj.constraints], ['gates', 'tb_gates', 'basys2', 'constraints/gates.ucf']);
  const shipped = (f) => fs.readFile(path.join(ROOT, 'examples/gates', f), 'utf8');
  assert.equal(await readWs(env, 'Gates', 'constraints/gates.ucf'), await shipped('constraints/gates.ucf'));
  // the schematic: 16 gates (and the bus taps / join), no check message, the HDL left as it is
  await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/gates.sch.json' && document.querySelectorAll(`${sel} g.sym[data-kind=sym]`).length === 21, [ED], { what: 'the schematic drawn' });
  const drawn = await page.eval(() => {
    const d = window.Silinx.active.schEditor.getDoc();
    const n = {};
    for (const s of d.symbols) n[s.type] = (n[s.type] || 0) + 1;
    return { n, nc: document.querySelectorAll('.doc:not([hidden]) .sch-editor rect.nc').length, desc: document.querySelector('.doc:not([hidden]) .sch-editor .se-desc')?.textContent || '' };
  });
  assert.deepEqual(drawn.n, { slice: 4, inv: 3, and3: 4, or4: 1, nand2: 3, nand3: 4, nand4: 1, busjoin: 1 });
  assert.equal(drawn.nc, 0, 'no unconnected pin');
  assert.match(drawn.desc, /4-bit prime-number detector/);
  // the VHDL: the banner of the synchronized file, the text the example ships
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent), 'Read-only, generated from gates.sch.json', 'in sync: read-only (#1176)');
  assert.equal(await readWs(env, 'Gates', 'src/gates.vhd'), await shipped('src/gates.vhd'));
  // Simulate Behavioral Model of tb_gates: all 16 inputs checked, both outputs right
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_gates');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  const out = await page.waitFor(() => { const t = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'); return window.Silinx.active?.id === 'isim' && /Simulation finished OK/.test(t) ? t : null; }, [], { timeout: 30000, what: 'Simulation finished OK' });
  assert.doesNotMatch(out, /ERROR|Warning/i);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Example traffic (New Project…), the second example: the state diagram and the truth table, synchronized with their VHDL; the test bench: Simulation finished OK', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.waitForSelector('#start-page .start-box');
  await newFromExample(page, 'traffic');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Traffic');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Traffic' && window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json' && window.Silinx.hdlToSch?.['src/lamps.vhd'] === 'src/lamps.tt.json', [], { what: 'project Traffic open, its state diagram and truth table linked to their VHDL' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.top, pj.simTop, pj.board, pj.constraints], ['top', 'tb_traffic', 'basys2', 'constraints/traffic.ucf']);
  const shipped = (f) => fs.readFile(path.join(ROOT, 'examples/traffic', f), 'utf8');
  assert.equal(await readWs(env, 'Traffic', 'constraints/traffic.ucf'), await shipped('constraints/traffic.ucf'));
  // the state diagram: its 7 states drawn, CARS the initial one, no problem, synchronized with traffic.vhd
  await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
  const FSM = '.doc:not([hidden]) .fsm-editor';
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json' && document.querySelectorAll(`${ed} .fsm-state`).length === 7, [FSM], { what: 'the state diagram drawn' });
  const states = await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-state`)].map((g) => `${g.querySelector('.fsm-name').textContent} ${g.querySelector('.fsm-outs')?.textContent || ''}`.trim()), FSM);
  assert.deepEqual(states, ['CARS phase=0', 'CARS_YELLOW phase=1', 'ALL_RED phase=2', 'WALK phase=3', 'WALK_END phase=4', 'ALL_RED_2 phase=5', 'NIGHT phase=6']);
  assert.ok(await page.eval((ed) => !!document.querySelector(`${ed} [data-state=s1].initial .fsm-circle-in`), FSM), 'CARS is the initial state');
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-trans]`).length, FSM), 8);
  // no error, no warning (only the notes that each state waits for its condition)
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-problems`).textContent, FSM), /^Problems \(0 error\(s\), 0 warning\(s\)\)/);
  await page.waitFor((ed) => /^HDL: traffic\.vhd — generated from the diagram$/.test(document.querySelector(`${ed} .fsm-link`)?.textContent || ''), [FSM], { what: 'the diagram synchronized with traffic.vhd' });
  // the truth table: 4 inputs, its 5 lamp outputs, synchronized with lamps.vhd
  await page.eval(() => window.SilinxApp.openTt('src/lamps.tt.json'));
  const TT = '.doc:not([hidden]) .tt-editor';
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/lamps.tt.json' && document.querySelector(t), [TT], { what: 'the truth table editor' });
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], TT), ['phase2, phase1, phase0, blink', 'car_r, car_y, car_g, walk_r, walk_g']);
  const cols = await page.eval((t) => Object.fromEntries(['car_r', 'car_y', 'car_g', 'walk_r', 'walk_g'].map((o) => [o, [...document.querySelectorAll(`${t} .tt-cell[data-out=${o}]`)].map((c) => c.textContent).join('')])), TT);
  assert.deepEqual(cols, { car_r: '00001111111100XX', car_y: '00110000000001XX', car_g: '11000000000000XX', walk_r: '11111100001100XX', walk_g: '00000011010000XX' });
  await page.waitFor((t) => /^HDL: lamps\.vhd — generated from the table$/.test(document.querySelector(`${t} .tt-link`)?.textContent || ''), [TT], { what: 'the table synchronized with lamps.vhd' });
  // their VHDL: the banner of the synchronized file, the text the example ships (not rewritten)
  for (const [f, from] of [['src/traffic.vhd', 'traffic.fsm.json'], ['src/lamps.vhd', 'lamps.tt.json']]) {
    await page.eval((p) => window.SilinxApp.openFile(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && window.Silinx.active.editor, [f]);
    assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent), `Read-only, generated from ${from}`, `${from}: in sync, read-only (#1176)`);
    assert.equal(await readWs(env, 'Traffic', f), await shipped(f));
  }
  // Simulate Behavioral Model of tb_traffic (longer than ISim's first run: run all): the lamps and the
  // display checked on every clock cycle
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_traffic');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  // (typed once: on a slow machine ISim's first run may only start now, and 'run all' waits for it, #215)
  await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
  await page.key('Enter');
  // (a timeout says what ISim was doing: the end of its console, its time, whether it runs)
  const out = await page.waitFor(() => { const t = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'); return window.Silinx.active?.id === 'isim' && /Simulation finished OK/.test(t) ? t : null; }, [], { timeout: 60000, what: 'Simulation finished OK' })
    .catch(async (e) => { throw new Error(`${e.message}\n--- ISim: ${JSON.stringify(await page.eval(() => ({ active: window.Silinx.active?.id, running: window.Silinx.active?.view?.state?.running, time: document.querySelector('.isim-st-time')?.textContent, console: (Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n')).split('\n').slice(-15) })))}`); });
  assert.doesNotMatch(out, /ERROR|Warning/i);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('open, switch and close projects (Open Project dialog, Recent Projects, Start page)', E, async (page) => {
  for (const n of ['Alpha', 'Beta']) {
    await makeProject(env, { name: n, files: { [`src/${n.toLowerCase()}.vhd`]: `library ieee; use ieee.std_logic_1164.all;\nentity ${n.toLowerCase()} is port (a : in std_logic; y : out std_logic); end;\narchitecture r of ${n.toLowerCase()} is begin y <= not a; end r;\n` }, top: n.toLowerCase() });
  }
  // Open Project dialog (#196): the list of the workspace's projects (name, device, top, board), as the server lists them,
  // by when each was last used (its last change, or its last opening here when later), the newest first, that date last (#1156)
  const before0 = await page.eval(() => window.Silinx.project?.name ?? null);
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  const gridRows = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay table.grid tr')].map((r) => [...r.children].map((c) => c.textContent)));
  const rows = await gridRows();
  assert.deepEqual(rows[0], ['Project', 'Device', 'Top', 'Board', 'Last Used']);
  const listed = await env.server.api('GET', '/api/projects');
  const openedHere = await page.eval(() => JSON.parse(localStorage.getItem('silinx.opened') || '{}'));
  const z = (n) => String(n).padStart(2, '0'), when = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
  const used = listed.map((p) => ({ ...p, used: Math.max(p.modified, openedHere[p.name] || 0) })).sort((a, b) => b.used - a.used || (a.name < b.name ? -1 : 1));
  assert.ok(listed.every((p) => p.modified > Date.now() - 3600e3 && p.modified <= Date.now()), 'the server says when each changed');
  assert.deepEqual(rows.slice(1), used.map((p) => [p.name, p.device ? `${p.device.part}${p.device.speed}-${p.device.package}` : '', p.top || '', p.board || '', when(p.used)]));
  assert.deepEqual(rows.slice(1).filter((r) => ['Alpha', 'Beta'].includes(r[0])).map((r) => r[2]).sort(), ['alpha', 'beta']);
  // a click selects one row only; Cancel opens nothing
  await page.click('.dlg-overlay table.grid tr', { text: 'Beta' });
  await page.click('.dlg-overlay table.grid tr', { text: 'Alpha' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay table.grid tr.sel td:first-child')].map((e) => e.textContent)), ['Alpha']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.project?.name ?? null), before0);
  // Open with no row chosen: nothing opened either
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.project?.name ?? null), before0);
  // select a row, Open
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  await page.click('.dlg-overlay table.grid tr', { text: 'Alpha' });
  await page.dialogButton('Open');
  await page.waitFor(() => window.Silinx.project?.name === 'Alpha' && document.querySelector('#hier .row .lbl')?.textContent === 'Alpha');
  assert.match(await page.eval(() => document.title), /^Alpha — Silinx ISE/);
  await page.waitFor(() => window.SilinxApp.findDoc('summary'));
  await page.eval(() => window.SilinxApp.openFile('src/alpha.vhd'));
  await page.waitFor(() => window.SilinxApp.findDoc('file:src/alpha.vhd')?.editor);
  // switch: double-click the other project; the documents of the first one are closed
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  await page.dblclick('.dlg-overlay table.grid tr', { text: 'Beta' });
  await page.waitFor(() => window.Silinx.project?.name === 'Beta' && document.querySelector('#hier .row .lbl')?.textContent === 'Beta');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.docs.some((d) => d.project === 'Alpha')), false);
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'beta')));
  // the last ones opened first: Beta, then Alpha (#1156)
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  assert.deepEqual((await gridRows()).slice(1, 3).map((r) => r[0]), ['Beta', 'Alpha']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // Recent Projects lists both, newest first; choosing one switches back
  const items = await page.openMenu('File');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((i) => i.label === 'Recent Projects') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((e) => e.textContent)), ['Beta', 'Alpha', 'Clear Recent Projects']);
  await page.click('.menu-popup.sub .mi', { text: 'Alpha' });
  await page.waitFor(() => window.Silinx.project?.name === 'Alpha');
  // Close Project: back to the Start page, project items disabled
  await page.menu('File', 'Close Project');
  await page.waitFor(() => window.Silinx.project === null && !document.querySelector('[data-page=start]').hidden);
  assert.match(await page.eval(() => document.getElementById('hier').innerText), /No project open/);
  assert.equal(await page.eval(() => window.Silinx.docs.length), 0);
  const file = await page.openMenu('File');
  assert.equal(file.find((i) => i.label === 'Close Project').disabled, true);
  assert.equal(file.find((i) => i.label === 'Export Silinx ISE Project (.zip)…').disabled, true);
  await page.closeMenus();
  // the Start page opens a recent project
  await page.waitFor(() => [...document.querySelectorAll('#start-page a')].some((a) => a.textContent === 'Beta'));
  await page.click('#start-page a', { text: 'Beta' });
  await page.waitFor(() => window.Silinx.project?.name === 'Beta' && !document.querySelector('[data-page=design]').hidden);
  // the last project is reopened when the page is loaded again
  await page.goto(env.server.url);
  await page.waitFor(() => window.Silinx?.project?.name === 'Beta');
  // File ▸ Recent Projects ▸ Clear Recent Projects: the list is empty (the projects stay)
  const recentSub = async () => {
    const it = await page.openMenu('File');
    await page.hover(await page.point('body > .menu-popup > .mi', { index: it.findIndex((i) => i.label === 'Recent Projects') }));
    await page.waitForSelector('.menu-popup.sub .mi');
    return page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => [r.querySelector('.lbl').textContent, r.classList.contains('disabled')]));
  };
  await recentSub();
  await page.click('.menu-popup.sub .mi', { text: 'Clear Recent Projects' });
  await page.waitFor(() => !localStorage.getItem('silinx.recent'), [], { what: 'recent list cleared' });
  // the menus closed before File is opened again (a click on an open menu closes it)
  await page.waitFor(() => !document.querySelector('.menu-popup') && !document.querySelector('#menubar .item.open'), [], { what: 'menus closed' });
  assert.deepEqual(await recentSub(), [['Clear Recent Projects', true]]);
  await page.closeMenus();
  assert.deepEqual((await env.server.api('GET', '/api/projects')).map((p) => p.name).filter((n) => ['Alpha', 'Beta'].includes(n)).sort(), ['Alpha', 'Beta'], 'the projects are kept');
  // the Start page: no recent projects; opening one lists it again, and its Clear link empties the list
  await page.menu('File', 'Close Project');
  await page.waitFor(() => !document.querySelector('[data-page=start]').hidden && document.querySelector('#start-page .start-box'));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#start-page .start-box')][1].querySelectorAll('a').length), 0);
  await page.openProject('Alpha');
  await page.menu('File', 'Close Project');
  await page.waitFor(() => [...document.querySelectorAll('#start-page a')].some((a) => a.textContent === 'Alpha'));
  await page.click('#start-page a', { text: 'Clear Recent Projects' });
  await page.waitFor(() => ![...document.querySelectorAll('#start-page a')].some((a) => a.textContent === 'Alpha' || a.textContent === 'Clear Recent Projects'), [], { what: 'Start page list cleared' });
});

uiTest('Close Project while the project is still opening: closed after the opening, the Start page stays shown (#375)', E, async (page) => {
  await makeProject(env, { name: 'Gamma', files: { 'src/gamma.vhd': 'library ieee; use ieee.std_logic_1164.all;\nentity gamma is port (a : in std_logic; y : out std_logic); end;\narchitecture r of gamma is begin y <= not a; end r;\n' }, top: 'gamma' });
  // opened once with a file: its view (the Design page, the file open) is restored when it is opened again
  await page.openProject('Gamma');
  await page.eval(() => window.SilinxApp.openFile('src/gamma.vhd'));
  await page.waitFor(() => window.SilinxApp.findDoc('file:src/gamma.vhd')?.editor);
  await page.menu('File', 'Close Project');
  await page.waitFor(() => window.Silinx.project === null && !document.querySelector('[data-page=start]').hidden);
  const closedState = () => page.eval(() => ({ project: window.Silinx.project?.name ?? null, docs: window.Silinx.docs.length, start: !document.querySelector('[data-page=start]').hidden, design: !document.querySelector('[data-page=design]').hidden }));
  const closed = { project: null, docs: 0, start: true, design: false };
  // Close Project chosen at once after Open: run in that order, the project ends closed
  await page.eval(async () => { await Promise.all([window.SilinxApp.openProject('Gamma'), window.SilinxApp.closeProject()]); });
  assert.deepEqual(await closedState(), closed);
  // Close Project as soon as the project is open (the rest of its opening still running): the opening did not
  // show the Design page over the Start page, nor reopen its documents, after the close
  await page.eval(async () => {
    const opening = window.SilinxApp.openProject('Gamma');
    while (window.Silinx.project?.name !== 'Gamma') await new Promise((r) => setTimeout(r, 0));
    await Promise.all([opening, window.SilinxApp.closeProject()]);
  });
  assert.deepEqual(await closedState(), closed);
  // the Start page's recent project is there to click, even when the page is drawn again (a close's drawing
  // finishing late) between the press and the release: the page was rebuilt and the click lost (#494)
  const at = await page.point('#start-page a', { text: 'Gamma' });
  await page.mouse('mouseMoved', at.x, at.y);
  await page.mouse('mousePressed', at.x, at.y);
  await page.eval(() => window.SilinxApp.renderStartPage());
  await page.mouse('mouseReleased', at.x, at.y);
  await page.waitFor(() => window.Silinx.project?.name === 'Gamma' && !document.querySelector('[data-page=design]').hidden);
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
});

uiTest('Add Copy of Source: new files, association, overwrite confirmation (No keeps, Yes replaces)', E, async (page) => {
  const orig = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture r of inv is begin y <= not a; end r;\n';
  await makeProject(env, { name: 'Copies', files: { 'src/inv.vhd': orig }, top: 'inv' });
  await page.openProject('Copies');
  const dir = path.join(env.tmp, 'to-add');
  await fs.mkdir(dir, { recursive: true });
  const changed = orig.replace('not a', 'a');
  await fs.writeFile(path.join(dir, 'inv.vhd'), changed);
  await fs.writeFile(path.join(dir, 'buf2.v'), 'module buf2(input a, output y); assign y = a; endmodule\n');
  await fs.writeFile(path.join(dir, 'tb_buf2.v'), 'module tb_buf2; reg a = 0; wire y; buf2 u(.a(a), .y(y)); initial begin #10 a = 1; #10 $finish; end endmodule\n');
  const add = async (files, role, answer) => {
    await page.menu('Project', 'Add Copy of Source…');
    await page.waitDialog('Add Copy of Source');
    await page.setFiles('.dlg-overlay input[type=file]', files.map((f) => path.join(dir, f)));
    await page.fill('.dlg-overlay select', role);
    await page.dialogButton('OK');
    if (answer) {
      await page.waitDialog('Add Copy of Source');
      assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText), /src\/inv\.vhd already exists in the project\. Replace it with the copy of inv\.vhd\?/);
      await page.dialogButton(answer);
    }
    await page.waitNoDialog();
  };
  await add(['inv.vhd', 'buf2.v'], 'design', 'No');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/buf2.v'));
  assert.equal(await readWs(env, 'Copies', 'src/inv.vhd'), orig, 'No: the project file is kept');
  await page.waitConsole(/Added 1 source file\(s\)\./);
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'buf2'));
  // a simulation-only copy goes to sim/ with the Simulation association
  await add(['tb_buf2.v'], 'sim');
  await page.waitFor(() => window.Silinx.project.files.find((f) => f.path === 'sim/tb_buf2.v')?.role === 'sim');
  assert.equal(await page.eval(() => window.Silinx.project.files.find((f) => f.path === 'src/buf2.v').role), 'design');
  // an implementation-only copy: in the Implementation view, not in the Simulation view; Files and Source Properties show it
  await fs.writeFile(path.join(dir, 'syn_only.v'), 'module syn_only(input a, output y); assign y = ~a; endmodule\n');
  await add(['syn_only.v'], 'impl');
  await page.waitFor(() => window.Silinx.project.files.find((f) => f.path === 'src/syn_only.v')?.role === 'impl', [], { what: 'syn_only.v implementation only' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'syn_only'), [], { what: 'syn_only in the Implementation view' });
  await page.click('#left-tabs .tab[data-page=design]');
  await page.waitFor(() => document.querySelector('input[name=view][value=sim]')?.getClientRects().length > 0, [], { what: 'Design page shown' });
  await page.click('input[name=view][value=sim]');
  await page.waitFor(() => ![...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'syn_only') && [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'tb_buf2'), [], { what: 'syn_only hidden in the Simulation view' });
  await page.click('input[name=view][value=impl]');
  await page.click('#left-tabs .tab[data-page=files]');
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[0]?.textContent === 'src/syn_only.v' && r.cells[1]?.textContent === 'Implementation'), [], { what: 'Files view: Implementation' });
  await page.click('#left-tabs .tab[data-page=design]');
  // Yes: replaced, and the open editor of that file shows the new text after reopening
  await add(['inv.vhd'], 'design', 'Yes');
  await page.waitFor(async () => true);
  await page.waitConsole(/(Added 1 source file\(s\)\.[\s\S]*){4}/);   // buf2, tb_buf2, syn_only, then inv replaced
  assert.equal(await readWs(env, 'Copies', 'src/inv.vhd'), changed);
  // Files view: every file with its association
  await page.click('#left-tabs .tab[data-page=files]');
  const rows = await page.eval(() => [...document.querySelectorAll('#files-page tr')].slice(1).map((r) => [...r.cells].map((c) => c.textContent).join('|')));
  assert.ok(rows.includes('src/inv.vhd|All|vhdl') && rows.includes('src/buf2.v|All|verilog') && rows.includes('sim/tb_buf2.v|Simulation|verilog'), rows.join('\n'));
});

uiTest('Files view: rename a file into another folder, remove a file (right-click)', E, async (page) => {
  await makeProject(env, {
    name: 'FilesPj', top: 'a',
    files: {
      'src/a.vhd': 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin y <= x; end r;\n',
      'src/b.v': 'module b(input x, output y); assign y = ~x; endmodule\n',
    },
  });
  await page.openProject('FilesPj');
  await page.click('#left-tabs .tab[data-page=files]');
  const row = (text) => page.waitFor((t) => { const r = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === t); return r >= 0 ? r + 1 : 0; }, [text]).then((i) => i - 1);
  // rename src/a.vhd -> rtl/core/a.vhd
  await page.rightClick('#files-page tr', { index: await row('src/a.vhd') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay input[type=text]', 'rtl/core/a.vhd', { index: 1 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'rtl/core/a.vhd'));
  assert.equal(await page.eval(() => window.Silinx.project.files.some((f) => f.path === 'src/a.vhd')), false);
  assert.match(await readWs(env, 'FilesPj', 'rtl/core/a.vhd'), /entity a is/);
  await assert.rejects(fs.access(path.join(env.server.workspace, 'FilesPj', 'src/a.vhd')));
  await page.waitConsole(/Rename: src\/a\.vhd → rtl\/core\/a\.vhd\./);
  // remove src/b.v (confirmation): out of the project, but the file stays in the folder ("Not in project")
  await page.rightClick('#files-page tr', { index: await row('src/b.v') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText), /The file stays in the project folder/);
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'));
  await fs.access(path.join(env.server.workspace, 'FilesPj', 'src/b.v'));   // still on disk
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[0]?.textContent === 'src/b.v' && r.cells[1]?.textContent === 'Not in project'), [], { what: 'Not in project row' });
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#hier .lbl')].map((e) => e.textContent))).includes('b'));
  // Undo (the toast button): back in the project
  await page.click('.toast .toast-action', { text: 'Undo' });
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v' && f.role === 'design'), [], { what: 'undo: b.v back' });
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[0]?.textContent === 'src/b.v' && r.cells[1]?.textContent === 'All'), [], { what: 'b.v row in the project again' });
  // remove again, then Edit ▸ Undo Remove from Project
  await page.rightClick('#files-page tr', { index: await row('src/b.v') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'));
  await page.menu('Edit', 'Undo Remove from Project');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Edit undo: b.v back' });
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[0]?.textContent === 'src/b.v' && r.cells[1]?.textContent === 'All'), [], { what: 'b.v row in the project again' });
  // remove again, then the toolbar's Undo button
  await page.rightClick('#files-page tr', { index: await row('src/b.v') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'));
  await page.click('#toolbar .tb-btn[title=Undo]');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'toolbar undo: b.v back' });
  // Redo: the toolbar button removes it again (no question), Ctrl+Z / Ctrl+Shift+Z and Ctrl+Y alternate
  const inPj = () => page.eval(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'));
  await page.click('#toolbar .tb-btn[title=Redo]');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'toolbar redo: b.v out' });
  assert.equal(await page.dialogCount(), 0);
  await page.eval(() => document.activeElement?.blur?.());
  await page.key('z', { modifiers: 2 });
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Ctrl+Z: back' });
  await page.key('z', { modifiers: 2 | 8 });
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Ctrl+Shift+Z: out' });
  await page.key('z', { modifiers: 2 });
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Ctrl+Z: back again' });
  const edit = await page.openMenu('Edit');
  assert.ok(edit.some((i) => i.label === 'Redo Remove from Project' && !i.disabled), edit.map((i) => i.label).join(' | '));
  await page.closeMenus();
  await page.key('y', { modifiers: 2 });
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Ctrl+Y: out' });
  await page.menu('Edit', 'Undo Remove from Project');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Edit undo: back' });
  assert.ok(await inPj());
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[0]?.textContent === 'src/b.v' && r.cells[1]?.textContent === 'All'), [], { what: 'b.v row in the project again' });
  // remove once more, then right-click the "Not in project" row ▸ Add to Project
  await page.rightClick('#files-page tr', { index: await row('src/b.v') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v'));
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((r) => r.cells[1]?.textContent === 'Not in project'));
  await page.rightClick('#files-page tr', { index: await row('src/b.v') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Add to Project' });
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'Add to Project' });
});

uiTest('Files view: rename a folder (its files and subfolders follow, still registered), delete a folder', E, async (page) => {
  await makeProject(env, {
    name: 'FoldPj', top: 'a',
    files: {
      'src/a.vhd': 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin y <= x; end r;\n',
      'src/sub/b.v': 'module b(input x, output y); assign y = ~x; endmodule\n',
      'old/c.v': 'module c(input x, output y); assign y = x; endmodule\n',
    },
  });
  await page.openProject('FoldPj');
  await page.click('#left-tabs .tab[data-page=files]');
  const folderRow = (dir) => page.waitFor((d) => { const i = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.folder === d); return i >= 0 ? i + 1 : 0; }, [dir]).then((i) => i - 1);
  // rename src -> rtl: both files (also the one in src/sub) move and stay registered
  await page.rightClick('#files-page tr', { index: await folderRow('src') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename Folder…' });
  await page.waitDialog('Rename Folder');
  await page.fill('.dlg-overlay input[type=text]', 'rtl');
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'rtl/sub/b.v') && window.Silinx.project.files.some((f) => f.path === 'rtl/a.vhd'));
  assert.equal(await page.eval(() => window.Silinx.project.files.some((f) => f.path.startsWith('src/'))), false);
  assert.match(await readWs(env, 'FoldPj', 'rtl/sub/b.v'), /module b/);
  await assert.rejects(fs.access(path.join(env.server.workspace, 'FoldPj', 'src')));
  // delete the folder old (confirmation): its file is gone and unregistered
  await page.rightClick('#files-page tr', { index: await folderRow('old') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Delete Folder…' });
  await page.waitDialog('Delete Folder');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'old/c.v'));
  await assert.rejects(fs.access(path.join(env.server.workspace, 'FoldPj', 'old')));
});

uiTest('Silinx and Xilinx zip: export, import as a new project, and a failing import keeps the existing project', E, async (page) => {
  await makeProject(env, { name: 'ZipSrc', template: 'blinky', board: 'basys2' });
  await page.openProject('ZipSrc');
  await page.menu('File', 'Export Silinx ISE Project (.zip)…');
  const silinxZip = await waitDownload(page, 'ZipSrc-silinx.zip');
  await page.menu('File', 'Export Xilinx ISE Project (.zip)…');
  const xilinxZip = await waitDownload(page, 'ZipSrc.zip');
  const srcTree = (await env.server.api('GET', '/api/projects/ZipSrc')).fileTree;

  // import the Silinx zip under a new name: every file and the settings come back
  await page.menu('File', 'Import Silinx ISE Project (.zip)…');
  await page.waitDialog('Import Silinx ISE Project');
  await page.setFiles('.dlg-overlay input[type=file]', [silinxZip]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[type=text]').value), 'ZipSrc', 'name suggested from the zip');
  await page.fill('.dlg-overlay input[type=text]', 'ZipCopy');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'ZipCopy');
  await page.waitConsole(/Imported Silinx project 'ZipCopy'/);
  const copy = await env.server.api('GET', '/api/projects/ZipCopy');
  assert.deepEqual(copy.fileTree, srcTree);
  assert.equal(copy.board, 'basys2');
  assert.equal(copy.top, 'top');
  assert.equal(await readWs(env, 'ZipCopy', 'src/speed_ctrl.asm.json'), await readWs(env, 'ZipSrc', 'src/speed_ctrl.asm.json'));

  // the Xilinx zip (a .xise and its sources) imports as an ISE project
  await page.menu('File', 'Import Xilinx ISE Project (.zip)…');
  await page.waitDialog('Import Xilinx ISE Project');
  await page.setFiles('.dlg-overlay input[type=file]', [xilinxZip], { index: 1 });
  await page.fill('.dlg-overlay input[type=text]', 'FromIse');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'FromIse');
  await page.waitConsole(/Imported Xilinx ISE project 'FromIse'/);
  const ise = await env.server.api('GET', '/api/projects/FromIse');
  assert.equal(ise.top, 'top');
  for (const f of ['src/top.vhd', 'src/knight.vhd', 'src/counter.v', 'constraints/top.ucf']) assert.ok(ise.fileTree.includes(f), `${f} imported: ${ise.fileTree}`);
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_knight - knight')));

  // a broken zip imported over an existing (open) project: error, and the existing project is still there
  await page.openProject('ZipCopy');
  const bad = path.join(env.tmp, 'broken.zip');
  await fs.writeFile(bad, 'this is not a zip file');
  await page.menu('File', 'Import Silinx ISE Project (.zip)…');
  await page.waitDialog('Import Silinx ISE Project');
  await page.setFiles('.dlg-overlay input[type=file]', [bad]);
  await page.fill('.dlg-overlay input[type=text]', 'ZipCopy');
  await page.dialogButton('Import');
  await page.waitDialog('Replace Project');
  await page.dialogButton('Yes');
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay .msg-error')].length);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /cannot read zip/);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  const kept = await env.server.api('GET', '/api/projects/ZipCopy');
  assert.deepEqual(kept.fileTree, srcTree, 'the project that the import would have replaced is kept');
  assert.equal(kept.board, 'basys2');
  assert.equal(await readWs(env, 'ZipCopy', 'src/top.vhd'), await readWs(env, 'ZipSrc', 'src/top.vhd'));
  // …and it is open again, as it was before the import
  await page.waitFor(() => window.Silinx.project?.name === 'ZipCopy');
});

uiTest('New Project wizard: Top-Level Source Type Schematic / FSM / ASM / Truth Table starts the project with that top and its synchronized HDL', E, async (page) => {
  const cases = [['sch', 'top.sch.json', 'vhdl', 'Schematic'], ['fsm', 'top.fsm.json', 'verilog', 'Finite State Machine (FSM)'],
    ['asm', 'top.asm.json', 'vhdl', 'Algorithmic State Machine (ASM)'], ['tt', 'top.tt.json', 'verilog', 'Truth Table']];
  for (const [type, file, lang, label] of cases) {
    const name = `Top_${type}`;
    const r = await newProject(page, { name, lang, top: type });
    assert.ok(r.summary.includes(`Top-Level Source Type: ${label}\n`), r.summary);
    await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top === 'top', [name], { what: `${name}: top = top` });
    const hdl = `src/top.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    const pj = JSON.parse(await readWs(env, name, 'silinx.json'));
    assert.equal(pj.topSourceType, type);
    assert.ok(pj.files.some((f) => f.path === hdl && f.role === 'design'), JSON.stringify(pj.files));
    const doc = JSON.parse(await readWs(env, name, `src/${file}`));
    assert.equal(doc.generatedFile, hdl);
    assert.match(await readWs(env, name, hdl), lang === 'vhdl' ? /entity top is/ : /module top/);
    // the hierarchy shows the top as that document, and its editor is open
    await page.waitFor((f) => [...document.querySelectorAll('#hier .row')].some((r) => r.textContent.includes(`(${f})`)), [file], { what: `hierarchy shows ${file}` });
    await page.waitFor((f) => String(window.Silinx.active?.id || '').endsWith(`src/${f}`), [file], { what: `${file} editor open` });
  }
  // an example: the type stays HDL (the example has its own sources)
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Top_ex');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  assert.deepEqual(await page.eval(() => { const s = document.querySelectorAll('.dlg-overlay .wiz-main select')[6]; return [s.value, s.disabled]; }), ['hdl', true]);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('Remove from Project of a diagram (ASM chart): it leaves the hierarchy, the file stays; Undo brings it back', E, async (page) => {
  const { newModel } = await import('../../core/asm.js');
  await makeProject(env, { name: 'ExclPj', files: { 'src/ctl.asm.json': JSON.stringify(newModel('ctl', 'vhdl'), null, 2) } });
  await page.openProject('ExclPj');
  const inHier = () => page.eval(() => [...document.querySelectorAll('#hier .row')].some((r) => r.textContent.includes('ctl.asm.json')));
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.textContent.includes('ctl.asm.json')), [], { what: 'chart in the hierarchy' });
  await page.click('#left-tabs .tab[data-page=files]');
  const idx = await page.waitFor(() => { const i = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === 'src/ctl.asm.json'); return i >= 0 ? i + 1 : 0; }) - 1;
  await page.rightClick('#files-page tr', { index: idx });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => (window.Silinx.project.excluded || []).includes('src/ctl.asm.json'), [], { what: 'chart excluded' });
  await fs.access(path.join(env.server.workspace, 'ExclPj', 'src/ctl.asm.json'));
  await page.click('#left-tabs .tab[data-page=design]');
  await page.waitFor(() => ![...document.querySelectorAll('#hier .row')].some((r) => r.textContent.includes('ctl.asm.json')), [], { what: 'chart left the hierarchy' });
  // the Edit menu has one Undo, which now undoes the removal; Ctrl+Z (outside an editor) does it
  const items = await page.openMenu('Edit');
  assert.ok(items.some((i) => i.label === 'Undo Remove from Project' && !i.disabled), items.map((i) => i.label).join(' | '));
  assert.ok(!items.some((i) => i.label === 'Undo'), 'a single Undo entry');
  await page.closeMenus();
  await page.eval(() => document.activeElement?.blur?.());
  await page.key('z', { modifiers: 2 });
  await page.waitFor(() => !(window.Silinx.project.excluded || []).includes('src/ctl.asm.json'), [], { what: 'undo' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.textContent.includes('ctl.asm.json')), [], { what: 'chart back in the hierarchy' });
  assert.ok(await inHier());
});

// #1162: a project opened after another: its own processes, not the last one's (their list, caption and states), also
// with no state of its own to restore (no run yet) and no top module
uiTest('#1162 the Processes panel after opening another project: not the last project\'s processes and states', E, async (page) => {
  await makeProject(env, { name: 'ProcsFull', template: 'blinky' });
  await makeProject(env, { name: 'ProcsEmpty' });
  await page.openProject('ProcsFull');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => document.getElementById('proc-caption').textContent === 'Processes: top' && [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize')), [], { what: 'the top\'s processes' });
  // a state of the last project's (as a run leaves it)
  await page.eval(() => { window.SilinxApp.S.status.synth = 'ok'; window.SilinxApp.renderProcesses(); });
  await page.openProject('ProcsEmpty');
  const procs = await page.eval(() => ({ caption: document.getElementById('proc-caption').textContent, rows: [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent), states: document.querySelectorAll('#procs .status svg').length }));
  assert.deepEqual(procs, { caption: 'Processes: ', rows: ['Design Summary/Reports'], states: 0 });
});
