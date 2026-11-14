// UI: Design Properties on another board (#3710, web/js/board-top.js): the top's generics CLK_HZ, BTN_LOW and SW_LOW
// written with the board's clock and its inputs' levels (the clock example on the Mimas V2: 100 MHz, active-low buttons
// and switches), the console told; Undo Design Properties gives the file back; in the Silinx and ISE style interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const EXAMPLE = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'examples', 'clock', 'src', 'digital_clock.v'), 'utf8');
const LINE = 'src/digital_clock.v: CLK_HZ = 100000000, BTN_LOW = 1, SW_LOW = 1, the Numato Mimas V2\'s clock and inputs (the defaults of its generics).';

uiTest('#3710 Design Properties: on the Mimas V2, the clock\'s top gets the board\'s CLK_HZ and inputs\' levels; Undo gives it back', E, async (page) => {
  const name = `Board3710_${process.env.SILINX_UI_INTERFACE || 'silinx'}`;
  await makeProject(env, { name, template: 'clock' });
  await page.openProject(name);
  const top = () => page.eval(async (n) => (await fetch(`/api/projects/${n}/file?path=src/digital_clock.v`)).text(), [name]);
  assert.equal(await top(), EXAMPLE);
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.fill('.dlg-overlay select', 'mimas-v2', { index: 0 });
  await page.dialogButton('OK');
  await page.waitDialog('Update Constraints');
  await page.dialogButton('No');
  await page.waitNoDialog();
  await page.waitFor((l) => window.__console().split('\n').includes(l), [LINE], { what: 'the console\'s line' });
  const params = (await top()).split('\n').filter((l) => /parameter (CLK_HZ|BTN_LOW|SW_LOW|AN_LOW) /.test(l)).map((l) => l.trim().replace(/\s*\/\/.*$/, ''));
  assert.deepEqual(params, ['parameter CLK_HZ  = 100000000,', 'parameter BTN_LOW = 1,', 'parameter SW_LOW  = 1,', 'parameter AN_LOW  = 1']);
  await page.menu('Edit', 'Undo Design Properties');
  await page.waitFor(() => window.Silinx.project.board === 'basys2', [], { what: 'undo design properties' });
  assert.equal(await top(), EXAMPLE);
});
