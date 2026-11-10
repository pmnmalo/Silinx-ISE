// The clocks through the whole open flow on the Spartan-3E: a DCM's outputs past its multiplexer's four, blinky on the
// other boards, a clock with no constraints, the clocks LOC'd on their pads, two DCMs, twelve global clocks, a pad's buffer
// into a DCM; split from test/open-flow.test.js, run beside it (#3124).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmp, openFlow, padNet, GENERAL, dcmClockPips, BLINKY_WARNINGS } from './open-flow-lib.mjs';

// A DCM with more outputs on global buffers than its output multiplexer reaches (four; feat_dcm's CLK0, CLKDV, CLKFX,
// CLK2X and CLK90 too, on the XC3S100E): Silinx's placer refused it ("no free global clock buffer reachable"); nextpnr
// takes the fifth to a buffer of its own through general routing, into the buffer's CLKDUB input (#2756). The Basys2's
// clock on B8, which reaches no CLKIN of the XC3S100E on a dedicated path: said (#2768).
test('the open flow: a DCM with five outputs on global buffers, one past its output multiplexer\'s four, the fifth through general routing, the CLKIN from B8 said', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'dcm5');
  fs.mkdirSync(dir, { recursive: true });
  const src = fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm/top.vhd'), 'utf8').replace('CLK90 => open', 'CLK90 => clk90_u')
    .replace('clk2x_u, clk2x_b, locked : std_logic;', 'clk2x_u, clk2x_b, clk90_u, clk90_b, h90, locked : std_logic;')
    .replace('  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);', '  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);\n  u_b90 : BUFG port map (I => clk90_u, O => clk90_b);\n  process (clk90_b) begin if rising_edge(clk90_b) then h90 <= sw(0); end if; end process;')
    .replace('led <= locked & "000"', 'led <= locked & h90 & "00"');
  assert.match(src, /u_b90 : BUFG/);
  fs.writeFileSync(path.join(dir, 'top.vhd'), src);
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'dcm5', version: 1, device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' }, top: 'top',
    // the constraints by an absolute path (on Windows a relative one across drives is absolute too: it was
    // joined onto the project folder, CI b898d8e)
    files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: path.join(ROOT, 'test/fixtures/open-flow/basys2.ucf') }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out')], { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.deepEqual(`${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()),
    ['WARNING:nextpnr - DCM u_dcm: its CLKIN comes from the pad B8 through general routing: only B9, A9, A10, C9 reach its CLKIN on a dedicated path.']);
  const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
  assert.equal((routed.match(/^inst "u_b\w+" "BUFGMUX",placed /gm) || []).length, 5);
  // each output's net into its buffer: the dedicated path (DLL_OUT…), but one through general routing into a CLKDUB
  // (#2770: nextpnr took two)
  const nets = routed.split(/^net /m).slice(1).filter(n => /\n {2}outpin "u_dcm" CLK\w+ ,\n/.test(n));
  assert.equal(nets.length, 5);
  assert.equal(nets.filter(n => /_CLKDUB\d -> \w+_GCLK\d ,/.test(n)).length, 1);
});

// blinky on the other boards (stage F of packages/silinx-fpga/research/s3e-bitstream): the Basys2-100 with the Basys2's
// pins, the Nexys2-500 / -1200 with the Nexys2's (LD4-LD7 differ by die)
const NEXYS2 = led => [['clk', 'B8'], ['sw<0>', 'G18'], ['sw<1>', 'H18'], ['sw<2>', 'K18'], ['sw<3>', 'K17'], ['btn<0>', 'B18'], ['btn<1>', 'D18'],
  ...led.map((p, i) => [`led<${i}>`, p])].map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n') + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
const BOARDS = [
  ['Basys2-100', 'xc3s100e', 'cp132', null, 72738],
  ['Nexys2-500', 'xc3s500e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4']), 283846],
  ['Nexys2-1200', 'xc3s1200e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4']), 480219],
];
for (const [board, part, pkg, ucf, size] of BOARDS) {
  test(`the open flow for the ${board} (${part.toUpperCase()}-${pkg.toUpperCase()}): blinky to a complete bitstream, the exact warnings`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `proj-${board}`);
    fs.cpSync(path.join(ROOT, 'examples/blinky'), dir, { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    Object.assign(pj.device, { part, package: pkg });
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj, null, 2));
    if (ucf) fs.writeFileSync(path.join(dir, pj.constraints), ucf);
    const out = path.join(tmp, `out-${board}`);
    const r = openFlow(dir, out);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
    assert.deepEqual(r.warnings, BLINKY_WARNINGS);
    const bit = fs.readFileSync(path.join(out, 'top.bit'));
    assert.equal(bit.length, size, 'the .bit of the device');
    assert.ok(bit.includes(Buffer.from(`${part.slice(2)}${pkg}\0`)), 'the part in the header');
  });
}

// A clock with no LOC (no UCF at all): the placer puts it on a GCLK pin, a pad whose dedicated path
// of known bits reaches a global buffer (nextpnr's choice of the pad and the buffer, #2756: Silinx's placer took
// B8 -> BUFGMUX_X2Y11), and every net routes on known switches (#49:
// feat_constmult's clock on another pad could not reach its block RAM's CLKA / CLKB). No warning.
const NO_UCF_WARNINGS = [];
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow with no constraints on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the clock on a GCLK pin, every net routed (#49)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `noucf-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_constmult/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `noucf-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /cannot be routed/);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, NO_UCF_WARNINGS);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => [...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => `${m[1]} ${m[2]}`);
    assert.equal(placedOf('IBUF').filter(s => s.startsWith('clk ')).length, 1);
    assert.equal(placedOf('BUFGMUX').length, 1);
    // the pad into the buffer on its dedicated path: the clock tile's CKIk -> GCLKk
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "[^"]+" I0 ,$/m);
    assert.match(clk, /^ {2}pip CLK[TB]\w*_X\d+Y\d+ CLK[TB]_CKI\d -> CLK[TB]_GCLK\d ,$/m);
    assert.doesNotMatch(clk, GENERAL);
    for (const type of ['RAMB16', 'MULT18X18SIO']) assert.ok(placedOf(type).length > 0, type);
  });
}

// The clocks of #56, #57, #58 through the whole open flow (checked against ISE: npm run
// check:open-flow on the same projects gives DRC 0 errors / 0 warnings and a byte-identical .bit):
// feat_constmult's clock LOC'd on the bottom GCLK pin (its buffer's lines reach no block RAM /
// multiplier clock on known switches: BUFGMUX_X2Y11 through general routing, a warning), feat_dcm
// with no constraints (the clock on the pad ISE gives the DCM's CLKIN, on its dedicated path, #92), and
// feat_constmult's clock LOC'd on a side GCLK pin (on its own side buffer, through the side clock tile's CKIk, as
// ISE pairs them, #641).
const CLOCK_CASES = [
  // (M4's own buffer, BUFGMUX_X2Y1, on its dedicated path: since #2 its line reaches the block RAMs' and multipliers'
  // clock pins; before, BUFGMUX_X2Y11 through general routing, with a warning)
  ['#56', 'feat_constmult', 'xc3s250e', 'cp132', 'M4', { clk: 'M4', bufg: 'BUFGMUX_X2Y1' }, []],
  // (with no LOC, the pad and the DCM nextpnr's: the DCM's CLKIN on its dedicated path from the pad, #92, #2756;
  // Silinx's placer took ISE's pads, B9 / A9)
  ['#57', 'feat_dcm', 'xc3s500e', 'fg320', null, { padInto: 'u_dcm CLKIN' }, []],
  ['#47', 'feat_dcm', 'xc3s1200e', 'fg320', null, { padInto: 'u_dcm CLKIN' }, []],
  ['#47', 'feat_dcm', 'xc3s100e', 'cp132', null, { padInto: 'u_dcm CLKIN' }, []],
  // (#641: K3's own side buffer, BUFGMUX_X0Y6, the one ISE gives it; the path ISE routes, I0_PINWIRE -> LIOIS_IBUF1 of its
  // I/O tile, CLKL_CKI4 -> CLKL_GCLK4 of the side clock tile)
  ['#641', 'feat_constmult', 'xc3s500e', 'fg320', 'K3', { clk: 'K3', bufg: 'BUFGMUX_X0Y6', pips: [/^ {2}pip LIOIS_CLK_PCI_X0Y23 I0_PINWIRE -> LIOIS_IBUF1 ,$/m, /^ {2}pip CLKL_X0Y23 CLKL_CKI4 -> CLKL_GCLK4 ,$/m] }, []],
];
for (const [issue, fixture, part, pkg, loc, want, warnings] of CLOCK_CASES) {
  test(`the open flow: ${fixture} on the ${part.toUpperCase()}-${pkg.toUpperCase()}, the clock ${loc ? `LOC'd on ${loc}` : 'with no LOC'}: complete bitstream, the exact warnings (${issue})`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `clock-${issue.slice(1)}-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow', fixture, 'top.vhd'), path.join(dir, 'top.vhd'));
    if (loc) fs.writeFileSync(path.join(dir, 'top.ucf'), `NET "clk" LOC = "${loc}";\n`);
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `clock-${issue.slice(1)}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], ...(loc && { constraints: 'top.ucf' }) }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => [...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]);
    const clk = placedOf('IBUF').find(([n]) => n === 'clk')?.[1];
    assert.deepEqual(r.warnings, typeof warnings === 'function' ? warnings(clk) : warnings);
    if (want.clk) assert.equal(clk, want.clk);
    if (want.bufg) assert.deepEqual(placedOf('BUFGMUX').map(([, s]) => s), [want.bufg]);
    if (want.dcm) assert.deepEqual(placedOf('DCM').map(([, s]) => s), [want.dcm]);
    for (const re of want.pips || []) assert.match(routed, re);
    if (want.padInto) {
      assert.equal(placedOf('DCM').length, 1);
      const net = padNet(routed, 'clk');
      assert.ok(net.includes(`\n  inpin "${want.padInto.replace(' ', '" ')} ,\n`), net);
      assert.match(net, /^ {2}pip DCM_\w+ DCM_DLL_CLKPAD\d -> DCM_CLKIN ,$/m);
      assert.doesNotMatch(net, GENERAL);
    }
  });
}

// Two DCMs on the other devices (#47; checked against ISE: npm run check:open-flow gives DRC 0 errors /
// 0 warnings and a byte-identical .bit): feat_dcm2 with no constraints, on the XC3S100E CLK2X in CLK2X180's place
// (whose DCMs reach no global buffer from CLK2X180). The two DCMs on two sites, the first DCM's CLKIN on its dedicated
// path from the clock's pad (#92); the sites and the pad nextpnr's (#2756: Silinx's placer took the top-left and
// bottom-left DCMs and ISE's pad).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: two DCMs (feat_dcm2) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: complete bitstream, the exact warnings (#47)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `dcm2-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    let src = fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm2/top.vhd'), 'utf8');
    if (part === 'xc3s100e') src = src.replace('CLK2X => open, CLK2X180 => b2x_u', 'CLK2X => b2x_u, CLK2X180 => open');
    fs.writeFileSync(path.join(dir, 'top.vhd'), src);
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `dcm2-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => Object.fromEntries([...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]));
    assert.deepEqual(r.warnings, []);
    const dcms = placedOf('DCM');
    assert.deepEqual(Object.keys(dcms).sort(), ['u_dcma', 'u_dcmb']);
    assert.notEqual(dcms.u_dcma, dcms.u_dcmb);
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "u_dcma" CLKIN ,\n/m);
    assert.match(clk, /^ {2}pip DCM_\w+ DCM_DLL_CLKPAD\d -> DCM_CLKIN ,$/m);
    assert.doesNotMatch(clk, GENERAL);
    // B's CLKIN and both feedbacks on the global lines (#93)
    const pips = dcmClockPips(routed);
    assert.equal(pips.length, 3, pips.join('; '));
    for (const p of pips) assert.match(p, / GCLK\d -> CLK(IN|FB)$/);
    assert.doesNotMatch(routed, /_TO_OMUX/);
  });
}

// Twelve global clocks on every device (#95; checked against ISE: npm run check:open-flow gives DRC 0
// errors / 0 warnings and a byte-identical .bit): feat_clocks12 with no constraints: the eight top /
// bottom buffers and five side buffers of the left (lines 0-4); in the left centre tile lines 0-4 come
// from the side buffers only (before: no free global clock buffer past the eighth).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: twelve global clocks (feat_clocks12) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the side buffers, each line from one buffer per half, no warning (#95)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `clocks12-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_clocks12/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `clocks12-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, []);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const bufs = [...routed.matchAll(/^inst "[^"]+" "BUFGMUX",placed \S+ (\S+) /gm)].map(m => m[1]).sort();
    assert.deepEqual(bufs, ['BUFGMUX_X0Y2', 'BUFGMUX_X0Y3', 'BUFGMUX_X0Y4', 'BUFGMUX_X0Y5', 'BUFGMUX_X0Y6', 'BUFGMUX_X1Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
    // each quadrant line of each half driven from one buffer: the side one or the top / bottom one
    const drivers = new Map();
    for (const m of routed.matchAll(/pip (GCLKVM[LR])_\S+ GCLKVM[LR]_GCLK(CORE|LR)(\d) -> GCLKVMLR_GCLK_(UP|DN)\d /g)) {
      const k = `${m[1]} ${m[4]}${m[3]}`;
      drivers.set(k, new Set([...(drivers.get(k) || []), m[2]]));
    }
    for (const [k, d] of drivers) assert.equal(d.size, 1, k);
    for (const k of [0, 1, 2, 3, 4]) assert.ok(drivers.has(`GCLKVML DN${k}`) || drivers.has(`GCLKVML UP${k}`), `left line ${k}`);
    assert.ok(![...drivers].some(([k, d]) => /^GCLKVML .[NP][0-4]$/.test(k) && d.has('CORE')));
  });
}

// A clock pad driving a global buffer that feeds a DCM's CLKIN (#94; checked against ISE: npm run
// check:open-flow gives DRC 0 errors / 0 warnings and a byte-identical .bit): feat_dcm_bufgin with no
// constraints. The DCM's site and the buffer are chosen together: the clock on the GCLK pin whose
// buffer's line reaches the DCM's CLKIN (the pad, the buffer and the DCM nextpnr's, #2756: Silinx's placer took B7 ->
// BUFGMUX_X1Y10, D9 on the FG320), the pad into its buffer on the dedicated path, the DCM's outputs on the other
// buffers, no warning (before #94: the DCM's outputs took the buffers first, and the pad's buffer, not reaching the
// CLKIN, was said and reached through general routing).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: a pad's global buffer into a DCM's CLKIN (feat_dcm_bufgin) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the DCM and the buffer together, no warning (#94)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `dcm-bufgin-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm_bufgin/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `dcm-bufgin-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, []);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => Object.fromEntries([...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]));
    assert.ok(placedOf('IBUF').clk && placedOf('BUFGMUX').u_bin && placedOf('DCM').u_dcm);
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "u_bin" I0 ,$/m);
    assert.match(clk, /^ {2}pip CLK[TB]\w*_X\d+Y\d+ CLK[TB]_CKI\d -> CLK[TB]_GCLK\d ,$/m);
    assert.doesNotMatch(clk, GENERAL);
    // the CLKIN and the feedback on the global lines (#93)
    const pips = dcmClockPips(routed);
    assert.equal(pips.length, 2, pips.join('; '));
    for (const p of pips) assert.match(p, / GCLK\d -> CLK(IN|FB)$/);
    assert.doesNotMatch(routed, /_TO_OMUX/);
  });
}
