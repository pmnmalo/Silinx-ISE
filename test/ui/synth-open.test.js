// UI: Synthesize - Yosys (open) — the open synthesis in the browser: Silinx's front end and Yosys
// compiled to WebAssembly in a Web Worker, no Xilinx ISE. Its log and a utilization summary go to
// the console, the netlist to build/open/ (not added to the project's sources).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DONE = /Process "Synthesize - Yosys \(open\)" (completed successfully|failed)|Process "Synthesize - Yosys \(open\)" stopped/;

uiTest('Synthesize - Yosys (open): the blinky example synthesized in the browser; the netlist in build/open', E, async (page) => {
  await makeProject(env, { name: 'OpenPj', template: 'blinky' });
  await page.openProject('OpenPj');
  const top = await page.eval(() => window.Silinx.project.top);
  // in the Processes, after Synthesize - XST
  const procs = await page.eval(() => [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent));
  // (the first row after Synthesize - XST's children; Generate Post-Synthesis Simulation Model the ISE style interface's only, #1265, #1276)
  const kids = ['View RTL Schematic', 'View Technology Schematic', 'Check Syntax', 'View C Model', 'Generate Post-Synthesis Simulation Model'];   // (View C Model: #1530)
  assert.equal(procs.slice(procs.indexOf('Synthesize - XST') + 1).find((l) => !kids.includes(l)), 'Synthesize - Yosys (open)', procs.join(' | '));
  await page.treeRow('#procs', 'Synthesize - Yosys (open)', { dbl: true, exact: true });
  // (Yosys in WebAssembly: in WebKit / Firefox on a slow CI machine it can take minutes; a run that
  // never ends is reported with the console's last lines, what Yosys was doing)
  try { await page.waitConsole(DONE, { timeout: 180000 }); } catch (e) { throw new Error(`${e.message}\n--- console:\n${(await page.consoleText()).split('\n').slice(-25).join('\n')}`); }
  const text = await page.consoleText();
  assert.match(text, /Process "Synthesize - Yosys \(open\)" completed successfully/, text.slice(-2000));
  assert.match(text, /Device utilization \(open synthesis, spartan3e\):\n {2}LUTs: \d+\n {2}Flip-flops: \d+/);
  assert.match(text, new RegExp(`Netlist: build/open/${top}\\.json \\(and ${top}_yosys\\.v, ${top}_stat\\.txt\\) in [\\d.]+ s\\.`));
  // Yosys's "Shift register inference not yet supported for family xc3se" (printed on every
  // Spartan-3E run) is neither in the console nor counted: blinky has no warning
  assert.doesNotMatch(text, /Shift register inference/);
  assert.match(text, /Process "Synthesize - Yosys \(open\)" completed successfully(\n|$)/);
  assert.doesNotMatch(text, /completed successfully with \d+ warning/);
  assert.equal(await page.eval(() => window.SilinxApp.S.status['synth-open']), 'ok');
  // the files, and the project's sources unchanged
  const json = JSON.parse(await env.server.api('GET', `/api/projects/OpenPj/file?path=build/open/${top}.json`));
  assert.ok(Object.keys(json.modules).includes(top));
  assert.match(await env.server.api('GET', `/api/projects/OpenPj/file?path=build/open/${top}_syn.v`), new RegExp(`module ${top}`));
  const pj = await env.server.api('GET', '/api/projects/OpenPj');
  assert.deepEqual(pj.files.filter((f) => f.path.startsWith('build/')), []);
  // Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Sintetizar - Yosys (aberto)')));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
}, { timeout: 300000 });

uiTest('Synthesize - Yosys (open): a design with errors stops at Check Syntax', E, async (page) => {
  await makeProject(env, { name: 'OpenErr', files: { 'src/top.vhd': 'entity top is port (a : in bit; y : out bit); end top;\narchitecture rtl of top is begin y <= a and nope; end rtl;\n' }, top: 'top' });
  await page.openProject('OpenErr');
  await page.treeRow('#procs', 'Synthesize - Yosys (open)', { dbl: true, exact: true });
  await page.waitConsole(DONE, { timeout: 30000 });
  assert.match(await page.consoleText(), /Process "Synthesize - Yosys \(open\)" stopped: Check Syntax found errors/);
  assert.equal(await page.eval(() => window.SilinxApp.S.status['synth-open']), 'err');
});
