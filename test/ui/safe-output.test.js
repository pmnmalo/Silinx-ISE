// Safe output (#2830): a project from outside carries anyone's text in every name, label and comment of its drawings
// and sources. Every drawing kind (schematic, FSM, ASM, truth table, Petri net) and an HDL source are opened with a
// markup payload in each of their text fields: the editors, the Design tree and the console show it as text, and no
// element is made of it (test/safe-output.test.js scans the sinks; this checks them on the page).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newPetri } from '../../core/petri.js';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const PAYLOAD = '"><img src=x onerror="window.__xss=1"><svg onload="window.__xss=1"></svg>';
// the fields that hold the structure (kinds, ids, references, languages): kept, so that the drawing still opens
const STRUCTURE = new Set(['lang', 'type', 'kind', 'id', 'from', 'to', 'initial', 'generatedFile', 'dir', 'active', 'encoding', 'style',
  'clock', 'form', 'phase', 'version', 'module', 'symbol']);
// every other text of a drawing with the payload added (names, labels, nets, conditions, comments, descriptions…)
const poison = (o) => {
  if (Array.isArray(o)) return o.map(poison);
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && !STRUCTURE.has(k) ? `${v}${PAYLOAD}` : poison(v)]));
};
const example = async (f) => JSON.parse(await fs.readFile(path.join(ROOT, 'examples', f), 'utf8'));
// what the payload would have made, anywhere in the page
const injected = (page) => page.eval(() => ({
  xss: window.__xss ?? null,
  elements: [...document.querySelectorAll('img[src="x"], [onerror], [onload]')].map((e) => e.outerHTML.slice(0, 80)),
}));

uiTest('#2830 a markup payload in every text field of every drawing kind and of an HDL source is shown as text, never as markup', E, async (page) => {
  const pn = newPetri('ctl');
  const drawings = {
    'src/gates.sch.json': poison(await example('gates/src/gates.sch.json')),
    'src/traffic.fsm.json': poison(await example('traffic/src/traffic.fsm.json')),
    'src/lamps.bool.json': poison(await example('traffic/src/lamps.bool.json')),
    'src/speed_ctrl.asm.json': poison(await example('blinky/src/speed_ctrl.asm.json')),
    'src/ctl.pn.json': poison(pn),
  };
  const files = Object.fromEntries(Object.entries(drawings).map(([p, d]) => [p, JSON.stringify({ ...d, generatedFile: undefined }, null, 2)]));
  // an HDL source: the payload in a comment, a string, a VHDL extended identifier and a Verilog escaped one
  files['src/x.vhd'] = `-- ${PAYLOAD}\nentity \\x${PAYLOAD.replace(/\\/g, '')}\\ is end;\narchitecture a of x is begin assert false report "${PAYLOAD.replace(/"/g, '')}"; end;\n`;
  files['src/y.v'] = `// ${PAYLOAD}\nmodule \\y${PAYLOAD.replace(/\s/g, '')} (input a); endmodule\n`;
  await makeProject(env, { name: 'Payloads', template: 'empty', files });
  await page.openProject('Payloads');
  assert.deepEqual(await injected(page), { xss: null, elements: [] }, 'the Design tree');
  for (const p of Object.keys(files)) {
    await page.eval((f) => window.SilinxApp.openFile(f), p);
    await page.waitFor((f) => (window.Silinx.active?.id || '').endsWith(f) || window.Silinx.active?.path === f, [p], { what: `${p} open` });
    // (the editor drawn)
    await page.waitFor(() => document.querySelector('.doc:not([hidden])')?.textContent.length > 0 || document.querySelector('.doc:not([hidden]) svg'), [], { what: `${p} drawn` });
    assert.deepEqual(await injected(page), { xss: null, elements: [] }, p);
  }
  // the payload is on the page as text (the drawings and the console show it), never as markup
  assert.ok(await page.eval((x) => document.body.textContent.includes('onerror="window.__xss=1"') || [...document.querySelectorAll('text, tspan')].some((t) => t.textContent.includes('onerror')), PAYLOAD));
  // Check Syntax: its messages name the payload, in the console as text
  await page.eval(() => window.SilinxApp.checkSyntax?.());
  assert.deepEqual(await injected(page), { xss: null, elements: [] }, 'the console and its tabs');
});
