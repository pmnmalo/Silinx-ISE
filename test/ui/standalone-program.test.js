// UI: the browser edition programs the boards of the other families over WebUSB (#2298, core/usb-program.js). The site built
// (test/ui/site-lib.js) and served over HTTP, a simulated board as navigator.usb (test/fixtures/ftdi-jtag-sim.js: an FT2232H's
// MPSSE on a JTAG chain; never a real board):
//   - the Tang Nano 9K: blinky's .fs made in the browser (Generate Programming File), then Configure Target Device's Program FPGA
//     loads it into the GW1NR-9C's SRAM through its BL702: the FPGA's DONE, the bytes it took the .fs's; in Portuguese;
//   - the Basys 3: iMPACT's Initialize Chain finds its XC7A35T, Program FPGA loads a .bit chosen from the disk through its
//     Digilent FT2232H (DONE); a .bit for the Nexys A7's part refused;
//   - the ULX3S: not from the browser yet, Program FPGA disabled and why.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, ROOT } from './harness.js';
import { buildSite } from './site-lib.js';
import { xc7Bitstream } from '../fixtures/ftdi-jtag-sim.js';

let env, site;
// (the simulated board, served beside the site)
const route = async (req, res) => {
  const m = /^\/__test\/(ftdi-jtag-sim)\.js$/.exec(new URL(req.url, 'http://x').pathname);
  if (!m) return false;
  res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }).end(await fs.readFile(path.join(ROOT, 'test/fixtures', `${m[1]}.js`)));
  return true;
};
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp, { route });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

// File ▸ New Project… from an example on a board
async function newProject(page, name, template, board) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', board, { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
}
async function boot(page) {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
}
// the simulated board plugged in (granted: the browser's chooser answered)
const plug = (page, device) => page.eval(async (url, d) => {
  const { ftdiJtagBoard } = await import(url);
  window.__sim = ftdiJtagBoard({ device: d });
  const usb = window.__sim.usb;
  Object.defineProperty(navigator, 'usb', { value: { getDevices: async () => [usb], requestDevice: async () => usb }, configurable: true });
}, `${site.url}__test/ftdi-jtag-sim.js`, device);
const pageTexts = (page) => page.eval(() => [...document.querySelector('.open-program').closest('.page').querySelectorAll('h2, .imp-settings > *, .open-program, .note-box')].map((e) => e.textContent));
const problems = (text) => text.split('\n').filter((l) => /WARNING|ERROR/.test(l));

uiTest('#2298 browser edition: the Tang Nano 9K\'s .fs made in the browser, loaded into its SRAM through the BL702 (WebUSB); Portuguese', E, async (page) => {
  await boot(page);
  await newProject(page, 'WebTang', 'blinky', 'tangnano9k');
  await page.setView('impl');
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/=== SILINX (DONE|FAILED)/, { timeout: 300000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-3000)}`); });
  // (blinky's warnings on the Tang Nano 9K, as test/examples-gowin.test.js's: 8 nets nextpnr routed through the general routing)
  const built = problems(await page.consoleText());
  assert.equal(built.length, 8, built.join('\n'));
  for (const w of built) assert.match(w, /^WARNING:Place - Failed to route net '[^']+' from \S+ to \S+ using dedicated routing\.$/);
  await plug(page, 'gw1nr-9c');
  await page.treeRow('#procs', 'Configure Target Device', { dbl: true, exact: true });
  await page.waitFor(() => /^Configuration file: build\/\w+\.fs \(2069320 bytes\)$/.test(document.querySelector('.doc:not([hidden]) .imp-file')?.textContent || ''), [], { what: 'the program page' });
  const texts = await pageTexts(page);
  assert.deepEqual(texts.slice(0, 5), ['Program the Gowin GW1N — SRAM', 'Board:', 'Sipeed Tang Nano 9K', 'Programmer:', 'the board\'s USB (BL702), from the browser (WebUSB)']);
  const before = (await page.consoleText()).length;
  await page.click('.doc:not([hidden]) .open-program');
  await page.waitConsole(/FPGA programmed: the design runs until the board is powered off\.|Programming the FPGA failed/, { timeout: 120000 });
  const log = (await page.consoleText()).slice(before);
  assert.deepEqual(problems(log), []);
  assert.match(log, /Bitstream build\/\w+\.fs \(2069320 bytes, a Gowin's \.fs, IDCODE 0x1100481b\)\s+Programming \(SRAM, volatile\)\s+Programmer: the board's USB-JTAG \(an FT2232H, or its BL702\), from the browser \(WebUSB\)\s+JTAG chain: GW1NR-9C\s+Erasing the SRAM\s+XFER_WRITE: 258\d+ bytes/);
  assert.match(log, /DONE: the FPGA is configured in \d+\.\d s\s+FPGA programmed: the design runs until the board is powered off\./);
  // the FPGA's SRAM: the .fs's bytes (2069320 characters of 0s and 1s, a byte each 8, but its line ends)
  const sim = await page.eval(() => ({ done: window.__sim.st.dev.done, errors: window.__sim.st.dev.errors, bytes: window.__sim.st.dev.config.length, ops: window.__sim.st.dev.ops }));
  assert.deepEqual([sim.done, sim.errors, sim.ops], [true, [], [0x15, 0x05, 0x09, 0x12, 0x17, 0x3a]]);
  assert.equal(sim.bytes, (2069320 - 728) / 8);
  // in Portuguese (the page reloaded: the session's .fs gone, the store keeps no binaries)
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  try {
    await boot(page);
    await page.waitFor(() => document.documentElement.lang === 'pt', [], { what: 'Portuguese' });
    await page.eval(() => window.Silinx.project?.name === 'WebTang' || window.SilinxApp.openProject('WebTang'));
    await page.waitFor(() => window.Silinx.project?.name === 'WebTang', [], { what: 'WebTang' });
    await page.eval(() => window.SilinxApp.openImpact());
    await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .open-program'), [], { what: 'the program page' });
    assert.deepEqual((await pageTexts(page)).slice(0, 7), ['Programar o Gowin GW1N — SRAM', 'Placa:', 'Sipeed Tang Nano 9K', 'Programador:', 'a USB da placa (BL702), a partir do browser (WebUSB)',
      'Ficheiro de configuração (.fs):', 'build/top.fs']);
  } finally { await page.eval(() => localStorage.removeItem('silinx.lang')); }
}, { url: () => 'about:blank', timeout: 400000 });

uiTest('#2298 browser edition: the Basys 3\'s chain scanned, a .bit loaded through its Digilent FT2232H (WebUSB); one for another part refused', E, async (page) => {
  await boot(page);
  await newProject(page, 'WebB3', 'blinky', 'basys3');
  // a .bit for the XC7A35T, and one for the Nexys A7's XC7A100T (their headers, a configuration with its IDCODE)
  const header = (part) => { const f = (k, v) => [k.charCodeAt(0), 0, v.length + 1, ...Buffer.from(v), 0]; return Buffer.from([0, 9, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0, 0, 1, ...f('a', 'top;UserID=0XFFFFFFFF'), ...f('b', part), ...f('c', '2026/11/13'), ...f('d', '12:00:00'), 0x65, 0, 0, 0x01, 0x40]); };
  const good = path.join(env.tmp, 'b3.bit'), other = path.join(env.tmp, 'a7.bit'), cfg = Buffer.from(xc7Bitstream());
  await fs.writeFile(good, Buffer.concat([header('7a35tcpg236'), cfg]));
  await fs.writeFile(other, Buffer.concat([header('7a100tcsg324'), Buffer.from(xc7Bitstream(0x03631093))]));
  await plug(page, 'xc7a35t');
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .impact-chain'), [], { what: 'iMPACT' });
  await page.click('.doc:not([hidden]) .btn', { text: 'Initialize Chain (Scan)' });
  await page.waitConsole(/Scan finished\./);
  assert.match(await page.consoleText(), /Programmer: the board's Digilent USB-JTAG \(FT2232H\), from the browser \(WebUSB\)\s+Position 1: XC7A35T \(IDCODE 0x0362d093\)/);
  await page.setFiles('.doc:not([hidden]) input[type=file][accept=".bit"]', [good]);
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'b3.bit'), [], { what: 'b3.bit chosen' });
  let before = (await page.consoleText()).length;
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/'1': Programmed successfully\.|Programming FPGA \(SRAM\) failed/, { timeout: 60000 });
  let log = (await page.consoleText()).slice(before);
  assert.deepEqual(problems(log), []);
  assert.match(log, /JTAG chain: XC7A35T\s+JPROGRAM: clearing the configuration\s+CFG_IN: \d+ bytes\s+JSTART[\s\S]*DONE: the FPGA is configured in \d+\.\d s[\s\S]*'1': Programmed successfully\./);
  assert.deepEqual(await page.eval(() => [window.__sim.st.dev.done, window.__sim.st.dev.config.length]), [true, cfg.length - 20]);
  // a .bit for the XC7A100T: refused, the FPGA left as it was
  await plug(page, 'xc7a35t');
  await page.setFiles('.doc:not([hidden]) input[type=file][accept=".bit"]', [other]);
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'a7.bit'), [], { what: 'a7.bit chosen' });
  before = (await page.consoleText()).length;
  await page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' });
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: the board's FPGA is a XC7A35T, the bitstream is for a XC7A100T/);
  assert.equal(await page.eval(() => window.__sim.st.dev.done), false);
}, { url: () => 'about:blank', timeout: 120000 });

uiTest('#2298 browser edition: the ULX3S not programmed from the browser yet: Program FPGA disabled, and why', E, async (page) => {
  await boot(page);
  await newProject(page, 'WebUlx', 'blinky', 'ulx3s');
  await page.setView('impl');
  await page.treeRow('#procs', 'Configure Target Device', { dbl: true, exact: true });
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .open-program'), [], { what: 'the program page' });
  assert.deepEqual((await pageTexts(page)).slice(0, 5), ['Program the ECP5 — SRAM', 'Board:', 'Radiona ULX3S', 'Programmer:', 'not from the browser yet: the local server\'s openFPGALoader (silinx serve)']);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .open-program').disabled), true);
}, { url: () => 'about:blank', timeout: 120000 });
