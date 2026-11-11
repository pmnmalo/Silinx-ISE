// UI: Implement Design in the Silinx toolchain (the nextpnr engine) with I/Os that have no pad of their VCCO (#2816):
// blinky's UCF without the lines of four LEDs (no LOC, ISE's default LVCMOS25, every bank holding LVCMOS33 pins). The
// console names them by their ports, gives each bank's VCCO and I/Os and the constraints that fix it, as Silinx's
// placer did (#128), not nextpnr's cell nor the hint of an ISE mode. Both interfaces. The warnings: the ports with no LOC.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, writeWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#2816 Implement Design: LEDs with no LOC nor I/O standard named by their ports, the banks\' VCCO, the UCF line to add', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  try {
    // (blinky without its board: a board's ports all need a LOC, a device's may have none)
    await makeProject(env, { name: 'Vcco', template: 'blinky', board: null });
    const ucf = await readWs(env, 'Vcco', 'constraints/top.ucf');
    await writeWs(env, 'Vcco', 'constraints/top.ucf', ucf.split('\n').filter((l) => !/"led<[4-7]>"/.test(l)).join('\n'));
    await page.openProject('Vcco');
    await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
    await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
    await page.waitConsole(/Process (failed|"Implement Design" (completed successfully|failed))/, { timeout: 120000 });
    const lines = (await page.consoleText()).split('\n');
    const at = lines.findIndex((l) => l.startsWith('ERROR:Silinx'));
    assert.deepEqual(lines.slice(at, at + 2), [
      'ERROR:Silinx - placement failed: no pad for 4 I/O(s) of LVCMOS25 (VCCO 2.5 V): led<4>, led<5>, led<6>, led<7>: the banks with free pads need another VCCO: '
        + 'bank 0 VCCO 3.3 V (LVCMOS33: clk, sw<3>, btn<1>), bank 1 VCCO 3.3 V (LVCMOS33: btn<0>, seg<0>, seg<1> and 8 more), bank 2 VCCO 3.3 V (LVCMOS33: sw<0>, led<0>, led<1> and 4 more), '
        + 'bank 3 VCCO 3.3 V (LVCMOS33: sw<1>, sw<2>)',
      'Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "led<4>" IOSTANDARD = LVCMOS33; (or LOC them on pads of a bank of their own).',
    ]);
    const text = lines.join('\n');
    assert.doesNotMatch(text, /\$iopadmap|nextpnr failed|implement the design in an ISE mode/);
    // (the warnings: the ports with no LOC, as before #2816)
    assert.deepEqual(lines.filter((l) => /^WARNING/.test(l)), [
      'WARNING:ConstraintSystem - "constraints/top.ucf" Line 30: 4 port bit(s) of \'top\' have no LOC: led<4>, led<5>, led<6>, led<7>',
      'WARNING: 4 port bit(s) have no LOC constraint (led<4>, led<5>, led<6>, led<7>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream',
    ]);
    assert.equal(await page.eval(() => window.SilinxApp.S.status.impl), 'err');
  } finally {
    await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
  }
}, { timeout: 300000 });
