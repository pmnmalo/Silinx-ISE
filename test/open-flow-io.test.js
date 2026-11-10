// The Spartan-3E's DCMs, global buffers and IOBs through the whole open flow (test/fixtures/open-flow), each to a complete
// bitstream with no warning, and the IOB registers on every pad and device; split from test/open-flow.test.js, run beside
// it (#3124). The fixtures and their settings: FEATURES in test/open-flow-lib.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmp, openFlow, testFeatures } from './open-flow-lib.mjs';

testFeatures(['DCM', 'BUFGMUX', 'IOB']);

// #709: paths across the XC3S1200E between IOB registers (feat_ll_splitters), at seed 2: a complete bitstream, no warning
// (ISE: byte-identical, DRC clean, scripts/check-open-flow.mjs). Silinx's router joined a vertical long line of the left
// DCMs' column across the centre row there (CLKLH_DCM_LL); nextpnr's routing is its own (#2756): the splitter's bit is
// packages/silinx-fpga/test/fpga-bitgen.test.js's
test('the open flow: feat_ll_splitters at seed 2 across the XC3S1200E, every register in its IOB, a complete bitstream, no warning (#709)', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'feat_ll_splitters-s2');
  const r = openFlow(path.join(ROOT, 'test/fixtures/open-flow/feat_ll_splitters'), out, ['--seed', '2']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(r.warnings, []);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  const routed = fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8');
  assert.equal((routed.match(/^inst "[lrtb]<\d>" "(?:IBUF|IOB)",placed \S+ \S+ +,\n {2}cfg "[^"]* [IO]FF1:/gm) || []).length, 24, 'every register in its IOB');
});

// #749: feat_iob_pair with its pads LOC'd on two differential pairs of the Basys2-250 (J12 / K14, N13 / N14), each pair's
// two registers on different clocks: before, "the routing did not converge"; now both clocks routed into each tile, the
// DIFFM's register on its second flip-flop (as ISE does: its DRC clean on this routed XDL), whose settings on a pad alone
// are in the bit database since #759: a complete bitstream, no warning (nextpnr too since #2766)
test('the open flow: two registers of one kind on different clocks in the two IOBs of a LOC\'d pair: routed, the DIFFM\'s on its second flip-flop, a complete bitstream (#749, #759)', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'feat_iob_pair_loc'), out = path.join(tmp, 'feat_iob_pair_loc-out');
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_pair'), dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'top.ucf'), 'NET "led<0>" LOC = "J12" ;\nNET "led<1>" LOC = "K14" ;\nNET "sw<0>" LOC = "N13" ;\nNET "sw<1>" LOC = "N14" ;\n');
  const r = openFlow(dir, out);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(r.warnings, []);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  const routed = fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8');
  assert.match(routed, /^inst "led<1>" "IOB",placed RIOIS_PCI_X27Y14 K14 +,\n {2}cfg "[^"]* OMUX::OFF2 [^"]* OFF2:/m);
  assert.match(routed, /^inst "led<0>" "IOB",placed RIOIS_PCI_X27Y14 J12 +,\n {2}cfg "[^"]* OFF1:/m);
  assert.match(routed, /^inst "sw<0>" "IBUF",placed RIOIS_X27Y1 N13 +,\n {2}cfg "[^"]* IFF2:/m);
  for (const re of [/^ {2}pip RIOIS_PCI_X27Y14 GCLK\d -> IOIS_CLK5 ,$/m, /^ {2}pip RIOIS_PCI_X27Y14 IOIS_CLK5 -> OTCLK20 ,$/m, /^ {2}pip RIOIS_PCI_X27Y14 IOIS_CLK1 -> OTCLK11 ,$/m,
    /^ {2}pip RIOIS_X27Y1 IOIS_CLK4 -> ICLK20 ,$/m, /^ {2}pip RIOIS_X27Y1 IOIS_CLK0 -> ICLK11 ,$/m]) assert.match(routed, re);
});

// IOB registers of every kind on every pad (#96, its second round; before, a kind was measured on a quarter of the pads
// only): feat_iobreg's tristate output on M11 (LED1), an output-enable register with a clock enable and a reset, which
// the bitstream writer refused there before (R:TCEINV:TCE…), now complete
test('the open flow: an IOB register of every kind on every pad: feat_iobreg\'s tristate on M11, refused before #96\'s second round, complete', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'iobreg-m11');
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iobreg'), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'top.ucf'), fs.readFileSync(path.join(dir, 'top.ucf'), 'utf8').replace('LOC = "P6"', 'LOC = "M11"'));
  const r = openFlow(dir, path.join(dir, 'out'));
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.match(fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8'), /^inst "led<1>" "IOB",placed \S+ M11 +,\n {2}cfg "[^"]* TMUX::TFF1 [^"]* TCEINV::TCE /m);
  assert.deepEqual(r.warnings, []);
});

// IOB registers on ports with no LOC (#96): the placer keeps them on pads where the bit database measured their kinds,
// on every device (the tristate output's registers are measured on about half the pads)
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: IOB registers with no LOC on the ${part.toUpperCase()}-${pkg.toUpperCase()}: on pads where they are measured, complete bitstream (#96)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `iobreg-${part}`);
    fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iobreg'), dir, { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    Object.assign(pj.device, { part, package: pkg });
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj));
    fs.writeFileSync(path.join(dir, 'top.ucf'), 'NET "sw<0>" IOB = TRUE ;\nNET "led<*>" IOB = TRUE ;\n');
    for (const seed of ['1', '2']) {
      const r = openFlow(dir, path.join(dir, `out${seed}`), ['--seed', seed]);
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
      assert.deepEqual(r.warnings, []);
      const routed = fs.readFileSync(path.join(dir, `out${seed}`, 'routed.xdl'), 'utf8');
      for (const re of [/^inst "sw<0>" "IBUF",placed [^\n]*\n {2}cfg "[^"]* IFF1:/m, /^inst "led<0>" "IOB",placed [^\n]*\n {2}cfg "[^"]* OFF1:/m, /^inst "led<1>" "IOB",placed [^\n]*\n {2}cfg "[^"]* TFF1:/m]) assert.match(routed, re);
    }
  });
}

// #18: inputs that drive nothing get no pad, as ISE's map trims them (an XDL that has such a pad is
// written as ISE's bitgen writes it: packages/silinx-fpga/test/fpga-bitgen.test.js). Checked against ISE: the .bit is
// byte-identical to ISE's bitgen of the same routed XDL, DRC 0 errors and 0 warnings.
test('the open flow: inputs that drive nothing (the clock, the buttons) get no pad; complete bitstream, no warning', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'feat_unused_in');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), path.join(ROOT, 'test/fixtures/open-flow/feat_unused_in'), out],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  const pads = [...fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8').matchAll(/^inst "([^"]+)" "(?:IBUF|IOB)",placed/gm)].map(m => m[1]).sort();
  assert.deepEqual(pads, [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `led<${i}>`), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `sw<${i}>`)].sort());
});
