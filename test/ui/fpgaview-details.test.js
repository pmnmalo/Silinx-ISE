// UI: the FPGA view's site details (#405: web/js/fpgaview-details.js out of mountFpgaView in web/js/fpgaview.js):
// an output pad, an input clock pad and the global clock buffer selected on the chip: their site, tile, module,
// port, package pin, direction, I/O standard (and drive and slew of an output), the elements inside, and their
// connections, as the details panel shows them. The routed design is the XDL fixture (packages/silinx-fpga/test/fixtures/fpga), as in
// test/ui/fpgaview.test.js (a slice's details, its LUT contents and pins: there).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  signal q : std_logic;
begin
  u1: entity work.sub port map (clk => clk, a => a, q => q);
  y <= a or q;
end rtl;
`;
const SUB = `library ieee; use ieee.std_logic_1164.all;
entity sub is port (clk, a : in std_logic; q : out std_logic); end sub;
architecture rtl of sub is
  signal r : std_logic := '1';
begin
  process (clk) begin if rising_edge(clk) then r <= a and not r; end if; end process;
  q <= r;
end rtl;
`;

async function routedProject(name) {
  await makeProject(env, { name, files: { 'src/top.vhd': TOP, 'src/sub.vhd': SUB }, top: 'top' });
  const build = path.join(env.server.workspace, name, 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', f), path.join(build, f));
}
const V = '.doc:not([hidden]) .fv';
const idxOf = (page, inst) => page.eval(async (n) => (await (await fetch(`/api/projects/${window.Silinx.project.name}/fpga-view`)).json()).insts.findIndex((i) => i.name === n), inst);

uiTest('FPGA view, site details: an output pad, an input clock pad, the global clock buffer', E, async (page) => {
  await routedProject('FpgaDet');
  await page.openProject('FpgaDet');
  await page.menu('Tools', 'Implemented Design (FPGA View)');
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view open' });
  const details = async (inst, site) => {
    await page.click(`${V} .fv-site[data-i="${await idxOf(page, inst)}"]`);
    await page.waitFor((v, s) => document.querySelector(`${v} .fv-detail`).textContent.includes(s), [V, site], { what: `${inst} details` });
    return page.eval((v) => document.querySelector(`${v} .fv-detail`).innerText, V);
  };
  assert.equal(await details('y', 'P2'), 'Site\tP2 (IOB)\nTile\tTIOIS_X1Y3\nModule\ttop (top level)\nPort\ty\nPackage pin\tP2\nDirection\toutput\n'
    + 'I/O standard\tLVCMOS33\nDrive\t12 mA\nSlew rate\tSLOW\nOther elements\nOUTBUF y_OBUF output buffer\nConnections\nO1\ty_OBUF');
  assert.equal(await details('clk', 'P4'), 'Site\tP4 (IBUF)\nTile\tLIOIS_X0Y0\nModule\ttop (top level)\nPort\tclk\nPackage pin\tP4\nDirection\tinput\n'
    + 'I/O standard\tLVCMOS33\nOther elements\nINBUF clk_BUFGP/IBUFG input buffer\nConnections\nI\tclk_BUFGP/IBUFG');
  assert.equal(await details('clk_BUFGP/BUFG', 'BUFGMUX_X1Y10'), 'Site\tBUFGMUX_X1Y10 (BUFGMUX)\nTile\tCLKT_X2Y3\nModule\ttop (top level)\n'
    + 'Other elements\nGCLK_BUFFER clk_BUFGP/BUFG global clock buffer\nConnections\nI0\tclk_BUFGP/IBUFG\nO\tclk_BUFGP');
});
