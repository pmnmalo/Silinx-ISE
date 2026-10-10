// UI: the development-only remote ISE (SILINX_DEV_ISE_HOST on the server) is not offered to users:
// the Toolchain Settings dialog keeps the three user modes and the saved one; the status reports it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi({ serverEnv: { SILINX_DEV_ISE_HOST: 'dev@mini' } }); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('development remote ISE: reported in the console, not in the Toolchain Settings', E, async (page) => {
  await page.waitConsole(/Toolchain: ISE available \(dev-remote: development: docker image xilinx\/ise:14\.7 on dev@mini \(SILINX_DEV_ISE_HOST\)\)/);
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  const d = await page.eval(() => {
    const sel = document.querySelector('.dlg-overlay select');
    return { modes: [...sel.options].map((o) => o.value), mode: sel.value, text: document.querySelector('.dlg-overlay').innerText };
  });
  assert.deepEqual(d.modes, ['local', 'docker', 'ssh']);
  assert.equal(d.mode, 'local', 'the saved mode, not the development one');
  // the status line says what will actually run (only the developer who set the variable sees it)
  assert.match(d.text, /Xilinx ISE 14\.7: available\ndevelopment: docker image xilinx\/ise:14\.7 on dev@mini \(SILINX_DEV_ISE_HOST\)/);
  // saving keeps the user's configuration free of the development remote
  await page.dialogButton('Save');
  await page.waitNoDialog();
  const tc = await env.server.api('GET', '/api/toolchain');
  assert.equal(tc.config.mode, 'local');
  assert.equal(tc.config.devRemote, undefined);
  assert.equal(tc.config.ssh.host, '');
  assert.equal(tc.ise.mode, 'dev-remote');
});
