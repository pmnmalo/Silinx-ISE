// UI: the standalone single-file edition (scripts/build-standalone.mjs -> Silinx-ISE.html, built
// here into a temp directory): it loads from file:// without a server, creates a project from an
// example and simulates it; the site (--site: the page and the assets of the Silinx toolchain, as
// GitHub Pages publishes it), served over HTTP, implements blinky in the browser down to the bitstream and programs it into a
// (simulated) Basys2 over WebUSB; it keeps the projects in a folder on the disk (File System Access
// API, through a fake folder) or, without that API, in the browser's storage.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setupUi, uiTest, waitDownload, ROOT, chromeOnly, BROWSER } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { buildInfo } from '../../scripts/build-info.mjs';
import { VERSION, versionLabel } from '../../core/version.js';

let env, plain, html, site, server, siteUrl, build, skip = null;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  // a Chrome as a user's: without --allow-file-access-from-files, which the harness's has (#512)
  if (BROWSER === 'chrome') plain = await setupUi({ server: false, fileAccess: false });
  // the build script writes <its root>/dist: give it a root of its own (links to web, core, server,
  // examples and the installed packages) so that the repository's dist/ is not touched
  const require = createRequire(path.join(ROOT, 'package.json'));
  let modules;
  try {
    // (the node_modules folder of the editor's CodeMirror packages)
    const cm = require.resolve('@codemirror/view');
    modules = cm.slice(0, cm.lastIndexOf(`${path.sep}node_modules${path.sep}`) + `${path.sep}node_modules`.length);
    require.resolve('esbuild');
    require.resolve('elkjs/package.json');
  } catch { skip = 'esbuild / @codemirror / elkjs not installed (npm install): standalone build test skipped'; return; }
  const root = path.join(env.tmp, 'standalone');
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  for (const f of ['build-standalone.mjs', 'build-info.mjs']) await fs.copyFile(path.join(ROOT, 'scripts', f), path.join(root, 'scripts', f));
  // a git checkout of its own, its commit untagged: a development build, labelled with it (#135)
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'build');
  build = buildInfo(root, VERSION);
  for (const d of ['web', 'core', 'server', 'examples', 'research']) await fs.symlink(path.join(ROOT, d), path.join(root, d), 'dir');
  for (const f of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) await fs.copyFile(path.join(ROOT, f), path.join(root, f));   // the embedded notices
  await fs.symlink(modules, path.join(root, 'node_modules'), 'dir');
  site = path.join(root, 'site');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-standalone.mjs'), '--site', site], { cwd: root, encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) throw new Error(`standalone build failed: ${r.stderr || r.stdout}`);
  html = path.join(root, 'dist', 'Silinx-ISE.html');
  // the site over HTTP, as GitHub Pages serves it (no Content-Encoding: the .json.gz are fetched as bytes)
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
  server = http.createServer(async (req, res) => {
    // (dev/: the same site as the development edition of GitHub Pages, https://pmnmalo.github.io/Silinx-ISE/dev/)
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '').replace(/^dev\//, '').replace(/^$/, 'index.html') || 'index.html';
    // (the simulated Digilent board of the programming test, the fake folder of the workspace folder tests)
    const TEST = { '__test/adept-sim.js': 'adept-sim.js', '__test/fs-access-fake.js': 'fs-access-fake.js' };
    const f = TEST[rel] ? path.join(ROOT, 'test/fixtures', TEST[rel]) : path.join(site, rel);
    if (!f.startsWith(site + path.sep) && !rel.startsWith('__test/')) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(f);
      // (as GitHub Pages: readable from any page, the single file's too, #418)
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  siteUrl = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => { server?.close(); await env?.teardown?.(); await plain?.teardown?.(); });
const E = () => (skip ? { skip } : env);
const PLAIN = () => (skip ? { skip } : plain || { skip: chromeOnly });

uiTest('standalone edition (dist build): loads from file://, creates a project from an example, simulates it', E, async (page) => {
  const stat = await fs.stat(html);
  assert.ok(stat.size > 500_000, `single file of ${stat.size} bytes`);
  const text = await fs.readFile(html, 'utf8');
  assert.doesNotMatch(text, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(text, /<link[^>]+stylesheet/, 'no external stylesheets');
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'standalone boot' });
  // the version: a development build's (#135), with its date and time, not its commit (#204)
  assert.match(build?.commit || '', /^[0-9a-f]{7,}$/);
  assert.match(versionLabel(build), /^dev:[0-9a-f]{7,} \(\d{4}-\d\d-\d\d \d\d:\d\d\)$/);
  assert.equal(await page.eval(() => document.title), `Silinx ISE ${versionLabel(build)} Project Navigator`);
  assert.equal(await page.eval(() => document.querySelector('.m-ver').textContent), versionLabel(build));
  await page.waitConsole(/Browser edition: projects are stored in this browser/);
  // File menu: the bundle commands of the standalone edition
  const file = (await page.openMenu('File')).map((i) => i.label);
  assert.ok(file.includes('Open Project Bundle…') && file.includes('Download Project Bundle…'), file.join(' | '));
  await page.closeMenus();
  // New Project wizard from the embedded blinky example
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  // where the project goes: this browser's storage, not the full application's workspace folder (#125)
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main .hint:last-child').textContent), /^Projects are kept in this browser's storage \(/);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Solo');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Solo' && [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_knight - knight'));
  // the project lives in localStorage
  assert.ok(await page.eval(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes('"Solo"'))));
  // behavioural simulation of the test bench in the ISim view
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || ''), [], { what: 'simulation ran', timeout: 30000 });
  assert.ok(await page.eval(() => window.Silinx.active.view.state.rows.find((r) => r.name === 'clk').sig.wave.t.length) > 50);
  // a project that synthesizes with XST needs Xilinx ISE: a clear message, no crash
  await page.eval(async () => { window.Silinx.project.synthTool = 'xst'; await window.SilinxApp.saveProjectJson(); });
  await page.click('input[name=view][value=impl]');
  await page.menu('Process', 'Implement Top Module');
  await page.waitConsole(/This project synthesizes with XST, which needs Xilinx ISE 14\.7: not available in the browser edition\./, { timeout: 15000 });
  await page.waitFor(() => !window.Silinx.busy);
  await page.eval(async () => { window.Silinx.project.synthTool = 'silinx'; await window.SilinxApp.saveProjectJson(); });
  // programming with no bitstream yet: the reason at the end of the failure line; no "install
  // openFPGALoader…" at startup
  assert.doesNotMatch(await page.consoleText(), /Programmers found/);
  await page.eval(() => window.SilinxApp.openImpact());
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: no bitstream build\/top\.bit in this browser: run Generate Programming File first, or choose a \.bit file/);
  assert.doesNotMatch(await page.consoleText(), /see log/);
  // edits are kept across a reload (localStorage)
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- kept in the browser\n'); });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'));
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.Silinx?.project?.name === 'Solo', [], { what: 'reopened after reload' });
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor && window.Silinx.active.editor.getValue().startsWith('-- kept in the browser\n'));
  // live schematic simulation without a server: knight converted to a schematic (linked to knight.vhd)
  await page.treeRow('#hier', 'u_knight - knight', { right: true });
  await page.click('body > .menu-popup .mi', { text: 'Convert to Schematic (editable)…' });
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/knight.sch.json' && document.querySelector(`${sel} .se-btn[data-act=sim]`), [ED], { what: 'converted schematic open' });
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'standalone live simulation' });
  const leds = () => page.eval(() => { const ed = window.Silinx.active.schEditor, p = ed.getDoc().ports.find((q) => q.name === 'leds'); return ed.liveSim.portValue(p.id).v.toString(2); });
  assert.equal(await leds(), '1');
  const stepId = await page.eval(() => window.Silinx.active.schEditor.getDoc().ports.find((q) => q.name === 'step').id);
  await page.click(`${ED} .lv-ctl[data-port="${stepId}"]`);
  await page.click(`${ED} .se-simbar .lv-step`);
  assert.equal(await leds(), '10', 'one LED step after a clock cycle with step = 1');
  // Edit ▸ Undo / Redo of the conversion: the schematic and its link go and come back (browser storage)
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
  await page.menu('Edit', 'Undo Convert to Schematic (editable)');
  await page.waitFor(() => !window.Silinx.hdlToSch?.['src/knight.vhd'], [], { what: 'undo: schematic removed' });
  await page.menu('Edit', 'Redo Convert to Schematic (editable)');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/knight.vhd'] === 'src/knight.sch.json', [], { what: 'redo: schematic back' });
  await page.menu('Edit', 'Undo Convert to Schematic (editable)');
  await page.waitFor(() => !window.Silinx.hdlToSch?.['src/knight.vhd'], [], { what: 'undo again' });
}, { url: () => 'about:blank' });

uiTest('browser edition (the site over HTTP): Generate Programming File runs the Silinx toolchain in the browser', E, async (page) => {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  // the site's usage counter (GoatCounter on the published site): a stand-in recording the events
  await page.eval(() => { window.goatcounter = { count: (e) => (window.__gc ||= []).push(e.path) }; });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Web');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Web' && window.Silinx.project.top);
  assert.ok(await page.eval(() => window.SilinxApp.openMode()), 'the browser edition synthesizes with Silinx');
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX DONE ===/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  const log = await page.consoleText();
  for (const re of [/=== SILINX STEP synth ===/, /=== SILINX STEP par ===/, /=== SILINX STEP bitgen ===/, /Bitstream: build\/top\.bit/, /Bitstream downloaded: top\.bit/])
    assert.match(log, re);
  assert.doesNotMatch(log, /SILINX FAILED|Process failed/);
  // the bitstream is downloaded
  assert.deepEqual(await page.eval(() => window.__gc), ['event/new-project', 'event/bitstream'], 'what was used, counted once');
  // Help ▸ About says that this page counts (the site's counter there)
  await page.menu('Help', 'About Silinx ISE');
  await page.waitDialog('About');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .about-counts').innerText),
    /^Usage counts:\s+This page counts its visits and what is used \(a new project, a simulation, a bitstream…\) with GoatCounter: no cookies, no personal data, never the content of a project\.$/);
  await page.key('Enter');
  await page.waitNoDialog();
  const bitFile = await waitDownload(page, 'top.bit');
  const bit = await fs.readFile(bitFile);
  assert.ok(bit.length > 100_000, `top.bit downloaded (${bit.length} bytes)`);

  // Configure Target Device: Program FPGA over WebUSB. Without WebUSB (Firefox, Safari, a file): why not
  await page.eval(() => Object.defineProperty(navigator, 'usb', { value: undefined, configurable: true }));
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => /WebUSB/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'iMPACT, browser edition' });
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: programming from the browser needs Chrome or Edge \(WebUSB\)/);
  // a Basys2 (simulated: its Adept USB firmware and JTAG chain) plugged in
  await page.eval(async (url) => {
    const { SimAdeptBoard, simUsb } = await import(url);
    window.__board = new SimAdeptBoard({ fpga: 'xc3s250e', prom: 'xcf02s' });
    Object.defineProperty(navigator, 'usb', { value: simUsb(window.__board), configurable: true });
  }, `${siteUrl}__test/adept-sim.js`);
  await page.click('.doc:not([hidden]) .btn', { text: 'Initialize Chain (Scan)' });
  await page.waitConsole(/Scan finished\./);
  const log2 = await page.consoleText();
  assert.match(log2, /Position 1: XC3S250E \(IDCODE 0x11c1a093\)\s+Position 2: XCF02S \(IDCODE 0xd5045093\)/);
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/'1': Programmed successfully\./, { timeout: 60000 });
  assert.match(await page.consoleText(), /JTAG chain: XC3S250E → XCF02S\s+JPROGRAM: clearing the configuration\s+CFG_IN: \d+ bytes\s+JSTART\s+ {2}bitstream: \d+ bits in \d+\.\d s(?: \(\d+\.\d\d MHz TCK over USB\))?; INIT after \d+ polls?, DONE after \d+\s+ {2}USB: data shifts 1 x \d+\.\d KB in \d+\.\d s(?: \(\d+ KB\/s\))?; TAP moves \d+ x \d+\.\d KB in \d+\.\d s(?: \(\d+ KB\/s\))?\s+DONE: the FPGA is configured in \d+\.\d s/);
  // the FPGA took the downloaded bitstream, from its sync word
  assert.ok(await page.eval(() => window.__board.done));
  const sync = bit.indexOf(Buffer.from([0xaa, 0x99, 0x55, 0x66]));
  assert.ok(sync > 0);
  assert.equal(await page.eval(() => btoa(String.fromCharCode(...window.__board.config.subarray(0, 4096))) + window.__board.config.length),
    bit.subarray(sync, sync + 4096).toString('base64') + (bit.length - sync));
  // a .bit chosen from the disk (Choose .bit…), into another board (a Nexys2-500 would refuse it)
  await page.eval(async (url) => {
    const { SimAdeptBoard, simUsb } = await import(url);
    window.__board = Object.assign(new SimAdeptBoard({ fpga: 'xc3s500e', prom: 'xcf04s', product: 'Nexys2' }), { granted: true });
    Object.defineProperty(navigator, 'usb', { value: simUsb(window.__board), configurable: true });
  }, `${siteUrl}__test/adept-sim.js`);
  await page.setFiles('.doc:not([hidden]) input[type=file][accept=".bit"]', [bitFile]);
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'top.bit'), [], { what: 'top.bit chosen' });
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: the board's FPGA is a XC3S500E, the bitstream is for a XC3S250E/);
  assert.equal(await page.eval(() => window.__board.done), false);

  // the Platform Flash (#271): Program PROM over WebUSB (core/xcf.js) with build/top_prom.bit, verified,
  // then the FPGA reloaded from it; the lines of the full application's
  await page.eval(async (url) => {
    const { SimAdeptBoard, simUsb } = await import(url);
    window.__board = Object.assign(new SimAdeptBoard({ fpga: 'xc3s250e', prom: 'xcf02s' }), { granted: true });
    Object.defineProperty(navigator, 'usb', { value: simUsb(window.__board), configurable: true });
  }, `${siteUrl}__test/adept-sim.js`);
  await page.click('.doc:not([hidden]) .impact-dev', { text: 'XCF02S' });
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'build/top_prom.bit'), [], { what: 'the PROM\'s file' });
  await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .prom-box input[type=checkbox]')[1].click());   // reload the FPGA from it
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program PROM' });
  await page.waitDialog('Program PROM');
  await page.dialogButton('Yes');
  await page.waitConsole(/'2': XCF02S programmed and verified; FPGA loaded from the PROM \(DONE\)\./, { timeout: 120000 });
  const promLog = (await page.consoleText()).split('Programming XCF02S...')[1].trim().split('\n').map((l) => l.trimEnd());
  const blocks = promLog.filter((l) => /^ {2}programmed block/.test(l));
  const n = +blocks.at(-1).match(/\/(\d+)$/)[1];
  // (each phase's time, #287, the browser's: T)
  // (each phase's USB commands, #289: the browser's times, the counts of the data shifts kept)
  assert.deepEqual(promLog.map((l) => l.replace(/built \S+ \S+$/, 'built D T').replace(/(part 3s250ecp132) \S+ \S+, \d+ bytes$/, '$1 D T, N bytes').replace(/ in \d+\.\d s$/, ' in T s')
    .replace(/^ {2}USB: data shifts (\d+) x \d+\.\d KB in \d+\.\d s(?: \(\d+ KB\/s\))?; TAP moves \d+ x \d+\.\d KB in \d+\.\d s(?: \(\d+ KB\/s\))?(; waits \d+ x in T s)?$/, (m, k, w) => `  USB: data shifts ${k} x…${w ? '; waits' : ''}`)
    // (#291: the TCK measured in the browser's time, and so the times in clocks converted)
    .replace(/^TCK: 4\.00 MHz said, \d+\.\d\d MHz measured: the waits counted at \d+\.\d\d MHz$/, 'TCK: 4.00 MHz said, …')
    .replace(/^ {2}block program time \(ISCTESTSTATUS, every block\): \d+\.\d\d to \d+\.\d\d ms, mean \d+\.\d\d ms of TCK; \d+ polls; \d+\.\d\d to \d+\.\d\d ms, mean \d+\.\d\d ms a block in all$/, '  block program time (ISCTESTSTATUS, every block): …')), [
    'PROM image build/top_prom.bit: design top.ncd, part 3s250ecp132, built D T',
    'Platform Flash: program + reload FPGA from PROM',
    'Programmer: Digilent Basys2 (serial 10146A2B3C4D)',
    'JTAG chain: xcf02s(d5045093), xc3s250e(11c1a093)',
    'PROM xcf02s: 2048 Kbit, 4096-bit blocks',
    'TCK: 4.00 MHz said, …',
    'bitstream: design top.ncd part 3s250ecp132 D T, N bytes',
    'erasing...', 'erased in T s', 'programming...',
    ...Array.from({ length: n }, (_, i) => i).filter((i) => i % 16 === 0 || i === n - 1).map((i) => `  programmed block ${i + 1}/${n}`),
    '  block program time (ISCTESTSTATUS, every block): …', `  USB: data shifts ${n} x…`, `programmed ${n} blocks in T s`,
    'verifying...', `  USB: data shifts ${n} x…`, 'verify OK in T s', 'reconfiguring the FPGA from the PROM...', 'STATUS: DONE', 'program done in T s',
    'Platform Flash program finished.',
    "'2': XCF02S programmed and verified; FPGA loaded from the PROM (DONE).",
  ]);
  assert.doesNotMatch(await page.consoleText(), /programmed by the full Silinx application/);
  assert.doesNotMatch(promLog.join('\n'), /WARNING|ERROR|failed/);
  // the PROM holds the PROM bitstream (StartUpClk:Cclk), and the FPGA took it from the PROM
  assert.deepEqual(await page.eval(() => window.__board.promDev.errors), []);
  assert.ok(await page.eval(() => window.__board.done));
  // (the PROM's whole memory: the configuration from the sync word, as long as the .bit's at least, then the erased cells)
  const cfg = await page.eval(() => [window.__board.config.length, ...window.__board.config.subarray(0, 4)]);
  assert.deepEqual(cfg.slice(1), [0xaa, 0x99, 0x55, 0x66]);
  assert.ok(cfg[0] >= bit.length - sync, `${cfg[0]} bytes from the PROM`);
  // Back up PROM: the whole PROM read and downloaded (prom-<date>.bin, in the .bit's bit order)
  await page.click('.doc:not([hidden]) .btn', { text: 'Back up PROM' });
  await page.waitConsole(/PROM backup downloaded\./, { timeout: 120000 });
  const backup = (await page.consoleText()).split('Backing up XCF02S...')[1].trim().split('\n').map((l) => l.trimEnd());
  const name = backup.find((l) => /^PROM backup: /.test(l)).match(/^PROM backup: (prom-[\dTZ-]+\.bin) \(262144 bytes\)$/)?.[1];
  assert.ok(name, backup.join('\n'));
  assert.deepEqual(backup.map((l) => l.replace(/\(\d+ bytes before/, '(N bytes before').replace(name, 'F').replace(/ in \d+\.\d s$/, ' in T s')
    .replace(/^TCK: 4\.00 MHz said, .*$/, 'TCK: 4.00 MHz said, …')), [
    'Platform Flash: read', 'Programmer: Digilent Basys2 (serial 10146A2B3C4D)', 'JTAG chain: xcf02s(d5045093), xc3s250e(11c1a093)',
    'PROM xcf02s: 2048 Kbit, 4096-bit blocks', 'TCK: 4.00 MHz said, …', 'read 262144 bytes (N bytes before the erased tail)', 'read done in T s', 'PROM backup: F (262144 bytes)',
    'Platform Flash read finished.', 'PROM backup downloaded.',
  ]);
  const saved = await fs.readFile(await waitDownload(page, name));
  assert.equal(saved.length, 262144);
  assert.equal(saved.indexOf(Buffer.from([0xaa, 0x99, 0x55, 0x66])) >= 0, true, 'the sync word, in the .bit\'s bit order');
}, { url: () => 'about:blank', timeout: 300000 });

// ---- projects in a folder on the disk (File System Access API, Chrome / Edge). The real folder
// picker cannot be driven headless: the page gets a fake one (test/fixtures/fs-access-fake.js),
// its folder kept in IndexedDB across reloads (with a build's files), and the folder's handle "remembered" through
// window.SILINX_WORKSPACE_HANDLES (a fake handle cannot be stored in IndexedDB).
const FAKE_FOLDER = (url) => `(() => {
  const fake = () => import(${JSON.stringify(url)});
  const open = async () => (window.__fakeRoot = await (await fake()).fakeDirectoryIdb('Silinx-projects',
    { db: '__fakefs', permission: localStorage.getItem('__fakefs.permission') || 'granted' }));
  window.showDirectoryPicker = async (opts) => { window.__picker = opts; return open(); };
  window.SILINX_WORKSPACE_HANDLES = {
    load: async () => (localStorage.getItem('__fakefs.remembered') ? open() : null),
    save: async (h) => { localStorage.setItem('__fakefs.remembered', h.name); },
  };
})();`;
const NO_FOLDER_API = 'Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true, writable: true });';
const startEntries = (page) => page.eval(() => [...document.querySelectorAll('#start-page .start-storage .entry')]
  .map((e) => ({ text: e.textContent.trim(), link: !!e.querySelector('a'), title: e.title || '' })));
const statusStorage = (page) => page.eval(() => document.getElementById('status-storage').textContent);
const fileMenu = async (page) => {
  await page.openMenu('File');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')]
    .map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled'), title: r.title || '' })));
  await page.closeMenus();
  return items.filter((i) => /Workspace Folder|Reopen|Browser Storage|Browser Projects/.test(i.label));
};
const newProject = async (page, name, template) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
const UNSUPPORTED = 'This browser cannot give a page a folder on the disk (File System Access API: Chrome or Edge); the projects are kept in the browser\'s storage';

// #397: Stop during the browser flow stops it: the worker is terminated, no bitstream is written, the
// process is marked stopped; a run after it works
uiTest('browser edition: Stop during Generate Programming File stops the flow, and writes nothing of it (#397)', E, async (page) => {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Stop');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Stop' && window.Silinx.project.top);
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX STEP synth ===/, { timeout: 60000 });
  await page.menu('Process', 'Stop');
  await page.waitConsole(/Process stopped by the user\./, { timeout: 30000 });
  await page.waitFor(() => !window.Silinx.busy && !window.Silinx.currentJob, [], { what: 'the flow stopped', timeout: 30000 });
  // (a stopped worker writes nothing more: give a late message the time to come)
  await new Promise((r) => setTimeout(r, 1500));
  const log = await page.consoleText();
  assert.match(log, /\*\*\* cancel requested \*\*\*/);
  assert.doesNotMatch(log, /=== SILINX STEP par ===|Bitstream: build\/top\.bit|Bitstream downloaded|ERROR:Silinx - cancelled by user/);
  // the next run is a full one, on a new worker
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX DONE ===/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  assert.match(await page.consoleText(), /Bitstream: build\/top\.bit/);
}, { url: () => 'about:blank', timeout: 300000 });

// #280: a second Generate Programming File with the design unchanged (only the pins may have changed) starts
// at Translate, from the netlist of the first: the browser's flow worker as the server's
// #418: the single file (file://) compiles the design with the site's Yosys (here the test's site, as the
// published one: SILINX_ASSETS)
uiTest('standalone edition (file://): the Board Emulator runs blinky on the compiled engine, Yosys from the site', E, async (page) => {
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'standalone boot' });
  await page.eval((u) => { window.SILINX_ASSETS = u; }, `${siteUrl}assets/`);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'SoloEmu');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'SoloEmu' && window.Silinx.project.top);
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running', timeout: 120000 });
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-side > .emu-hint')].map((e) => e.textContent).slice(1)), []);
  // #427: in its worker, started from the page's embedded text (a Blob)
  assert.equal(await page.eval(() => window.Silinx.active.view.worker), true, 'the compiled engine in a worker');
  await page.waitFor(() => window.Silinx.active.view.sim.now > 1e11, [], { what: '0.1 s of the board\'s time', timeout: 60000 });
}, { url: () => 'about:blank', timeout: 240000 });

// #512: the single file opened from the disk in a user's Chrome (no --allow-file-access-from-files: the
// page an opaque origin, from which a module worker cannot start from a Blob): the Silinx toolchain's
// worker and the compiled engine's, embedded in the page, start as classic workers, and Yosys's too
uiTest('standalone edition (file://) in a Chrome without --allow-file-access-from-files: Generate Programming File and the Board Emulator run in their workers (#512)', PLAIN, async (page) => {
  await page.goto(pathToFileURL(html).href);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'standalone boot' });
  assert.equal(await page.eval(() => location.protocol), 'file:');
  await page.eval((u) => { window.SILINX_ASSETS = u; }, `${siteUrl}assets/`);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'SoloPlain');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'SoloPlain' && window.Silinx.project.top);
  // the flow in its worker, down to the bitstream (the old code: "the Silinx toolchain could not start in
  // this browser: the worker failed")
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX DONE ===|could not start in this browser/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  const log = await page.consoleText();
  assert.doesNotMatch(log, /could not start in this browser|the Yosys worker failed|SILINX FAILED|Process failed/);
  for (const re of [/=== SILINX STEP synth ===/, /=== SILINX STEP bitgen ===/, /Bitstream: build\/top\.bit/, /=== SILINX DONE ===/]) assert.match(log, re);
  assert.ok((await fs.readFile(await waitDownload(page, 'top.bit'))).length > 100_000, 'top.bit downloaded');
  // the Board Emulator: the compiled engine in its worker, Yosys in its own
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running', timeout: 120000 });
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-side > .emu-hint')].map((e) => e.textContent).slice(1)), [], 'no reason, no warning');
  assert.equal(await page.eval(() => window.Silinx.active.view.worker), true, 'the compiled engine in a worker');
  await page.waitFor(() => window.Silinx.active.view.sim.now > 1e11, [], { what: '0.1 s of the board\'s time', timeout: 60000 });
}, { url: () => 'about:blank', timeout: 300000 });

// #418: the Board Emulator in the browser edition compiles the design with the site's Yosys (its assets)
uiTest('browser edition: the Board Emulator runs blinky on the compiled engine, Yosys from the site\'s assets', E, async (page) => {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'WebEmu');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'WebEmu' && window.Silinx.project.top);
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running', timeout: 120000 });
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-side > .emu-hint')].map((e) => e.textContent).slice(1)), [], 'no reason, no warning');
  assert.equal(await page.eval(() => window.Silinx.active.view.worker), true, 'the compiled engine in a worker (#427)');
  // the board's time runs at the clock's rate (real time): blinky's knight rider moves
  await page.waitFor(() => window.Silinx.active.view.sim.now > 1e11, [], { what: '0.1 s of the board\'s time', timeout: 60000 });
  assert.ok(await page.eval(() => window.Silinx.active.view.outputs.leds.some((v) => v > 0)), 'an LED lit');
}, { url: () => 'about:blank', timeout: 240000 });

uiTest('#280 browser edition: Generate Programming File again, the design unchanged: the synthesis up to date, not run again', E, async (page) => {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Again');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Again' && window.Silinx.project.top);
  await page.click('input[name=view][value=impl]');
  const run = async () => {
    const before = (await page.consoleText()).length;
    await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
    await page.waitFor((b) => /Process "Generate Programming File" (completed successfully|failed)/.test(document.getElementById('console-log').innerText.slice(b)), [before], { what: 'the flow', timeout: 120000 });
    return (await page.consoleText()).slice(before);
  };
  let log = await run();
  assert.match(log, /=== SILINX STEP synth ===/);
  assert.match(log, /Process "Generate Programming File" completed successfully/);
  log = await run();
  assert.doesNotMatch(log, /=== SILINX STEP synth ===/);
  assert.match(log, /Process "Synthesize - Yosys" is up to date: its netlist build\/open\/top\.json is used\./);
  assert.match(log, /=== SILINX STEP translate ===[\s\S]*=== SILINX STEP bitgen ===/);
  assert.match(log, /Process "Generate Programming File" completed successfully/);
  const st = await page.eval(() => window.SilinxApp.S.status);
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(st[id]), `${id}: ${st[id]}`);
}, { url: () => 'about:blank', timeout: 240000 });

uiTest('browser edition: File ▸ Open Workspace Folder… keeps the projects in a folder on the disk, in the full application\'s format', E, async (page) => {
  const fakeUrl = `${siteUrl}__test/fs-access-fake.js`;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_FOLDER(fakeUrl) });
  const boot = async () => {
    await page.eval(async (url) => window.__fakeRoot && (await import(url)).flushFake(window.__fakeRoot), fakeUrl).catch(() => {});   // the fake folder written
    await page.goto(siteUrl);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices && document.getElementById('status-storage').textContent
      && document.querySelector('#start-page .start-storage, #hier .lbl'), [], { what: 'site boot' });
  };
  const files = () => page.eval(async (url) => (await import(url)).dump(window.__fakeRoot), fakeUrl);
  await boot();
  await page.waitConsole(/Browser edition: projects are stored in this browser \(File > Download Project Bundle to keep a copy; File > Open Workspace Folder… keeps them in a folder on the disk\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: false, title: '' }]);
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Open Workspace Folder…', link: true, title: '' },
  ]);
  // a project in the browser's storage, then the folder
  await newProject(page, 'InBrowser', 'blinky');
  await page.menu('File', 'Open Workspace Folder…');
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk: each project is a folder in the format of the full Silinx application\./);
  assert.deepEqual(await page.eval(() => window.__picker), { id: 'silinx-workspace', mode: 'readwrite' });
  assert.equal(await page.eval(() => window.Silinx.project), null, 'the browser storage\'s project is closed');
  assert.equal(await statusStorage(page), 'Storage: folder Silinx-projects');
  // the New Project wizard names the folder (#125)
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .wiz-main .form-grid input[disabled]').value, document.querySelector('.dlg-overlay .wiz-main .hint:last-child').textContent]),
    ['Silinx-projects/…', 'Projects are kept in the folder Silinx-projects on the disk (File ▸ Open Workspace Folder… to change it).']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: false, title: '' },
    { label: 'Copy Browser Projects to the Folder', disabled: false, title: '' }, { label: 'Use Browser Storage', disabled: false, title: '' }]);
  await page.waitFor(() => /In the folder/.test(document.querySelector('#start-page .start-storage')?.textContent || ''));
  assert.deepEqual((await startEntries(page)).map((e) => e.text), ['In the folder Silinx-projects on the disk.', 'Open Workspace Folder…', 'Copy Browser Projects to the Folder', 'Use Browser Storage']);
  // a project created and edited in the folder: a project folder as the full application's
  await newProject(page, 'Disk', 'stopwatch');
  await page.eval(() => window.SilinxApp.openFile('src/stopwatch.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/stopwatch.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- kept in the folder\n'); });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'));
  let tree = await files();
  assert.ok(tree['Disk/src/stopwatch.vhd'].startsWith('-- kept in the folder\n'));
  const example = JSON.parse(await fs.readFile(path.join(ROOT, 'examples/stopwatch/silinx.json'), 'utf8'));
  const pj = JSON.parse(tree['Disk/silinx.json']);
  assert.equal(tree['Disk/silinx.json'], `${JSON.stringify(pj, null, 2)}\n`);
  assert.deepEqual({ name: pj.name, board: pj.board, top: pj.top, files: pj.files, constraints: pj.constraints },
    { name: 'Disk', board: 'basys2', top: example.top, files: example.files, constraints: example.constraints });
  for (const f of await fs.readdir(path.join(ROOT, 'examples/stopwatch/src'))) assert.ok(`Disk/src/${f}` in tree, f);
  assert.equal(Object.keys(tree).some((k) => k.startsWith('InBrowser/')), false);
  // the browser storage's projects copied into the folder (once: then they are there)
  await page.menu('File', 'Copy Browser Projects to the Folder');
  await page.waitConsole(/Copied 1 project\(s\) from the browser's storage into the folder 'Silinx-projects': InBrowser\./);
  tree = await files();
  assert.equal(JSON.parse(tree['InBrowser/silinx.json']).name, 'InBrowser');
  assert.ok(tree['InBrowser/src/top.vhd']);
  await page.menu('File', 'Copy Browser Projects to the Folder');
  await page.waitConsole(/No project copied into the folder 'Silinx-projects'\.\s+WARNING: project 'InBrowser' was not copied: the folder 'Silinx-projects' already has a project of that name\./);
  // reloaded: the folder again (the browser still gives the permission), the project open, the edit kept
  await boot();
  await page.waitFor(() => window.Silinx.project?.name === 'Disk', [], { what: 'reopened from the folder' });
  await page.waitConsole(/Browser edition: projects are stored in the folder 'Silinx-projects' on the disk \(File > Use Browser Storage to keep them in this browser\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: folder Silinx-projects');
  await page.eval(() => window.SilinxApp.openFile('src/stopwatch.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor && window.Silinx.active.editor.getValue().startsWith('-- kept in the folder\n'));
  // after a browser restart the permission is asked again (a click: Reopen <folder>)
  await page.eval(() => localStorage.setItem('__fakefs.permission', 'prompt'));
  await boot();
  await page.waitConsole(/The workspace folder 'Silinx-projects' needs the browser's permission again: Start page > Reopen Silinx-projects\./);
  assert.equal(await page.eval(() => window.Silinx.project), null);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Reopen Silinx-projects', link: true, title: '' },
    { text: 'Open Workspace Folder…', link: true, title: '' },
  ]);
  assert.deepEqual((await fileMenu(page)).map((i) => i.label), ['Open Workspace Folder…', 'Reopen Silinx-projects']);
  await page.click('#start-page .start-storage a', { text: 'Reopen Silinx-projects' });
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk/);
  assert.equal(await page.eval(() => window.__fakeRoot.queryPermission({ mode: 'readwrite' })), 'granted');
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay table.grid tr td:first-child')].map((td) => td.textContent)), ['Disk', 'InBrowser']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the build's files go into the project's build/ folder, as the full application writes them
  await page.eval(() => window.SilinxApp.openProject('InBrowser').then(() => window.SilinxApp.showLeftPage('design')));
  await page.waitFor(() => window.Silinx.project?.name === 'InBrowser' && window.Silinx.project.top);
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Bitstream downloaded: top\.bit/, { timeout: 120000 });
  await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
  assert.doesNotMatch(await page.consoleText(), /was not written into the workspace folder/);
  tree = await files();
  assert.ok(tree['InBrowser/build/top.bit']?.length > 100_000, Object.keys(tree).filter((k) => k.includes('/build/')).join(' '));
  assert.deepEqual((await page.eval(() => window.Silinx.fileTree)).filter((f) => f.startsWith('build/')), []);
  // with the Design Summary's reports and the FPGA view's model (build/reports.json, build/open/fpga-view.json, #126)
  const saved = JSON.parse(tree['InBrowser/build/reports.json']);
  assert.deepEqual([saved.source, saved.top, saved.summary.routed, saved.summary.bitstream], ['open', 'top', true, true]);
  assert.equal(JSON.parse(tree['InBrowser/build/open/fpga-view.json']).key, 'browser:2');
  assert.ok(tree['InBrowser/build/open/routed.xdl'] && tree['InBrowser/build/silinx-status.json']);
  const SUMMARY = '.doc:not([hidden]) .page';
  const summary = async () => {
    await page.eval(() => window.SilinxApp.openSummary());
    await page.waitFor((s) => /Device Utilization Summary \(Silinx toolchain\)/.test(document.querySelector(s)?.innerText || ''), [SUMMARY], { what: 'Design Summary with the reports' });
    return page.eval((s) => document.querySelector(s).innerText, SUMMARY);
  };
  const built = await summary();
  for (const re of [/Number of occupied Slices\s+\d+\s+2448\s+\d+%/, /Timing \(post Place & Route, Silinx toolchain estimate\)/, /All constraints met/, /Bitstream\s+build\/top\.bit/, /Routed Design \(XDL\)\s+Current/])
    assert.match(built, re);
  const IMPL = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen'];
  const status = () => page.eval((ids) => ids.map((id) => window.SilinxApp.S.status[id]), IMPL);
  const builtStatus = await status();
  assert.ok(builtStatus.every((s) => ['ok', 'warn'].includes(s)), builtStatus.join(' '));
  // reloaded (the browser still gives the permission): the same Design Summary and process states,
  // read back from build/ (no new run)
  await page.eval(() => localStorage.setItem('__fakefs.permission', 'granted'));
  await boot();
  await page.waitFor(() => window.Silinx.project?.name === 'InBrowser' && window.Silinx.project.top, [], { what: 'reopened from the folder' });
  await page.click('input[name=view][value=impl]');
  await page.waitFor((ids) => ids.every((id) => window.SilinxApp.S.status[id]), [IMPL], { what: 'process states restored' });
  assert.deepEqual(await status(), builtStatus);
  assert.equal(await summary(), built);
  // the Detailed Reports: the routed design opens from build/ (not among the project's files)
  await page.click(await page.eval((s) => {
    const a = [...document.querySelectorAll(`${s} tr`)].find((r) => r.cells[0]?.textContent === 'Routed Design (XDL)')?.querySelector('a');
    a.scrollIntoView({ block: 'nearest' });
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, SUMMARY));
  await page.waitFor(() => window.Silinx.active?.path === 'build/open/routed.xdl' && window.Silinx.active.editor?.getValue().length > 1000, [], { what: 'routed.xdl open' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.getValue()), tree['InBrowser/build/open/routed.xdl']);
  // View Implemented Design (FPGA): opens at once, without building again
  await page.treeRow('#procs', 'View Implemented Design (FPGA)', { dbl: true, exact: true });
  await page.waitFor(() => window.SilinxApp.findDoc('fpgaview') && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.active.title), 'FPGA (top)');
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false, 'no offer to run Implement Design');
  // View Technology Schematic: the netlist of the synthesis read back from build/open/top.json (no Synthesize again)
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'tech:top' && window.Silinx.active.viewer?.getDoc().symbols.length > 10, [], { what: 'technology schematic from build/', timeout: 60000 });
  let log = await page.consoleText();
  assert.match(log, /Technology Schematic of 'top': the netlist of the Silinx toolchain's synthesis \(build\/open\/top\.json\), \d+ cells in \d+ block\(s\): /);
  assert.doesNotMatch(log, /=== SILINX STEP|Sources changed since the last implementation run|WARNING|ERROR/);
  // the sources changed since: the processes out of date (as the full application), the reports still shown
  await page.eval(async () => {
    const f = await (await (await window.__fakeRoot.getDirectoryHandle('InBrowser')).getDirectoryHandle('src')).getFileHandle('top.vhd');
    const text = await (await f.getFile()).text();
    const w = await f.createWritable();
    await w.write(`-- changed on the disk\n${text}`);
    await w.close();
  });
  await boot();
  await page.waitFor(() => window.Silinx.project?.name === 'InBrowser' && window.Silinx.project.top, [], { what: 'reopened after the change' });
  await page.waitConsole(/Sources changed since the last implementation run: processes marked out of date\./);
  assert.deepEqual(await status(), IMPL.map(() => 'stale'));
  assert.equal(await summary(), built);
  log = await page.consoleText();
  assert.doesNotMatch(log, /=== SILINX STEP|WARNING|ERROR/);
  // back to the browser's storage: its own projects; the next visit stays there (the folder offered again)
  await page.menu('File', 'Use Browser Storage');
  await page.waitConsole(/Projects are now kept in this browser's storage\./);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  await boot();
  await page.waitConsole(/Browser edition: projects are stored in this browser/);
  assert.doesNotMatch(await page.consoleText(), /needs the browser's permission again/);
  assert.deepEqual((await startEntries(page)).map((e) => e.text), ['In this browser\'s storage.', 'Reopen Silinx-projects', 'Open Workspace Folder…']);
  // in Portuguese: the Start page, the status bar and the File menu (texts and tooltips) translated
  const texts = async () => {
    await page.eval(TEXTS);
    await page.openMenu(0); // File (Ficheiro);
    const t = await page.eval(() => [...window.__uiTexts(document.getElementById('start-page')), ...window.__uiTexts(document.getElementById('statusbar')),
      ...window.__uiTexts(document.querySelector('body > .menu-popup'))]);
    await page.closeMenus();
    return t;
  };
  const en = await texts();
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot();
  const pt = await texts();
  assert.ok(pt.includes('Reabrir Silinx-projects') && pt.includes('Onde Ficam os Projetos') && pt.includes('Armazenamento: este navegador'), pt.join(' | '));
  assert.deepEqual(untranslated(en, pt, [/^(InBrowser|Disk|Silinx-projects)$/]), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 120000 });

uiTest('browser edition without the File System Access API (Firefox, Safari): Open Workspace Folder… disabled, and why', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_FOLDER_API });
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && document.querySelector('#start-page .start-storage'), [], { what: 'site boot' });
  await page.waitConsole(/Browser edition: projects are stored in this browser \(File > Download Project Bundle to keep a copy\)\. Implement Design/);
  assert.equal(await statusStorage(page), 'Storage: this browser');
  assert.deepEqual(await fileMenu(page), [{ label: 'Open Workspace Folder…', disabled: true, title: UNSUPPORTED }]);
  assert.deepEqual(await startEntries(page), [
    { text: 'In this browser\'s storage.', link: false, title: '' },
    { text: 'Open Workspace Folder…', link: false, title: UNSUPPORTED },
    { text: 'A folder on the disk needs Chrome or Edge.', link: false, title: '' },
  ]);
  // the browser's storage works as before
  await newProject(page, 'NoFolder', 'blinky');
  assert.ok(await page.eval(() => JSON.parse(localStorage.getItem('silinx.standalone.fs')).NoFolder.json.name === 'NoFolder'));
}, { url: () => 'about:blank', skip: chromeOnly });

// a new project from an example in the browser edition (the site): the New Project wizard
async function newSiteProject(page, name, example) {
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', example, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
  await page.click('input[name=view][value=impl]');
}

uiTest('browser edition: Back-annotate Pin Locations runs the Silinx toolchain in the browser and writes the placer\'s pins into the UCF (#118)', E, async (page) => {
  await newSiteProject(page, 'WebPins', 'blinky');
  // no board (its pins would be required), the UCF without the LOCs of four LEDs and a switch
  const ucf = (await fs.readFile(path.join(ROOT, 'examples/blinky/constraints/top.ucf'), 'utf8'))
    .split('\n').map((l) => (/"(led<[4-7]>|sw<3>)"/.test(l) ? l.replace(/LOC = "\w+" \| /, '') : l)).join('\n');
  await page.eval(async (text) => {
    window.Silinx.project.board = null;
    await window.SilinxApp.saveProjectJson();
    const d = await window.SilinxApp.openFile('constraints/top.ucf');
    d.editor.setValue(text);
    await window.SilinxApp.saveAll();
  }, ucf);
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitDialog('Back-annotate Pin Locations', { timeout: 120000 });
  const pins = ['NET "led<4>" LOC = "H3";', 'NET "led<5>" LOC = "N4";', 'NET "led<6>" LOC = "N5";', 'NET "led<7>" LOC = "M4";', 'NET "sw<3>" LOC = "P4";'];
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent),
    `Add the 5 pin location(s) chosen by the tools to constraints/top.ucf?\n\n${pins.join('\n')}`);
  const log = await page.consoleText();
  for (const re of [/=== SILINX STEP par ===/, /=== SILINX STEP pin2ucf ===/, /Pin locations of 15 port bit\(s\), 5 of them chosen by the placer \(no LOC in the constraints\): build\/top_pins\.ucf/])
    assert.match(log, re);
  assert.deepEqual(log.split('\n').filter((l) => /warning/i.test(l)),
    ['WARNING:ConstraintSystem - "constraints/top.ucf" Line 22: 5 port bit(s) of \'top\' have no LOC: sw<3>, led<4>, led<5>, led<6>, led<7>',
      'WARNING:Silinx - 5 port bit(s) have no LOC constraint (sw<3>, led<4>, led<5>, led<6>, led<7>): the Silinx toolchain chooses their pins - do NOT program real hardware with this bitstream',
      'Process "Back-annotate Pin Locations" completed successfully with 2 warning(s)']);
  // the constraints' warning: the process's own (after its Started line), counted with the others,
  // in the Warnings tab once; the process's icon a warning (#129)
  const run = log.slice(log.lastIndexOf('Started : "Back-annotate Pin Locations"'));
  assert.match(run, /^Started : "Back-annotate Pin Locations"\.\n+WARNING:ConstraintSystem - "constraints\/top\.ucf" Line 22: 5 port bit\(s\) of 'top' have no LOC/);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 2);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(2)');
  await page.dialogButton('Yes');
  await page.waitConsole(/Back-annotated 5 pin location\(s\) into constraints\/top\.ucf\./);
  const saved = await page.eval(async () => (await window.SilinxApp.openFile('constraints/top.ucf')).editor.getValue());
  assert.equal(saved, `${ucf.replace(/\s*$/, '\n')}\n# Back-annotated pin locations (Silinx toolchain, ${new Date().toISOString().slice(0, 10)})\n${pins.join('\n')}\n`);
  // built again from it: nothing more to add, no warning
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitConsole(/every port already has a LOC in the UCF \(nothing to add\)\./, { timeout: 120000 });
  assert.deepEqual((await page.consoleText()).split('Back-annotated 5 pin location(s)').pop().split('\n').filter((l) => /warning/i.test(l)), []);
}, { url: () => 'about:blank', timeout: 240000 });

// (the names as the netlist writes them, like ISE's: IBUF, FDRE, LUT4, dbL; #131)
uiTest('browser edition: View Technology Schematic of blinky and pong: the netlist of the Silinx toolchain\'s synthesis in the browser, by instance (#119)', E, async (page) => {
  const view = () => page.eval(() => {
    const ed = window.Silinx.active?.viewer;
    return ed ? { id: window.Silinx.active.id, crumb: document.querySelector('.doc:not([hidden]) .rtl-crumbs b')?.textContent, syms: ed.getDoc().symbols.map((x) => ({ id: x.id, module: x.params?.module || null })) } : null;
  });
  for (const [name, top, blocks, inside] of [['blinky', 'top', ['u_pre', 'u_speed', 'u_knight'], 'u_knight'], ['pong', 'pong', ['display', 'dbL', 'dbR', 'db1', 'db2', 'timer_logic'], 'display']]) {
    await newSiteProject(page, `WebTech_${name}`, name);
    await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
    await page.waitFor((t) => window.Silinx.active?.id === `tech:${t}` && window.Silinx.active.viewer?.getDoc().symbols.length > 10, [top], { what: `technology schematic of ${name}`, timeout: 180000 });
    const log = await page.consoleText();
    assert.match(log, /=== SILINX STEP synth ===/);
    assert.match(log, new RegExp(`Technology Schematic of '${top}': the netlist of the Silinx toolchain's synthesis \\(build/open/${top}\\.json\\), \\d+ cells in \\d+ block\\(s\\): `));
    assert.doesNotMatch(log, /SILINX FAILED|ERROR/);
    let v = await view();
    assert.equal(v.crumb, `${top} : ${top}`);
    const mods = new Set(v.syms.map((x) => x.module));
    for (const m of ['IBUF', 'OBUF', 'BUFG', ...blocks]) assert.ok(mods.has(m), `${name}: ${m} (${[...mods].join(' ')})`);
    // push into an instance: LUTs and flip-flops; a LUT's function on demand
    await page.dblclick(`.doc:not([hidden]) .se-svg [data-kind=sym][data-id="${v.syms.find((x) => x.module === inside).id}"]`);
    // (the crumbs say the instance once its drawing is shown, #346: a click before then went to the drawing left)
    await page.waitFor((b) => document.querySelector('.doc:not([hidden]) .rtl-crumbs b')?.textContent === `${b} : ${b}`, [inside], { what: `inside ${inside}`, timeout: 60000 });
    v = await view();
    assert.ok(!v.syms.some((x) => x.module === inside), `${name}/${inside}: the instance's drawing`);
    assert.ok(v.syms.some((x) => x.module === 'FDRE'), `${name}/${inside}: flip-flops`);
    const lut = v.syms.find((x) => /^LUT[1-4]$/.test(x.module));
    await page.click(`.doc:not([hidden]) .se-svg [data-kind=sym][data-id="${lut.id}"]`);
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-lutfn > summary')?.getClientRects().length, [], { what: 'the LUT function' });
    await page.click('.doc:not([hidden]) .se-lutfn > summary');
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-lutfn[open] .se-lut-eq')?.getClientRects().length, [], { what: 'the LUT equation' });
    assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-lut-eq').textContent), /^O = (0|1|!?I\d)/);
  }
}, { url: () => 'about:blank', timeout: 400000 });

uiTest('the site\'s development edition (dev/): says so, and keeps its projects apart from the stable edition\'s', E, async (page) => {
  // a project in the stable edition's storage
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'stable boot' });
  await page.eval(() => localStorage.setItem('silinx.standalone.fs', JSON.stringify({ Stable: { json: { name: 'Stable', version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [], top: '' }, files: {} } })));
  // the development edition: its own storage (no Stable), a warning at start-up
  await page.goto(`${siteUrl}dev/`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'dev boot' });
  await page.waitConsole(/Development edition \(built from main, not a release\): its projects are kept apart from the stable edition's, http:\/\/127\.0\.0\.1:\d+\/ /);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'DevOnly');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'DevOnly');
  const ls = await page.eval(() => ({ dev: Object.keys(JSON.parse(localStorage.getItem('silinx.dev.standalone.fs') || '{}')), stable: Object.keys(JSON.parse(localStorage.getItem('silinx.standalone.fs') || '{}')) }));
  assert.deepEqual(ls, { dev: ['DevOnly'], stable: ['Stable'] });
  // the stable edition: no warning, its own project only
  await page.goto(siteUrl);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'stable boot again' });
  assert.doesNotMatch(await page.consoleText(), /Development edition/);
  assert.deepEqual(await page.eval(() => Object.keys(JSON.parse(localStorage.getItem('silinx.standalone.fs')))), ['Stable']);
}, { url: () => 'about:blank' });

uiTest('the site\'s Check for Updates (#198): the page open against the one the site serves (version.json), never GitHub\'s latest release; a newer page served: reload', E, async (page) => {
  // the site's build says what it serves
  const vfile = path.join(site, 'version.json');
  const served = JSON.parse(await fs.readFile(vfile, 'utf8'));
  assert.deepEqual(served, { version: VERSION, build });
  const label = versionLabel(build);
  // GitHub stubbed with a newer release: the site must not offer it
  const stubGitHub = `window.__gh = 0; (() => { const f = window.fetch; window.fetch = (u, o) => (String(u).includes('github') ? (window.__gh++, Promise.resolve(new Response(JSON.stringify({ tag_name: 'v99.9.9', name: 'v99.9.9', html_url: 'https://github.com/x/y', assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))) : f(u, o)); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stubGitHub });
  try {
    await page.goto(siteUrl);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
    // the same build: up to date, the development edition said so, no Reload, GitHub not asked
    await page.menu('Help', 'Check for Updates…');
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /is up to date/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'up to date' });
    const text = await page.eval(() => document.querySelector('.dlg-overlay .dlg-body, .dlg-overlay').innerText);
    assert.match(text, new RegExp(`Silinx ISE ${label.replace(/[.()]/g, '\\$&')} is up to date\\.\\s+It is the version this site serves\\.`));
    assert.match(text, /This is the development edition, built from the latest code \(main\)/);
    assert.doesNotMatch(text, /A new version is available|99\.9\.9/);
    assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay button')].some((b) => b.textContent === 'Reload')), false);
    await page.key('Escape');
    await page.waitNoDialog();
    assert.equal(await page.eval(() => window.__gh), 0, 'GitHub not asked on the site');
    // the site rebuilt with a newer version: reload to get it
    await fs.writeFile(vfile, `${JSON.stringify({ version: '99.0.0', build: null })}\n`);
    await page.menu('Help', 'Check for Updates…');
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /This site now serves/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'newer page served' });
    const text2 = await page.eval(() => document.querySelector('.dlg-overlay').innerText);
    assert.match(text2, /This site now serves Silinx ISE 99\.0\.0\./);
    assert.match(text2, new RegExp(`This page is ${label.replace(/[.()]/g, '\\$&')}: reload the page to get the new version \\(your projects are kept\\)\\.`));
    await page.eval(() => { window.__before = true; });
    await page.dialogButton('Reload');
    await page.waitFor(() => !window.__before && window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'the page reloaded', timeout: 30000 });
    // at start-up (the check on): the newer page served opens the same dialog by itself
    const s2 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.SILINX_NO_UPDATE_CHECK = false;' });
    await page.reload();
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /This site now serves Silinx ISE 99\.0\.0\./.test([...document.querySelectorAll('.dlg-overlay')].pop()?.innerText || ''), [], { what: 'the start-up dialog' });
    await page.dialogButton('OK');
    await page.waitNoDialog();
    // the same build served again: at start-up only a line in the console
    await fs.writeFile(vfile, `${JSON.stringify(served)}\n`);
    await page.reload();
    await page.waitConsole(new RegExp(`Silinx ISE ${label.replace(/[.()]/g, '\\$&')} is the version this site serves\\.`));
    assert.equal(await page.dialogCount(), 0);
    assert.equal(await page.eval(() => window.__gh), 0, 'GitHub never asked on the site');
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s2.identifier });
  } finally {
    await fs.writeFile(vfile, `${JSON.stringify(served)}\n`);
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  }
}, { url: () => 'about:blank', skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument)

uiTest('browser edition: Generate Post-Synthesis Simulation Model in the browser, then Simulate Post-Synthesis Model: the test bench passes on the netlist (#120)', E, async (page) => {
  await newSiteProject(page, 'WebPostSyn', 'blinky');
  await page.treeRow('#procs', 'Generate Post-Synthesis Simulation Model', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Post-Synthesis Simulation Model" (completed successfully|failed)/, { timeout: 180000 });
  const log = await page.consoleText();
  assert.match(log, /Process "Generate Post-Synthesis Simulation Model" completed successfully/, log.slice(-3000));
  assert.match(log, /=== SILINX STEP postsynth ===/);
  assert.match(log, /Synthesizing 'top' with the generics the test bench 'tb_top' gives: div = 2, debounce = 2/);
  assert.match(log, /Post-Synthesis simulation model: build\/netgen\/synthesis\/top_synthesis\.vhd/);
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 60000, what: 'ISim ready' });
  for (let k = 0; ; k++) {
    await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
    await page.key('Enter');
    try { await page.waitFor(() => window.Silinx.active.view.state.running || /Simulation finished OK/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''), [], { what: 'run all started', timeout: 5000 }); break; } catch (e) { if (k >= 3) throw e; }
  }
  const out = await page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return /Simulation finished OK|ERROR/.test(t) ? t : null; }, [], { timeout: 120000, what: 'the simulation of the model' });
  assert.match(out, /Simulation finished OK/);
  assert.doesNotMatch(out, /ERROR/);
}, { url: () => 'about:blank', timeout: 300000 });

uiTest('browser edition: Simulate Post-Synthesis Model with no model: "Generate and Simulate" generates it in the browser and the simulation starts (#490)', E, async (page) => {
  await newSiteProject(page, 'WebGenSim', 'blinky');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  const start = (await page.consoleText()).length;
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitDialog('Simulate Post-Synthesis Model');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Generate and Simulate', 'Cancel']);
  await page.dialogButton('Generate and Simulate');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 180000, what: 'ISim ready' });
  const lines = (await page.consoleText()).slice(start).split('\n').map((l) => l.trim()).filter(Boolean);
  const done = 'Process "Generate Post-Synthesis Simulation Model" completed successfully with 1 warning(s)';
  assert.ok(lines.includes('=== SILINX STEP postsynth ==='), lines.join('\n'));
  assert.ok(lines.includes(done), lines.join('\n'));
  assert.ok(lines.indexOf(done) < lines.indexOf('Started : "Simulate Post-Synthesis Model".'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(WARNING|ERROR)/i.test(l)), ['WARNING:Silinx - cells with no simulation model in Silinx (the model cannot be simulated as it is): $SPECIFY2']);
  assert.equal(await page.eval(() => window.Silinx.active.title), 'ISim (tb_top, Post-Synthesis)');
}, { url: () => 'about:blank', timeout: 300000 });
