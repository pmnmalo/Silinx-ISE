// The Clocking Wizard's modules (#793) through the Silinx toolchain: the two board tests made of them
// (test/fixtures/open-flow/feat_clkwiz, VHDL, and feat_clkwiz_v, Verilog) are the generator's output for their
// specs, and build to a complete bitstream on the four devices of the toolchain (Basys2-100 /
// 250, Nexys2-500 / 1200), each output's PERIOD derived from the input's, with no warning but on the XC3S100E. Every DCM
// output reaches its four global buffers on switches of known bits (#2: before, the XC3S100E's top DCM's CLKDV and CLK90
// reached none and the bottom DCM was used); but on the XC3S100E the board's clock pin B8 is a dedicated clock pad of no
// DCM (the top one's: B9, A9, A10, C9; #92 measured them all), so its CLKIN comes through general routing, said (the
// board clock's CLOCK_DEDICATED_ROUTE = FALSE lets ISE do the same). Checked against ISE (npm run
// check:open-flow on the two fixtures): DRC 0 errors / 0 warnings, the .bit byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clockModule, readWizardSpec } from '../core/clocking.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test/fixtures/open-flow');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-clocking-flow-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the board tests\' clock modules are the Clocking Wizard\'s output for the specs in their headers', () => {
  for (const [dir, file] of [['feat_clkwiz', 'clkgen.vhd'], ['feat_clkwiz_v', 'clkgen.v']]) {
    const text = fs.readFileSync(path.join(FIX, dir, file), 'utf8');
    const spec = readWizardSpec(text);
    assert.equal(spec.lang, file.endsWith('.v') ? 'verilog' : 'vhdl');
    assert.equal(clockModule(spec).code, text, dir);
  }
});

// the pins of each board (the Nexys2's LD4-LD7 differ by die)
const ucf = (pins, extra = '') => `${Object.entries(pins).map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n')}
NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
${extra}`;
const LEDS = {
  cp132: ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'], xc3s500e: ['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4'], xc3s1200e: ['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4'],
};
const pinsOf = (part, pkg, btn) => ({
  clk: 'B8', ...(btn ? { 'btn<0>': pkg === 'cp132' ? 'G12' : 'B18' } : {}), 'sw<0>': pkg === 'cp132' ? 'P11' : 'G18',
  ...Object.fromEntries((LEDS[pkg] || LEDS[part]).map((p, i) => [`led<${i}>`, p])),
});
const DEVICES = [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']];
const WARNINGS = {
  xc3s100e: ['Warning: place: u_clk_u_dcm: its CLKIN comes from the pad B8 through general routing: only B9, A9, A10, C9 reach the CLKIN of DCM_X0Y1 on a dedicated path of known bits'],
};
// the derived PERIOD of each output, as the open flow's timing prints it
const PERIODS = {
  feat_clkwiz: ['CLK0 of u_clk_u_dcm: 20 ns', 'CLK2X of u_clk_u_dcm: 10 ns', 'CLKDV of u_clk_u_dcm: 80 ns', 'CLKFX of u_clk_u_dcm: 15.385 ns'],
  feat_clkwiz_v: ['CLK0 of u_clk_u_dcm: 20 ns', 'CLK90 of u_clk_u_dcm: 20 ns', 'CLKFX of u_clk_u_dcm: 40 ns'],
};

for (const fixture of ['feat_clkwiz', 'feat_clkwiz_v']) {
  for (const [part, pkg] of DEVICES) {
    test(`the open flow: the Clocking Wizard's module (${fixture}) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: complete bitstream, the exact warnings, each output's PERIOD met`, { timeout: 300000 }, () => {
      const dir = path.join(tmp, `${fixture}-${part}`);
      fs.cpSync(path.join(FIX, fixture), dir, { recursive: true });
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
      Object.assign(pj.device, { part, package: pkg });
      fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj, null, 2));
      fs.writeFileSync(path.join(dir, 'top.ucf'), ucf(pinsOf(part, pkg, fixture === 'feat_clkwiz')));
      const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out')],
        { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
      assert.deepEqual(`${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()), WARNINGS[part] || []);
      for (const p of PERIODS[fixture]) assert.match(r.stdout, new RegExp(`timing: constraint PERIOD 20 ns on clk, ${p.replace(/\./g, '\\.')}, met`));
      const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
      assert.match(routed, /^inst "u_clk_u_dcm" "DCM",placed /m);
    });
  }
}
