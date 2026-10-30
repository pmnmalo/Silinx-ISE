// The Block Memory wizard's modules (#794) through the Silinx toolchain: the three board tests made of them
// (test/fixtures/open-flow/feat_bramwiz, a dual-port RAM of two rows of RAMB16_S9_S9 in VHDL from a .mem;
// feat_bramwiz_v, a ROM of two RAMB16_S9 side by side in Verilog from a .coe; feat_bramwiz_inf, the inferable HDL of a
// RAM mapped to a RAMB16_S18) are the generator's output for their specs and files, and build to a complete
// bitstream with no warning on the four devices of the toolchain (Basys2-100 / 250, Nexys2-500 / 1200), their block
// RAMs as planned, the initial contents in their INIT_xx. Checked against ISE (npm run check:open-flow on the
// fixtures): DRC 0 errors / 0 warnings, the .bit byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readWizardSpec } from '../core/clocking.js';
import { memoryModule, readInitFile } from '../core/blockram.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test/fixtures/open-flow');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-blockram-flow-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// fixture -> [the module's file, the block RAMs placed]
const FIXTURES = { feat_bramwiz: ['bram.vhd', 2], feat_bramwiz_v: ['bram.v', 2], feat_bramwiz_inf: ['bram.vhd', 1] };

test('the board tests\' memory modules are the Block Memory wizard\'s output for the specs in their headers and their files', () => {
  for (const [dir, [file]] of Object.entries(FIXTURES)) {
    const text = fs.readFileSync(path.join(FIX, dir, file), 'utf8');
    const spec = readWizardSpec(text);
    assert.equal(spec.wizard, 'memory');
    const c = readInitFile(fs.readFileSync(path.join(FIX, dir, spec.init), 'utf8'), spec.init, spec.width, spec.depth);
    assert.deepEqual(c.errors, []);
    assert.equal(memoryModule(spec, c.words).code, text, dir);
  }
});

// the pins of each board (the Nexys2's LD4-LD7 differ by die)
const LEDS = {
  cp132: ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'], xc3s500e: ['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4'], xc3s1200e: ['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4'],
};
const SW = { cp132: ['P11', 'L3', 'K3', 'B4', 'G3', 'F3', 'E2', 'N3'], fg320: ['G18', 'H18', 'K18', 'K17', 'L14', 'L13', 'N17', 'R17'] };
const BTN = { cp132: ['G12', 'C11'], fg320: ['B18', 'D18'] };
const ucf = (part, pkg, io) => `${Object.entries({
  clk: 'B8', ...(io ? Object.fromEntries([...BTN[pkg].map((p, i) => [`btn<${i}>`, p]), ...SW[pkg].map((p, i) => [`sw<${i}>`, p])]) : {}),
  ...Object.fromEntries((LEDS[pkg] || LEDS[part]).map((p, i) => [`led<${i}>`, p])),
}).map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n')}
NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
`;
const DEVICES = [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']];

for (const [fixture, [, brams]] of Object.entries(FIXTURES)) {
  for (const [part, pkg] of DEVICES) {
    test(`the open flow: the Block Memory wizard's module (${fixture}) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: complete bitstream, no warning, ${brams} block RAM(s)`, { timeout: 300000 }, () => {
      const dir = path.join(tmp, `${fixture}-${part}`);
      fs.cpSync(path.join(FIX, fixture), dir, { recursive: true });
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
      Object.assign(pj.device, { part, package: pkg });
      fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj, null, 2));
      fs.writeFileSync(path.join(dir, 'top.ucf'), ucf(part, pkg, fixture !== 'feat_bramwiz_v'));
      const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out')],
        { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
      assert.deepEqual(`${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()), []);
      assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
      const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
      assert.equal([...routed.matchAll(/^inst "[^"]+" "RAMB16",placed /gm)].length, brams);
      // the initial contents: a block's INIT_00 not all zeros
      assert.match(routed, /INIT_00::0*[1-9A-F][0-9A-F]* /);
    });
  }
}
